import { many, one, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import type { ContentStatus } from "@/lib/content/status";
import type { Channel } from "@/lib/content/document";

export const DASHBOARD_PERIODS = ["month", "7d", "30d", "90d"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  month: "Mês atual",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
};

export interface DashboardFilter {
  clientId?: string;
  period?: DashboardPeriod;
  channel?: Channel;
  status?: ContentStatus;
}

export interface DashboardData {
  clients: { active: number; total: number };
  contentByStatus: Partial<Record<ContentStatus, number>>;
  producedInPeriod: number;
  approvedInPeriod: number;
  pendingApprovals: number;
  failedJobs: number;
  runningJobs: number;
  ai: { runs: number; costUsd: number; unpriced: number; demoRuns: number };
  avgHoursToApproval: number | null;
  recent: Array<{ id: string; title: string; clientName: string; status: ContentStatus; updatedAt: string }>;
  perClient: Array<{ clientId: string; name: string; contents: number; pending: number; approved: number; costUsd: number }>;
}

/**
 * Filtros como uma linha `f` (cliente, início do período, canal e status),
 * reaproveitada por todas as consultas. O início do período é calculado no
 * banco, no mesmo fuso das datas registradas.
 */
const F = `WITH f AS (
  SELECT $1::uuid AS org, $2::uuid AS client, $4::text AS channel, $5::text AS status,
         CASE $3::text WHEN '7d' THEN now() - interval '7 days' WHEN '30d' THEN now() - interval '30 days'
                       WHEN '90d' THEN now() - interval '90 days' ELSE date_trunc('month', now()) END AS since
)`;
/** Conteúdo `ci` que atende cliente, canal e status. */
const ITEM = "ci.organization_id = f.org AND (f.client IS NULL OR ci.client_id = f.client) AND (f.channel IS NULL OR ci.channel = f.channel) AND (f.status IS NULL OR ci.status = f.status)";

/**
 * Indicadores calculados exclusivamente a partir dos registros do banco, com
 * filtros por cliente, período, canal e status. O RLS garante que cada usuário
 * veja apenas os clientes a que tem acesso.
 */
export async function getDashboard(auth: AuthContext, filter: DashboardFilter = {}): Promise<DashboardData> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const params = [auth.organizationId, filter.clientId ?? null, filter.period ?? "month", filter.channel ?? null, filter.status ?? null];
    const clients = await one<{ active: number; total: number }>(
      tx,
      `${F} SELECT count(*) FILTER (WHERE c.status = 'active')::int AS active, count(*) FILTER (WHERE c.status <> 'archived')::int AS total
       FROM clients c, f WHERE c.organization_id = f.org AND (f.client IS NULL OR c.id = f.client)`,
      params,
    );
    // Fluxo de produção: todos os estados (o filtro de status não esconde o fluxo).
    const statusRows = await many<{ status: ContentStatus; n: number }>(
      tx,
      `${F} SELECT ci.status, count(*)::int AS n FROM content_items ci, f
       WHERE ci.organization_id = f.org AND (f.client IS NULL OR ci.client_id = f.client) AND (f.channel IS NULL OR ci.channel = f.channel)
       GROUP BY ci.status`,
      params,
    );
    const period = await one<{ produced: number; approved: number }>(
      tx,
      `${F} SELECT
         (SELECT count(*)::int FROM content_items ci WHERE ${ITEM} AND ci.created_at >= f.since) AS produced,
         (SELECT count(*)::int FROM approvals a JOIN content_items ci ON ci.id = a.content_item_id
          WHERE ${ITEM} AND a.status = 'approved' AND a.decided_at >= f.since) AS approved
       FROM f`,
      params,
    );
    const pending = await one<{ n: number }>(
      tx,
      `${F} SELECT count(*)::int AS n FROM approvals a JOIN content_items ci ON ci.id = a.content_item_id, f WHERE ${ITEM} AND a.status = 'pending'`,
      params,
    );
    const jobs = await one<{ failed: number; running: number }>(
      tx,
      `${F} SELECT count(*) FILTER (WHERE j.status = 'failed' AND j.updated_at >= f.since)::int AS failed,
              count(*) FILTER (WHERE j.status IN ('queued', 'running'))::int AS running
       FROM jobs j JOIN content_items ci ON ci.id::text = j.payload->>'contentItemId', f
       WHERE j.organization_id = f.org AND ${ITEM}`,
      params,
    );
    // Consumo de IA: com canal ou status, só execuções ligadas a conteúdos que atendem ao filtro.
    const ai = await one<{ runs: number; cost: string; unpriced: number; demo: number }>(
      tx,
      `${F} SELECT count(*)::int AS runs, coalesce(sum(r.cost_usd), 0)::text AS cost,
              count(*) FILTER (WHERE r.cost_usd IS NULL AND NOT r.is_demo AND r.status = 'succeeded')::int AS unpriced,
              count(*) FILTER (WHERE r.is_demo)::int AS demo
       FROM ai_runs r LEFT JOIN content_items ci ON ci.id = r.content_item_id, f
       WHERE r.organization_id = f.org AND (f.client IS NULL OR r.client_id = f.client) AND r.created_at >= f.since
         AND (f.channel IS NULL OR ci.channel = f.channel) AND (f.status IS NULL OR ci.status = f.status)`,
      params,
    );
    const tta = await one<{ hours: string | null }>(
      tx,
      `${F} SELECT avg(extract(epoch FROM a.decided_at - ci.created_at) / 3600)::text AS hours
       FROM approvals a JOIN content_items ci ON ci.id = a.content_item_id, f
       WHERE ${ITEM} AND a.status = 'approved' AND a.decided_at >= f.since`,
      params,
    );
    const recent = await many<{ id: string; title: string; client_name: string; status: ContentStatus; updated_at: Date }>(
      tx,
      `${F} SELECT ci.id, ci.title, cl.name AS client_name, ci.status, ci.updated_at
       FROM content_items ci JOIN clients cl ON cl.id = ci.client_id, f
       WHERE ${ITEM}
       ORDER BY ci.updated_at DESC LIMIT 8`,
      params,
    );
    const perClient = await many<{ id: string; name: string; contents: number; pending: number; approved: number; cost: string }>(
      tx,
      `${F} SELECT cl.id, cl.name,
              (SELECT count(*)::int FROM content_items ci WHERE ${ITEM} AND ci.client_id = cl.id AND ci.status <> 'archived' AND ci.created_at >= f.since) AS contents,
              (SELECT count(*)::int FROM approvals a JOIN content_items ci ON ci.id = a.content_item_id WHERE ${ITEM} AND ci.client_id = cl.id AND a.status = 'pending') AS pending,
              (SELECT count(*)::int FROM approvals a JOIN content_items ci ON ci.id = a.content_item_id
                WHERE ${ITEM} AND ci.client_id = cl.id AND a.status = 'approved' AND a.decided_at >= f.since) AS approved,
              (SELECT coalesce(sum(r.cost_usd), 0)::text FROM ai_runs r LEFT JOIN content_items ci ON ci.id = r.content_item_id
                WHERE r.client_id = cl.id AND r.created_at >= f.since AND (f.channel IS NULL OR ci.channel = f.channel) AND (f.status IS NULL OR ci.status = f.status)) AS cost
       FROM clients cl, f WHERE cl.organization_id = f.org AND cl.status <> 'archived' AND (f.client IS NULL OR cl.id = f.client)
       ORDER BY cl.name LIMIT 50`,
      params,
    );
    return {
      clients,
      contentByStatus: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
      producedInPeriod: period.produced,
      approvedInPeriod: period.approved,
      pendingApprovals: pending.n,
      failedJobs: jobs.failed,
      runningJobs: jobs.running,
      ai: { runs: ai.runs, costUsd: Number(ai.cost), unpriced: ai.unpriced, demoRuns: ai.demo },
      avgHoursToApproval: tta.hours === null ? null : Number(tta.hours),
      recent: recent.map((r) => ({ id: r.id, title: r.title, clientName: r.client_name, status: r.status, updatedAt: r.updated_at.toISOString() })),
      perClient: perClient.map((r) => ({ clientId: r.id, name: r.name, contents: r.contents, pending: r.pending, approved: r.approved, costUsd: Number(r.cost) })),
    };
  });
}
