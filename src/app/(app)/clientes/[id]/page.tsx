import Link from "next/link";
import { InlineAction } from "@/components/inline-action";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth/next";
import { getClient, listMemories, MEMORY_KIND_LABELS } from "@/server/services/clients";
import { listMedia } from "@/server/services/media";
import { instagramStatus } from "@/server/integrations/instagram";
import { listContents } from "@/server/services/content";
import { getCostSummary } from "@/server/services/costs";
import { getClientDeletionSummary } from "@/server/services/deletion";
import { can } from "@/server/authz/permissions";
import { NotFoundError } from "@/server/errors";
import { brandCompleteness } from "@/lib/brand";
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, TabLinks, formatDateTime, formatUsd } from "@/components/ui";
import { ContentTable } from "@/components/content-table";
import { toContentRows } from "@/components/content-rows";
import { MediaUploader } from "@/components/media-uploader";
import { MediaGrid } from "@/components/media-grid";
import { deleteMediaAction } from "../../midia/actions";
import { memoryStatusAction } from "../actions";
import { deleteContentsAction } from "../../conteudos/actions";
import { DeleteClientCard } from "./delete-client";
import { BrandForm } from "./brand-form";
import { AddMemoryForm } from "./memory-panel";
import { BudgetForm, ClientSettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Cliente" };

const TABS = [
  ["visao", "Visão geral"],
  ["marca", "Perfil da marca"],
  ["memoria", "Memória"],
  ["arquivos", "Arquivos"],
  ["conteudos", "Conteúdos"],
] as const;

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; novo?: string }> }) {
  const auth = await requireAuth();
  const { id } = await params;
  const { aba, novo } = await searchParams;
  const tab = TABS.some(([t]) => t === aba) ? aba! : "visao";
  const client = await getClient(auth, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const completeness = brandCompleteness(client.brand);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/clientes" className="hover:text-ink-200">
            Clientes
          </Link>
        }
        title={client.name}
        description={client.segment || "Segmento não informado"}
        actions={can(auth.role, "content.create") && client.status !== "archived" ? <LinkButton href={`/criar?cliente=${client.id}`}>Criar conteúdo</LinkButton> : null}
      />
      <TabLinks tabs={TABS.map(([t, label]) => ({ id: t, label, href: `/clientes/${client.id}?aba=${t}` }))} active={tab} />
      {novo === "1" && tab === "marca" ? (
        <div className="mb-6">
          <Alert tone="success" title="Cliente cadastrado">
            Preencha o perfil da marca: ele é usado em todas as criações deste cliente.
          </Alert>
        </div>
      ) : null}
      {tab === "visao" ? <Overview auth={auth} client={client} completeness={completeness} /> : null}
      {tab === "marca" ? <BrandTab auth={auth} client={client} /> : null}
      {tab === "memoria" ? <MemoryTab auth={auth} clientId={client.id} /> : null}
      {tab === "arquivos" ? <FilesTab auth={auth} clientId={client.id} /> : null}
      {tab === "conteudos" ? <ContentsTab auth={auth} clientId={client.id} /> : null}
    </>
  );
}

type Auth = Awaited<ReturnType<typeof requireAuth>>;
type Client = Awaited<ReturnType<typeof getClient>>;

