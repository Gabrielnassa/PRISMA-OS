import type { Queryable } from "../db";
import type { AuthContext } from "../auth/types";

export type AuditActor = { type: "user"; auth: Pick<AuthContext, "userId" | "organizationId"> } | { type: "system" | "worker"; userId?: string | null };

export interface AuditEntry {
  organizationId: string | null;
  clientId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Registra uma ação na trilha de auditoria (tabela somente inserção). */
export async function audit(tx: Queryable, actor: AuditActor, entry: AuditEntry): Promise<void> {
  const actorUserId = actor.type === "user" ? actor.auth.userId : (actor.userId ?? null);
  await tx.query(
    `INSERT INTO audit_logs (organization_id, client_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.organizationId,
      entry.clientId ?? null,
      actorUserId,
      actor.type,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      JSON.stringify(entry.metadata ?? {}),
      entry.ip ?? null,
    ],
  );
}

export const userActor = (auth: Pick<AuthContext, "userId" | "organizationId">): AuditActor => ({ type: "user", auth });
