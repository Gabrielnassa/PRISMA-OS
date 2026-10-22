import crypto from "node:crypto";
import { z } from "zod";
import { many, maybeOne, one, userCtx, withTx, type Queryable } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { ConflictError, ForbiddenError, NotFoundError, ProviderNotConfiguredError, RateLimitError, ValidationError } from "../errors";
import { env } from "../env";
import { getProvider } from "../ai/gateway";
import { CreateContentSchema, type CreateContentInput, type Briefing } from "@/lib/content/briefing";
import {
  ContentDocumentSchema,
  canonicalJson,
  referencedAssetIds,
  type Channel,
  type ContentDocument,
  type ContentFormat,
  type Objective,
} from "@/lib/content/document";
import type { ContentStatus } from "@/lib/content/status";
import { artDirectorSkill } from "../skills/art-director";
import { composeDocument, diffDocuments, productionNotes, slideKinds } from "../content/compose";
import { renderDocument } from "../render/engine";
import { runQualityChecks, type QualityReport } from "../quality/checks";
import { enqueueJob } from "../jobs/queue";
import { audit, userActor } from "./audit";
import { loadBrandProfile, requireClient } from "./clients";
import { loadImagesForRender } from "./media";
import { OrgSettingsSchema } from "./organizations";
import { assertWithinBudget } from "./costs";

export const GENERATE_JOB = "content.generate";

export function documentHash(doc: ContentDocument): string {
  return crypto.createHash("sha256").update(canonicalJson(doc)).digest("hex");
}

// ---------------------------------------------------------------------------
// Tipos de leitura
// ---------------------------------------------------------------------------

export interface ContentListItem {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  channel: Channel;
  format: ContentFormat;
  objective: Objective;
  status: ContentStatus;
  currentVersion: number | null;
  hasApprovedVersion: boolean;
  updatedAt: string;
  createdByName: string | null;
}

export interface VersionSummary {
  id: string;
  number: number;
  source: "ai" | "demo" | "manual";
  changeNote: string;
  createdAt: string;
  createdByName: string | null;
  hash: string;
  qualityPassed: boolean | null;
  criticalCount: number | null;
  warningCount: number | null;
}

export interface ApprovalRecord {
  id: string;
  versionId: string;
  versionNumber: number;
  status: "pending" | "approved" | "rejected" | "superseded" | "cancelled";
  requestNote: string;
  requestedByName: string | null;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string;
}

export interface ContentDetail {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  channel: Channel;
  format: ContentFormat;
  objective: Objective;
  briefing: Briefing;
  status: ContentStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  current: { id: string; number: number; source: string; document: ContentDocument; hash: string } | null;
  approvedVersionId: string | null;
  versions: VersionSummary[];
  quality: QualityReport | null;
  approvals: ApprovalRecord[];
  comments: Array<{ id: string; body: string; authorName: string | null; createdAt: string; versionNumber: number | null }>;
  job: { id: string; status: string; attempts: number; maxAttempts: number; lastError: string | null; updatedAt: string } | null;
  aiRuns: Array<{ id: string; skillId: string; model: string; status: string; isDemo: boolean; costUsd: number | null; createdAt: string }>;
}

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

