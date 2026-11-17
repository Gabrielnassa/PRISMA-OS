import { z } from "zod";
import { many, maybeOne, one, systemCtx, userCtx, withTx, type Queryable } from "../db";
import type { AuthContext } from "../auth/types";
import { assertCan } from "../authz/permissions";
import { ValidationError } from "../errors";
import { randomToken, sha256 } from "../crypto/secrets";
import { ContentDocumentSchema, FORMAT_LABELS, referencedAssetIds, type ContentFormat } from "@/lib/content/document";
import { renderSlide, svgToPng } from "../render/engine";
import { audit, userActor } from "./audit";
import { requireClient } from "./clients";
import { loadImagesForRender } from "./media";
import { publicBase } from "./integration-apps";
import type { Network } from "./social-accounts";
import type { PostMetrics } from "../integrations/social/meta";

/**
 * Relatório do mês de um cliente: o que foi contratado e entregue, o que foi
 * publicado e como foi, e o ritmo das aprovações. Tudo calculado dos
 * registros; métricas só das publicações feitas pelo sistema. A equipe vê
 * pelo sistema e pode mandar ao cliente um link só de leitura (30 dias).
 */

const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const LINK_DAYS = 30;

export interface ReportPiece {
  contentId: string;
  title: string;
  format: string;
  plannedDate: string | null;
  approvedAt: string;
  versionId: string;
}

export interface ReportPost {
  id: string;
  network: Network;
  account: string;
  title: string;
  kind: string;
  publishedAt: string;
  url: string | null;
  metrics: PostMetrics | null;
}

export interface MonthlyReport {
  organizationName: string;
  clientName: string;
  month: string;
  contracted: number;
  delivered: number;
  videosDone: number;
  pieces: ReportPiece[];
  posts: ReportPost[];
  totals: {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    reach: number;
    views: number;
    withMetrics: number;
  };
  approvals: { approved: number; adjustments: number; avgHours: number | null; byClient: number };
  editorial: { planned: number; done: number; approved: boolean };
}

async function buildReport(tx: Queryable, clientId: string, month: string): Promise<MonthlyReport> {
  const start = `${month}-01`;
  const head = await one<{ client_name: string; org_name: string; contracted: number }>(
    tx,
    `SELECT c.name AS client_name, o.name AS org_name, coalesce((SELECT posts + carousels + stories + videos FROM client_packages WHERE client_id = c.id), 0) AS contracted
     FROM clients c JOIN organizations o ON o.id = c.organization_id WHERE c.id = $1`,
    [clientId],
  );
  const pieces = await many<{
    id: string;
    title: string;
    format: ContentFormat;
    planned_date: Date | null;
    approved_at: Date;
    version_id: string;
  }>(
    tx,
    `SELECT ci.id, ci.title, ci.format, (SELECT i.planned_date FROM editorial_items i WHERE i.content_item_id = ci.id LIMIT 1) AS planned_date,
            max(a.decided_at) AS approved_at, ci.approved_version_id AS version_id
     FROM content_items ci JOIN approvals a ON a.content_item_id = ci.id AND a.status = 'approved' AND a.content_version_id = ci.approved_version_id
     WHERE ci.client_id = $1 AND ci.status <> 'archived' AND a.decided_at >= $2::date AND a.decided_at < ($2::date + interval '1 month')
     GROUP BY ci.id ORDER BY coalesce((SELECT i.planned_date FROM editorial_items i WHERE i.content_item_id = ci.id LIMIT 1), max(a.decided_at)::date), ci.title`,
    [clientId, start],
  );
  const posts = await many<{
    id: string;
    network: Network;
    account_label: string;
    title: string;
    content_title: string | null;
    kind: string;
    published_at: Date;
    external_url: string | null;
    metrics: PostMetrics | null;
  }>(
    tx,
    `SELECT p.id, p.network, p.account_label, p.title, ci.title AS content_title, p.kind, p.published_at, p.external_url, p.metrics
     FROM publications p LEFT JOIN content_items ci ON ci.id = p.content_item_id
     WHERE p.client_id = $1 AND p.status = 'published' AND p.published_at >= $2::date AND p.published_at < ($2::date + interval '1 month')
     ORDER BY p.published_at`,
    [clientId, start],
  );
  const ap = await one<{ approved: number; adjustments: number; avg_hours: string | null; by_client: number }>(
    tx,
    `SELECT count(*) FILTER (WHERE status = 'approved')::int AS approved,
            count(*) FILTER (WHERE status = 'rejected')::int AS adjustments,
            (avg(extract(epoch FROM decided_at - requested_at)) FILTER (WHERE status IN ('approved', 'rejected')) / 3600)::text AS avg_hours,
            count(*) FILTER (WHERE decided_via = 'client_link')::int AS by_client
     FROM approvals WHERE client_id = $1 AND decided_at >= $2::date AND decided_at < ($2::date + interval '1 month')`,
    [clientId, start],
  );
  const ed = await maybeOne<{ planned: number; done: number; videos_done: number; status: string }>(
    tx,
    `SELECT count(i.*) FILTER (WHERE i.status <> 'skipped')::int AS planned,
            count(i.*) FILTER (WHERE i.status IN ('in_production', 'done'))::int AS done,
            count(i.*) FILTER (WHERE i.status = 'done' AND i.format = 'video')::int AS videos_done,
            pl.status
     FROM editorial_plans pl LEFT JOIN editorial_items i ON i.plan_id = pl.id WHERE pl.client_id = $1 AND pl.month = $2::date GROUP BY pl.status`,
    [clientId, start],
  );
  const totals = { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, views: 0, withMetrics: 0 };
  for (const p of posts) {
    if (!p.metrics) continue;
    totals.withMetrics++;
    totals.likes += p.metrics.likes ?? 0;
    totals.comments += p.metrics.comments ?? 0;
    totals.shares += p.metrics.shares ?? 0;
    totals.saves += p.metrics.saves ?? 0;
    totals.reach += p.metrics.reach ?? 0;
    totals.views += p.metrics.views ?? 0;
  }
  return {
    organizationName: head.org_name,
    clientName: head.client_name,
    month,
    contracted: head.contracted,
    delivered: pieces.length + (ed?.videos_done ?? 0),
    videosDone: ed?.videos_done ?? 0,
    pieces: pieces.map((p) => ({
      contentId: p.id,
      title: p.title,
      format: FORMAT_LABELS[p.format],
      plannedDate: p.planned_date ? p.planned_date.toISOString().slice(0, 10) : null,
      approvedAt: p.approved_at.toISOString(),
      versionId: p.version_id,
    })),
    posts: posts.map((p) => ({
      id: p.id,
      network: p.network,
      account: p.account_label,
      title: p.content_title ?? p.title,
      kind: p.kind,
      publishedAt: p.published_at.toISOString(),
      url: p.external_url,
      metrics: p.metrics,
    })),
    totals,
    approvals: {
      approved: ap.approved,
      adjustments: ap.adjustments,
      avgHours: ap.avg_hours === null ? null : Number(ap.avg_hours),
      byClient: ap.by_client,
    },
    editorial: { planned: ed?.planned ?? 0, done: ed?.done ?? 0, approved: ed?.status === "approved" },
  };
}

