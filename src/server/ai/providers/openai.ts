import OpenAI from "openai";
import type { Response as OpenAiResponse, ResponseUsage } from "openai/resources/responses/responses";
import { z } from "zod";
import { IntegrationError } from "../../errors";
import { nullsToUndefined, toOpenAiJsonSchema } from "../json-schema";
import type { AiProvider, Effort, StructuredRequest, StructuredResult, TokenUsage } from "../types";

export interface OpenAiProviderOptions {
  apiKey: string;
  model: string;
  /** Quando definido (OPENAI_EFFORT), substitui o esforço de cada skill. */
  effort?: Effort;
  timeoutMs: number;
  /** Injetável nos testes para simular a API sem rede. */
  fetch?: typeof fetch;
}

/**
 * Consumo no formato do sistema. Na OpenAI, `input_tokens` já inclui os tokens
 * lidos e gravados no cache; aqui eles ficam separados, como na Anthropic, para
 * cada parte ser cobrada pela sua tarifa.
 */
export function openAiUsage(u: ResponseUsage | null | undefined): TokenUsage {
  if (!u) return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const cacheRead = u.input_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = u.input_tokens_details?.cache_write_tokens ?? 0;
  return {
    inputTokens: Math.max(0, (u.input_tokens ?? 0) - cacheRead - cacheWrite),
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  };
}

/** Converte erros do SDK em erros de integração com indicação de nova tentativa. */
export function mapOpenAiError(err: unknown): IntegrationError {
  if (err instanceof IntegrationError) return err;
  if (err instanceof OpenAI.AuthenticationError) {
    return new IntegrationError("A chave da API OpenAI foi recusada. Verifique OPENAI_API_KEY.", false, { cause: err, providerCode: "auth_failed" });
  }
  if (err instanceof OpenAI.PermissionDeniedError) {
    return new IntegrationError("A conta OpenAI não tem permissão para este modelo ou recurso.", false, { cause: err, providerCode: "permission_denied" });
  }
  if (err instanceof OpenAI.NotFoundError) {
    return new IntegrationError("Modelo não encontrado na API OpenAI. Verifique OPENAI_MODEL.", false, { cause: err, providerCode: "not_found" });
  }
  if (err instanceof OpenAI.RateLimitError) {
    const code = (err as { code?: string | null }).code;
    if (code === "insufficient_quota") {
      return new IntegrationError("A conta OpenAI está sem crédito. Adicione saldo em platform.openai.com (Billing).", false, { cause: err, providerCode: "insufficient_quota" });
    }
    return new IntegrationError("Limite de requisições da API OpenAI atingido. Nova tentativa automática.", true, { cause: err, providerCode: "rate_limited" });
  }
  if (err instanceof OpenAI.BadRequestError) {
    return new IntegrationError(`Requisição recusada pela API OpenAI: ${err.message}`, false, { cause: err, providerCode: "bad_request" });
  }
  if (err instanceof OpenAI.InternalServerError) {
    return new IntegrationError("A API OpenAI está temporariamente indisponível ou sobrecarregada.", true, { cause: err, providerCode: "provider_unavailable" });
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return new IntegrationError("Tempo limite excedido na chamada à API OpenAI.", true, { cause: err, providerCode: "timeout" });
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new IntegrationError("Falha de conexão com a API OpenAI.", true, { cause: err, providerCode: "connection_error" });
  }
  if (err instanceof OpenAI.APIError) {
    return new IntegrationError(`Erro da API OpenAI (${err.status ?? "?"}).`, (err.status ?? 0) >= 500, { cause: err, providerCode: "api_error" });
  }
  return new IntegrationError(`Falha inesperada ao chamar a IA: ${(err as Error)?.message ?? String(err)}`, false, { cause: err, providerCode: "unexpected" });
}

function refusalOf(res: OpenAiResponse): string | null {
  for (const item of res.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content) if (c.type === "refusal") return c.refusal;
  }
  return null;
}