async function lockItem(tx: Queryable, auth: AuthContext, contentId: string) {
  if (!z.string().uuid().safeParse(contentId).success) throw new NotFoundError("Conteúdo não encontrado.");
  const row = await maybeOne<{
    id: string;
    client_id: string;
    status: ContentStatus;
    current_version_id: string | null;
    approved_version_id: string | null;
    title: string;
    briefing: Briefing;
    objective: Objective;
    format: ContentFormat;
    channel: Channel;
  }>(
    tx,
    `SELECT id, client_id, status, current_version_id, approved_version_id, title, briefing, objective, format, channel
     FROM content_items WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [contentId, auth.organizationId],
  );
  if (!row) throw new NotFoundError("Conteúdo não encontrado.");
  return row;
}

async function assertAssetsBelongToClient(tx: Queryable, clientId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await many<{ id: string }>(
    tx,
    "SELECT id FROM media_assets WHERE client_id = $1 AND id = ANY($2::uuid[]) AND mime_type LIKE 'image/%'",
    [clientId, ids],
  );
  if (rows.length !== new Set(ids).size) throw new ValidationError("Há imagens que não pertencem a este cliente ou não são imagens.");
}

/** Renderiza a versão, executa o controle de qualidade e grava o relatório. */
export async function evaluateVersion(tx: Queryable, auth: AuthContext, clientId: string, versionId: string, doc: ContentDocument, briefing: Briefing): Promise<QualityReport> {
  const { brand } = await loadBrandProfile(tx, clientId);
  const images = await loadImagesForRender(tx, clientId, referencedAssetIds(doc));
  const rendered = await renderDocument(doc, { images });
  const report = runQualityChecks({
    doc,
    rendered,
    brand,
    briefing: { cta: briefing.cta, offer: briefing.offer },
    images: new Map([...images].map(([id, v]) => [id, { width: v.width, height: v.height }])),
  });
  await tx.query(
    `INSERT INTO quality_reports (organization_id, client_id, content_version_id, checker_version, results, critical_count, warning_count, passed, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [auth.organizationId, clientId, versionId, report.checkerVersion, JSON.stringify(report), report.criticalCount, report.warningCount, report.passed, auth.userId],
  );
  return report;
}

export async function insertVersion(
  tx: Queryable,
  auth: AuthContext,
  item: { id: string; client_id: string; current_version_id: string | null },
  doc: ContentDocument,
  meta: { source: "ai" | "demo" | "manual"; aiRunId?: string | null; changeNote?: string },
): Promise<{ id: string; number: number; hash: string }> {
  const next = await one<{ n: number }>(tx, "SELECT coalesce(max(version_number), 0) + 1 AS n FROM content_versions WHERE content_item_id = $1", [item.id]);
  const hash = documentHash(doc);
  const row = await one<{ id: string }>(
    tx,
    `INSERT INTO content_versions (organization_id, client_id, content_item_id, version_number, document, document_hash, source, ai_run_id, parent_version_id, change_note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [auth.organizationId, item.client_id, item.id, next.n, JSON.stringify(doc), hash, meta.source, meta.aiRunId ?? null, item.current_version_id, meta.changeNote ?? "", auth.userId],
  );
  return { id: row.id, number: next.n, hash };
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export async function createContent(auth: AuthContext, raw: CreateContentInput): Promise<{ contentId: string; jobId: string | null; reused: boolean }> {
  assertCan(auth.role, "content.create");
  const parsed = CreateContentSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    throw new ValidationError("Revise os campos do pedido.", fieldErrors);
  }
  const input = parsed.data;
  if (input.mode === "ai") {
    const provider = getProvider();
    if (!provider) throw new ProviderNotConfiguredError();
  }

  return withTx(userCtx(auth.userId), async (tx) => {
    const client = await requireClient(tx, auth, input.clientId);
    if (client.status === "archived") throw new ValidationError("Cliente arquivado não recebe novos conteúdos.");
    const existing = await maybeOne<{ id: string }>(tx, "SELECT id FROM content_items WHERE organization_id = $1 AND request_id = $2", [auth.organizationId, input.requestId]);
    if (existing) {
      const job = await maybeOne<{ id: string }>(tx, "SELECT id FROM jobs WHERE organization_id = $1 AND idempotency_key = $2", [auth.organizationId, `content:${existing.id}:generate`]);
      return { contentId: existing.id, jobId: job?.id ?? null, reused: true };
    }
    await assertAssetsBelongToClient(tx, input.clientId, input.imageAssetIds);

    if (input.mode === "ai") {
      const recent = await one<{ n: number }>(
        tx,
        "SELECT count(*)::int AS n FROM jobs WHERE created_by = $1 AND type = $2 AND created_at > now() - interval '1 minute'",
        [auth.userId, GENERATE_JOB],
      );
      if (recent.n >= env().GENERATION_RATE_PER_MINUTE) throw new RateLimitError("Muitas gerações em sequência. Aguarde um minuto.");
      await assertWithinBudget(tx, input.clientId);
    }

    const item = await one<{ id: string }>(
      tx,
      `INSERT INTO content_items (organization_id, client_id, title, channel, format, objective, briefing, status, request_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [auth.organizationId, input.clientId, input.title, input.channel, input.format, input.objective, JSON.stringify(input.briefing), input.mode === "ai" ? "generating" : "draft", input.requestId, auth.userId],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: input.clientId,
      action: "content.created",
      entityType: "content_item",
      entityId: item.id,
      metadata: { mode: input.mode, format: input.format, objective: input.objective },
    });

    if (input.mode === "manual") {
      const { brand } = await loadBrandProfile(tx, input.clientId);
      const art = artDirectorSkill.run({
        format: input.format,
        objective: input.objective,
        segment: brand.business.segment,
        visual: brand.visual,
        handle: brand.channels.instagram,
        hasImages: input.imageAssetIds.length > 0,
        templatePreference: input.templatePreference,
        aspect: input.aspect,
      });
      const kinds = slideKinds(input.format, input.slideCount);
      const doc = composeDocument({ format: input.format, art, kinds, imageIds: input.imageAssetIds, copy: null, fallbackTitle: input.title, notes: productionNotes(null, art, false) });
      const version = await insertVersion(tx, auth, { id: item.id, client_id: input.clientId, current_version_id: null }, doc, { source: "manual", changeNote: "Criado manualmente a partir do template" });
      await tx.query("UPDATE content_items SET current_version_id = $2 WHERE id = $1", [item.id, version.id]);
      await evaluateVersion(tx, auth, input.clientId, version.id, doc, input.briefing);
      return { contentId: item.id, jobId: null, reused: false };
    }

    const { job } = await enqueueJob(tx, {
      organizationId: auth.organizationId,
      clientId: input.clientId,
      type: GENERATE_JOB,
      payload: {
        contentItemId: item.id,
        slideCount: input.slideCount,
        templatePreference: input.templatePreference,
        aspect: input.aspect ?? null,
        imageAssetIds: input.imageAssetIds,
      },
      idempotencyKey: `content:${item.id}:generate`,
      createdBy: auth.userId,
    });
    return { contentId: item.id, jobId: job.id, reused: false };
  });
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface ContentFilter {
  clientId?: string;
  status?: ContentStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listContents(auth: AuthContext, f: ContentFilter = {}): Promise<{ items: ContentListItem[]; total: number }> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const where = `ci.organization_id = $1 AND ($2::uuid IS NULL OR ci.client_id = $2) AND ($3::text IS NULL OR ci.status = $3)
      AND ($4::text IS NULL OR ci.title ILIKE '%' || $4 || '%')`;
    const params = [auth.organizationId, f.clientId ?? null, f.status ?? null, f.search?.trim() || null];
    const total = await one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM content_items ci WHERE ${where}`, params);
    const rows = await many<{
      id: string; client_id: string; client_name: string; title: string; channel: Channel; format: ContentFormat; objective: Objective;
      status: ContentStatus; version_number: number | null; approved_version_id: string | null; updated_at: Date; created_by_name: string | null;
    }>(
      tx,
      `SELECT ci.id, ci.client_id, c.name AS client_name, ci.title, ci.channel, ci.format, ci.objective, ci.status,
              v.version_number, ci.approved_version_id, ci.updated_at, u.name AS created_by_name
       FROM content_items ci
       JOIN clients c ON c.id = ci.client_id
       LEFT JOIN content_versions v ON v.id = ci.current_version_id
       LEFT JOIN users u ON u.id = ci.created_by
       WHERE ${where}
       ORDER BY ci.updated_at DESC LIMIT $5 OFFSET $6`,
      [...params, Math.min(f.limit ?? 30, 100), f.offset ?? 0],
    );
    return {
      total: total.n,
      items: rows.map((r) => ({
        id: r.id,
        clientId: r.client_id,
        clientName: r.client_name,
        title: r.title,
        channel: r.channel,
        format: r.format,
        objective: r.objective,
        status: r.status,
        currentVersion: r.version_number,
        hasApprovedVersion: r.approved_version_id !== null,
        updatedAt: r.updated_at.toISOString(),
        createdByName: r.created_by_name,
      })),
    };
  });
}

export async function getContent(auth: AuthContext, contentId: string): Promise<ContentDetail> {
  if (!z.string().uuid().safeParse(contentId).success) throw new NotFoundError("Conteúdo não encontrado.");
  return withTx(userCtx(auth.userId), async (tx) => {
    const item = await maybeOne<{
      id: string; client_id: string; client_name: string; title: string; channel: Channel; format: ContentFormat; objective: Objective;
      briefing: Briefing; status: ContentStatus; last_error: string | null; created_at: Date; updated_at: Date;
      current_version_id: string | null; approved_version_id: string | null;
    }>(
      tx,
      `SELECT ci.*, c.name AS client_name FROM content_items ci JOIN clients c ON c.id = ci.client_id
       WHERE ci.id = $1 AND ci.organization_id = $2`,
      [contentId, auth.organizationId],
    );
    if (!item) throw new NotFoundError("Conteúdo não encontrado.");
    const versions = await many<{
      id: string; version_number: number; source: "ai" | "demo" | "manual"; change_note: string; created_at: Date; name: string | null;
      document_hash: string; passed: boolean | null; critical_count: number | null; warning_count: number | null;
    }>(
      tx,
      `SELECT v.id, v.version_number, v.source, v.change_note, v.created_at, u.name, v.document_hash,
              q.passed, q.critical_count, q.warning_count
       FROM content_versions v
       LEFT JOIN users u ON u.id = v.created_by
       LEFT JOIN LATERAL (SELECT passed, critical_count, warning_count FROM quality_reports qr
                          WHERE qr.content_version_id = v.id ORDER BY created_at DESC LIMIT 1) q ON true
       WHERE v.content_item_id = $1 ORDER BY v.version_number DESC`,
      [contentId],
    );
    let current: ContentDetail["current"] = null;
    let quality: QualityReport | null = null;
    if (item.current_version_id) {
      const v = await one<{ id: string; version_number: number; source: string; document: unknown; document_hash: string }>(
        tx,
        "SELECT id, version_number, source, document, document_hash FROM content_versions WHERE id = $1",
        [item.current_version_id],
      );
      current = { id: v.id, number: v.version_number, source: v.source, document: ContentDocumentSchema.parse(v.document), hash: v.document_hash };
      const q = await maybeOne<{ results: QualityReport }>(
        tx,
        "SELECT results FROM quality_reports WHERE content_version_id = $1 ORDER BY created_at DESC LIMIT 1",
        [v.id],
      );
      quality = q?.results ?? null;
    }
    const approvals = await many<{
      id: string; content_version_id: string; version_number: number; status: ApprovalRecord["status"]; request_note: string;
      requested_by_name: string | null; requested_at: Date; decided_by_name: string | null; decided_at: Date | null; decision_note: string;
    }>(
      tx,
      `SELECT a.id, a.content_version_id, v.version_number, a.status, a.request_note, ru.name AS requested_by_name, a.requested_at,
              du.name AS decided_by_name, a.decided_at, a.decision_note
       FROM approvals a
       JOIN content_versions v ON v.id = a.content_version_id
       LEFT JOIN users ru ON ru.id = a.requested_by
       LEFT JOIN users du ON du.id = a.decided_by
       WHERE a.content_item_id = $1 ORDER BY a.requested_at DESC`,
      [contentId],
    );
    const comments = await many<{ id: string; body: string; name: string | null; created_at: Date; version_number: number | null }>(
      tx,
      `SELECT cm.id, cm.body, u.name, cm.created_at, v.version_number
       FROM content_comments cm LEFT JOIN users u ON u.id = cm.author_id LEFT JOIN content_versions v ON v.id = cm.content_version_id
       WHERE cm.content_item_id = $1 ORDER BY cm.created_at`,
      [contentId],
    );
    const job = await maybeOne<{ id: string; status: string; attempts: number; max_attempts: number; last_error: string | null; updated_at: Date }>(
      tx,
      `SELECT id, status, attempts, max_attempts, last_error, updated_at FROM jobs
       WHERE organization_id = $1 AND payload->>'contentItemId' = $2 ORDER BY created_at DESC LIMIT 1`,
      [auth.organizationId, contentId],
    );
    const runs = await many<{ id: string; skill_id: string; model: string; status: string; is_demo: boolean; cost_usd: string | null; created_at: Date }>(
      tx,
      "SELECT id, skill_id, model, status, is_demo, cost_usd::text, created_at FROM ai_runs WHERE content_item_id = $1 ORDER BY created_at DESC LIMIT 20",
      [contentId],
    );
    return {
      id: item.id,
      clientId: item.client_id,
      clientName: item.client_name,
      title: item.title,
      channel: item.channel,
      format: item.format,
      objective: item.objective,
      briefing: item.briefing,
      status: item.status,
      lastError: item.last_error,
      createdAt: item.created_at.toISOString(),
      updatedAt: item.updated_at.toISOString(),
      current,
      approvedVersionId: item.approved_version_id,
      versions: versions.map((v) => ({
        id: v.id,
        number: v.version_number,
        source: v.source,
        changeNote: v.change_note,
        createdAt: v.created_at.toISOString(),
        createdByName: v.name,
        hash: v.document_hash,
        qualityPassed: v.passed,
        criticalCount: v.critical_count,
        warningCount: v.warning_count,
      })),
      quality,
      approvals: approvals.map((a) => ({
        id: a.id,
        versionId: a.content_version_id,
        versionNumber: a.version_number,
        status: a.status,
        requestNote: a.request_note,
        requestedByName: a.requested_by_name,
        requestedAt: a.requested_at.toISOString(),
        decidedByName: a.decided_by_name,
        decidedAt: a.decided_at?.toISOString() ?? null,
        decisionNote: a.decision_note,
      })),
      comments: comments.map((c) => ({ id: c.id, body: c.body, authorName: c.name, createdAt: c.created_at.toISOString(), versionNumber: c.version_number })),
      job: job ? { id: job.id, status: job.status, attempts: job.attempts, maxAttempts: job.max_attempts, lastError: job.last_error, updatedAt: job.updated_at.toISOString() } : null,
      aiRuns: runs.map((r) => ({ id: r.id, skillId: r.skill_id, model: r.model, status: r.status, isDemo: r.is_demo, costUsd: r.cost_usd === null ? null : Number(r.cost_usd), createdAt: r.created_at.toISOString() })),
    };
  });
}

/** Documento de uma versão específica (para comparação e exportação). */
export async function getVersionDocument(auth: AuthContext, contentId: string, versionId: string): Promise<{ clientId: string; number: number; document: ContentDocument; isApproved: boolean; title: string }> {
  if (!z.string().uuid().safeParse(versionId).success) throw new NotFoundError("Versão não encontrada.");
  return withTx(userCtx(auth.userId), async (tx) => {
    const row = await maybeOne<{ client_id: string; version_number: number; document: unknown; approved_version_id: string | null; title: string }>(
      tx,
      `SELECT v.client_id, v.version_number, v.document, ci.approved_version_id, ci.title
       FROM content_versions v JOIN content_items ci ON ci.id = v.content_item_id
       WHERE v.id = $1 AND v.content_item_id = $2 AND v.organization_id = $3`,
      [versionId, contentId, auth.organizationId],
    );
    if (!row) throw new NotFoundError("Versão não encontrada.");
    return { clientId: row.client_id, number: row.version_number, document: ContentDocumentSchema.parse(row.document), isApproved: row.approved_version_id === versionId, title: row.title };
  });
}

// ---------------------------------------------------------------------------
// Edição e versões
// ---------------------------------------------------------------------------

export async function saveVersion(
  auth: AuthContext,
  contentId: string,
  input: { document: unknown; baseVersionId: string | null; changeNote?: string },
): Promise<{ versionId: string; number: number; unchanged: boolean; quality: QualityReport | null; changes: string[] }> {
  assertCan(auth.role, "content.edit");
  const parsed = ContentDocumentSchema.safeParse(input.document);
  if (!parsed.success) {
    throw new ValidationError(`Documento inválido: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  const doc = parsed.data;
  return withTx(userCtx(auth.userId), async (tx) => {
    const item = await lockItem(tx, auth, contentId);
    if (["archived", "generating", "scheduled", "published"].includes(item.status)) {
      throw new ConflictError(`Não é possível editar um conteúdo com status "${item.status}".`);
    }
    if (item.current_version_id !== input.baseVersionId) {
      throw new ConflictError("Outra versão foi salva enquanto você editava. Recarregue para ver a versão mais recente.");
    }
    if (doc.format !== item.format) throw new ValidationError("O formato da peça não pode ser alterado no editor.");
    await assertAssetsBelongToClient(tx, item.client_id, referencedAssetIds(doc));
    let previous: ContentDocument | null = null;
    if (item.current_version_id) {
      const prev = await one<{ document: unknown; document_hash: string; version_number: number }>(
        tx,
        "SELECT document, document_hash, version_number FROM content_versions WHERE id = $1",
        [item.current_version_id],
      );
      if (prev.document_hash === documentHash(doc)) {
        return { versionId: item.current_version_id, number: prev.version_number, unchanged: true, quality: null, changes: [] };
      }
      previous = ContentDocumentSchema.parse(prev.document);
    }
    const changes = previous ? diffDocuments(previous, doc) : [];
    const version = await insertVersion(tx, auth, item, doc, { source: "manual", changeNote: (input.changeNote ?? "").slice(0, 500) });
    // Alteração relevante invalida a aprovação pendente e exige nova aprovação (seção 14).
    const superseded = await tx.query("UPDATE approvals SET status = 'superseded' WHERE content_item_id = $1 AND status = 'pending'", [contentId]);
    await tx.query("UPDATE content_items SET current_version_id = $2, status = 'in_review', last_error = NULL WHERE id = $1", [contentId, version.id]);
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: item.client_id,
      action: "content.version_created",
      entityType: "content_item",
      entityId: contentId,
      metadata: { version: version.number, changes, supersededApprovals: superseded.rowCount ?? 0, previousStatus: item.status },
    });
    const quality = await evaluateVersion(tx, auth, item.client_id, version.id, doc, item.briefing);
    return { versionId: version.id, number: version.number, unchanged: false, quality, changes };
  });
}