export async function monthlyReport(auth: AuthContext, clientId: string, month: string): Promise<MonthlyReport> {
  const m = MonthSchema.parse(month);
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    return buildReport(tx, clientId, m);
  });
}

export async function createReportLink(
  auth: AuthContext,
  clientId: string,
  month: string,
): Promise<{ url: string; expiresAt: string }> {
  assertCan(auth.role, "approval.share");
  const m = MonthSchema.safeParse(month);
  if (!m.success) throw new ValidationError("Mês inválido.");
  if (!publicBase().url) throw new ValidationError("Defina APP_URL (o endereço do sistema) para gerar links.");
  const token = randomToken(24);
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const r = await one<{ expires_at: Date }>(
      tx,
      `INSERT INTO report_links (organization_id, client_id, month, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3::date, $4, now() + make_interval(days => $5), $6) RETURNING expires_at`,
      [auth.organizationId, clientId, `${m.data}-01`, sha256(token), LINK_DAYS, auth.userId],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: "report.link_created",
      entityType: "client",
      entityId: clientId,
      metadata: { month: m.data },
    });
    return { url: `${publicBase().url}/relatorio/${token}`, expiresAt: r.expires_at.toISOString() };
  });
}

async function loadReportLink(token: string): Promise<{ id: string; client_id: string; month: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const r = await withTx(systemCtx("report_link.read"), (tx) =>
    maybeOne<{ id: string; client_id: string; month: Date }>(
      tx,
      `SELECT l.id, l.client_id, l.month FROM report_links l JOIN clients c ON c.id = l.client_id WHERE l.token_hash = $1 AND l.expires_at > now() AND c.status <> 'archived'`,
      [sha256(token)],
    ),
  );
  return r ? { id: r.id, client_id: r.client_id, month: r.month.toISOString().slice(0, 7) } : null;
}

/** Relatório pelo link enviado ao cliente; `null` se o link não vale. */
export async function publicReport(token: string): Promise<MonthlyReport | null> {
  const link = await loadReportLink(token);
  if (!link) return null;
  return withTx(systemCtx("report_link.view"), async (tx) => {
    await tx.query("UPDATE report_links SET opened_at = coalesce(opened_at, now()) WHERE id = $1", [link.id]);
    return buildReport(tx, link.client_id, link.month);
  });
}

/** Capa (primeira lâmina) de uma peça aprovada do relatório, para o link público. */
export async function publicReportCover(token: string, contentId: string): Promise<Buffer | null> {
  const link = await loadReportLink(token);
  if (!link || !z.string().uuid().safeParse(contentId).success) return null;
  const row = await withTx(systemCtx("report_link.cover"), (tx) =>
    maybeOne<{ document: unknown }>(
      tx,
      `SELECT v.document FROM content_items ci JOIN content_versions v ON v.id = ci.approved_version_id
       WHERE ci.id = $1 AND ci.client_id = $2 AND EXISTS (
         SELECT 1 FROM approvals a WHERE a.content_item_id = ci.id AND a.status = 'approved' AND a.decided_at >= $3::date AND a.decided_at < ($3::date + interval '1 month'))`,
      [contentId, link.client_id, `${link.month}-01`],
    ),
  );
  if (!row) return null;
  const doc = ContentDocumentSchema.parse(row.document);
  const images = await withTx(systemCtx("report_link.cover"), (tx) =>
    loadImagesForRender(tx, link.client_id, referencedAssetIds(doc)),
  );
  const slide = await renderSlide(doc, 0, { images });
  return svgToPng(slide.svg, 540);
}

export function assertMonth(month: string | undefined, fallback: string): string {
  return month && MonthSchema.safeParse(month).success ? month : fallback;
}
