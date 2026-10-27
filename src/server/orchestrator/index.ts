import crypto from "node:crypto";
import { maybeOne, one, systemCtx, userCtx, withTx, type Queryable } from "../db";
import type { AuthContext } from "../auth/types";
import { env } from "../env";
import { ConflictError, IntegrationError, ProviderNotConfiguredError, RateLimitError, ValidationError } from "../errors";
import { getProvider } from "../ai/gateway";
import type { StructuredResult, TokenUsage, UsageByModel } from "../ai/types";
import type { AiSkill } from "../skills/types";
import { assertWithinBudget, computeCostUsd, currentPrice, type PriceRow } from "../services/costs";
import { audit, userActor } from "../services/audit";
import { requireClient } from "../services/clients";
import { buildClientContext } from "./context";

export interface SkillRunRequest<I> {
  auth: AuthContext;
  clientId: string;
  input: I;
  contentItemId?: string | null;
  jobId?: string | null;
  /** Mesma chave => mesma execução (reaproveita resultado bem-sucedido, sem nova cobrança). */
  idempotencyKey?: string;
  /** Dados extras guardados no resumo da execução (ex.: o pedido de uma skill personalizada). */
  summary?: Record<string, unknown>;
}

export interface SkillRunResult<O> {
  runId: string;
  output: O;
  isDemo: boolean;
  model: string;
  usage: TokenUsage;
  costUsd: number | null;
  reused: boolean;
}

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", msg: event, ...data, at: new Date().toISOString() }));
}

/** Outra chamada com a mesma chave ainda está em andamento: tentar de novo depois (sem nova cobrança). */
export class AiRunInProgressError extends ConflictError {
  readonly retryable = true;
  constructor() {
    super("Esta tarefa de IA já está em execução. Aguarde alguns instantes e tente novamente.");
  }
}

/**
 * Chave efetiva: a chave pedida + skill/versão + provedor/modelo + resumo da
 * entrada. Mudou qualquer um deles (template, plano de lâminas, versão da
 * skill, saída de demonstração vs. IA real), a execução anterior não é reaproveitada.
 */
function effectiveKey(key: string, skillId: string, skillVersion: string, providerKey: string, input: unknown): string {
  const digest = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
  return `${key}|${skillId}@${skillVersion}|${providerKey}|${digest}`;
}

const ZERO: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/**
 * Custo por modelo que atendeu. Sem tarifa para algum modelo, o custo oficial
 * fica nulo ("sem tarifa") e a estimativa usa a tarifa do modelo configurado,
 * para que o teto mensal do cliente continue valendo.
 */
async function priceUsage(tx: Queryable, organizationId: string, providerId: string, primaryModel: string, byModel: UsageByModel) {
  const primary = await currentPrice(tx, organizationId, providerId, primaryModel);
  let cost: number | null = 0;
  let estimated: number | null = 0;
  let priceId: string | null = null;
  const breakdown: Array<{ model: string; usage: TokenUsage; costUsd: number | null; priceId: string | null }> = [];
  for (const entry of byModel) {
    const price: PriceRow | null = entry.model === primaryModel ? primary : await currentPrice(tx, organizationId, providerId, entry.model);
    const c = price ? computeCostUsd(entry.usage, price) : null;
    breakdown.push({ model: entry.model, usage: entry.usage, costUsd: c, priceId: price?.id ?? null });
    priceId ??= price?.id ?? null;
    cost = cost === null || c === null ? null : cost + c;
    const est = c ?? (primary ? computeCostUsd(entry.usage, primary) : null);
    estimated = estimated === null || est === null ? null : estimated + est;
  }
  const round = (v: number | null) => (v === null ? null : Math.round(v * 1_000_000) / 1_000_000);
  return { cost: round(cost), estimated: round(estimated), priceId, breakdown };
}

/**
 * Orquestrador (seção 8): valida acesso e limites, recupera contexto, executa
 * a skill pelo gateway de IA, valida a saída e registra resultado, custo e erros.
 */
