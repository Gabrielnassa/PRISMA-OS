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
import { getPackageOverview } from "@/server/services/packages";
import { currentMonth, getEditorialPlan, shiftMonth } from "@/server/services/editorial";
import { getDriveLink } from "@/server/services/drive";
import { approvedInMonth, clientChecklist } from "@/server/services/month";
import { driveStatus } from "@/server/integrations/google-drive";
import { getProvider } from "@/server/ai/gateway";
import { EDITORIAL_FORMAT_LABELS, monthLabel } from "@/lib/content/editorial";
import { can } from "@/server/authz/permissions";
import { NotFoundError } from "@/server/errors";
import { brandCompleteness } from "@/lib/brand";
import { plural } from "@/lib/text";

const CLIENT_STATUS_LABELS = { active: "Ativo", paused: "Pausado", archived: "Arquivado" } as const;
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, Stat, StatGroup, TabLinks, formatDateTime, formatRelative, formatUsd } from "@/components/ui";
import { ContentTable } from "@/components/content-table";
import { toContentRows } from "@/components/content-rows";
import { MediaUploader } from "@/components/media-uploader";
import { MediaGrid } from "@/components/media-grid";
import { deleteMediaAction } from "../../midia/actions";
import { memoryStatusAction } from "../actions";
import { deleteContentsAction } from "../../conteudos/actions";
import { DeleteClientCard } from "./delete-client";
import { ApproveForm, EditorialItems, PackageForm, ProposeForm } from "./editorial-panel";
import { DrivePanel } from "./drive-panel";
import { BrandForm } from "./brand-form";
import { AddMemoryForm } from "./memory-panel";
import { BudgetForm, ClientSettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Cliente" };

const TABS = [
  ["visao", "Visão geral"],
  ["marca", "Perfil da marca"],
  ["editorial", "Linha editorial"],
  ["memoria", "Memória"],
  ["arquivos", "Arquivos"],
  ["conteudos", "Conteúdos"],
] as const;

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; novo?: string; mes?: string }> }) {
  const auth = await requireAuth();
  const { id } = await params;
  const { aba, novo, mes } = await searchParams;
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
            Agora preencha o perfil da marca. Ele orienta todas as peças deste cliente.
          </Alert>
        </div>
      ) : null}
      {tab === "visao" ? <Overview auth={auth} client={client} completeness={completeness} /> : null}
      {tab === "marca" ? <BrandTab auth={auth} client={client} /> : null}
      {tab === "memoria" ? <MemoryTab auth={auth} clientId={client.id} /> : null}
      {tab === "arquivos" ? <FilesTab auth={auth} clientId={client.id} /> : null}
      {tab === "conteudos" ? <ContentsTab auth={auth} clientId={client.id} /> : null}
      {tab === "editorial" ? <EditorialTab auth={auth} clientId={client.id} month={mes} archived={client.status === "archived"} /> : null}
    </>
  );
}

type Auth = Awaited<ReturnType<typeof requireAuth>>;
type Client = Awaited<ReturnType<typeof getClient>>;