/** Restaura uma versão anterior criando uma nova versão idêntica a ela. */
export async function restoreVersion(auth: AuthContext, contentId: string, versionId: string, baseVersionId: string | null) {
  const v = await getVersionDocument(auth, contentId, versionId);
  return saveVersion(auth, contentId, { document: v.document, baseVersionId, changeNote: `Restaurada a partir da versão ${v.number}` });
}

export async function rerunQuality(auth: AuthContext, contentId: string): Promise<QualityReport> {
  assertCan(auth.role, "content.edit");
  return withTx(userCtx(auth.userId), async (tx) => {
    const item = await lockItem(tx, auth, contentId);
    if (!item.current_version_id) throw new ValidationError("O conteúdo ainda não tem versão.");
    const v = await one<{ document: unknown }>(tx, "SELECT document FROM content_versions WHERE id = $1", [item.current_version_id]);
    return evaluateVersion(tx, auth, item.client_id, item.current_version_id, ContentDocumentSchema.parse(v.document), item.briefing);
  });
}

// ---------------------------------------------------------------------------
// Aprovação
// ---------------------------------------------------------------------------

export async function submitForApproval(auth: AuthContext, contentId: string, input: { versionId: string; note?: string }): Promise<{ approvalId: string }> {
  assertCan(auth.role, "content.submit");
  return withTx(userCtx(auth.userId), async (tx) => {
    const item = await lockItem(tx, auth, contentId);
    if (!["draft", "in_review", "rejected"].includes(item.status)) {
      throw new ConflictError("Este conteúdo não pode ser enviado para aprovação no estado atual.");
    }
    if (!item.current_version_id || item.current_version_id !== input.versionId) {
      throw new ConflictError("Envie a versão mais recente. A versão selecionada não é a atual.");
    }
    const report = await maybeOne<{ critical_count: number }>(
      tx,
      "SELECT critical_count FROM quality_reports WHERE content_version_id = $1 ORDER BY created_at DESC LIMIT 1",
      [input.versionId],
    );
    if (!report) throw new ValidationError("Execute o controle de qualidade antes de enviar para aprovação.");
    if (report.critical_count > 0) {
      throw new ValidationError(`Corrija os ${report.critical_count} problema(s) crítico(s) apontados pelo controle de qualidade antes de enviar.`);
    }
    const version = await one<{ document_hash: string; version_number: number }>(tx, "SELECT document_hash, version_number FROM content_versions WHERE id = $1", [input.versionId]);
    const approval = await one<{ id: string }>(
      tx,
      `INSERT INTO approvals (organization_id, client_id, content_item_id, content_version_id, document_hash, request_note, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [auth.organizationId, item.client_id, contentId, input.versionId, version.document_hash, (input.note ?? "").slice(0, 1000), auth.userId],
    );
    await tx.query("UPDATE content_items SET status = 'awaiting_approval' WHERE id = $1", [contentId]);
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: item.client_id,
      action: "approval.requested",
      entityType: "approval",
      entityId: approval.id,
      metadata: { contentId, version: version.version_number, hash: version.document_hash },
    });
    return { approvalId: approval.id };
  });
}

export async function decideApproval(
  auth: AuthContext,
  approvalId: string,
  input: { decision: "approved" | "rejected"; note?: string },
): Promise<{ contentId: string; status: ContentStatus }> {
  assertCan(auth.role, "content.approve");
  if (!z.string().uuid().safeParse(approvalId).success) throw new NotFoundError("Solicitação de aprovação não encontrada.");
  const note = (input.note ?? "").trim();
  if (input.decision === "rejected" && note.length < 3) throw new ValidationError("Explique o motivo da reprovação para orientar o ajuste.");
  return withTx(userCtx(auth.userId), async (tx) => {
    const approval = await maybeOne<{ id: string; content_item_id: string; content_version_id: string; document_hash: string; status: string; requested_by: string | null; client_id: string }>(
      tx,
      "SELECT id, content_item_id, content_version_id, document_hash, status, requested_by, client_id FROM approvals WHERE id = $1 AND organization_id = $2 FOR UPDATE",
      [approvalId, auth.organizationId],
    );
    if (!approval) throw new NotFoundError("Solicitação de aprovação não encontrada.");
    if (approval.status !== "pending") throw new ConflictError("Esta solicitação já foi decidida ou substituída.");
    const item = await lockItem(tx, auth, approval.content_item_id);
    if (item.current_version_id !== approval.content_version_id) {
      await tx.query("UPDATE approvals SET status = 'superseded' WHERE id = $1", [approvalId]);
      throw new ConflictError("A peça foi alterada depois do pedido de aprovação. Uma nova aprovação é necessária.");
    }
    const version = await one<{ document: unknown; document_hash: string; version_number: number }>(
      tx,
      "SELECT document, document_hash, version_number FROM content_versions WHERE id = $1",
      [approval.content_version_id],
    );
    // Integridade: o conteúdo aprovado é exatamente o que foi enviado.
    if (documentHash(ContentDocumentSchema.parse(version.document)) !== approval.document_hash || version.document_hash !== approval.document_hash) {
      throw new ConflictError("A integridade da versão não confere com o pedido de aprovação.");
    }
    const org = await one<{ settings: unknown }>(tx, "SELECT settings FROM organizations WHERE id = $1", [auth.organizationId]);
    const settings = OrgSettingsSchema.parse(org.settings ?? {});
    if (settings.requireDistinctApprover && approval.requested_by === auth.userId) {
      throw new ForbiddenError("A organização exige que a aprovação seja feita por outra pessoa.");
    }
    const status: ContentStatus = input.decision === "approved" ? "approved" : "rejected";
    await tx.query("UPDATE approvals SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1", [approvalId, input.decision, auth.userId, note.slice(0, 2000)]);
    if (status === "approved") {
      await tx.query("UPDATE content_items SET status = 'approved', approved_version_id = $2 WHERE id = $1", [item.id, approval.content_version_id]);
    } else {
      await tx.query("UPDATE content_items SET status = 'rejected' WHERE id = $1", [item.id]);
      // Aprendizado controlado: a correção vira SUGESTÃO revisável na memória deste cliente apenas.
      await tx.query(
        `INSERT INTO client_memories (organization_id, client_id, kind, content, source, created_by)
         VALUES ($1, $2, 'suggestion', $3, 'approval_feedback', $4)`,
        [auth.organizationId, item.client_id, `Reprovação de "${item.title}" (v${version.version_number}): ${note}`.slice(0, 2000), auth.userId],
      );
    }
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: item.client_id,
      action: input.decision === "approved" ? "approval.approved" : "approval.rejected",
      entityType: "approval",
      entityId: approvalId,
      metadata: { contentId: item.id, version: version.version_number, hash: approval.document_hash, note },
    });
    return { contentId: item.id, status };
  });
}

export interface ApprovalQueueItem {
  approvalId: string;
  contentId: string;
  title: string;
  clientName: string;
  format: ContentFormat;
  versionNumber: number;
  versionId: string;
  requestedByName: string | null;
  requestedAt: string;
  requestNote: string;
  warningCount: number | null;
}

export async function listPendingApprovals(auth: AuthContext, clientId?: string): Promise<ApprovalQueueItem[]> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<{
      id: string; content_item_id: string; title: string; client_name: string; format: ContentFormat; version_number: number; content_version_id: string;
      requested_by_name: string | null; requested_at: Date; request_note: string; warning_count: number | null;
    }>(
      tx,
      `SELECT a.id, a.content_item_id, ci.title, c.name AS client_name, ci.format, v.version_number, a.content_version_id,
              u.name AS requested_by_name, a.requested_at, a.request_note,
              (SELECT warning_count FROM quality_reports q WHERE q.content_version_id = a.content_version_id ORDER BY created_at DESC LIMIT 1) AS warning_count
       FROM approvals a
       JOIN content_items ci ON ci.id = a.content_item_id
       JOIN clients c ON c.id = a.client_id
       JOIN content_versions v ON v.id = a.content_version_id
       LEFT JOIN users u ON u.id = a.requested_by
       WHERE a.organization_id = $1 AND a.status = 'pending' AND ($2::uuid IS NULL OR a.client_id = $2)
       ORDER BY a.requested_at`,
      [auth.organizationId, clientId ?? null],
    );
    return rows.map((r) => ({
      approvalId: r.id,
      contentId: r.content_item_id,
      title: r.title,
      clientName: r.client_name,
      format: r.format,
      versionNumber: r.version_number,
      versionId: r.content_version_id,
      requestedByName: r.requested_by_name,
      requestedAt: r.requested_at.toISOString(),
      requestNote: r.request_note,
      warningCount: r.warning_count,
    }));
  });
}

// ---------------------------------------------------------------------------
// Comentários, arquivamento e histórico
// ---------------------------------------------------------------------------

export async function addComment(auth: AuthContext, contentId: string, input: { body: string; versionId?: string | null }): Promise<void> {
  assertCan(auth.role, "content.comment");
  const body = input.body.trim();
  if (body.length < 1 || body.length > 4000) throw new ValidationError("O comentário deve ter entre 1 e 4.000 caracteres.");
  await withTx(userCtx(auth.userId), async (tx) => {
    const item = await lockItem(tx, auth, contentId);
    const versionId = input.versionId ?? item.current_version_id;
    const row = await one<{ id: string }>(
      tx,
      `INSERT INTO content_comments (organization_id, client_id, content_item_id, content_version_id, author_id, body)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [auth.organizationId, item.client_id, contentId, versionId, auth.userId, body],
    );
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId: item.client_id, action: "content.commented", entityType: "content_comment", entityId: row.id, metadata: { contentId } });
  });
}

