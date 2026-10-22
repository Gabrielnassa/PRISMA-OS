import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { IntegrationError } from "../../errors";
import type { AiProvider, Effort, StructuredRequest, StructuredResult, TokenUsage } from "../types";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  effort: Effort;
  fallbacks: boolean;
  timeoutMs: number;
  /** Injetável nos testes para simular a API sem rede. */
  fetch?: typeof fetch;
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function usageFrom(u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): TokenUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

/** Converte erros do SDK em erros de integração com indicação de nova tentativa. */
export function mapAnthropicError(err: unknown): IntegrationError {
  if (err instanceof IntegrationError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new IntegrationError("A chave da API Anthropic foi recusada. Verifique ANTHROPIC_API_KEY.", false, { cause: err, providerCode: "auth_failed" });
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new IntegrationError("A conta Anthropic não tem permissão para este modelo ou recurso.", false, { cause: err, providerCode: "permission_denied" });
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new IntegrationError("Modelo ou recurso não encontrado na API Anthropic. Verifique ANTHROPIC_MODEL.", false, { cause: err, providerCode: "not_found" });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new IntegrationError("Limite de requisições da API Anthropic atingido. Nova tentativa automática.", true, { cause: err, providerCode: "rate_limited" });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new IntegrationError(`Requisição recusada pela API Anthropic: ${err.message}`, false, { cause: err, providerCode: "bad_request" });
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new IntegrationError("A API Anthropic está temporariamente indisponível ou sobrecarregada.", true, { cause: err, providerCode: "provider_unavailable" });
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new IntegrationError("Tempo limite excedido na chamada à API Anthropic.", true, { cause: err, providerCode: "timeout" });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new IntegrationError("Falha de conexão com a API Anthropic.", true, { cause: err, providerCode: "connection_error" });
  }
  if (err instanceof Anthropic.APIError) {
    return new IntegrationError(`Erro da API Anthropic (${err.status ?? "?"}).`, (err.status ?? 0) >= 500, { cause: err, providerCode: "api_error" });
  }
  return new IntegrationError(`Falha inesperada ao chamar a IA: ${(err as Error)?.message ?? String(err)}`, false, { cause: err, providerCode: "unexpected" });
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  readonly label = "Anthropic (Claude)";
  readonly isDemo = false;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(private readonly opts: AnthropicProviderOptions) {
    this.model = opts.model;
    this.client = new Anthropic({
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
      // `create` (e não `parse`): a recusa ou o corte por limite precisam ser
      // tratados antes de qualquer tentativa de interpretar o JSON.
      const response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 16000,
          ...(this.opts.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: req.context, cache_control: { type: "ephemeral" } },
                { type: "text", text: req.task },
              ],
            },
          ],
          output_config: {
            format: betaZodOutputFormat(req.schema as unknown as z.ZodType<T>),
            effort: req.effort ?? this.opts.effort,
          },
        },
        { signal: opts?.signal },
      );
      const usage = usageFrom(response.usage);
      if (response.stop_reason === "refusal") {
        throw Object.assign(
          new IntegrationError("O modelo recusou a solicitação por política de uso. Revise o briefing.", false, { providerCode: "refused" }),
          { usage, model: response.model },
        );
      }
      if (response.stop_reason === "max_tokens") {
        throw Object.assign(new IntegrationError("A resposta da IA foi interrompida pelo limite de tokens.", false, { providerCode: "max_tokens" }), {
          usage,
          model: response.model,
        });
      }
      const text = response.content.find((b) => b.type === "text");
      let parsed: unknown = null;
      try {
        parsed = text && text.type === "text" ? JSON.parse(text.text) : null;
      } catch {
        parsed = null;
      }
      const validated = parsed === null ? null : req.schema.safeParse(parsed);
      if (!validated || !validated.success) {
        throw Object.assign(new IntegrationError("A IA retornou um formato inválido para esta tarefa.", true, { providerCode: "invalid_output" }), {
          usage,
          model: response.model,
        });
      }
      return {
        data: validated.data,
        usage,
        model: response.model,
        provider: this.id,
        isDemo: false,
        stopReason: response.stop_reason ?? "end_turn",
        durationMs: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof IntegrationError) throw err;
      throw mapAnthropicError(err);
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