export async function runAiSkill<I, O, In>(skill: AiSkill<I, O, In>, req: SkillRunRequest<In>): Promise<SkillRunResult<O>> {
  const parsedInput = skill.inputSchema.safeParse(req.input);
  if (!parsedInput.success) throw new ValidationError(`Entrada inválida para a skill ${skill.name}.`);
  const input = parsedInput.data;
  const provider = getProvider();
  if (!provider) throw new ProviderNotConfiguredError();
  const { auth } = req;

  const key = req.idempotencyKey ? effectiveKey(req.idempotencyKey, skill.id, skill.version, provider.isDemo ? "demo" : `${provider.id}:${provider.model}`, input) : null;

  // 1) Reaproveitamento idempotente e preparação (transação curta, sem chamada externa).
  const prep = await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, req.clientId);
    if (key) {
      const existing = await maybeOne<{
        id: string; status: string; output: unknown; is_demo: boolean; model: string; input_tokens: number; output_tokens: number;
        cache_read_tokens: number; cache_write_tokens: number; cost_usd: string | null; stale: boolean;
      }>(
        tx,
        `SELECT id, status, output, is_demo, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd,
                created_at < now() - make_interval(secs => $3) AS stale
         FROM ai_runs WHERE organization_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [auth.organizationId, key, (env().AI_TIMEOUT_MS * 2 + 60_000) / 1000],
      );
      if (existing?.status === "succeeded") {
        const out = skill.outputSchema.safeParse(existing.output);
        if (out.success) return { reuse: existing, output: out.data };
      }
      // Chamada com a mesma chave ainda em andamento: não paga duas vezes.
      if (existing?.status === "running" && !existing.stale) throw new AiRunInProgressError();
      if (existing) {
        // Execução anterior falhou ou foi abandonada: libera a chave, preservando o histórico.
        await tx.query(
          `UPDATE ai_runs SET idempotency_key = idempotency_key || ':retry:' || id,
             status = CASE WHEN status = 'running' THEN 'failed' ELSE status END,
             error_code = CASE WHEN status = 'running' THEN 'abandoned' ELSE error_code END,
             finished_at = coalesce(finished_at, now())
           WHERE id = $1`,
          [existing.id],
        );
      }
    }
    if (!req.jobId) {
      // Chamadas interativas (ideias, revisão) têm limite por pessoa, como as gerações.
      const recent = await one<{ n: number }>(
        tx,
        "SELECT count(*)::int AS n FROM ai_runs WHERE created_by = $1 AND job_id IS NULL AND created_at > now() - interval '1 minute'",
        [auth.userId],
      );
      if (recent.n >= env().GENERATION_RATE_PER_MINUTE) throw new RateLimitError("Muitas solicitações à IA em sequência. Aguarde um minuto.");
    }
    await assertWithinBudget(tx, req.clientId);
    const context = await buildClientContext(tx, auth.organizationId, req.clientId);
    const run = await maybeOne<{ id: string }>(
      tx,
      `INSERT INTO ai_runs (organization_id, client_id, content_item_id, job_id, skill_id, skill_version, provider, model, is_demo,
         status, input_summary, idempotency_key, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'running', $10, $11, $12)
       ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        auth.organizationId,
        req.clientId,
        req.contentItemId ?? null,
        req.jobId ?? null,
        skill.id,
        skill.version,
        provider.id,
        provider.model,
        provider.isDemo,
        JSON.stringify({ ...req.summary, memoryCount: context.memoryCount, contextChars: context.text.length }),
        key,
        auth.userId,
      ],
    );
    // Outra requisição criou a mesma execução ao mesmo tempo.
    if (!run) throw new AiRunInProgressError();
    return { reuse: null, runId: run.id, context };
  });

  if (prep.reuse) {
    const r = prep.reuse;
    log("skill.reused", { skill: skill.id, runId: r.id });
    return {
      runId: r.id,
      output: prep.output as O,
      isDemo: r.is_demo,
      model: r.model,
      usage: { inputTokens: r.input_tokens, outputTokens: r.output_tokens, cacheReadTokens: r.cache_read_tokens, cacheWriteTokens: r.cache_write_tokens },
      costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
      reused: true,
    };
  }
  const { runId, context } = prep as { runId: string; context: Awaited<ReturnType<typeof buildClientContext>> };

  // 2) Chamada ao provedor, fora de transação.
  const started = Date.now();
  let result: StructuredResult<O> | null = null;
  let failure: IntegrationError | null = null;
  let technicalError: string | null = null;
  try {
    result = await provider.generateStructured<O>({
      system: skill.instructions,
      context: context.text,
      task: skill.buildTask(input),
      schema: skill.outputSchema,
      maxTokens: skill.maxTokens,
      effort: skill.effort,
      demo: () => skill.demo(input),
    });
  } catch (err) {
    if (err instanceof IntegrationError) failure = err;
    else {
      // Erro fora do mapeamento do provedor: a pessoa vê uma mensagem genérica; o detalhe fica no registro da execução.
      technicalError = (err as Error)?.message ?? String(err);
      failure = new IntegrationError("Falha inesperada ao chamar a IA. O detalhe foi registrado.", false, { cause: err, providerCode: "unexpected" });
    }
  }

  // 3) Registro do resultado, custo e auditoria. Em contexto de sistema (a
  // execução já foi autorizada na preparação): se a pessoa perder o acesso
  // durante a chamada, o consumo cobrado continua registrado.
  const billed = (failure as unknown as { usage?: TokenUsage; usageByModel?: UsageByModel; model?: string } | null) ?? null;
  const usage: TokenUsage = result?.usage ?? billed?.usage ?? ZERO;
  const servedModel = result?.model ?? billed?.model ?? provider.model;
  const usageByModel: UsageByModel = result?.usageByModel ?? billed?.usageByModel ?? [{ model: servedModel, usage }];
  const output = result ? (skill.postProcess ? skill.postProcess(result.data, input) : result.data) : null;
  const costUsd = await withTx(systemCtx("ai.record_run"), async (tx) => {
    const priced = provider.isDemo
      ? { cost: 0, estimated: 0, priceId: null, breakdown: [] }
      : await priceUsage(tx, auth.organizationId, provider.id, provider.model, usageByModel);
    await tx.query(
      `UPDATE ai_runs SET status = $2, model = $3, input_tokens = $4, output_tokens = $5, cache_read_tokens = $6, cache_write_tokens = $7,
         cost_usd = $8, price_id = $9, duration_ms = $10, error_code = $11, error_message = $12, output = $13, finished_at = now(),
         estimated_cost_usd = $14, usage_breakdown = $15
       WHERE id = $1`,
      [
        runId,
        result ? "succeeded" : failure?.code === "refused" ? "refused" : "failed",
        servedModel,
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheReadTokens,
        usage.cacheWriteTokens,
        priced.cost,
        priced.priceId,
        Date.now() - started,
        failure?.code ?? null,
        (technicalError ?? failure?.message ?? null)?.slice(0, 2000) ?? null,
        output === null ? null : JSON.stringify(output),
        priced.estimated,
        priced.breakdown.length > 1 ? JSON.stringify(priced.breakdown) : null,
      ],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: req.clientId,
      action: result ? "ai.run_succeeded" : "ai.run_failed",
      entityType: "ai_run",
      entityId: runId,
      metadata: {
        skill: skill.id,
        version: skill.version,
        model: servedModel,
        isDemo: provider.isDemo,
        costUsd: priced.cost,
        estimatedCostUsd: priced.cost === null ? priced.estimated : undefined,
        error: failure?.code ?? null,
      },
    });
    return priced.cost;
  });
  log(result ? "skill.succeeded" : "skill.failed", {
    skill: skill.id,
    runId,
    model: servedModel,
    durationMs: Date.now() - started,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd,
    error: failure?.code,
  });
  if (!result || output === null) throw failure ?? new IntegrationError("Falha desconhecida na IA", false);
  return { runId, output, isDemo: result.isDemo, model: servedModel, usage, costUsd, reused: false };
}
