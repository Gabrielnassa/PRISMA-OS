import type { Metadata } from "next";
import Link from "next/link";
import { pageParam } from "@/lib/page-param";
import { requireAuth } from "@/server/auth/next";
import { listMedia, MEDIA_KINDS, MEDIA_KIND_LABELS, type MediaKind } from "@/server/services/media";
import { listClients } from "@/server/services/clients";
import { can } from "@/server/authz/permissions";
import { Card, CardHeader, Input, PageHeader, Select } from "@/components/ui";
import { MediaGrid } from "@/components/media-grid";
import { MediaUploader } from "@/components/media-uploader";
import { deleteMediaAction } from "./actions";

export const metadata: Metadata = { title: "Mídia" };
const PAGE = 48;

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ cliente?: string; tipo?: string; q?: string; pagina?: string }> }) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const clients = await listClients(auth);
  const clientId = clients.some((c) => c.id === sp.cliente) ? sp.cliente : undefined;
  const kind = (MEDIA_KINDS as readonly string[]).includes(sp.tipo ?? "") ? (sp.tipo as MediaKind) : undefined;
  const page = pageParam(sp.pagina);
  const { items, total } = await listMedia(auth, { clientId, kind, search: sp.q, limit: PAGE, offset: (page - 1) * PAGE });
  // A paginação mantém os filtros e a busca.
  const pageHref = (p: number) =>
    `/midia?${new URLSearchParams({ ...(clientId ? { cliente: clientId } : {}), ...(kind ? { tipo: kind } : {}), ...(sp.q ? { q: sp.q } : {}), pagina: String(p) })}`;
  return (
    <>
      <PageHeader title="Mídia" />
      {clientId && can(auth.role, "media.upload") ? (
        <Card className="mb-6">
          <CardHeader title={`Enviar para ${clients.find((c) => c.id === clientId)?.name}`} />
          <MediaUploader clientId={clientId} />
        </Card>
      ) : can(auth.role, "media.upload") ? (
        <p className="mb-4 text-sm text-ink-400">Para enviar arquivos, escolha um cliente no filtro.</p>
      ) : null}
      <form className="mb-6 grid gap-2 md:grid-cols-[1fr_220px_180px_auto]" action="/midia">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nome, descrição ou etiqueta" aria-label="Buscar" />
        <Select name="cliente" defaultValue={clientId ?? ""} aria-label="Cliente">
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="tipo" defaultValue={kind ?? ""} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {MEDIA_KINDS.map((k) => (
            <option key={k} value={k}>
              {MEDIA_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <button type="submit" className="inline-flex h-9 items-center justify-center rounded-md border border-ink-700 bg-ink-900 px-3.5 text-[13.5px] font-medium text-ink-100 transition-colors hover:border-ink-600 hover:bg-ink-850">
          Filtrar
        </button>
      </form>
      <MediaGrid items={items} showClient={!clientId} deleteAction={can(auth.role, "media.delete") ? deleteMediaAction : undefined} />
      <div className="mt-4 flex justify-between text-sm text-ink-400">
        <span>{total} arquivo(s)</span>
        <span className="flex gap-3">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Anterior</Link> : null}
          {page * PAGE < total ? <Link href={pageHref(page + 1)}>Próxima →</Link> : null}
        </span>
      </div>
    </>
  );
}