async function Overview({ auth, client, completeness }: { auth: Auth; client: Client; completeness: ReturnType<typeof brandCompleteness> }) {
  const costs = can(auth.role, "costs.view") ? await getCostSummary(auth) : null;
  const myCosts = costs?.byClient.find((c) => c.clientId === client.id);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Perfil da marca" description={`${completeness.percent}% dos campos essenciais preenchidos`} actions={<LinkButton href={`/clientes/${client.id}?aba=marca`} size="sm" variant="secondary">Editar perfil</LinkButton>} />
        <div className="p-5">
          <div className="h-[3px] rounded-full bg-ink-800">
            <div className={completeness.percent === 100 ? "h-[3px] rounded-full bg-teal-400" : "h-[3px] rounded-full bg-violet-400"} style={{ width: `${completeness.percent}%` }} />
          </div>
          {completeness.missing.length ? (
            <p className="mt-3 text-sm text-ink-300">
              Falta preencher: <span className="text-ink-100">{completeness.missing.join(", ")}</span>.
            </p>
          ) : (
            <p className="mt-3 text-sm text-emerald-300">Perfil essencial completo.</p>
          )}
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-400">Público-alvo</dt>
              <dd className="mt-0.5 text-ink-100">{client.brand.audience.targetAudience || "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Tom de voz</dt>
              <dd className="mt-0.5 text-ink-100">{client.brand.voice.tone || "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Cores</dt>
              <dd className="mt-1 flex gap-1.5">
                {Object.entries(client.brand.visual.colors).map(([k, v]) => (
                  <span key={k} className="size-6 rounded-[4px] ring-1 ring-inset ring-white/10" style={{ backgroundColor: v }} title={`${k}: ${v}`} />
                ))}
                {!client.brand.visual.configured ? <Badge tone="warning" className="ml-2">Provisórias</Badge> : null}
              </dd>
            </div>
            <div>
              <dt className="text-ink-400">Termos proibidos</dt>
              <dd className="mt-0.5 text-ink-100">{client.brand.voice.forbiddenTerms.join(", ") || "—"}</dd>
            </div>
          </dl>
          <div className="mt-6 border-t border-ink-800 pt-3 font-mono text-[11.5px] text-ink-400">Revisão {client.brandRevision} · atualizado em {formatDateTime(client.brandUpdatedAt)}</div>
        </div>
      </Card>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Dados do cliente" />
          {can(auth.role, "client.update") ? (
            <ClientSettingsForm client={client} canArchive={can(auth.role, "client.archive")} />
          ) : (
            <div className="p-5 text-sm text-ink-300">Situação: {client.status}</div>
          )}
        </Card>
        {can(auth.role, "costs.manage") ? (
          <Card>
            <CardHeader title="Consumo de IA" description={myCosts ? `${myCosts.runs} execução(ões) no mês · ${formatUsd(myCosts.costUsd, 4)}` : "Sem execuções no mês"} />
            <BudgetForm clientId={client.id} budget={{ limitUsd: myCosts?.limitUsd ?? null, alertPct: myCosts?.alertPct ?? null, hardStop: myCosts?.hardStop ?? null }} />
          </Card>
        ) : null}
        {can(auth.role, "client.delete") ? <DeleteClientCard clientId={client.id} summary={await getClientDeletionSummary(auth, client.id)} /> : null}
      </div>
    </div>
  );
}

async function BrandTab({ auth, client }: { auth: Auth; client: Client }) {
  const logos = await listMedia(auth, { clientId: client.id, imagesOnly: true, limit: 200 });
  return (
    <BrandForm
      clientId={client.id}
      brand={client.brand}
      revision={client.brandRevision}
      logos={logos.items.map((l) => ({ id: l.id, filename: `${l.filename}${l.kind === "logo" ? " (logotipo)" : ""}` }))}
      images={logos.items
        .filter((l) => /^image\/(png|jpe?g|gif|svg\+xml)$/.test(l.mimeType))
        .sort((x, y) => Number(y.kind === "logo") - Number(x.kind === "logo"))
        .map((l) => ({ id: l.id, filename: l.filename, kind: l.kind }))}
      canEdit={can(auth.role, "client.update")}
      canUpload={can(auth.role, "media.upload")}
      instagramReady={instagramStatus().configured}
    />
  );
}

async function MemoryTab({ auth, clientId }: { auth: Auth; clientId: string }) {
  const memories = await listMemories(auth, clientId);
  const canManage = can(auth.role, "memory.manage");
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Memória do cliente"
          description="Fatos e preferências confirmados entram no contexto da IA. Hipóteses entram rotuladas como hipóteses. Sugestões (inclusive de reprovações) só valem depois de revisadas e convertidas por você."
        />
        {canManage ? <AddMemoryForm clientId={clientId} /> : null}
      </Card>
      {memories.length === 0 ? (
        <EmptyState title="Nenhuma informação memorizada" description="Registre preferências e fatos confirmados para orientar as próximas criações." />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-800">
            {memories.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <Badge tone={m.kind === "fact" ? "success" : m.kind === "preference" ? "accent" : m.kind === "hypothesis" ? "warning" : "neutral"}>{MEMORY_KIND_LABELS[m.kind]}</Badge>
                <div className="min-w-0 flex-1">
                  <p className={m.status === "archived" ? "text-sm text-ink-400 line-through" : "text-sm text-ink-100"}>{m.content}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {m.source === "approval_feedback" ? "Origem: reprovação" : "Registro manual"} · {m.createdByName ?? "—"} · {formatDateTime(m.createdAt)}
                    {m.kind === "suggestion" && m.status === "active" ? " · não entra no contexto da IA até ser registrada como fato ou preferência" : ""}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    <InlineAction
                      action={memoryStatusAction}
                      fields={{ clientId, memoryId: m.id, op: m.status === "active" ? "archive" : "restore" }}
                      label={m.status === "active" ? "Arquivar" : "Restaurar"}
                    />
                    <InlineAction
                      action={memoryStatusAction}
                      fields={{ clientId, memoryId: m.id, op: "delete" }}
                      label="Excluir"
                      tone="danger"
                      confirmMessage="Excluir esta informação da memória do cliente? A exclusão é definitiva; para apenas tirá-la do contexto da IA, use Arquivar."
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

async function FilesTab({ auth, clientId }: { auth: Auth; clientId: string }) {
  const media = await listMedia(auth, { clientId, limit: 200 });
  return (
    <div className="flex flex-col gap-6">
      {can(auth.role, "media.upload") ? (
        <Card>
          <CardHeader title="Enviar arquivos" description="Prefira fotografias reais do cliente ou imagens licenciadas." />
          <MediaUploader clientId={clientId} />
        </Card>
      ) : null}
      <MediaGrid items={media.items} deleteAction={can(auth.role, "media.delete") ? deleteMediaAction : undefined} />
    </div>
  );
}

async function ContentsTab({ auth, clientId }: { auth: Auth; clientId: string }) {
  const { items } = await listContents(auth, { clientId, limit: 50 });
  if (items.length === 0) return <EmptyState title="Nenhum conteúdo" description="Os conteúdos deste cliente aparecerão aqui." action={can(auth.role, "content.create") ? <LinkButton href={`/criar?cliente=${clientId}`}>Criar conteúdo</LinkButton> : undefined} />;
  return (
    <Card>
      <ContentTable items={toContentRows(items)} showClient={false} onDelete={can(auth.role, "content.delete") ? deleteContentsAction : undefined} />
    </Card>
  );
}
