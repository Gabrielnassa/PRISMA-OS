import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { can } from "@/server/authz/permissions";
import { listClients } from "@/server/services/clients";
import { listHistory, type HistoryEntry } from "@/server/services/history";
import { AUDIT_GROUPS, AUDIT_LABELS } from "@/lib/audit-labels";
import { Card, EmptyState, PageHeader, Select, buttonClass, formatDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Histórico" };

/** Link para o que a ação tocou, quando faz sentido abrir. */
function target(e: HistoryEntry): string | null {
  const id = e.entityId;
  if (!id) return null;
  if (e.entityType === "content_item") return `/conteudos/${id}`;
  if (e.entityType === "approval" && typeof e.metadata.contentId === "string") return `/conteudos/${e.metadata.contentId}`;
  if (e.entityType === "client" && !e.action.endsWith(".deleted")) return `/clientes/${id}`;
  return null;
}

function detail(e: HistoryEntry): string {
  const m = e.metadata;
  const parts: string[] = [];
  if (typeof m.network === "string") parts.push(m.network);
  if (typeof m.account === "string") parts.push(m.account);
  if (typeof m.name === "string" && m.via === "client_link") parts.push(`${m.name} (cliente)`);
  if (typeof m.note === "string" && m.note) parts.push(`“${m.note.slice(0, 120)}”`);
  if (typeof m.filename === "string") parts.push(m.filename);
  if (typeof m.title === "string") parts.push(m.title);
  return parts.join(" · ");
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ cliente?: string; tipo?: string; pagina?: string }> }) {
  const auth = await requireAuth();
  if (!can(auth.role, "audit.view")) return <EmptyState title="Acesso restrito" description="O histórico da agência fica com a administração." />;
  const sp = await searchParams;
  const clients = await listClients(auth, { includeArchived: true });
  const clientId = clients.some((c) => c.id === sp.cliente) ? sp.cliente : undefined;
  const group = sp.tipo && sp.tipo in AUDIT_GROUPS ? sp.tipo : undefined;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const { items, total, pageSize } = await listHistory(auth, { clientId, group, page });
  const href = (p: number) => `/historico?${new URLSearchParams({ ...(clientId ? { cliente: clientId } : {}), ...(group ? { tipo: group } : {}), pagina: String(p) })}`;
  return (
    <>
      <PageHeader title="Histórico" description="Tudo o que foi feito no sistema, por quem e quando" />
      <form className="mb-6 flex flex-wrap gap-2" action="/historico">
        <Select name="cliente" defaultValue={clientId ?? ""} aria-label="Cliente" className="w-60">
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="tipo" defaultValue={group ?? ""} aria-label="Tipo" className="w-48">
          <option value="">Tudo</option>
          {Object.entries(AUDIT_GROUPS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
      </form>
      {items.length === 0 ? (
        <EmptyState title="Nada registrado" />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-800">
            {items.map((e) => {
              const link = target(e);
              const d = detail(e);
              return (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-3 text-[13.5px]">
                  <span className="w-32 shrink-0 tabular text-[12px] text-ink-400">{formatDateTime(e.createdAt)}</span>
                  <span className="min-w-0 flex-1">
                    {link ? (
                      <Link href={link} className="font-medium text-ink-50 hover:underline">
                        {AUDIT_LABELS[e.action] ?? e.action}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink-50">{AUDIT_LABELS[e.action] ?? e.action}</span>
                    )}
                    {e.clientName ? <span className="text-ink-400"> · {e.clientName}</span> : null}
                    {d ? <span className="block truncate text-[12.5px] text-ink-400">{d}</span> : null}
                  </span>
                  <span className="shrink-0 text-[12.5px] text-ink-300">{e.actorName ?? (e.actorType === "worker" ? "Sistema (fila)" : "Sistema")}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-ink-800 px-5 py-3 text-[13px] text-ink-400">
            <span className="tabular">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total.toLocaleString("pt-BR")}
            </span>
            <span className="flex gap-4">
              {page > 1 ? <Link href={href(page - 1)} className="hover:text-ink-50">← Anteriores</Link> : null}
              {page * pageSize < total ? <Link href={href(page + 1)} className="hover:text-ink-50">Mais antigos →</Link> : null}
            </span>
          </div>
        </Card>
      )}
    </>
  );
}
