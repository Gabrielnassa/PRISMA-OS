import { z } from "zod";
import { OBJECTIVES, type Objective } from "@/lib/content/document";
import { SHARED_RULES, clipWords, escapeData, splitMessages } from "./common";
import type { AiSkill } from "./types";

import { EDITORIAL_FORMATS, type EditorialFormat } from "@/lib/content/editorial";

export { EDITORIAL_FORMATS, type EditorialFormat };

export const EditorialInputSchema = z.object({
  /** Mês no formato AAAA-MM. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  slots: z
    .array(z.object({ format: z.enum(EDITORIAL_FORMATS), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .min(1)
    .max(60),
  theme: z.string().max(3000).default(""),
  recentTitles: z.array(z.string().max(200)).max(40).default([]),
});
export type EditorialInput = z.infer<typeof EditorialInputSchema>;

export const EditorialOutputSchema = z.object({
  items: z.array(
    z.object({
      title: z.string(),
      objective: z.enum(OBJECTIVES),
      brief: z.string(),
      cta: z.string(),
    }),
  ),
});
export type EditorialOutput = z.infer<typeof EditorialOutputSchema>;

const FORMAT_TEXT: Record<EditorialFormat, string> = {
  post: "post único (uma lâmina)",
  carousel: "carrossel (várias lâminas, conteúdo em sequência)",
  story: "story (vertical, mensagem rápida)",
  video: "vídeo curto (Reels): roteiro em poucas cenas, gravado pela equipe",
};

/**
 * Planejador editorial do mês (seção 9.2): uma pauta para cada espaço do
 * pacote, na ordem das datas, coerente com o perfil da marca e sem repetir
 * pautas recentes. A equipe edita e aprova antes de qualquer peça ser criada.
 */
export const editorialSkill: AiSkill<EditorialInput, EditorialOutput, z.input<typeof EditorialInputSchema>> = {
  id: "planner.editorial",
  version: "1.0.0",
  name: "Linha editorial do mês",
  specSection: "9.2 (planejador editorial) e fase 3 (calendário)",
  description: "Propõe as pautas do mês para o pacote do cliente (formato e data de cada uma), para a equipe revisar e aprovar.",
  kind: "ai",
  allowedTools: [],
  qualityCriteria: [
    "Uma pauta por espaço do pacote, na mesma ordem",
    "Mistura de objetivos ao longo do mês (não só venda)",
    "Briefing específico o bastante para virar peça sem nova conversa",
    "Sem datas comemorativas, números ou ofertas que não estejam no contexto",
  ],
  errorHandling: "Saída validada por esquema e pela quantidade de espaços; falhas ficam registradas na execução.",
  inputSchema: EditorialInputSchema,
  outputSchema: EditorialOutputSchema,
  effort: "medium",
  maxTokens: 16000,
  instructions: `Você é o planejador editorial de uma agência. Monte a linha editorial do mês de um cliente: uma pauta para cada espaço informado, na mesma ordem.

${SHARED_RULES}

- Para cada espaço: título de trabalho (curto), objetivo, briefing (2 a 5 frases: o que dizer, para quem, com que mensagem principal e quais informações do contexto usar) e a chamada para ação.
- Varie os objetivos ao longo do mês (relacionamento, educação, autoridade, conversão...). Conversão só quando houver oferta ou produto confirmado no contexto.
- Respeite o formato de cada espaço: carrossel pede conteúdo em sequência; vídeo pede um roteiro curto que a equipe consiga gravar.
- Não invente datas comemorativas, preços, prazos ou números que não estejam no contexto.
- Não repita nem parafraseie os títulos recentes.`,
  buildTask(input) {
    const slots = input.slots.map((s, i) => `${i + 1}. ${s.date}: ${FORMAT_TEXT[s.format]}`).join("\n");
    return `Mês: ${input.month}. Espaços do pacote (devolva exatamente ${input.slots.length} pautas, nesta ordem):
${slots}
<tema_do_mes>
${input.theme ? escapeData(input.theme) : "Sem tema específico: use o perfil e a memória da marca."}
</tema_do_mes>
Títulos recentes (não repetir):
<titulos_recentes>
${input.recentTitles.length ? input.recentTitles.map((t) => `- ${escapeData(t)}`).join("\n") : "- nenhum"}
</titulos_recentes>`;
  },
  postProcess(output, input) {
    // Exatamente uma pauta por espaço: o excedente sai; a falta é tratada pelo serviço.
    return { items: output.items.slice(0, input.slots.length) };
  },
  demo(input) {
    const seeds = splitMessages(input.theme || "Apresente a marca. Mostre os bastidores. Responda uma dúvida frequente. Conte a história de um cliente.");
    const cycle: Objective[] = ["relationship", "education", "authority", "engagement"];
    return {
      items: input.slots.map((slot, i) => {
        const seed = (seeds[i % seeds.length] ?? "Pauta").replace(/[.!?]+$/, "");
        return {
          title: clipWords(`${seed}`, 70),
          objective: cycle[i % cycle.length]!,
          brief: `Pauta de demonstração (sem IA) para ${FORMAT_TEXT[slot.format]}: ${seed}. Revise e complete com informações confirmadas do cliente.`,
          cta: slot.format === "video" ? "Siga o perfil" : "Fale com a gente",
        };
      }),
    };
  },
};
