import { describe, expect, it } from "vitest";
import { many, one, systemCtx, withTx } from "../../src/server/db";
import { BudgetExceededError, IntegrationError, ProviderNotConfiguredError } from "../../src/server/errors";
import { setProviderOverride } from "../../src/server/ai/gateway";
import { createClient } from "../../src/server/services/clients";
import { createContent, getContent, retryGeneration } from "../../src/server/services/content";
import { getCostSummary, setClientBudget, addPrice } from "../../src/server/services/costs";
import { claimNextJob, completeJob, failJob } from "../../src/server/jobs/queue";
import { processNextJob, recoverStale } from "../../src/server/jobs/worker";
import { AiRunInProgressError, runAiSkill } from "../../src/server/orchestrator";
import { ideasSkill } from "../../src/server/skills/registry";
import { FakeProvider, addMember, newOrg } from "./helpers";

async function setup() {
  const { owner } = await newOrg();
  const { id: clientId } = await createClient(owner, { name: "Loja Exemplo" });
  return { owner, clientId };
}

const request = (clientId: string) => ({
  clientId,
  title: "Lançamento",
  channel: "instagram" as const,
  format: "post" as const,
  objective: "conversion" as const,
  briefing: { text: "Lançamento da nova coleção de outono." },
  mode: "ai" as const,
  requestId: crypto.randomUUID(),
});

async function runJobsUntilIdle() {
  // Força a execução imediata de tarefas reagendadas com backoff.
  await withTx(systemCtx("test"), (tx) => tx.query("UPDATE jobs SET run_after = now() WHERE status = 'queued'"));
  while (await processNextJob("test-worker")) {
    await withTx(systemCtx("test"), (tx) => tx.query("UPDATE jobs SET run_after = now() WHERE status = 'queued'"));
  }
}

