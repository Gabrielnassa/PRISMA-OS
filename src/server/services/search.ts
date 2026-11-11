import { many, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import { STATUS_LABELS, type ContentStatus } from "@/lib/content/status";

/** Busca rápida (Ctrl+K): clientes e peças que a pessoa acessa, pelo nome ou título. */
export interface SearchHit {
  kind: "client" | "content";
  id: string;
  title: string;
  detail: string;
  href: string;
}

export async function quickSearch(auth: AuthContext, raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return withTx(userCtx(auth.userId), async (tx) => {
    const clients = await many<{ id: string; name: string; segment: string }>(
      tx,
      `SELECT id, name, segment FROM clients WHERE organization_id = $1 AND status <> 'archived' AND (name ILIKE $2 OR segment ILIKE $2)
       ORDER BY lower(name) LIMIT 5`,
      [auth.organizationId, like],
    );
    const contents = await many<{ id: string; title: string; status: ContentStatus; client_name: string }>(
      tx,
      `SELECT ci.id, ci.title, ci.status, c.name AS client_name FROM content_items ci JOIN clients c ON c.id = ci.client_id
       WHERE ci.organization_id = $1 AND ci.status <> 'archived' AND (ci.title ILIKE $2 OR c.name ILIKE $2)
       ORDER BY ci.updated_at DESC LIMIT 8`,
      [auth.organizationId, like],
    );
    return [
      ...clients.map((c) => ({
        kind: "client" as const,
        id: c.id,
        title: c.name,
        detail: c.segment || "Cliente",
        href: `/clientes/${c.id}`,
      })),
      ...contents.map((c) => ({
        kind: "content" as const,
        id: c.id,
        title: c.title,
        detail: `${c.client_name} · ${STATUS_LABELS[c.status]}`,
        href: `/conteudos/${c.id}`,
      })),
    ];
  });
}