export async function archiveContent(auth: AuthContext, contentId: string): Promise<void> {
  assertCan(auth.role, "content.archive");
  await withTx(userCtx(auth.userId), async (tx) => {
    const item = await lockItem(tx, auth, contentId);
    if (item.status === "generating") throw new ConflictError("Aguarde o fim da geração para arquivar.");
    await tx.query("UPDATE approvals SET status = 'cancelled' WHERE content_item_id = $1 AND status = 'pending'", [contentId]);
    await tx.query("UPDATE content_items SET status = 'archived' WHERE id = $1", [contentId]);
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId: item.client_id, action: "content.archived", entityType: "content_item", entityId: contentId, metadata: { previousStatus: item.status } });
  });
}

export async function contentHistory(auth: AuthContext, contentId: string): Promise<Array<{ id: number; action: string; actorName: string | null; actorType: string; metadata: Record<string, unknown>; createdAt: string }>> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const item = await maybeOne<{ id: string }>(tx, "SELECT id FROM content_items WHERE id = $1 AND organization_id = $2", [contentId, auth.organizationId]);
    if (!item) throw new NotFoundError("Conteúdo não encontrado.");
    const rows = await many<{ id: number; action: string; name: string | null; actor_type: string; metadata: Record<string, unknown>; created_at: Date }>(
      tx,
      `SELECT l.id, l.action, u.name, l.actor_type, l.metadata, l.created_at
       FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE l.organization_id = $1 AND (
         (l.entity_type = 'content_item' AND l.entity_id = $2)
         OR (l.metadata->>'contentId' = $2)
         OR (l.entity_type = 'ai_run' AND l.entity_id IN (SELECT id::text FROM ai_runs WHERE content_item_id = $2::uuid))
       )
       ORDER BY l.created_at DESC LIMIT 200`,
      [auth.organizationId, contentId],
    );
    return rows.map((r) => ({ id: r.id, action: r.action, actorName: r.name, actorType: r.actor_type, metadata: r.metadata, createdAt: r.created_at.toISOString() }));
  });
}

