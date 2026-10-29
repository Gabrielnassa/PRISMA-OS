import { describe, expect, it } from "vitest";
import { many, systemCtx, withTx } from "../../src/server/db";
import { setProviderOverride } from "../../src/server/ai/gateway";
import { OpenAiProvider } from "../../src/server/ai/providers/openai";
import { createClient } from "../../src/server/services/clients";
import { getCostSummary } from "../../src/server/services/costs";
import { runAiSkill } from "../../src/server/orchestrator";
import { ideasSkill } from "../../src/server/skills/registry";
import { newOrg } from "./helpers";

const idea = { title: "Bastidores da loteria", angle: "Quem confere os bilhetes", format: "post", objective: "engagement", hook: "Você sabe o que acontece depois da aposta?", rationale: "Aproxima o público" };

/** API da OpenAI simulada: devolve 3 ideias e um consumo conhecido. */
const fakeOpenAi = (model: string): typeof fetch =>
  (async () =>
    new Response(
      JSON.stringify({
        id: "resp_1", object: "response", created_at: 1, model, status: "completed", incomplete_details: null,
        output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ ideas: [idea, idea, idea] }), annotations: [] }] }],
        usage: { input_tokens: 3000, input_tokens_details: { cached_tokens: 1000, cache_write_tokens: 0 }, output_tokens: 800, output_tokens_details: { reasoning_tokens: 300 }, total_tokens: 3800 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

describe("custos com a OpenAI", () => {
  it("organização nova já tem as tarifas da OpenAI e a execução é cobrada por elas", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    const prices = await withTx(systemCtx("teste"), (tx) =>
      many<{ model: string }>(tx, "SELECT model FROM provider_prices WHERE organization_id = $1 AND provider = 'openai' ORDER BY model", [owner.organizationId]),
    );
    expect(prices.map((p) => p.model)).toEqual(["gpt-6-astra", "gpt-6.1-sol", "gpt-6.1-terra"]);

    setProviderOverride(new OpenAiProvider({ apiKey: "sk-proj-teste", model: "gpt-6.1-sol", timeoutMs: 10_000, fetch: fakeOpenAi("gpt-6.1-sol") }));
    const out = await runAiSkill(ideasSkill, { auth: owner, clientId, input: { objective: "engagement", format: "post", theme: "Bastidores", quantity: 3 } });
    expect(out.output.ideas).toHaveLength(3);
    // 2000 entrada × 2 + 1000 em cache (sem tarifa própria: preço de entrada) × 2 + 800 saída × 10 = 14000 / 1e6
    expect(out.costUsd).toBeCloseTo(0.014, 6);
    const recent = (await getCostSummary(owner)).recent[0]!;
    expect(recent).toMatchObject({ model: "gpt-6.1-sol", clientName: "Coli Loterias", status: "succeeded" });
  });

  it("resposta com a versão datada do modelo é cobrada pela tarifa do modelo pedido", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Cliente" });
    setProviderOverride(new OpenAiProvider({ apiKey: "sk-proj-teste", model: "gpt-6.1-sol", timeoutMs: 10_000, fetch: fakeOpenAi("gpt-6.1-sol-2026-10-20") }));
    const out = await runAiSkill(ideasSkill, { auth: owner, clientId, input: { objective: "engagement", format: "post", quantity: 3 } });
    const run = await withTx(systemCtx("teste"), (tx) =>
      many<{ provider: string; cost_usd: string | null; estimated_cost_usd: string | null }>(tx, "SELECT provider, cost_usd, estimated_cost_usd FROM ai_runs WHERE id = $1", [out.runId]),
    );
    expect(run[0]!.provider).toBe("openai");
    expect(Number(run[0]!.cost_usd)).toBeCloseTo(0.014, 6);
    expect(Number(run[0]!.estimated_cost_usd)).toBeCloseTo(0.014, 6);
  });
});
