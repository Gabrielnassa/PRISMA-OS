import { describe, expect, it } from "vitest";
import { many, one, systemCtx, withTx } from "../../src/server/db";
import { BudgetExceededError, IntegrationError, ProviderNotConfiguredError } from "../../src/server/errors";
import { setProviderOverride } from "../../src/server/ai/gateway";
import { createClient } from "../../src/server/services/clients";
import { createContent, getContent } from "../../src/server/services/content";
import { getCostSummary, setClientBudget, addPrice } from "../../src/server/services/costs";
import { processNextJob, recoverStale } from "../../src/server/jobs/worker";
import { runAiSkill } from "../../src/server/orchestrator";
import { ideasSkill } from "../../src/server/skills/registry";
import { FakeProvider, newOrg } from "./helpers";

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
});