async function Overview({ auth, client, completeness }: { auth: Auth; client: Client; completeness: ReturnType<typeof brandCompleteness> }) {
  const [costs, steps] = await Promise.all([can(auth.role, "costs.view") ? getCostSummary(auth) : null, clientChecklist(auth, client.id, currentMonth(), completeness.percent)]);
  const pendingSteps = steps.filter((s) => !s.done).length;
  const myCosts = costs?.byClient.find((c) => c.clientId === client.id);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-3">
      {pendingSteps > 0 && client.status !== "archived" ? (
        <Card className="lg:col-span-3">
          <CardHeader title="Primeiros passos" description={`${steps.length - pendingSteps} de ${steps.length} concluídos`} />
          <ol className="grid gap-px bg-ink-800 sm:grid-cols-2 xl:grid-cols-3 [&>*]:bg-ink-900">
            {steps.map((st) => (
              <li key={st.id}>
                <Link href={st.href} className="flex h-full items-start gap-3 px-5 py-3.5 transition-colors hover:bg-ink-850">
                  <span
                    aria-hidden
                    className={st.done ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[11px] text-emerald-300" : "mt-0.5 size-5 shrink-0 rounded-full border border-ink-600"}
                  >
                    {st.done ? "✓" : null}
                  </span>
                  <span className="min-w-0">
                    <span className={st.done ? "block text-[13.5px] text-ink-300" : "block text-[13.5px] font-medium text-ink-50"}>{st.label}</span>
                    <span className="block text-[12.5px] text-ink-400">
                      <span className="sr-only">{st.done ? "Pronto: " : "Pendente: "}</span>
                      {st.hint}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
      <Card className="lg:col-span-2">
        <CardHeader title="Perfil da marca" description={`${completeness.percent}% preenchido`} actions={<LinkButton href={`/clientes/${client.id}?aba=marca`} size="sm" variant="secondary">Editar perfil</LinkButton>} />
        <div className="p-5">
          <div className="h-[3px] rounded-full bg-ink-800">
            <div className={completeness.percent === 100 ? "h-[3px] rounded-full bg-emerald-400" : "h-[3px] rounded-full bg-iris-400"} style={{ width: `${completeness.percent}%` }} />
          </div>
          {completeness.missing.length ? (
            <p className="mt-3 text-sm text-ink-300">
              Falta preencher: <span className="text-ink-100">{completeness.missing.join(", ")}</span>.
            </p>
          ) : (
            <p className="mt-3 text-sm text-emerald-300">Perfil completo.</p>
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
          <div className="mt-6 border-t border-ink-800 pt-3 tabular text-[11.5px] text-ink-400">Revisão {client.brandRevision} · atualizado em {formatDateTime(client.brandUpdatedAt)}</div>
        </div>
      </Card>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Dados do cliente" />
          {can(auth.role, "client.update") ? (
            <ClientSettingsForm client={client} canArchive={can(auth.role, "client.archive")} />
          ) : (
            <div className="p-5 text-sm text-ink-300">Situação: {CLIENT_STATUS_LABELS[client.status]}</div>
          )}
        </Card>
        {can(auth.role, "costs.manage") ? (
          <Card>
            <CardHeader title="Consumo de IA" description={myCosts?.runs ? `${plural(myCosts.runs, "execução", "execuções")} no mês · ${formatUsd(myCosts.costUsd, 2)}` : "Nenhum uso neste mês"} />
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
          description="Fatos e preferências usados nas próximas criações. Sugestões vindas de reprovações só valem depois de revisadas."
        />
        {canManage ? <AddMemoryForm clientId={clientId} /> : null}
      </Card>
      {memories.length === 0 ? (
        <EmptyState title="Memória vazia" description="Registre fatos e preferências confirmados do cliente." />
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
                    {m.kind === "suggestion" && m.status === "active" ? " · aguardando revisão" : ""}
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
                      confirmMessage="Excluir esta informação? Para só deixar de usá-la, prefira Arquivar."
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
  const [media, drive] = await Promise.all([listMedia(auth, { clientId, limit: 200 }), getDriveLink(auth, clientId)]);
  const ds = driveStatus();
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Pasta do Google Drive"
          description="Fotos e vídeos do cliente direto da pasta compartilhada."
          actions={drive?.lastImportAt ? <span className="text-[12.5px] text-ink-400" title={formatDateTime(drive.lastImportAt)}>Última importação {formatRelative(drive.lastImportAt)}</span> : null}
        />
        <DrivePanel
          clientId={clientId}
          folderLink={drive ? `https://drive.google.com/drive/folders/${drive.folderId}` : ""}
          folderName={drive?.folderName ?? null}
          configured={ds.configured}
          serviceEmail={ds.serviceEmail}
          canEdit={can(auth.role, "client.update")}
          canImport={can(auth.role, "media.upload")}
        />
      </Card>
      {can(auth.role, "media.upload") ? (
        <Card>
          <CardHeader title="Enviar arquivos" />
          <MediaUploader clientId={clientId} />
        </Card>
      ) : null}
      <MediaGrid items={media.items} deleteAction={can(auth.role, "media.delete") ? deleteMediaAction : undefined} />
    </div>
  );
}

async function ContentsTab({ auth, clientId }: { auth: Auth; clientId: string }) {
  const { items } = await listContents(auth, { clientId, limit: 50 });
  if (items.length === 0) return <EmptyState title="Nenhuma peça deste cliente" action={can(auth.role, "content.create") ? <LinkButton href={`/criar?cliente=${clientId}`}>Criar conteúdo</LinkButton> : undefined} />;
  return (
    <Card>
      <ContentTable items={toContentRows(items)} showClient={false} onDelete={can(auth.role, "content.delete") ? deleteContentsAction : undefined} />
    </Card>
  );
}

async function EditorialTab({ auth, clientId, month: requested, archived }: { auth: Auth; clientId: string; month?: string; archived: boolean }) {
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : currentMonth();
  const [overview, plan, delivered] = await Promise.all([getPackageOverview(auth, clientId), getEditorialPlan(auth, clientId, month), approvedInMonth(auth, clientId, month)]);
  const { pkg, estimate, produced } = overview;
  const total = pkg.posts + pkg.carousels + pkg.stories + pkg.videos;
  const canEdit = can(auth.role, "content.create") && !archived;
  const isCurrent = month === currentMonth();
  const pendingPieces = plan ? plan.items.filter((i) => i.status === "planned" && i.format !== "video").length : 0;
  const blank = plan ? plan.items.filter((i) => i.status === "planned" && i.format !== "video" && (i.title === "Pauta a definir" || i.brief.trim().length < 10)).length : 0;
  const href = (m: string) => `/clientes/${clientId}?aba=editorial&mes=${m}`;
  const counts: Array<[keyof typeof produced, string]> = [
    ["carousels", "carousel"],
    ["posts", "post"],
    ["stories", "story"],
    ["videos", "video"],
  ];
  return (
    <div className="flex flex-col gap-6">
      <StatGroup className="md:grid-cols-3">
        <Stat label="Pacote do mês" value={total ? `${total} peça${total === 1 ? "" : "s"}` : "—"} hint={total ? counts.filter(([k]) => pkg[k]).map(([k, f]) => `${pkg[k]} ${EDITORIAL_FORMAT_LABELS[f as "post"].toLowerCase()}${pkg[k] === 1 ? "" : "s"}`).join(" · ") : "Defina o pacote abaixo."} />
        <Stat label="Produzido neste mês" value={total ? `${produced.posts + produced.carousels + produced.stories + produced.videos} de ${total}` : "—"} hint="Inclui vídeos marcados como feitos" />
        <Stat
          label="Custo de IA estimado"
          tone="iris"
          value={estimate.totalUsd === null ? "—" : formatUsd(estimate.totalUsd, 2)}
          hint={estimate.totalUsd === null ? estimate.note : `${estimate.aiPieces} peças × ${formatUsd(estimate.perPieceUsd, 3)}${estimate.planUsd ? ` + pauta ${formatUsd(estimate.planUsd, 3)}` : ""} · ${estimate.basis === "measured" ? "média do histórico" : "pela tarifa"}`}
        />
      </StatGroup>
      {delivered.length ? (
        <Alert tone="success" title={`${delivered.length === 1 ? "1 peça aprovada" : `${delivered.length} peças aprovadas`} em ${monthLabel(month).toLowerCase()}`}>
          Uma pasta por peça, com as imagens, a legenda e os textos alternativos.{" "}
          <a href={`/api/clients/${clientId}/delivery?mes=${month}`} className="font-medium text-iris-300 hover:underline">
            Baixar entrega do mês (.zip)
          </a>
        </Alert>
      ) : null}
      {estimate.totalUsd !== null ? <p className="-mt-3 text-[12.5px] text-ink-400">{estimate.note} Gasto de IA do cliente neste mês: {formatUsd(overview.monthSpendUsd, 2)}.</p> : null}

      {can(auth.role, "client.package") ? (
        <Card>
          <CardHeader title="Pacote mensal" description="Peças contratadas por mês" />
          <PackageForm clientId={clientId} pkg={pkg} />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={`Linha editorial · ${monthLabel(month)}`}
          description={
            plan
              ? plan.status === "approved"
                ? `Aprovada${plan.approvedByName ? ` por ${plan.approvedByName}` : ""} em ${formatDateTime(plan.approvedAt)}.`
                : "Rascunho. Revise as pautas e aprove."
              : "Uma pauta para cada peça do pacote. Depois da aprovação, as peças entram em produção."
          }
          actions={
            <span className="flex items-center gap-1">
              <LinkButton href={href(shiftMonth(month, -1))} variant="ghost" size="sm" aria-label="Mês anterior">
                ←
              </LinkButton>
              {!isCurrent ? (
                <LinkButton href={href(currentMonth())} variant="ghost" size="sm">
                  Mês atual
                </LinkButton>
              ) : null}
              <LinkButton href={href(shiftMonth(month, 1))} variant="ghost" size="sm" aria-label="Próximo mês">
                →
              </LinkButton>
            </span>
          }
        />
        {plan && plan.items.length ? <EditorialItems items={plan.items} month={month} canEdit={canEdit} /> : null}
        {plan && canEdit ? (
          <div className="border-t border-ink-800 px-5 py-4">
            <ApproveForm planId={plan.id} approved={plan.status === "approved"} pending={pendingPieces} blank={blank} />
          </div>
        ) : null}
        {canEdit && (!plan || plan.status === "draft") ? (
          <div className={plan ? "border-t border-ink-800" : ""}>
            {total === 0 ? (
              <p className="p-5 text-[13.5px] text-ink-400">Defina o pacote mensal do cliente para montar a linha editorial.</p>
            ) : (
              <ProposeForm clientId={clientId} month={month} hasPlan={Boolean(plan)} aiReady={Boolean(getProvider())} />
            )}
          </div>
        ) : null}
        {!plan && !canEdit ? <p className="p-5 text-[13.5px] text-ink-400">Sem linha editorial neste mês.</p> : null}
      </Card>
    </div>
  );
}
