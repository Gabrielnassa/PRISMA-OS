import { z } from "zod";
import { many, one, systemCtx, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";

/**
 * Avisos dentro do sistema (o sino): o que precisa da atenção de cada pessoa.
 * Gravados em contexto de sistema; cada pessoa só lê os próprios.
 */

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export async function notifyUsers(organizationId: string, userIds: Array<string | null | undefined>, n: { kind: string; title: string; body?: string; href?: string }): Promise<void> {
  const ids = [...new Set(userIds.filter((u): u is string => Boolean(u) && z.string().uuid().safeParse(u).success))];
  if (ids.length === 0) return;
  try {
    await withTx(systemCtx("inbox.notify"), (tx) =>
      tx.query(
        `INSERT INTO notifications (organization_id, user_id, kind, title, body, href)
         SELECT $1, m.user_id, $3, $4, $5, $6 FROM memberships m WHERE m.organization_id = $1 AND m.user_id = ANY($2::uuid[]) AND m.deactivated_at IS NULL`,
        [organizationId, ids, n.kind.slice(0, 60), n.title.slice(0, 300), (n.body ?? "").slice(0, 1000), n.href && n.href.startsWith("/") ? n.href.slice(0, 500) : null],
      ),
    );
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", msg: "inbox.notify_failed", error: (err as Error).message }));
  }
}

/** Quem aprova peças deste cliente (proprietários, administração e aprovadores com acesso), menos `except`. */
export async function approversOf(organizationId: string, clientId: string, except?: string): Promise<string[]> {
  return withTx(systemCtx("inbox.approvers"), async (tx) =>
    (
      await many<{ user_id: string }>(
        tx,
        `SELECT m.user_id FROM memberships m JOIN users u ON u.id = m.user_id AND u.is_active
         WHERE m.organization_id = $1 AND m.deactivated_at IS NULL AND ($3::uuid IS NULL OR m.user_id <> $3)
           AND (m.role IN ('owner', 'admin') OR (m.role = 'reviewer' AND EXISTS (SELECT 1 FROM client_access ca WHERE ca.client_id = $2 AND ca.user_id = m.user_id)))`,
        [organizationId, clientId, except ?? null],
      )
    ).map((r) => r.user_id),
  );
}

export async function listInbox(auth: AuthContext, limit = 30): Promise<{ items: InboxItem[]; unread: number }> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<{ id: string; kind: string; title: string; body: string; href: string | null; read_at: Date | null; created_at: Date }>(
      tx,
      "SELECT id, kind, title, body, href, read_at, created_at FROM notifications WHERE organization_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT $3",
      [auth.organizationId, auth.userId, Math.min(limit, 100)],
    );
    const unread = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM notifications WHERE organization_id = $1 AND user_id = $2 AND read_at IS NULL", [auth.organizationId, auth.userId]);
    return {
      items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, href: r.href, read: Boolean(r.read_at), createdAt: r.created_at.toISOString() })),
      unread: unread.n,
    };
  });
}

/** Marca como lido um aviso (ou todos, sem `id`). Feito pelo sistema em nome da própria pessoa. */
export async function markInboxRead(auth: AuthContext, id?: string): Promise<void> {
  if (id && !z.string().uuid().safeParse(id).success) return;
  await withTx(systemCtx("inbox.read"), (tx) =>
    tx.query(
      `UPDATE notifications SET read_at = now() WHERE organization_id = $1 AND user_id = $2 AND read_at IS NULL AND ($3::uuid IS NULL OR id = $3)`,
      [auth.organizationId, auth.userId, id ?? null],
    ),
  );
}
