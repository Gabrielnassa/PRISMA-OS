import type { z } from "zod";
import type { Effort } from "../ai/types";

/**
 * Contrato de uma skill especializada (seção 9). Cada skill é um módulo
 * versionado, com esquemas de entrada/saída, critérios de qualidade e testes.
 * Skills não executam ações externas: o orquestrador decide o que roda.
 */
export interface SkillMeta {
  id: string;
  version: string;
  name: string;
  specSection: string;
  description: string;
  kind: "ai" | "rules";
  allowedTools: string[];
  qualityCriteria: string[];
  errorHandling: string;
}

export interface AiSkill<I, O, In = I> extends SkillMeta {
  kind: "ai";
  /** `I` é a entrada já validada (com padrões aplicados); `In`, a aceita pelo chamador. */
  inputSchema: z.ZodType<I, In>;
  outputSchema: z.ZodType<O>;
  effort: Effort;
  maxTokens: number;
  instructions: string;
  buildTask(input: I): string;
  /** Saída determinística do modo demonstração (derivada só da entrada). */
  demo(input: I): O;
  /** Ajustes pós-validação (normalização); nunca inventa conteúdo. */
  postProcess?(output: O, input: I): O;
}

export interface RulesSkill<I, O> extends SkillMeta {
  kind: "rules";
  inputSchema: z.ZodType<I>;
  run(input: I): O;
}
