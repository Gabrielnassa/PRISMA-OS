import { many, one, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import { assertCan } from "../authz/permissions";

/** Histórico da agência: tudo o que foi feito, quem fez e quando (administração). */
export interface HistoryEntry {
  id: number;
  action: string;
  actorName: string | null;
  actorType: string;
  clientName: string | null;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const PAGE = 50;

export async function listHistory(
  auth: AuthContext,
  f: { clientId?: string; group?: string; page?: number } = {},
): Promise<{ items: HistoryEntry[]; total: number; pageSize: number }> {
  assertCan(auth.role, "audit.view");
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const group = f.group && /^[a-z_]{2,30}$/.test(f.group) ? `${f.group}.%` : null;
  return withTx(userCtx(auth.userId), async (tx) => {
    const where = `l.organization_id = $1 AND ($2::uuid IS NULL OR l.client_id = $2) AND ($3::text IS NULL OR l.action LIKE $3)`;
    const params = [auth.organizationId, f.clientId ?? null, group];
    const total = await one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM audit_logs l WHERE ${where}`, params);
    const rows = await many<{
      id: string;
      action: string;
      actor_name: string | null;
      actor_type: string;
      client_name: string | null;
      entity_type: string;
      entity_id: string | null;
      metadata: Record<string, unknown>;
      created_at: Date;
    }>(
      tx,
      `SELECT l.id::text, l.action, u.name AS actor_name, l.actor_type, c.name AS client_name, l.entity_type, l.entity_id, l.metadata, l.created_at
       FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id LEFT JOIN clients c ON c.id = l.client_id
       WHERE ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ${PAGE} OFFSET $4`,
      [...params, (page - 1) * PAGE],
    );
    return {
      items: rows.map((r) => ({
        id: Number(r.id),
        action: r.action,
        actorName: r.actor_name,
        actorType: r.actor_type,
        clientName: r.client_name,
        entityType: r.entity_type,
        entityId: r.entity_id,
        metadata: r.metadata,
        createdAt: r.created_at.toISOString(),
      })),
      total: total.n,
      pageSize: PAGE,
    };
  });
}
