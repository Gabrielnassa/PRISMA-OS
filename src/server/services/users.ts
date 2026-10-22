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
    // Situação e último acesso são os desta organização (não vazam dados de outros tenants).
    const rows = await many<{ user_id: string; name: string; email: string; role: Role; deactivated_at: Date | null; last_access_at: Date | null; client_ids: string[] | null }>(
      tx,
      `SELECT m.user_id, u.name, u.email, m.role, m.deactivated_at, m.last_access_at,
              array_remove(array_agg(ca.client_id), NULL) AS client_ids
       FROM memberships m JOIN users u ON u.id = m.user_id
       LEFT JOIN client_access ca ON ca.user_id = m.user_id AND ca.organization_id = m.organization_id
       WHERE m.organization_id = $1
       GROUP BY m.user_id, u.name, u.email, m.role, m.deactivated_at, m.last_access_at
       ORDER BY u.name`,
      [auth.organizationId],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      role: r.role,
      isActive: r.deactivated_at === null,
      lastLoginAt: r.last_access_at?.toISOString() ?? null,
      clientIds: r.client_ids ?? [],
    }));
  });
}

export const InviteSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  role: z.enum(ROLES),
});

function temporaryPassword(): string {
  return `${crypto.randomBytes(9).toString("base64url")}9a`;
}

/**
 * Cria o acesso de um novo usuário com senha temporária (exibida uma única
 * vez ao administrador; troca obrigatória no primeiro acesso, expira em 7 dias).
 * Contas que já existem na plataforma NÃO são vinculadas por administradores de
 * organização (evita vincular pessoas sem consentimento); isso é feito por um
 * operador da plataforma com `npm run member:add`.
 */
export async function inviteMember(auth: AuthContext, input: z.input<typeof InviteSchema>): Promise<{ userId: string; temporaryPassword: string }> {
  assertCan(auth.role, "users.manage");
  const data = InviteSchema.parse(input);
  if (data.role === "owner" && auth.role !== "owner") throw new ForbiddenError("Somente proprietários podem conceder o papel de proprietário.");
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  return withTx(systemCtx("users.invite"), async (tx) => {
    const existing = await maybeOne<{ id: string }>(tx, "SELECT id FROM users WHERE email = $1", [data.email]);
    if (existing) {
      throw new ConflictError(
        "Não foi possível criar este acesso: o e-mail já está cadastrado na plataforma. Se a pessoa já fez parte desta organização, reative-a na lista abaixo; caso contrário, peça a vinculação ao operador da plataforma.",
      );
    }
    const user = await one<{ id: string }>(
      tx,
      "INSERT INTO users (email, name, password_hash, must_change_password) VALUES ($1, $2, $3, true) RETURNING id",
      [data.email, data.name, passwordHash],
    );
    await tx.query("INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)", [auth.organizationId, user.id, data.role]);
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "user.invited", entityType: "user", entityId: user.id, metadata: { email: data.email, role: data.role } });
    return { userId: user.id, temporaryPassword: password };
  });
}

/**
 * Gera nova senha temporária. Permitido só para usuários que pertencem
 * exclusivamente a esta organização: a senha é global e não pode ser trocada
 * por administradores de outra agência.
 */
export async function resetTemporaryPassword(auth: AuthContext, userId: string): Promise<{ temporaryPassword: string }> {
  assertCan(auth.role, "users.manage");
  if (userId === auth.userId) throw new ValidationError("Para alterar a própria senha, use Configurações.");
  const target = await loadTarget(auth, userId);
  if (!target) throw new NotFoundError("Usuário não encontrado.");
  if (target.role === "owner" && auth.role !== "owner") throw new ForbiddenError("Somente proprietários redefinem a senha de proprietários.");
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  await withTx(systemCtx("users.reset_password"), async (tx) => {
    const others = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM memberships WHERE user_id = $1 AND organization_id <> $2", [userId, auth.organizationId]);
    if (others.n > 0) throw new ForbiddenError("Esta pessoa também usa outra organização; a redefinição de senha deve ser feita por ela mesma ou pelo operador da plataforma.");
    await tx.query("UPDATE users SET password_hash = $2, must_change_password = true, password_set_at = now() WHERE id = $1", [userId, passwordHash]);
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "user.password_reset", entityType: "user", entityId: userId });
  });
  await revokeAllSessions(userId);
  return { temporaryPassword: password };
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
    if (target.role === "owner" && (input.role !== "owner" || !input.isActive)) {
      const owners = await one<{ n: number }>(
        tx,
        "SELECT count(*)::int AS n FROM memberships WHERE organization_id = $1 AND role = 'owner' AND deactivated_at IS NULL",
        [auth.organizationId],
      );
      if (owners.n <= 1) throw new ValidationError("A organização precisa de pelo menos um proprietário ativo.");
    }
    // A desativação vale só para esta organização (o acesso a outras agências não é afetado).
    await tx.query(
      `UPDATE memberships SET role = $3,
         deactivated_at = CASE WHEN $4::boolean THEN NULL ELSE coalesce(deactivated_at, now()) END
       WHERE organization_id = $1 AND user_id = $2`,
      [auth.organizationId, userId, input.role, input.isActive],
    );
    await tx.query("DELETE FROM client_access WHERE organization_id = $1 AND user_id = $2", [auth.organizationId, userId]);
    if (clientIds.length) {
      const valid = await many<{ id: string }>(tx, "SELECT id FROM clients WHERE organization_id = $1 AND id = ANY($2::uuid[])", [auth.organizationId, clientIds]);
      for (const c of valid) {
        await tx.query("INSERT INTO client_access (organization_id, client_id, user_id) VALUES ($1, $2, $3)", [auth.organizationId, c.id, userId]);
      }
    }
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "user.updated", entityType: "user", entityId: userId, metadata: { role: input.role, isActive: input.isActive, clients: clientIds.length } });
  });
  if (!input.isActive) await revokeAllSessions(userId, { organizationId: auth.organizationId });
}

export async function changeOwnPassword(auth: AuthContext, input: { current: string; next: string }): Promise<void> {
  const problem = validatePasswordStrength(input.next);
  if (problem) throw new ValidationError(problem);
  if (input.current === input.next) throw new ValidationError("A nova senha deve ser diferente da atual.");
  await withTx(systemCtx("users.change_password"), async (tx) => {
    const user = await one<{ password_hash: string }>(tx, "SELECT password_hash FROM users WHERE id = $1", [auth.userId]);
    if (!(await verifyPassword(input.current, user.password_hash))) throw new ValidationError("A senha atual não confere.");
    await tx.query("UPDATE users SET password_hash = $2, must_change_password = false, password_set_at = now() WHERE id = $1", [auth.userId, await hashPassword(input.next)]);
    await audit(tx, { type: "system", userId: auth.userId }, { organizationId: auth.organizationId, action: "user.password_changed", entityType: "user", entityId: auth.userId });
  });
  await revokeAllSessions(auth.userId, { exceptSessionId: auth.sessionId });
}
