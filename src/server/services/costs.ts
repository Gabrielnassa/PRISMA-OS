import { z } from "zod";
import { many, maybeOne, one, userCtx, withTx, type Queryable } from "../db";
import { assertCan } from "../authz/permissions";
import type { AuthContext } from "../auth/types";
import { BudgetExceededError, ValidationError } from "../errors";
import type { TokenUsage } from "../ai/types";
import { audit, userActor } from "./audit";
import { requireClient } from "./clients";

export interface PriceRow {
  id: string;
  provider: string;
  model: string;
  input_usd_per_mtok: string;
  output_usd_per_mtok: string;
  cache_read_usd_per_mtok: string | null;
  cache_write_usd_per_mtok: string | null;
  source: string;
  effective_from: Date;
}

/** Tarifa vigente (a mais recente com início no passado) para o modelo. */
export async function currentPrice(tx: Queryable, organizationId: string, provider: string, model: string): Promise<PriceRow | null> {
  return maybeOne<PriceRow>(
    tx,
    `SELECT id, provider, model, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, source, effective_from
     FROM provider_prices
     WHERE organization_id = $1 AND provider = $2 AND model = $3 AND effective_from <= now()
     ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
    [organizationId, provider, model],
  );
}

/** Custo em USD; leitura/escrita de cache sem tarifa cadastrada são cobradas como entrada. */
export function computeCostUsd(usage: TokenUsage, price: PriceRow): number {
  const inP = Number(price.input_usd_per_mtok);
  const outP = Number(price.output_usd_per_mtok);
  const crP = price.cache_read_usd_per_mtok === null ? inP : Number(price.cache_read_usd_per_mtok);
  const cwP = price.cache_write_usd_per_mtok === null ? inP : Number(price.cache_write_usd_per_mtok);
  const usd = (usage.inputTokens * inP + usage.outputTokens * outP + usage.cacheReadTokens * crP + usage.cacheWriteTokens * cwP) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Gasto do mês para o teto: custo calculado ou, sem tarifa, a estimativa registrada. */
export async function monthToDateSpend(tx: Queryable, clientId: string): Promise<number> {
  const row = await one<{ total: string | null }>(
    tx,
    `SELECT coalesce(sum(coalesce(cost_usd, estimated_cost_usd)), 0)::text AS total FROM ai_runs
     WHERE client_id = $1 AND created_at >= date_trunc('month', now())`,
    [clientId],
  );
  return Number(row.total ?? 0);
}

/** Interrompe operações de IA quando o teto mensal do cliente foi atingido. */
export async function assertWithinBudget(tx: Queryable, clientId: string): Promise<{ spent: number; limit: number | null; alert: boolean }> {
  const budget = await maybeOne<{ monthly_limit_usd: string; alert_threshold_pct: number; hard_stop: boolean }>(
    tx,
    "SELECT monthly_limit_usd, alert_threshold_pct, hard_stop FROM client_budgets WHERE client_id = $1",
    [clientId],
  );
  const spent = await monthToDateSpend(tx, clientId);
  if (!budget) return { spent, limit: null, alert: false };
  const limit = Number(budget.monthly_limit_usd);
  if (budget.hard_stop && spent >= limit) {
    throw new BudgetExceededError(
      `Teto mensal de IA deste cliente atingido (US$ ${spent.toFixed(2)} de US$ ${limit.toFixed(2)}). Ajuste o limite em Custos e consumo.`,
    );
  }
  return { spent, limit, alert: spent >= (limit * budget.alert_threshold_pct) / 100 };
}

export interface CostSummary {
  month: string;
  totals: { runs: number; failed: number; costUsd: number; unpricedRuns: number; unpricedEstimateUsd: number; inputTokens: number; outputTokens: number; demoRuns: number };
  byClient: Array<{ clientId: string | null; clientName: string; runs: number; costUsd: number; budgetSpendUsd: number; limitUsd: number | null; alertPct: number | null; hardStop: boolean | null }>;
  bySkill: Array<{ skillId: string; runs: number; costUsd: number; avgDurationMs: number | null }>;
  recent: Array<{ id: string; createdAt: string; clientName: string | null; skillId: string; model: string; status: string; isDemo: boolean; inputTokens: number; outputTokens: number; costUsd: number | null; estimatedCostUsd: number | null; durationMs: number | null; errorMessage: string | null }>;
  prices: Array<{ id: string; provider: string; model: string; input: string; output: string; cacheRead: string | null; cacheWrite: string | null; source: string; effectiveFrom: string }>;
}

export async function getCostSummary(auth: AuthContext): Promise<CostSummary> {
  assertCan(auth.role, "costs.view");
  return withTx(userCtx(auth.userId), async (tx) => {
    const org = auth.organizationId;
    const totals = await one<{ runs: number; failed: number; cost: string; unpriced: number; unpriced_est: string; input: string; output: string; demo: number }>(
      tx,
      `SELECT count(*)::int AS runs, count(*) FILTER (WHERE status <> 'succeeded')::int AS failed,
              coalesce(sum(cost_usd), 0)::text AS cost,
              count(*) FILTER (WHERE cost_usd IS NULL AND NOT is_demo AND (input_tokens + output_tokens) > 0)::int AS unpriced,
              coalesce(sum(estimated_cost_usd) FILTER (WHERE cost_usd IS NULL), 0)::text AS unpriced_est,
              coalesce(sum(input_tokens + cache_read_tokens + cache_write_tokens), 0)::text AS input,
              coalesce(sum(output_tokens), 0)::text AS output,
              count(*) FILTER (WHERE is_demo)::int AS demo
       FROM ai_runs WHERE organization_id = $1 AND created_at >= date_trunc('month', now())`,
      [org],
    );
    const byClient = await many<{ client_id: string | null; name: string | null; runs: number; cost: string; spend: string; limit_usd: string | null; alert: number | null; hard_stop: boolean | null }>(
      tx,
      `SELECT c.id AS client_id, c.name, count(r.id)::int AS runs, coalesce(sum(r.cost_usd), 0)::text AS cost,
              coalesce(sum(coalesce(r.cost_usd, r.estimated_cost_usd)), 0)::text AS spend,
              b.monthly_limit_usd::text AS limit_usd, b.alert_threshold_pct AS alert, b.hard_stop
       FROM clients c
       LEFT JOIN ai_runs r ON r.client_id = c.id AND r.created_at >= date_trunc('month', now())
       LEFT JOIN client_budgets b ON b.client_id = c.id
       WHERE c.organization_id = $1 AND c.status <> 'archived'
       GROUP BY c.id, c.name, b.monthly_limit_usd, b.alert_threshold_pct, b.hard_stop
       ORDER BY coalesce(sum(r.cost_usd), 0) DESC, c.name`,
      [org],
    );
    const bySkill = await many<{ skill_id: string; runs: number; cost: string; avg_ms: string | null }>(
      tx,
      `SELECT skill_id, count(*)::int AS runs, coalesce(sum(cost_usd), 0)::text AS cost, avg(duration_ms)::text AS avg_ms
       FROM ai_runs WHERE organization_id = $1 AND created_at >= date_trunc('month', now())
       GROUP BY skill_id ORDER BY runs DESC`,
      [org],
    );
    const recent = await many<{
      id: string; created_at: Date; client_name: string | null; skill_id: string; model: string; status: string; is_demo: boolean;
      input_tokens: number; output_tokens: number; cost_usd: string | null; estimated_cost_usd: string | null; duration_ms: number | null; error_message: string | null;
    }>(
      tx,
      `SELECT r.id, r.created_at, c.name AS client_name, r.skill_id, r.model, r.status, r.is_demo, r.input_tokens, r.output_tokens,
              r.cost_usd::text, r.estimated_cost_usd::text, r.duration_ms, r.error_message
       FROM ai_runs r LEFT JOIN clients c ON c.id = r.client_id
       WHERE r.organization_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
      [org],
    );
    const prices = await many<PriceRow & { created_at: Date }>(
      tx,
      `SELECT id, provider, model, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, source, effective_from, created_at
       FROM provider_prices WHERE organization_id = $1 ORDER BY provider, model, effective_from DESC`,
      [org],
    );
    return {
      month: new Date().toISOString().slice(0, 7),
      totals: {
        runs: totals.runs,
        failed: totals.failed,
        costUsd: Number(totals.cost),
        unpricedRuns: totals.unpriced,
        unpricedEstimateUsd: Number(totals.unpriced_est),
        inputTokens: Number(totals.input),
        outputTokens: Number(totals.output),
        demoRuns: totals.demo,
      },
      byClient: byClient.map((r) => ({
        clientId: r.client_id,
        clientName: r.name ?? "—",
        runs: r.runs,
        costUsd: Number(r.cost),
        budgetSpendUsd: Number(r.spend),
        limitUsd: r.limit_usd === null ? null : Number(r.limit_usd),
        alertPct: r.alert,
        hardStop: r.hard_stop,
      })),
      bySkill: bySkill.map((r) => ({ skillId: r.skill_id, runs: r.runs, costUsd: Number(r.cost), avgDurationMs: r.avg_ms === null ? null : Math.round(Number(r.avg_ms)) })),
      recent: recent.map((r) => ({
        id: r.id,
        createdAt: r.created_at.toISOString(),
        clientName: r.client_name,
        skillId: r.skill_id,
        model: r.model,
        status: r.status,
        isDemo: r.is_demo,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
        estimatedCostUsd: r.estimated_cost_usd === null ? null : Number(r.estimated_cost_usd),
        durationMs: r.duration_ms,
        errorMessage: r.error_message,
      })),
      prices: prices.map((p) => ({
        id: p.id,
        provider: p.provider,
        model: p.model,
        input: p.input_usd_per_mtok,
        output: p.output_usd_per_mtok,
        cacheRead: p.cache_read_usd_per_mtok,
        cacheWrite: p.cache_write_usd_per_mtok,
        source: p.source,
        effectiveFrom: p.effective_from.toISOString(),
      })),
    };
  });
}

