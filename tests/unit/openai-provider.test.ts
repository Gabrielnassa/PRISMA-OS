import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { OpenAiProvider, openAiUsage } from "@/server/ai/providers/openai";
import { toOpenAiJsonSchema } from "@/server/ai/json-schema";
import { getProvider, providerStatus, setProviderOverride } from "@/server/ai/gateway";
import { resetEnvCache } from "@/server/env";
import { IntegrationError } from "@/server/errors";
import { copywriterSkill } from "@/server/skills/copywriter";

type Captured = { url: string; body: Record<string, unknown>; headers: Headers };

function mockFetch(responses: Array<{ status: number; body: unknown }>, captured: Captured[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("sem resposta simulada");
    captured.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json", "x-request-id": "req_test" } });
  }) as typeof fetch;
}

/** Resposta no formato da Responses API. */
const response = (text: string, extra: Record<string, unknown> = {}) => ({
  id: "resp_test",
  object: "response",
  created_at: 1,
  model: "gpt-6.1-sol-2026-10-20",
  status: "completed",
  incomplete_details: null,
  output: [{ id: "msg_1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }],
  usage: { input_tokens: 1200, input_tokens_details: { cached_tokens: 800, cache_write_tokens: 100 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 120 }, total_tokens: 1500 },
  ...extra,
});

const provider = (fetchImpl: typeof fetch, effort?: "low") => new OpenAiProvider({ apiKey: "sk-proj-teste", model: "gpt-6.1-sol", effort, timeoutMs: 10_000, fetch: fetchImpl });
const schema = z.object({ title: z.string(), subtitle: z.string().optional() });
const req = { system: "sistema", context: "contexto do cliente", task: "tarefa", schema, effort: "medium" as const };

describe("provedor OpenAI (API simulada)", () => {
  it("usa a Responses API com JSON Schema estrito, esforço, chave no cabeçalho e sem guardar a resposta", async () => {
    const captured: Captured[] = [];
    const p = provider(mockFetch([{ status: 200, body: response('{"title":"Olá","subtitle":null}') }], captured));
    const res = await p.generateStructured(req);
    expect(res.data).toEqual({ title: "Olá" });
    expect(res.provider).toBe("openai");
    expect(res.model).toBe("gpt-6.1-sol-2026-10-20");
    // input_tokens da OpenAI inclui o cache: aqui fica separado para cobrar cada parte pela sua tarifa.
    expect(res.usage).toEqual({ inputTokens: 300, outputTokens: 300, cacheReadTokens: 800, cacheWriteTokens: 100 });
    const { url, body, headers } = captured[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(headers.get("authorization")).toBe("Bearer sk-proj-teste");
    expect(body.model).toBe("gpt-6.1-sol");
    expect(body.instructions).toBe("sistema");
    expect(body.store).toBe(false);
    expect(body.reasoning).toEqual({ effort: "medium" });
    const format = (body.text as { format: { type: string; strict: boolean; schema: { required: string[]; properties: Record<string, unknown> } } }).format;
    expect(format.type).toBe("json_schema");
    expect(format.strict).toBe(true);
    expect(format.schema.required.sort()).toEqual(["subtitle", "title"]);
    expect(format.schema.properties.subtitle).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
  });

  it("esforço fixo pelo ambiente substitui o da skill", async () => {
    const captured: Captured[] = [];
    await provider(mockFetch([{ status: 200, body: response('{"title":"a","subtitle":"b"}') }], captured), "low").generateStructured(req);
    expect(captured[0]!.body.reasoning).toEqual({ effort: "low" });
  });

  it("o esquema estrito do copywriter exige todos os campos e mantém as listas de valores", () => {
    type Node = { type?: string; required?: string[]; properties?: Record<string, Node>; items?: Node; anyOf?: Node[]; enum?: unknown[] };
    const walk = (n: Node | undefined): void => {
      if (!n) return;
      if (n.properties) {
        expect(n.required?.sort()).toEqual(Object.keys(n.properties).sort());
        Object.values(n.properties).forEach(walk);
      }
      walk(n.items);
      n.anyOf?.forEach(walk);
    };
    walk(toOpenAiJsonSchema(copywriterSkill.outputSchema) as Node);
  });

  it("classifica erros: chave inválida, sem crédito, limite de uso, modelo inexistente, indisponibilidade", async () => {
    const err = (status: number, code: string, type: string) => ({ status, body: { error: { message: "x", type, code, param: null } } });
    const cases: Array<[Array<{ status: number; body: unknown }>, string, boolean]> = [
      [[err(401, "invalid_api_key", "invalid_request_error")], "auth_failed", false],
      [[err(429, "insufficient_quota", "insufficient_quota"), err(429, "insufficient_quota", "insufficient_quota")], "insufficient_quota", false],
      [[err(429, "rate_limit_exceeded", "requests"), err(429, "rate_limit_exceeded", "requests")], "rate_limited", true],
      [[err(404, "model_not_found", "invalid_request_error")], "not_found", false],
      [[err(500, "server_error", "server_error"), err(500, "server_error", "server_error")], "provider_unavailable", true],
    ];
    for (const [responses, code, retryable] of cases) {
      const e = await provider(mockFetch(responses, [])).generateStructured(req).catch((x) => x);
      expect(e).toBeInstanceOf(IntegrationError);
      expect([e.code, e.retryable]).toEqual([code, retryable]);
    }
  });

  it("recusa, corte por limite de tokens e JSON inválido viram erros com o consumo cobrado", async () => {
    const refusal = response("", { output: [{ id: "m", type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "Não posso ajudar." }] }] });
    let e = await provider(mockFetch([{ status: 200, body: refusal }], [])).generateStructured(req).catch((x) => x);
    expect([e.code, e.retryable]).toEqual(["refused", false]);
    expect(e.usage.outputTokens).toBe(300);

    const cut = response('{"title":"inc', { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    e = await provider(mockFetch([{ status: 200, body: cut }], [])).generateStructured(req).catch((x) => x);
    expect(e.code).toBe("max_tokens");

    e = await provider(mockFetch([{ status: 200, body: response('{"outro":1}') }], [])).generateStructured(req).catch((x) => x);
    expect([e.code, e.retryable]).toEqual(["invalid_output", true]);
  });

  it("consumo vazio não quebra", () => {
    expect(openAiUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});

describe("escolha do provedor", () => {
  const keys = ["AI_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENAI_MODEL", "DATABASE_URL"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const set = (vars: Partial<Record<(typeof keys)[number], string>>) => {
    for (const k of keys) delete process.env[k];
    process.env.DATABASE_URL = "postgres://teste:teste@localhost:5432/teste";
    Object.assign(process.env, vars);
    resetEnvCache();
    setProviderOverride(undefined);
  };
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    resetEnvCache();
  });

  it("só com a chave da OpenAI, usa a OpenAI com o modelo padrão", () => {
    set({ OPENAI_API_KEY: "sk-proj-x" });
    expect(getProvider()?.id).toBe("openai");
    expect(providerStatus()).toMatchObject({ configured: true, provider: "openai", model: "gpt-6.1-sol" });
  });

  it("com as duas chaves, AI_PROVIDER decide (sem ele, Claude)", () => {
    set({ OPENAI_API_KEY: "sk-proj-x", ANTHROPIC_API_KEY: "sk-ant-x" });
    expect(getProvider()?.id).toBe("anthropic");
    set({ OPENAI_API_KEY: "sk-proj-x", ANTHROPIC_API_KEY: "sk-ant-x", AI_PROVIDER: "openai", OPENAI_MODEL: "gpt-6-astra" });
    expect(getProvider()?.model).toBe("gpt-6-astra");
  });

  it("AI_PROVIDER=openai sem chave explica o que falta", () => {
    set({ AI_PROVIDER: "openai" });
    expect(providerStatus()).toMatchObject({ configured: false, detail: expect.stringMatching(/OPENAI_API_KEY/) });
  });
});
