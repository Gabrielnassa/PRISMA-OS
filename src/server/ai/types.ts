import type { z } from "zod";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Consumo por modelo que atendeu (o fallback do servidor pode envolver mais de um). */
export type UsageByModel = Array<{ model: string; usage: TokenUsage }>;

export interface StructuredRequest<T> {
  /** Instruções estáveis da skill (prefixo cacheável). */
  system: string;
  /** Contexto do cliente (dados de referência, nunca instruções). */
  context: string;
  /** Tarefa específica desta execução. */
  task: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: Effort;
  /** Saída usada somente pelo provedor de demonstração. */
  demo?: () => T;
}

export interface StructuredResult<T> {
  data: T;
  /** Total de todas as tentativas cobradas nesta chamada. */
  usage: TokenUsage;
  usageByModel: UsageByModel;
  /** Modelo que efetivamente atendeu (pode diferir em caso de fallback). */
  model: string;
  provider: string;
  isDemo: boolean;
  stopReason: string;
  durationMs: number;
}

export interface ProviderStatus {
  configured: boolean;
  provider: string;
  label: string;
  model: string | null;
  isDemo: boolean;
  detail: string;
}

export interface AiProvider {
  readonly id: "anthropic" | "openai" | "demo";
  readonly label: string;
  readonly model: string;
  readonly isDemo: boolean;
  generateStructured<T>(req: StructuredRequest<T>, opts?: { signal?: AbortSignal }): Promise<StructuredResult<T>>;
  /** Chamada mínima real para verificar credenciais e disponibilidade. */
  ping(): Promise<{ ok: boolean; detail: string; usage?: TokenUsage; model?: string }>;
}
