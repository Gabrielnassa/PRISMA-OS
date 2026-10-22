import { z } from "zod";
import { CONTENT_FORMATS, FORMAT_LABELS, OBJECTIVE_LABELS, OBJECTIVES, type ContentFormat, type Objective } from "@/lib/content/document";
import { SHARED_RULES, clipWords, escapeData, splitMessages } from "./common";
import type { AiSkill } from "./types";

export const IdeasInputSchema = z.object({
  objective: z.enum(OBJECTIVES),
  format: z.enum(CONTENT_FORMATS),
  theme: z.string().max(2000).default(""),
  quantity: z.number().int().min(3).max(8).default(5),
  recentTitles: z.array(z.string().max(200)).max(30).default([]),
});
export type IdeasInput = z.infer<typeof IdeasInputSchema>;

export const IdeasOutputSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      angle: z.string(),
      format: z.enum(CONTENT_FORMATS),
      objective: z.enum(OBJECTIVES),
      hook: z.string(),
      rationale: z.string(),
    }),
  ),
});
export type IdeasOutput = z.infer<typeof IdeasOutputSchema>;

export const ideasSkill: AiSkill<IdeasInput, IdeasOutput, z.input<typeof IdeasInputSchema>> = {
  id: "planner.ideas",
  version: "1.1.0",
  name: "Gerador de pautas",
  specSection: "9.2 (planejador editorial) e 10 (passo 2)",
  description: "Sugere pautas alinhadas à marca e ao objetivo, evitando repetir títulos recentes do cliente.",
  kind: "ai",
  allowedTools: [],
  qualityCriteria: ["Ideias específicas para o segmento", "Sem repetir pautas recentes", "Ganchos sem clickbait nem promessas"],
  errorHandling: "Saída validada por esquema; falhas são registradas na execução e exibidas ao usuário.",
  inputSchema: IdeasInputSchema,
  outputSchema: IdeasOutputSchema,
  effort: "low",
  maxTokens: 8000,
  instructions: `Você é o planejador editorial de uma agência. Sugira pautas concretas e variadas para o cliente descrito no contexto.

${SHARED_RULES}

- Cada ideia precisa de um título de trabalho, um ângulo editorial, o formato recomendado, o objetivo, um gancho de abertura e a justificativa.
- Não repita nem parafraseie os títulos recentes informados.`,
  buildTask(input) {
    return `Sugira ${input.quantity} pautas. Objetivo principal: ${OBJECTIVE_LABELS[input.objective]}. Formato preferido: ${FORMAT_LABELS[input.format]}.
<briefing>
${input.theme ? escapeData(input.theme) : "Sem tema específico: use o perfil da marca."}
</briefing>
Títulos recentes (não repetir):
<titulos_recentes>
${input.recentTitles.length ? input.recentTitles.map((t) => `- ${escapeData(t)}`).join("\n") : "- nenhum"}
</titulos_recentes>`;
  },
  demo(input) {
    const seeds = splitMessages(input.theme || "Apresente a marca. Mostre os bastidores. Responda uma dúvida frequente.");
    const ideas = Array.from({ length: input.quantity }, (_, i) => {
      const seed = seeds[i % seeds.length] ?? "Pauta";
      return {
        title: clipWords(`${seed}`, 80),
        angle: "Pauta de demonstração derivada do tema informado (sem IA).",
        format: input.format as ContentFormat,
        objective: input.objective as Objective,
        hook: clipWords(seed, 90),
        rationale: "Gerado pelo provedor de demonstração; valide com a equipe.",
      };
    });
    return { ideas };
  },
};