describe("fila, recuperação de falhas e custos", () => {
  it("registra custo pela tarifa vigente e tokens do provedor", async () => {
    const { owner, clientId } = await setup();
    const fake = new FakeProvider();
    setProviderOverride(fake);
    const { contentId } = await createContent(owner, request(clientId));
    await runJobsUntilIdle();
    const detail = await getContent(owner, contentId);
    expect(detail.status).toBe("in_review");
    expect(detail.current?.source).toBe("ai");
    // 1000 entrada × 4 + 500 saída × 20 + 2000 leitura de cache × 0,20 = 4000 + 10000 + 400 = 14400 / 1e6
    expect(detail.aiRuns[0]?.costUsd).toBeCloseTo(0.0144, 6);
    const summary = await getCostSummary(owner);
    expect(summary.totals.costUsd).toBeCloseTo(0.0144, 6);
    expect(summary.byClient.find((c) => c.clientId === clientId)?.runs).toBe(1);
  });

  it("tarifa nova cadastrada pelo administrador passa a valer", async () => {
    const { owner, clientId } = await setup();
    await addPrice(owner, { provider: "anthropic", model: "claude-opus-5-5", input: 8, output: 40, source: "Tarifa de teste" });
    setProviderOverride(new FakeProvider());
    const out = await runAiSkill(ideasSkill, { auth: owner, clientId, input: { objective: "engagement", format: "post", theme: "Dicas", quantity: 3 } });
    expect(out.costUsd).toBeCloseTo((1000 * 8 + 500 * 40 + 2000 * 8) / 1e6, 6);
  });

  it("falha transitória é repetida com backoff e a IA bem-sucedida não é cobrada de novo", async () => {
    const { owner, clientId } = await setup();
    const fake = new FakeProvider();
    fake.failures.push(new IntegrationError("sobrecarga", true, { providerCode: "provider_unavailable" }));
    setProviderOverride(fake);
    const { contentId } = await createContent(owner, request(clientId));
    expect(await processNextJob("w")).toBe(true);
    const job = await withTx(systemCtx("test"), (tx) => one<{ status: string; attempts: number; last_error: string; run_after: Date }>(tx, "SELECT status, attempts, last_error, run_after FROM jobs WHERE payload->>'contentItemId' = $1", [contentId]));
    expect(job).toMatchObject({ status: "queued", attempts: 1, last_error: "sobrecarga" });
    expect(job.run_after.getTime()).toBeGreaterThan(Date.now());
    await runJobsUntilIdle();
    expect((await getContent(owner, contentId)).status).toBe("in_review");
    const runs = await withTx(systemCtx("test"), (tx) => many<{ status: string }>(tx, "SELECT status FROM ai_runs WHERE content_item_id = $1 ORDER BY created_at", [contentId]));
    expect(runs.map((r) => r.status)).toEqual(["failed", "succeeded"]);
    const attempts = await withTx(systemCtx("test"), (tx) => many<{ status: string }>(tx, "SELECT a.status FROM job_attempts a JOIN jobs j ON j.id = a.job_id WHERE j.payload->>'contentItemId' = $1 ORDER BY attempt", [contentId]));
    expect(attempts.map((a) => a.status)).toEqual(["failed", "succeeded"]);
  });

  it("falha definitiva marca o conteúdo como Falhou com a mensagem", async () => {
    const { owner, clientId } = await setup();
    const fake = new FakeProvider();
    fake.failures.push(new IntegrationError("A chave da API foi recusada.", false, { providerCode: "auth_failed" }));
    setProviderOverride(fake);
    const { contentId } = await createContent(owner, request(clientId));
    await runJobsUntilIdle();
    const detail = await getContent(owner, contentId);
    expect(detail.status).toBe("failed");
    expect(detail.lastError).toContain("chave");
    expect(detail.job?.status).toBe("failed");
  });

  it("reexecução após interrupção reaproveita a chamada de IA concluída (sem duplicar versão ou custo)", async () => {
    const { owner, clientId } = await setup();
    const fake = new FakeProvider();
    setProviderOverride(fake);
    const key = `test:${crypto.randomUUID()}`;
    const first = await runAiSkill(ideasSkill, { auth: owner, clientId, idempotencyKey: key, input: { objective: "engagement", format: "post", quantity: 3 } });
    const second = await runAiSkill(ideasSkill, { auth: owner, clientId, idempotencyKey: key, input: { objective: "engagement", format: "post", quantity: 3 } });
    expect(second.reused).toBe(true);
    expect(second.runId).toBe(first.runId);
    expect(fake.calls).toBe(1);
  });

  it("tarefas presas por worker interrompido são recuperadas", async () => {
    const { owner, clientId } = await setup();
    setProviderOverride(new FakeProvider());
    const { contentId } = await createContent(owner, request(clientId));
    await withTx(systemCtx("test"), async (tx) => {
      await tx.query("UPDATE jobs SET status = 'running', attempts = 1, locked_at = now() - interval '1 hour', locked_by = 'morto' WHERE payload->>'contentItemId' = $1", [contentId]);
      const job = await one<{ id: string; organization_id: string }>(tx, "SELECT id, organization_id FROM jobs WHERE payload->>'contentItemId' = $1", [contentId]);
      await tx.query("INSERT INTO job_attempts (job_id, organization_id, attempt, worker_id) VALUES ($1, $2, 1, 'morto')", [job.id, job.organization_id]);
    });
    await recoverStale(60_000);
    await runJobsUntilIdle();
    expect((await getContent(owner, contentId)).status).toBe("in_review");
  });

  it("teto de consumo interrompe novas gerações do cliente", async () => {
    const { owner, clientId } = await setup();
    setProviderOverride(new FakeProvider());
    await createContent(owner, request(clientId));
    await runJobsUntilIdle();
    await setClientBudget(owner, clientId, { monthlyLimitUsd: 0.01, alertThresholdPct: 80, hardStop: true });
    await expect(createContent(owner, request(clientId))).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("sem provedor configurado a geração por IA é recusada com mensagem clara", async () => {
    const { owner, clientId } = await setup();
    setProviderOverride(null);
    await expect(createContent(owner, request(clientId))).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });

  it("reprocessamento manual continua a numeração das tentativas e preserva o histórico", async () => {
    const { owner, clientId } = await setup();
    const fake = new FakeProvider();
    fake.failures.push(new IntegrationError("A chave da API foi recusada.", false, { providerCode: "auth_failed" }));
    setProviderOverride(fake);
    const { contentId } = await createContent(owner, request(clientId));
    await runJobsUntilIdle();
    expect((await getContent(owner, contentId)).status).toBe("failed");
    await retryGeneration(owner, contentId);
    await runJobsUntilIdle();
    expect((await getContent(owner, contentId)).status).toBe("in_review");
    const rows = await withTx(systemCtx("test"), (tx) =>
      many<{ attempt: number; status: string; error: string | null }>(
        tx,
        "SELECT a.attempt, a.status, a.error FROM job_attempts a JOIN jobs j ON j.id = a.job_id WHERE j.payload->>'contentItemId' = $1 ORDER BY a.id",
        [contentId],
      ),
    );
    expect(rows.map((r) => [r.attempt, r.status])).toEqual([
      [1, "failed"],
      [2, "succeeded"],
    ]);
    expect(rows[0]!.error).toContain("chave");
  });

  it("worker que perdeu a reserva não conclui nem reagenda a tarefa de outro", async () => {
    const { owner, clientId } = await setup();
    setProviderOverride(new FakeProvider());
    const { contentId } = await createContent(owner, request(clientId));
    const a = await claimNextJob("worker-a");
    expect(a?.payload.contentItemId).toBe(contentId);
    // A ficou sem renovar a reserva: a recuperação devolve a tarefa à fila e B a assume.
    await withTx(systemCtx("test"), (tx) => tx.query("UPDATE jobs SET locked_at = now() - interval '1 hour' WHERE id = $1", [a!.id]));
    await recoverStale(60_000);
    const b = await claimNextJob("worker-b");
    expect(b?.id).toBe(a!.id);
    expect(await completeJob(a!, { stale: true })).toBe(false);
    expect((await failJob(a!, "erro tardio", true)).owned).toBe(false);
    const mid = await withTx(systemCtx("test"), (tx) => one<{ status: string; locked_by: string }>(tx, "SELECT status, locked_by FROM jobs WHERE id = $1", [a!.id]));
    expect(mid).toMatchObject({ status: "running", locked_by: "worker-b" });
    expect(await completeJob(b!, { ok: true })).toBe(true);
  });

  it("chamada de IA em andamento com a mesma chave não é cobrada duas vezes", async () => {
    const { owner, clientId } = await setup();
    const fake = new FakeProvider();
    fake.delayMs = 300;
    setProviderOverride(fake);
    const key = `test:${crypto.randomUUID()}`;
    const input = { objective: "engagement" as const, format: "post" as const, quantity: 3 };
    const results = await Promise.allSettled([
      runAiSkill(ideasSkill, { auth: owner, clientId, idempotencyKey: key, input }),
      runAiSkill(ideasSkill, { auth: owner, clientId, idempotencyKey: key, input }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AiRunInProgressError);
    expect(fake.calls).toBe(1);
    // Depois de concluída, a mesma chave reaproveita o resultado.
    const again = await runAiSkill(ideasSkill, { auth: owner, clientId, idempotencyKey: key, input });
    expect(again.reused).toBe(true);
    expect(fake.calls).toBe(1);
    // Entrada diferente com a mesma chave é uma nova execução (não reaproveita texto de outro pedido).
    const other = await runAiSkill(ideasSkill, { auth: owner, clientId, idempotencyKey: key, input: { ...input, quantity: 4 } });
    expect(other.reused).toBe(false);
    expect(fake.calls).toBe(2);
  });

  it("fallback do servidor: cada tentativa é cobrada pelo modelo que a executou", async () => {
    const { owner, clientId } = await setup();
    const fake = new FakeProvider();
    fake.nextUsageByModel = [
      { model: "claude-opus-5-5", usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      { model: "claude-opus-5", usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 } },
    ];
    setProviderOverride(fake);
    const out = await runAiSkill(ideasSkill, { auth: owner, clientId, input: { objective: "engagement", format: "post", quantity: 3 } });
    expect(out.model).toBe("claude-opus-5");
    // Opus 5.5: 1000×4 + 100×20 = 6000; Opus 5: 1000×5 + 500×25 = 17500 → US$ 0,0235
    expect(out.costUsd).toBeCloseTo(0.0235, 6);
    const run = await withTx(systemCtx("test"), (tx) => one<{ input_tokens: number; usage_breakdown: unknown[] }>(tx, "SELECT input_tokens, usage_breakdown FROM ai_runs WHERE id = $1", [out.runId]));
    expect(run.input_tokens).toBe(2000);
    expect(run.usage_breakdown).toHaveLength(2);
  });

  it("modelo sem tarifa: custo fica 'sem tarifa', mas a estimativa conta para o teto", async () => {
    const { owner, clientId } = await setup();
    const fake = new FakeProvider();
    fake.nextUsageByModel = [{ model: "modelo-sem-tarifa", usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 } }];
    setProviderOverride(fake);
    const out = await runAiSkill(ideasSkill, { auth: owner, clientId, input: { objective: "engagement", format: "post", quantity: 3 } });
    expect(out.costUsd).toBeNull();
    const summary = await getCostSummary(owner);
    // Estimativa pela tarifa do modelo configurado: 1000×4 + 500×20 = US$ 0,014
    expect(summary.totals.unpricedRuns).toBe(1);
    expect(summary.totals.unpricedEstimateUsd).toBeCloseTo(0.014, 6);
    expect(summary.byClient.find((c) => c.clientId === clientId)?.budgetSpendUsd).toBeCloseTo(0.014, 6);
    await setClientBudget(owner, clientId, { monthlyLimitUsd: 0.01, alertThresholdPct: 80, hardStop: true });
    await expect(runAiSkill(ideasSkill, { auth: owner, clientId, input: { objective: "engagement", format: "post", quantity: 3 } })).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("o custo é registrado mesmo se a pessoa perder o acesso durante a chamada", async () => {
    const { owner, clientId } = await setup();
    const editor = await addMember(owner, "editor");
    await withTx(systemCtx("test"), (tx) => tx.query("INSERT INTO client_access (organization_id, client_id, user_id) VALUES ($1, $2, $3)", [owner.organizationId, clientId, editor.userId]));
    const fake = new FakeProvider();
    fake.delayMs = 300;
    setProviderOverride(fake);
    const pending = runAiSkill(ideasSkill, { auth: editor, clientId, input: { objective: "engagement", format: "post", quantity: 3 } });
    await new Promise((r) => setTimeout(r, 100));
    await withTx(systemCtx("test"), (tx) => tx.query("DELETE FROM client_access WHERE client_id = $1 AND user_id = $2", [clientId, editor.userId]));
    const out = await pending;
    const run = await withTx(systemCtx("test"), (tx) => one<{ status: string; cost_usd: string | null }>(tx, "SELECT status, cost_usd::text FROM ai_runs WHERE id = $1", [out.runId]));
    expect(run.status).toBe("succeeded");
    expect(Number(run.cost_usd)).toBeCloseTo(0.0144, 6);
  });
});
