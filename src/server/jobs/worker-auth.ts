import { maybeOne, systemCtx, withTx } from "../db";
import { isRole } from "../authz/permissions";
import type { AuthContext } from "../auth/types";

/**
 * Reconstrói o contexto do usuário que pediu a tarefa. O worker atua com as
 * permissões dessa pessoa (RLS incluído); se ela perdeu o acesso, a tarefa falha.
 */
export async function workerAuth(organizationId: string, userId: string | null): Promise<AuthContext | null> {
  if (!userId) return null;
  return withTx(systemCtx("worker.auth"), async (tx) => {
    const row = await maybeOne<{ name: string; email: string; role: string; org_name: string }>(
      tx,
      `SELECT u.name, u.email, m.role, o.name AS org_name
       FROM memberships m JOIN users u ON u.id = m.user_id AND u.is_active JOIN organizations o ON o.id = m.organization_id
       WHERE m.organization_id = $1 AND m.user_id = $2`,
      [organizationId, userId],
    );
    if (!row || !isRole(row.role)) return null;
    return {
      sessionId: "worker",
      userId,
      userName: row.name,
      email: row.email,
      organizationId,
      organizationName: row.org_name,
      role: row.role,
      mustChangePassword: false,
    };
  });
}
