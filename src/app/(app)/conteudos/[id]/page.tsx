import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/server/auth/next";
import { contentHistory, getContent, getVersionDocument } from "@/server/services/content";
import { getClient } from "@/server/services/clients";
import { listMedia } from "@/server/services/media";
import { providerStatus } from "@/server/ai/gateway";
import { can } from "@/server/authz/permissions";
import { NotFoundError } from "@/server/errors";
import { TEMPLATES, getTemplate } from "@/server/render/templates";
import { diffDocuments } from "@/server/content/compose";
import { FAMILY_LABELS } from "@/lib/brand";
import { ASPECTS, CHANNEL_LABELS, FORMAT_LABELS, OBJECTIVE_LABELS, type DocumentStyle } from "@/lib/content/document";
import { Alert, Badge, Card, CardHeader, LinkButton, PageHeader, buttonClass, formatDateTime, formatUsd } from "@/components/ui";
import { SourceBadge, StatusBadge } from "@/components/status";
import { Icon } from "@/components/icons";
import { ContentEditor } from "./editor";
import { GenerationStatus } from "./generation-status";
import { QualityPanel } from "./quality-panel";
import { AiReviewPanel, ApprovalPanel, CommentsPanel, RetryPanel } from "./review-panels";
import { archiveAction, restoreVersionAction } from "./actions";

export const metadata: Metadata = { title: "Conteúdo" };

const ACTION_LABELS: Record<string, string> = {
  "content.created": "Conteúdo criado",
  "content.generated": "Peça gerada",
  "content.version_created": "Nova versão salva",
  "content.generation_retried": "Geração reenviada",
  "content.commented": "Comentário",
  "content.archived": "Arquivado",
  "content.exported": "Exportação da versão aprovada",
  "content.draft_downloaded": "Download de rascunho",
  "approval.requested": "Aprovação solicitada",
  "approval.approved": "Aprovado",
  "approval.rejected": "Reprovado",
  "ai.run_succeeded": "Execução de IA concluída",
  "ai.run_failed": "Execução de IA falhou",
};

