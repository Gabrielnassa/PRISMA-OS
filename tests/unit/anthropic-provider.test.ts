import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicProvider } from "@/server/ai/providers/anthropic";
import { IntegrationError } from "@/server/errors";

type Captured = { url: string; body: Record<string, unknown>; headers: Headers };

function mockFetch(responses: Array<{ status: number; body: unknown }>, captured: Captured[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("sem resposta simulada");
    captured.push({ url: String(input), body: JSON.parse(String(init?.body ?? "{}")), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json", "request-id": "req_test" } });
  }) as typeof fetch;
}

const message = (text: string, stop = "end_turn") => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text }],
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
});

const provider = (fetchImpl: typeof fetch) =>
  new AnthropicProvider({ apiKey: "sk-test", model: "claude-opus-5-5", effort: "medium", fallbacks: true, timeoutMs: 10_000, fetch: fetchImpl });

const schema = z.object({ title: z.string() });
const req = { system: "sistema", context: "contexto", task: "tarefa", schema };

describe("provedor Anthropic (API simulada)", () => {
  it("envia requisição com saída estruturada, esforço e fallback do servidor e lê o consumo", async () => {
    const captured: Captured[] = [];
    const p = provider(mockFetch([{ status: 200, body: message('{"title":"Olá"}') }], captured));
    const res = await p.generateStructured(req);
    expect(res.data).toEqual({ title: "Olá" });
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 30, cacheReadTokens: 50, cacheWriteTokens: 10 });
    const body = captured[0]!.body;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body).not.toHaveProperty("temperature");
    expect((body.output_config as { effort: string }).effort).toBe("medium");
    expect((body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(captured[0]!.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("classifica limite de requisições como recuperável", async () => {
    const p = provider(mockFetch([{ status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "x" } } }, { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "x" } } }], []));
    const err = await p.generateStructured(req).catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationError);
    expect(err.retryable).toBe(true);
    expect(err.code).toBe("rate_limited");
  });

  it("classifica chave inválida como definitiva", async () => {
    const p = provider(mockFetch([{ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }], []));
    const err = await p.generateStructured(req).catch((e) => e);
    expect(err.retryable).toBe(false);
    expect(err.code).toBe("auth_failed");
  });

  it("trata recusa do modelo sem tentar novamente", async () => {
    const p = provider(mockFetch([{ status: 200, body: { ...message(""), stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } } }], []));
    const err = await p.generateStructured(req).catch((e) => e);
    expect(err.code).toBe("refused");
    expect(err.retryable).toBe(false);
  });

  it("mantém enum no esquema enviado e remove restrições não suportadas", async () => {
    const captured: Captured[] = [];
    const p = provider(mockFetch([{ status: 200, body: message('{"kind":"cta","title":"Ok","items":["a"]}') }], captured));
    const enumSchema = z.object({ kind: z.enum(["cover", "content", "cta"]), title: z.string().max(80), items: z.array(z.string()).min(1).max(5) });
    await p.generateStructured({ ...req, schema: enumSchema });
    type Node = { enum?: string[]; additionalProperties?: boolean; minItems?: number; properties: Record<string, Node> };
    const sent = (captured[0]!.body.output_config as { format: { schema: Node } }).format.schema;
    expect(sent.properties.kind!.enum).toEqual(["cover", "content", "cta"]);
    expect(sent.additionalProperties).toBe(false);
    expect(sent.properties.title).not.toHaveProperty("maxLength");
    expect(sent.properties.items).not.toHaveProperty("maxItems");
    expect(sent.properties.items!.minItems).toBe(1);
    expect(sent).not.toHaveProperty("$schema");
  });

  it("ANTHROPIC_EFFORT, quando definido, substitui o esforço da skill", async () => {
    const captured: Captured[] = [];
    const forced = new AnthropicProvider({ apiKey: "sk-test", model: "claude-opus-5-5", effort: "high", fallbacks: true, timeoutMs: 10_000, fetch: mockFetch([{ status: 200, body: message('{"title":"x"}') }], captured) });
    await forced.generateStructured({ ...req, effort: "low" });
    expect((captured[0]!.body.output_config as { effort: string }).effort).toBe("high");
    const perSkill = new AnthropicProvider({ apiKey: "sk-test", model: "claude-opus-5-5", fallbacks: true, timeoutMs: 10_000, fetch: mockFetch([{ status: 200, body: message('{"title":"x"}') }], captured) });
    await perSkill.generateStructured({ ...req, effort: "low" });
    expect((captured[1]!.body.output_config as { effort: string }).effort).toBe("low");
  });

  it("fallback do servidor: soma todas as tentativas cobradas, separadas por modelo", async () => {
    const body = {
      ...message('{"title":"Resgatado"}'),
      model: "claude-opus-5",
      usage: {
        input_tokens: 900,
        output_tokens: 300,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        iterations: [
          { type: "message", model: "claude-opus-5-5", input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
          { type: "fallback_message", model: "claude-opus-5", input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
        ],
      },
    };
    const res = await provider(mockFetch([{ status: 200, body }], [])).generateStructured(req);
    expect(res.model).toBe("claude-opus-5");
    expect(res.usage).toEqual({ inputTokens: 1800, outputTokens: 340, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(res.usageByModel.map((u) => [u.model, u.usage.outputTokens])).toEqual([
      ["claude-opus-5-5", 40],
      ["claude-opus-5", 300],
    ]);
  });
});
