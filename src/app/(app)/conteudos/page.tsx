import Link from "next/link";
import { pageParam } from "@/lib/page-param";
import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/next";
import { listContents } from "@/server/services/content";
import { listClients } from "@/server/services/clients";
import { can } from "@/server/authz/permissions";
import { CONTENT_STATUSES, STATUS_LABELS, type ContentStatus } from "@/lib/content/status";
import { FORMAT_LABELS } from "@/lib/content/document";
import { Card, EmptyState, Input, LinkButton, PageHeader, Select, Table, Td, Th, formatDateTime } from "@/components/ui";
import { StatusBadge } from "@/components/status";

export const metadata: Metadata = { title: "Conteúdos" };
const PAGE = 30;

export default async function ContentsPage({ searchParams }: { searchParams: Promise<{ cliente?: string; status?: string; q?: string; pagina?: string }> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const clients = await listClients(auth, { includeArchived: true });
  const clientId = clients.some((c) => c.id === sp.cliente) ? sp.cliente : undefined;
  const status = (CONTENT_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as ContentStatus) : undefined;
  const page = pageParam(sp.pagina);
  const { items, total } = await listContents(auth, { clientId, status, search: sp.q, limit: PAGE, offset: (page - 1) * PAGE });
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (clientId) u.set("cliente", clientId);
    if (status) u.set("status", status);
    if (sp.q) u.set("q", sp.q);
    u.set("pagina", String(p));
    return `/conteudos?${u.toString()}`;
  };
  return (
    <>
      <PageHeader title="Conteúdos" description="Todas as peças, com status, versões e histórico." actions={can(auth.role, "content.create") ? <LinkButton href="/criar">Criar conteúdo</LinkButton> : null} />
      <form className="mb-6 grid gap-2 md:grid-cols-[1fr_220px_220px_auto]" action="/conteudos">
        <label className="sr-only" htmlFor="q">
          Buscar
        </label>
        <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por título" />
        <Select name="cliente" defaultValue={clientId ?? ""} aria-label="Cliente">
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status">
          <option value="">Todos os status</option>
          {CONTENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <button type="submit" className="inline-flex h-9 items-center justify-center rounded-md border border-ink-700 bg-ink-900 px-3.5 text-[13.5px] font-medium text-ink-100 transition-colors hover:border-ink-600 hover:bg-ink-850">
          Filtrar
        </button>
      </form>
      {items.length === 0 ? (
        <EmptyState title="Nenhum conteúdo encontrado" description="Ajuste os filtros ou crie um novo conteúdo." />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Título</Th>
                <Th>Cliente</Th>
                <Th>Formato</Th>
                <Th>Status</Th>
                <Th>Versão</Th>
                <Th>Atualizado</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-ink-850/50">
                  <Td>
                    <Link href={`/conteudos/${c.id}`} className="font-medium text-ink-50 underline-offset-4 hover:underline">
                      {c.title}
                    </Link>
                  </Td>
                  <Td>{c.clientName}</Td>
                  <Td>{FORMAT_LABELS[c.format]}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td>
                    {c.currentVersion ? `v${c.currentVersion}` : "—"}
                    {c.hasApprovedVersion ? <span className="ml-1 text-xs text-emerald-300">(aprovada)</span> : null}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-[12px] text-ink-400">{formatDateTime(c.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex items-center justify-between px-5 py-3 text-sm text-ink-400">
            <span>
              {total} conteúdo(s) · página {page} de {Math.max(1, Math.ceil(total / PAGE))}
            </span>
            <span className="flex gap-3">
              {page > 1 ? <Link href={qs(page - 1)} className="hover:text-ink-50">← Anterior</Link> : null}
              {page * PAGE < total ? <Link href={qs(page + 1)} className="hover:text-ink-50">Próxima →</Link> : null}
            </span>
          </div>
        </Card>
      )}
    </>
  );
}