export default async function ContentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ comparar?: string; com?: string }> }) {
  const auth = await requireAuth();
  const { id } = await params;
  const { comparar, com } = await searchParams;
  const detail = await getContent(auth, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const [history, client, media] = await Promise.all([
    contentHistory(auth, id),
    getClient(auth, detail.clientId),
    listMedia(auth, { clientId: detail.clientId, imagesOnly: true, limit: 200 }),
  ]);
  const provider = providerStatus();
  const canEdit = can(auth.role, "content.edit") && ["draft", "in_review", "awaiting_approval", "approved", "rejected", "failed"].includes(detail.status) && Boolean(detail.current);
  const current = detail.current;
  const brandStyle: DocumentStyle = {
    colors: { ...client.brand.visual.colors },
    headingFont: client.brand.visual.headingFont,
    bodyFont: client.brand.visual.bodyFont,
    logoAssetId: client.brand.visual.logoAssetId,
    showLogo: true,
    handle: client.brand.channels.instagram,
  };

  let compare: null | { a: Awaited<ReturnType<typeof getVersionDocument>>; b: Awaited<ReturnType<typeof getVersionDocument>>; aId: string; bId: string; changes: string[] } = null;
  if (comparar && com) {
    try {
      const [a, b] = await Promise.all([getVersionDocument(auth, id, comparar), getVersionDocument(auth, id, com)]);
      compare = { a, b, aId: comparar, bId: com, changes: diffDocuments(a.document, b.document) };
    } catch {
      compare = null;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/clientes/${detail.clientId}?aba=conteudos`} className="hover:underline">
            {detail.clientName}
          </Link>
        }
        title={detail.title}
        description={`${FORMAT_LABELS[detail.format]} · ${CHANNEL_LABELS[detail.channel]} · ${OBJECTIVE_LABELS[detail.objective]}${current ? ` · ${ASPECTS[current.document.aspect].label}` : ""}`}
        actions={
          <>
            <StatusBadge status={detail.status} />
            {current ? <Badge tone="neutral">v{current.number}</Badge> : null}
            {current ? <SourceBadge source={current.source} /> : null}
            {detail.approvedVersionId ? (
              <a href={`/api/contents/${id}/export?format=zip`} className={buttonClass("primary", "sm")}>
                <Icon.download /> Exportar aprovada (.zip)
              </a>
            ) : null}
            {current && current.id !== detail.approvedVersionId ? (
              <a href={`/api/contents/${id}/export?format=zip&version=${current.id}`} className={buttonClass("secondary", "sm")} title="Arquivo identificado como rascunho">
                Baixar rascunho
              </a>
            ) : null}
          </>
        }
      />

      {detail.status === "generating" ? (
        <div className="mb-6">
          <GenerationStatus contentId={id} />
        </div>
      ) : null}
      {detail.status === "failed" && !current ? (
        <div className="mb-6">
          <RetryPanel contentId={id} error={detail.lastError} />
        </div>
      ) : null}
      {current?.source === "demo" ? (
        <div className="mb-6">
          <Alert tone="warning" title="Versão gerada em modo demonstração">
            Os textos foram extraídos do briefing sem IA. Revise tudo antes de enviar para aprovação.
          </Alert>
        </div>
      ) : null}
      {detail.status === "approved" && current?.id === detail.approvedVersionId ? (
        <div className="mb-6">
          <Alert tone="success" title="Versão aprovada">
            A exportação oficial usa exatamente esta versão. Publicação automática ainda não está habilitada (fase 4); nada é publicado sem autorização.
          </Alert>
        </div>
      ) : null}

      {current ? (
        canEdit ? (
          <ContentEditor
            key={current.id}
            contentId={id}
            baseVersionId={current.id}
            initialDocument={current.document}
            initialQuality={detail.quality}
            templates={TEMPLATES.map((t) => ({ id: t.id, name: t.name, familyLabel: FAMILY_LABELS[t.family], formats: t.formats, aspects: t.aspects, image: t.image, fieldLimits: t.fieldLimits }))}
            images={media.items.map((m) => ({ id: m.id, filename: m.filename }))}
            brandStyle={brandStyle}
            canEdit={canEdit}
          />
        ) : (
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <Card>
              <CardHeader title={`Versão ${current.number}`} description={`Template: ${getTemplate(current.document.templateId).template.name}`} />
              <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3">
                {current.document.slides.map((s, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={s.id} src={`/api/contents/${id}/versions/${current.id}/slides/${i}`} alt={`Lâmina ${i + 1}`} className="w-full rounded-lg border border-ink-700" loading="lazy" />
                ))}
              </div>
              <div className="border-t border-ink-700 p-5 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Legenda</div>
                <p className="mt-1 whitespace-pre-wrap text-ink-100">{current.document.caption || "—"}</p>
                <p className="mt-2 text-violet-300">{current.document.hashtags.join(" ")}</p>
              </div>
            </Card>
            <QualityPanel report={detail.quality} />
          </div>
        )
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          {current ? (
            <ApprovalPanel
              contentId={id}
              currentVersionId={current.id}
              currentVersionNumber={current.number}
              status={detail.status}
              qualityPassed={detail.quality?.passed ?? false}
              approvals={detail.approvals}
              canSubmit={can(auth.role, "content.submit")}
              canApprove={can(auth.role, "content.approve")}
            />
          ) : null}
          <CommentsPanel contentId={id} comments={detail.comments} canComment={can(auth.role, "content.comment")} />
          {current && can(auth.role, "content.edit") ? <AiReviewPanel contentId={id} enabled={provider.configured} /> : null}
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Versões" description="Versões são imutáveis. Restaurar cria uma nova versão igual à escolhida." />
            <ul className="divide-y divide-ink-800">
              {detail.versions.map((v, i) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                  <span className="font-semibold text-ink-100">v{v.number}</span>
                  <SourceBadge source={v.source} />
                  {v.id === detail.approvedVersionId ? <Badge tone="success">Aprovada</Badge> : null}
                  {v.qualityPassed === false ? <Badge tone="danger">{v.criticalCount} crítico(s)</Badge> : null}
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-400">
                    {v.createdByName ?? "—"} · {formatDateTime(v.createdAt)}
                    {v.changeNote ? ` · ${v.changeNote}` : ""}
                  </span>
                  {detail.versions[i + 1] ? (
                    <Link href={`/conteudos/${id}?comparar=${detail.versions[i + 1]!.id}&com=${v.id}#comparacao`} className="text-xs text-violet-300 hover:underline">
                      Comparar com v{detail.versions[i + 1]!.number}
                    </Link>
                  ) : null}
                  {canEdit && current && v.id !== current.id ? (
                    <form action={restoreVersionAction}>
                      <input type="hidden" name="contentId" value={id} />
                      <input type="hidden" name="versionId" value={v.id} />
                      <input type="hidden" name="baseVersionId" value={current.id} />
                      <button type="submit" className="text-xs text-ink-300 hover:text-ink-50">
                        Restaurar
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
              {detail.versions.length === 0 ? <li className="px-5 py-3 text-sm text-ink-400">Nenhuma versão ainda.</li> : null}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Briefing" />
            <dl className="space-y-3 p-5 text-sm">
              <div>
                <dt className="text-xs text-ink-400">Briefing</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink-100">{detail.briefing.text}</dd>
              </div>
              {detail.briefing.keyMessages ? (
                <div>
                  <dt className="text-xs text-ink-400">Mensagens-chave</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-ink-100">{detail.briefing.keyMessages}</dd>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-ink-400">Público</dt>
                  <dd className="mt-0.5 text-ink-100">{detail.briefing.audience || "Perfil da marca"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">Oferta</dt>
                  <dd className="mt-0.5 text-ink-100">{detail.briefing.offer || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-400">CTA</dt>
                  <dd className="mt-0.5 text-ink-100">{detail.briefing.cta || "—"}</dd>
                </div>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Histórico e auditoria" description="Ações registradas para este conteúdo." />
            <ol className="max-h-96 divide-y divide-ink-800 overflow-y-auto">
              {history.map((h) => (
                <li key={h.id} className="px-5 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink-100">{ACTION_LABELS[h.action] ?? h.action}</span>
                    <span className="text-xs text-ink-500">
                      {h.actorName ?? (h.actorType === "worker" ? "worker" : "sistema")} · {formatDateTime(h.createdAt)}
                    </span>
                  </div>
                  {h.action === "content.version_created" && Array.isArray(h.metadata.changes) && h.metadata.changes.length ? (
                    <p className="mt-0.5 text-xs text-ink-400">v{String(h.metadata.version)}: {(h.metadata.changes as string[]).slice(0, 8).join(", ")}</p>
                  ) : null}
                  {h.action.startsWith("approval.") && h.metadata.note ? <p className="mt-0.5 text-xs text-ink-400">“{String(h.metadata.note)}”</p> : null}
                </li>
              ))}
            </ol>
          </Card>

          {detail.aiRuns.length ? (
            <Card>
              <CardHeader title="Execuções de IA" />
              <ul className="divide-y divide-ink-800 text-sm">
                {detail.aiRuns.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                    <span className="text-ink-100">{r.skillId}</span>
                    <Badge tone={r.status === "succeeded" ? "success" : "danger"}>{r.status}</Badge>
                    {r.isDemo ? <Badge tone="warning">demo</Badge> : null}
                    <span className="text-xs text-ink-400">
                      {r.model} · {r.isDemo ? "sem custo" : r.costUsd === null ? "tarifa não cadastrada" : formatUsd(r.costUsd, 4)} · {formatDateTime(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {can(auth.role, "content.archive") && detail.status !== "archived" && detail.status !== "generating" ? (
            <form action={archiveAction} className="text-right">
              <input type="hidden" name="contentId" value={id} />
              <button type="submit" className="text-xs text-ink-400 hover:text-red-300">
                Arquivar conteúdo
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {compare ? (
        <Card className="mt-6" id="comparacao">
          <CardHeader
            title={`Comparação: v${compare.a.number} → v${compare.b.number}`}
            description={compare.changes.length ? compare.changes.join(" · ") : "Sem diferenças."}
            actions={<LinkButton href={`/conteudos/${id}`} variant="ghost" size="sm">Fechar</LinkButton>}
          />
          <div className="grid gap-6 p-5 md:grid-cols-2">
            {[
              { v: compare.a, vid: compare.aId },
              { v: compare.b, vid: compare.bId },
            ].map(({ v, vid }) => (
              <div key={vid}>
                <div className="mb-2 text-sm font-semibold text-ink-100">Versão {v.number}</div>
                <div className="grid grid-cols-2 gap-2">
                  {v.document.slides.map((s, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={s.id} src={`/api/contents/${id}/versions/${vid}/slides/${i}`} alt={`v${v.number} lâmina ${i + 1}`} className="w-full rounded-lg border border-ink-700" loading="lazy" />
                  ))}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs text-ink-400">{v.document.caption}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}