const money = z.coerce.number().min(0, "Valor inválido").max(100000);

export const AddPriceSchema = z.object({
  provider: z.string().trim().min(2).max(60),
  model: z.string().trim().min(2).max(120),
  input: money,
  output: money,
  cacheRead: money.optional(),
  cacheWrite: money.optional(),
  source: z.string().trim().min(3, "Informe a fonte da tarifa (link ou documento).").max(1000),
});

export async function addPrice(auth: AuthContext, input: z.input<typeof AddPriceSchema>): Promise<void> {
  assertCan(auth.role, "costs.manage");
  const data = AddPriceSchema.parse(input);
  await withTx(userCtx(auth.userId), async (tx) => {
    const row = await one<{ id: string }>(
      tx,
      `INSERT INTO provider_prices (organization_id, provider, model, input_usd_per_mtok, output_usd_per_mtok, cache_read_usd_per_mtok, cache_write_usd_per_mtok, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [auth.organizationId, data.provider, data.model, data.input, data.output, data.cacheRead ?? null, data.cacheWrite ?? null, data.source, auth.userId],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      action: "price.added",
      entityType: "provider_price",
      entityId: row.id,
      metadata: { provider: data.provider, model: data.model, input: data.input, output: data.output },
    });
  });
}

export const BudgetSchema = z.object({
  monthlyLimitUsd: money,
  alertThresholdPct: z.coerce.number().int().min(1).max(100).default(80),
  hardStop: z.boolean().default(true),
});

export async function setClientBudget(auth: AuthContext, clientId: string, input: z.input<typeof BudgetSchema> | null): Promise<void> {
  assertCan(auth.role, "costs.manage");
  await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    if (input === null) {
      await tx.query("DELETE FROM client_budgets WHERE client_id = $1", [clientId]);
    } else {
      const data = BudgetSchema.safeParse(input);
      if (!data.success) throw new ValidationError("Limite inválido.");
      await tx.query(
        `INSERT INTO client_budgets (client_id, organization_id, monthly_limit_usd, alert_threshold_pct, hard_stop, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (client_id) DO UPDATE SET monthly_limit_usd = EXCLUDED.monthly_limit_usd,
           alert_threshold_pct = EXCLUDED.alert_threshold_pct, hard_stop = EXCLUDED.hard_stop,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [clientId, auth.organizationId, data.data.monthlyLimitUsd, data.data.alertThresholdPct, data.data.hardStop, auth.userId],
      );
    }
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: input === null ? "budget.removed" : "budget.set",
      entityType: "client_budget",
      entityId: clientId,
      metadata: input ?? {},
    });
  });
}
