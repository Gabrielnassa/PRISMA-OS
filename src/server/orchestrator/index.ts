import { maybeOne, one, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import { IntegrationError, ProviderNotConfiguredError, ValidationError } from "../errors";
import { getProvider } from "../ai/gateway";
import type { StructuredResult, TokenUsage } from "../ai/types";
import type { AiSkill } from "../skills/types";
import { assertWithinBudget, computeCostUsd, currentPrice } from "../services/costs";
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

  // 1) Reaproveitamento idempotente e preparação (transação curta, sem chamada externa).
  const prep = await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, req.clientId);
    if (req.idempotencyKey) {
      const existing = await maybeOne<{ id: string; status: string; output: unknown; is_demo: boolean; model: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; cost_usd: string | null }>(
        tx,
        `SELECT id, status, output, is_demo, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd
         FROM ai_runs WHERE organization_id = $1 AND idempotency_key = $2`,
        [auth.organizationId, req.idempotencyKey],
      );
      if (existing?.status === "succeeded") {
        const out = skill.outputSchema.safeParse(existing.output);
        if (out.success) return { reuse: existing, output: out.data };
      }
      if (existing) {
        // Execução anterior falhou: libera a chave para a nova tentativa, preservando o histórico.
        await tx.query("UPDATE ai_runs SET idempotency_key = idempotency_key || ':retry:' || id WHERE id = $1", [existing.id]);
      }
    }
    await assertWithinBudget(tx, req.clientId);
    const context = await buildClientContext(tx, auth.organizationId, req.clientId);
    const run = await one<{ id: string }>(
      tx,
      `INSERT INTO ai_runs (organization_id, client_id, content_item_id, job_id, skill_id, skill_version, provider, model, is_demo,
         status, input_summary, idempotency_key, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'running', $10, $11, $12) RETURNING id`,
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
        JSON.stringify({ memoryCount: context.memoryCount, contextChars: context.text.length }),
        req.idempotencyKey ?? null,
        auth.userId,
      ],
    );
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
    failure = err instanceof IntegrationError ? err : new IntegrationError((err as Error).message ?? "Falha na IA", false, { cause: err });
  }

  // 3) Registro do resultado, custo e auditoria.
  const failureUsage = (failure as unknown as { usage?: TokenUsage; model?: string } | null)?.usage;
  const usage: TokenUsage = result?.usage ?? failureUsage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const servedModel = result?.model ?? (failure as unknown as { model?: string } | null)?.model ?? provider.model;
  const output = result ? (skill.postProcess ? skill.postProcess(result.data, input) : result.data) : null;
  const costUsd = await withTx(userCtx(auth.userId), async (tx) => {
    const price = provider.isDemo ? null : await currentPrice(tx, auth.organizationId, provider.id, servedModel);
    const cost = provider.isDemo ? 0 : price ? computeCostUsd(usage, price) : null;
    await tx.query(
      `UPDATE ai_runs SET status = $2, model = $3, input_tokens = $4, output_tokens = $5, cache_read_tokens = $6, cache_write_tokens = $7,
         cost_usd = $8, price_id = $9, duration_ms = $10, error_code = $11, error_message = $12, output = $13, finished_at = now()
       WHERE id = $1`,
      [
        runId,
        result ? "succeeded" : failure?.code === "refused" ? "refused" : "failed",
        servedModel,
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheReadTokens,
        usage.cacheWriteTokens,
        cost,
        price?.id ?? null,
        Date.now() - started,
        failure?.code ?? null,
        failure?.message ?? null,
        output === null ? null : JSON.stringify(output),
      ],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: req.clientId,
      action: result ? "ai.run_succeeded" : "ai.run_failed",
      entityType: "ai_run",
      entityId: runId,
      metadata: { skill: skill.id, version: skill.version, model: servedModel, isDemo: provider.isDemo, costUsd: cost, error: failure?.code ?? null },
    });
    return cost;
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
