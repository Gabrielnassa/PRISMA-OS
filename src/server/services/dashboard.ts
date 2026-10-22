import { many, one, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import type { ContentStatus } from "@/lib/content/status";

export interface DashboardData {
  clients: { active: number; total: number };
  contentByStatus: Partial<Record<ContentStatus, number>>;
  producedThisMonth: number;
  approvedThisMonth: number;
  pendingApprovals: number;
  failedJobs: number;
  runningJobs: number;
  ai: { runs: number; costUsd: number; unpriced: number; demoRuns: number };
  avgHoursToApproval: number | null;
  recent: Array<{ id: string; title: string; clientName: string; status: ContentStatus; updatedAt: string }>;
  perClient: Array<{ clientId: string; name: string; contents: number; pending: number; approved: number; costUsd: number }>;
}

/**
 * Indicadores calculados exclusivamente a partir dos registros do banco.
 * O filtro por cliente respeita o RLS: cada usuário vê apenas seus clientes.
 */
export async function getDashboard(auth: AuthContext, clientId?: string): Promise<DashboardData> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const org = auth.organizationId;
    const c = clientId ?? null;
    const clients = await one<{ active: number; total: number }>(
      tx,
      `SELECT count(*) FILTER (WHERE status = 'active')::int AS active, count(*) FILTER (WHERE status <> 'archived')::int AS total
       FROM clients WHERE organization_id = $1 AND ($2::uuid IS NULL OR id = $2)`,
      [org, c],
    );
    const statusRows = await many<{ status: ContentStatus; n: number }>(
      tx,
      "SELECT status, count(*)::int AS n FROM content_items WHERE organization_id = $1 AND ($2::uuid IS NULL OR client_id = $2) GROUP BY status",
      [org, c],
    );
    const month = await one<{ produced: number; approved: number }>(
      tx,
      `SELECT
         (SELECT count(*)::int FROM content_items WHERE organization_id = $1 AND ($2::uuid IS NULL OR client_id = $2) AND created_at >= date_trunc('month', now())) AS produced,
         (SELECT count(*)::int FROM approvals WHERE organization_id = $1 AND ($2::uuid IS NULL OR client_id = $2) AND status = 'approved' AND decided_at >= date_trunc('month', now())) AS approved`,
      [org, c],
    );
    const pending = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM approvals WHERE organization_id = $1 AND ($2::uuid IS NULL OR client_id = $2) AND status = 'pending'", [org, c]);
    const jobs = await one<{ failed: number; running: number }>(
      tx,
      `SELECT count(*) FILTER (WHERE status = 'failed' AND updated_at > now() - interval '7 days')::int AS failed,
              count(*) FILTER (WHERE status IN ('queued', 'running'))::int AS running
       FROM jobs WHERE organization_id = $1 AND ($2::uuid IS NULL OR client_id = $2)`,
      [org, c],
    );
    const ai = await one<{ runs: number; cost: string; unpriced: number; demo: number }>(
      tx,
      `SELECT count(*)::int AS runs, coalesce(sum(cost_usd), 0)::text AS cost,
              count(*) FILTER (WHERE cost_usd IS NULL AND NOT is_demo AND status = 'succeeded')::int AS unpriced,
              count(*) FILTER (WHERE is_demo)::int AS demo
       FROM ai_runs WHERE organization_id = $1 AND ($2::uuid IS NULL OR client_id = $2) AND created_at >= date_trunc('month', now())`,
      [org, c],
    );
    const tta = await one<{ hours: string | null }>(
      tx,
      `SELECT avg(extract(epoch FROM a.decided_at - ci.created_at) / 3600)::text AS hours
       FROM approvals a JOIN content_items ci ON ci.id = a.content_item_id
       WHERE a.organization_id = $1 AND ($2::uuid IS NULL OR a.client_id = $2) AND a.status = 'approved' AND a.decided_at > now() - interval '90 days'`,
      [org, c],
    );
    const recent = await many<{ id: string; title: string; client_name: string; status: ContentStatus; updated_at: Date }>(
      tx,
      `SELECT ci.id, ci.title, cl.name AS client_name, ci.status, ci.updated_at
       FROM content_items ci JOIN clients cl ON cl.id = ci.client_id
       WHERE ci.organization_id = $1 AND ($2::uuid IS NULL OR ci.client_id = $2)
       ORDER BY ci.updated_at DESC LIMIT 8`,
      [org, c],
    );
    const perClient = await many<{ id: string; name: string; contents: number; pending: number; approved: number; cost: string }>(
      tx,
      `SELECT cl.id, cl.name,
              (SELECT count(*)::int FROM content_items ci WHERE ci.client_id = cl.id AND ci.status <> 'archived') AS contents,
              (SELECT count(*)::int FROM approvals a WHERE a.client_id = cl.id AND a.status = 'pending') AS pending,
              (SELECT count(*)::int FROM content_items ci WHERE ci.client_id = cl.id AND ci.status = 'approved') AS approved,
              (SELECT coalesce(sum(cost_usd), 0)::text FROM ai_runs r WHERE r.client_id = cl.id AND r.created_at >= date_trunc('month', now())) AS cost
       FROM clients cl WHERE cl.organization_id = $1 AND cl.status <> 'archived' AND ($2::uuid IS NULL OR cl.id = $2)
       ORDER BY cl.name LIMIT 50`,
      [org, c],
    );
    return {
      clients,
      contentByStatus: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
      producedThisMonth: month.produced,
      approvedThisMonth: month.approved,
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
