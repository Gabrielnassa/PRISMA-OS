import { z } from "zod";
import { FIELD_KEYS, OBJECTIVE_LABELS, OBJECTIVES } from "@/lib/content/document";
import { SHARED_RULES } from "./common";
import type { AiSkill } from "./types";

export const ReviewInputSchema = z.object({
  objective: z.enum(OBJECTIVES),
  briefing: z.string().max(6000),
  slides: z.array(z.object({ kind: z.string(), kicker: z.string(), title: z.string(), body: z.string(), highlight: z.string(), footer: z.string(), alt: z.string() })),
  caption: z.string(),
  hashtags: z.array(z.string()),
  cta: z.string(),
});
export type ReviewInput = z.infer<typeof ReviewInputSchema>;

export const ReviewOutputSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      severity: z.enum(["critical", "warning", "info"]),
      slideNumber: z.number().int(),
      field: z.string(),
      problem: z.string(),
      suggestion: z.string(),
    }),
  ),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

export const reviewerSkill: AiSkill<ReviewInput, ReviewOutput, z.input<typeof ReviewInputSchema>> = {
  id: "quality.ai-review",
  version: "1.0.0",
  name: "Revisor de qualidade (IA)",
  specSection: "9.9",
  description: "Revisa ortografia, aderência ao briefing, coerência, tom de voz e afirmações sem comprovação. Complementa as regras automáticas.",
  kind: "ai",
  allowedTools: [],
  qualityCriteria: ["Aponta problemas concretos com sugestão", "Não reescreve a peça inteira", "Não é tratado como garantia de qualidade"],
  errorHandling: "Falhas não bloqueiam o fluxo: a revisão por regras continua válida e a falha fica registrada.",
  inputSchema: ReviewInputSchema,
  outputSchema: ReviewOutputSchema,
  effort: "medium",
  maxTokens: 12000,
  instructions: `Você é o revisor de qualidade de uma agência. Revise a peça e aponte somente problemas concretos.

${SHARED_RULES}

- Verifique: ortografia e gramática; aderência ao briefing e ao objetivo; coerência entre lâminas; tom de voz da marca; termos proibidos; afirmações, números ou promessas sem base no contexto; clareza do CTA.
- "slideNumber" é o número da lâmina (1, 2, ...) ou 0 para legenda/hashtags.
- "field" é um de: ${FIELD_KEYS.join(", ")}, caption, hashtags, cta.
- "critical" apenas para erros que impedem a publicação (dado inventado, termo proibido, erro grave de português, contradição com o briefing).
- Se não houver problemas, devolva "issues" vazio e diga isso no resumo.`,
  buildTask(input) {
    const slides = input.slides
      .map((s, i) => `Lâmina ${i + 1} (${s.kind}):\n${FIELD_KEYS.map((k) => `  ${k}: ${s[k] || "(vazio)"}`).join("\n")}\n  alt: ${s.alt || "(vazio)"}`)
      .join("\n");
    return `Objetivo: ${OBJECTIVE_LABELS[input.objective]}
<briefing>
${input.briefing}
</briefing>
<peca_para_revisao>
${slides}
Legenda: ${input.caption}
Hashtags: ${input.hashtags.join(" ")}
CTA: ${input.cta}
</peca_para_revisao>`;
  },
  demo() {
    return {
      summary: "Revisão de demonstração: nenhuma análise de IA foi executada. Use as regras automáticas e a revisão humana.",
      issues: [],
    };
  },
};