export async function recordExport(auth: AuthContext, contentId: string, clientId: string, meta: { versionId: string; versionNumber: number; approved: boolean; format: string }): Promise<void> {
  await withTx(userCtx(auth.userId), (tx) =>
    audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: meta.approved ? "content.exported" : "content.draft_downloaded",
      entityType: "content_item",
      entityId: contentId,
      metadata: meta,
    }),
  );
}

/** Usado pelo worker: falha definitiva da geração reflete no conteúdo. */
export async function markGenerationFailed(tx: Queryable, contentItemId: string, message: string): Promise<void> {
  await tx.query("UPDATE content_items SET status = 'failed', last_error = $2 WHERE id = $1 AND status = 'generating'", [contentItemId, message.slice(0, 1000)]);
}

/** Reprocessamento manual de uma geração que falhou (Workflow E). */
export async function retryGeneration(auth: AuthContext, contentId: string): Promise<void> {
  assertCan(auth.role, "content.create");
  if (!getProvider()) throw new ProviderNotConfiguredError();
  await withTx(userCtx(auth.userId), async (tx) => {
    const item = await lockItem(tx, auth, contentId);
    if (item.status !== "failed") throw new ConflictError("Só é possível reprocessar gerações que falharam.");
    await assertWithinBudget(tx, item.client_id);
    const job = await maybeOne<{ id: string }>(tx, "SELECT id FROM jobs WHERE organization_id = $1 AND idempotency_key = $2", [auth.organizationId, `content:${contentId}:generate`]);
    if (!job) throw new NotFoundError("Tarefa de geração não encontrada.");
    const res = await tx.query(
      "UPDATE jobs SET status = 'queued', attempts = 0, run_after = now(), finished_at = NULL, last_error = NULL, created_by = $2 WHERE id = $1 AND status = 'failed'",
      [job.id, auth.userId],
    );
    if ((res.rowCount ?? 0) === 0) throw new ConflictError("A tarefa não está em estado de falha.");
    await tx.query("UPDATE content_items SET status = 'generating', last_error = NULL WHERE id = $1", [contentId]);
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, clientId: item.client_id, action: "content.generation_retried", entityType: "content_item", entityId: contentId, metadata: { jobId: job.id } });
  });
}
