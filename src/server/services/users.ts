import crypto from "node:crypto";
import { z } from "zod";
import { many, maybeOne, one, systemCtx, userCtx, withTx } from "../db";
import { assertCan, ROLES, type Role } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { hashPassword, validatePasswordStrength, verifyPassword } from "../auth/password";
import { revokeAllSessions } from "../auth/service";
import { audit, userActor } from "./audit";

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  clientIds: string[];
}

export async function listMembers(auth: AuthContext): Promise<Member[]> {
  assertCan(auth.role, "users.manage");
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<{ user_id: string; name: string; email: string; role: Role; is_active: boolean; last_login_at: Date | null; client_ids: string[] | null }>(
      tx,
      `SELECT m.user_id, u.name, u.email, m.role, u.is_active, u.last_login_at,
              array_remove(array_agg(ca.client_id), NULL) AS client_ids
       FROM memberships m JOIN users u ON u.id = m.user_id
       LEFT JOIN client_access ca ON ca.user_id = m.user_id AND ca.organization_id = m.organization_id
       WHERE m.organization_id = $1
       GROUP BY m.user_id, u.name, u.email, m.role, u.is_active, u.last_login_at
       ORDER BY u.name`,
      [auth.organizationId],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      role: r.role,
      isActive: r.is_active,
      lastLoginAt: r.last_login_at?.toISOString() ?? null,
      clientIds: r.client_ids ?? [],
    }));
  });
}

export const InviteSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  role: z.enum(ROLES),
});

/**
 * Cria o acesso de um novo usuário com senha temporária (exibida uma única
 * vez ao administrador; o usuário deve trocá-la no primeiro acesso).
 * Envio por e-mail depende da integração de e-mail (fase posterior).
 */
export async function inviteMember(auth: AuthContext, input: z.input<typeof InviteSchema>): Promise<{ userId: string; temporaryPassword: string | null; existingUser: boolean }> {
  assertCan(auth.role, "users.manage");
  const data = InviteSchema.parse(input);
  if (data.role === "owner" && auth.role !== "owner") throw new ForbiddenError("Somente proprietários podem conceder o papel de proprietário.");
  const temporaryPassword = `${crypto.randomBytes(9).toString("base64url")}9a`;
  const passwordHash = await hashPassword(temporaryPassword);
  return withTx(systemCtx("users.invite"), async (tx) => {
    const existing = await maybeOne<{ id: string }>(tx, "SELECT id FROM users WHERE email = $1", [data.email]);
    let userId: string;
    if (existing) {
      const member = await maybeOne(tx, "SELECT 1 FROM memberships WHERE organization_id = $1 AND user_id = $2", [auth.organizationId, existing.id]);
      if (member) throw new ConflictError("Este usuário já faz parte da organização.");
      userId = existing.id;
    } else {
      const user = await one<{ id: string }>(
        tx,
        "INSERT INTO users (email, name, password_hash, must_change_password) VALUES ($1, $2, $3, true) RETURNING id",
        [data.email, data.name, passwordHash],
      );
      userId = user.id;
    }
    await tx.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)", [auth.organizationId, userId, data.role]);
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "user.invited", entityType: "user", entityId: userId, metadata: { email: data.email, role: data.role, existingUser: Boolean(existing) } });
    return { userId, temporaryPassword: existing ? null : temporaryPassword, existingUser: Boolean(existing) };
  });
}

async function loadTarget(auth: AuthContext, userId: string) {
  if (!z.string().uuid().safeParse(userId).success) throw new NotFoundError("Usuário não encontrado.");
  return withTx(userCtx(auth.userId), (tx) =>
    maybeOne<{ role: Role }>(tx, "SELECT role FROM memberships WHERE organization_id = $1 AND user_id = $2", [auth.organizationId, userId]),
  );
}

export async function updateMember(auth: AuthContext, userId: string, input: { role: Role; isActive: boolean; clientIds: string[] }): Promise<void> {
  assertCan(auth.role, "users.manage");
  const target = await loadTarget(auth, userId);
  if (!target) throw new NotFoundError("Usuário não encontrado.");
  if ((target.role === "owner" || input.role === "owner") && auth.role !== "owner") throw new ForbiddenError("Somente proprietários alteram proprietários.");
  if (userId === auth.userId && (input.role !== auth.role || !input.isActive)) throw new ValidationError("Você não pode alterar o próprio papel nem se desativar.");
  const clientIds = z.array(z.string().uuid()).max(500).parse(input.clientIds);
  await withTx(userCtx(auth.userId), async (tx) => {
    if (target.role === "owner" && input.role !== "owner") {
      const owners = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM memberships WHERE organization_id = $1 AND role = 'owner'", [auth.organizationId]);
      if (owners.n <= 1) throw new ValidationError("A organização precisa de pelo menos um proprietário.");
    }
    await tx.query("UPDATE memberships SET role = $3 WHERE organization_id = $1 AND user_id = $2", [auth.organizationId, userId, input.role]);
    await tx.query("DELETE FROM client_access WHERE organization_id = $1 AND user_id = $2", [auth.organizationId, userId]);
    if (clientIds.length) {
      const valid = await many<{ id: string }>(tx, "SELECT id FROM clients WHERE organization_id = $1 AND id = ANY($2::uuid[])", [auth.organizationId, clientIds]);
      for (const c of valid) {
        await tx.query("INSERT INTO client_access (organization_id, client_id, user_id) VALUES ($1, $2, $3)", [auth.organizationId, c.id, userId]);
      }
    }
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "user.updated", entityType: "user", entityId: userId, metadata: { role: input.role, isActive: input.isActive, clients: clientIds.length } });
  });
  // Ativação é global ao usuário; alteração feita em contexto de sistema após a checagem acima.
  await withTx(systemCtx("users.set_active"), (tx) => tx.query("UPDATE users SET is_active = $2 WHERE id = $1", [userId, input.isActive]));
  if (!input.isActive) await revokeAllSessions(userId);
}

export async function changeOwnPassword(auth: AuthContext, input: { current: string; next: string }): Promise<void> {
  const problem = validatePasswordStrength(input.next);
  if (problem) throw new ValidationError(problem);
  if (input.current === input.next) throw new ValidationError("A nova senha deve ser diferente da atual.");
  await withTx(systemCtx("users.change_password"), async (tx) => {
    const user = await one<{ password_hash: string }>(tx, "SELECT password_hash FROM users WHERE id = $1", [auth.userId]);
    if (!(await verifyPassword(input.current, user.password_hash))) throw new ValidationError("A senha atual não confere.");
    await tx.query("UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1", [auth.userId, await hashPassword(input.next)]);
    await audit(tx, { type: "system", userId: auth.userId }, { organizationId: auth.organizationId, action: "user.password_changed", entityType: "user", entityId: auth.userId });
  });
  await revokeAllSessions(auth.userId, auth.sessionId);
}
