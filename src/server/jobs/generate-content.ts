import { z } from "zod";
import { maybeOne, one, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import type { Briefing } from "@/lib/content/briefing";
import type { Channel, ContentFormat, Objective } from "@/lib/content/document";
import { artDirectorSkill } from "../skills/art-director";
import { copywriterSkill } from "../skills/copywriter";
import { composeDocument, productionNotes, slideKinds, slidePlan } from "../content/compose";
import { runAiSkill } from "../orchestrator";
import { loadBrandProfile } from "../services/clients";
import { evaluateVersion, insertVersion } from "../services/content";
import { audit, userActor } from "../services/audit";
import type { Job } from "./queue";

export const GeneratePayloadSchema = z.object({
  contentItemId: z.string().uuid(),
  slideCount: z.number().int().min(1).max(10).default(5),
  templatePreference: z.string().default("auto"),
  aspect: z.enum(["1:1", "4:5", "9:16"]).nullable().default(null),
  imageAssetIds: z.array(z.string().uuid()).default([]),
});

/**
 * Workflow de produção de uma peça: direção de arte (regras) -> copy (IA) ->
 * composição -> versão -> controle de qualidade -> "Em revisão".
 * Reexecuções reaproveitam a chamada de IA já concluída (sem nova cobrança).
 */
export async function handleGenerateContent(job: Job, auth: AuthContext): Promise<Record<string, unknown>> {
  const payload = GeneratePayloadSchema.parse(job.payload);

  const loaded = await withTx(userCtx(auth.userId), async (tx) => {
    const item = await maybeOne<{
      id: string; client_id: string; status: string; title: string; channel: Channel; format: ContentFormat; objective: Objective;
      briefing: Briefing; current_version_id: string | null;
    }>(
      tx,
      `SELECT id, client_id, status, title, channel, format, objective, briefing, current_version_id
       FROM content_items WHERE id = $1 AND organization_id = $2`,
      [payload.contentItemId, auth.organizationId],
    );
    if (!item) return null;
    const { brand } = await loadBrandProfile(tx, item.client_id);
    const recent = await maybeOne<{ template_id: string | null }>(
      tx,
      `SELECT v.document->>'templateId' AS template_id FROM content_versions v
       WHERE v.client_id = $1 ORDER BY v.created_at DESC LIMIT 1`,
      [item.client_id],
    );
    return { item, brand, recentTemplate: recent?.template_id ?? null };
  });
  if (!loaded) throw Object.assign(new Error("Conteúdo não encontrado ou sem acesso."), { retryable: false });
  const { item, brand } = loaded;
  if (item.status !== "generating") {
    return { skipped: true, reason: `status ${item.status}` };
  }

  const art = artDirectorSkill.run({
    format: item.format,
    objective: item.objective,
    segment: brand.business.segment,
    visual: brand.visual,
    handle: brand.channels.instagram,
    hasImages: payload.imageAssetIds.length > 0,
    templatePreference: payload.templatePreference,
    aspect: payload.aspect ?? undefined,
    recentTemplateIds: loaded.recentTemplate ? [loaded.recentTemplate] : [],
  });
  const kinds = slideKinds(item.format, payload.slideCount);

  const copy = await runAiSkill(copywriterSkill, {
    auth,
    clientId: item.client_id,
    contentItemId: item.id,
    jobId: job.id,
    idempotencyKey: `job:${job.id}:copywriter`,
    input: {
      format: item.format,
      channel: item.channel,
      objective: item.objective,
      title: item.title,
      briefing: item.briefing,
      templateName: art.template.name,
      templateDescription: art.template.description,
      slidePlan: slidePlan(art.template, kinds, art.aspect, payload.imageAssetIds),
      companyName: brand.business.companyName,
      handle: brand.channels.instagram,
    },
  });

  const doc = composeDocument({
    format: item.format,
    art,
    kinds,
    imageIds: payload.imageAssetIds,
    copy: copy.output,
    fallbackTitle: item.title,
    notes: productionNotes(copy.output, art, copy.isDemo),
  });

  return withTx(userCtx(auth.userId), async (tx) => {
    const locked = await one<{ id: string; client_id: string; status: string; current_version_id: string | null }>(
      tx,
      "SELECT id, client_id, status, current_version_id FROM content_items WHERE id = $1 FOR UPDATE",
      [item.id],
    );
    // Proteção contra duplicidade: se a versão desta execução já existe, não cria outra.
    const already = await maybeOne<{ id: string; version_number: number }>(
      tx,
      "SELECT id, version_number FROM content_versions WHERE content_item_id = $1 AND ai_run_id = $2",
      [item.id, copy.runId],
    );
    if (already) return { contentItemId: item.id, versionId: already.id, version: already.version_number, reused: true };
    if (locked.status !== "generating") return { skipped: true, reason: `status ${locked.status}` };

    const version = await insertVersion(tx, auth, locked, doc, {
      source: copy.isDemo ? "demo" : "ai",
      aiRunId: copy.runId,
      changeNote: copy.isDemo ? "Gerado pelo provedor de demonstração" : `Gerado por IA (${copy.model})`,
    });
    await tx.query("UPDATE content_items SET current_version_id = $2, status = 'in_review', last_error = NULL WHERE id = $1", [item.id, version.id]);
    const report = await evaluateVersion(tx, auth, item.client_id, version.id, doc, item.briefing);
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: item.client_id,
      action: "content.generated",
      entityType: "content_item",
      entityId: item.id,
      metadata: { version: version.number, template: art.template.id, aiRunId: copy.runId, isDemo: copy.isDemo, critical: report.criticalCount, warnings: report.warningCount },
    });
    return { contentItemId: item.id, versionId: version.id, version: version.number, template: art.template.id, critical: report.criticalCount };
  });
}