/**
 * Provedor OpenAI pela Responses API, com saída estruturada (JSON Schema em
 * modo estrito) e esforço de raciocínio. `store: false`: as respostas não ficam
 * guardadas na conta da OpenAI.
 */
export class OpenAiProvider implements AiProvider {
  readonly id = "openai" as const;
  readonly label = "OpenAI (ChatGPT)";
  readonly isDemo = false;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(private readonly opts: OpenAiProviderOptions) {
    this.model = opts.model;
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      timeout: opts.timeoutMs,
      // Uma nova tentativa no SDK; as demais ficam a cargo da fila (com backoff e registro).
      maxRetries: 1,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  async generateStructured<T>(req: StructuredRequest<T>, opts?: { signal?: AbortSignal }): Promise<StructuredResult<T>> {
    const started = Date.now();
    try {
      const response = await this.client.responses.create(
        {
          model: this.model,
          instructions: req.system,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: req.context },
                { type: "input_text", text: req.task },
              ],
            },
          ],
          max_output_tokens: req.maxTokens ?? 16000,
          reasoning: { effort: this.opts.effort ?? req.effort ?? "medium" },
          text: { format: { type: "json_schema", name: "resultado", schema: toOpenAiJsonSchema(req.schema), strict: true } },
          store: false,
        },
        { signal: opts?.signal },
      );
      const usage = openAiUsage(response.usage);
      const model = response.model || this.model;
      // A OpenAI responde com a versão datada do modelo (ex.: gpt-6.1-sol-2026-10-20);
      // a tarifa cadastrada é a do nome pedido.
      const billedModel = model.startsWith(`${this.model}-`) ? this.model : model;
      const billing = { usage, usageByModel: [{ model: billedModel, usage }], model };
      const refusal = refusalOf(response);
      if (refusal !== null || response.incomplete_details?.reason === "content_filter") {
        throw Object.assign(
          new IntegrationError("O modelo recusou a solicitação por política de uso. Revise o briefing.", false, { providerCode: "refused" }),
          billing,
        );
      }
      if (response.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
        throw Object.assign(new IntegrationError("A resposta da IA foi interrompida pelo limite de tokens.", false, { providerCode: "max_tokens" }), billing);
      }
      if (response.status === "failed") {
        throw Object.assign(new IntegrationError("A API OpenAI não conseguiu concluir a resposta.", true, { providerCode: "failed" }), billing);
      }
      let parsed: unknown = null;
      try {
        parsed = response.output_text ? JSON.parse(response.output_text) : null;
      } catch {
        parsed = null;
      }
      let validated = parsed === null ? null : req.schema.safeParse(parsed);
      // Campos opcionais chegam como null no modo estrito.
      if (validated && !validated.success) validated = req.schema.safeParse(nullsToUndefined(parsed));
      if (!validated || !validated.success) {
        throw Object.assign(new IntegrationError("A IA retornou um formato inválido para esta tarefa.", true, { providerCode: "invalid_output" }), billing);
      }
      return {
        data: validated.data,
        usage,
        usageByModel: billing.usageByModel,
        model,
        provider: this.id,
        isDemo: false,
        stopReason: response.status ?? "completed",
        durationMs: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof IntegrationError) throw err;
      throw mapOpenAiError(err);
    }
  }

  async ping(): Promise<{ ok: boolean; detail: string; usage?: TokenUsage; model?: string }> {
    try {
      const res = await this.generateStructured({
        system: "Responda apenas com o JSON solicitado.",
        context: "Verificação de conectividade do PRISMA OS.",
        task: 'Retorne {"ok": true}.',
        schema: z.object({ ok: z.boolean() }),
        maxTokens: 2000,
        effort: "low",
      });
      return { ok: res.data.ok === true, detail: `Resposta recebida do modelo ${res.model}.`, usage: res.usage, model: res.model };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }
}
