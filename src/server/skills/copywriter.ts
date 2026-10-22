import { z } from "zod";
import {
  CHANNEL_LABELS,
  CHANNELS,
  CONTENT_FORMATS,
  FIELD_KEYS,
  FIELD_LABELS,
  FORMAT_LABELS,
  OBJECTIVE_LABELS,
  OBJECTIVES,
  SLIDE_KIND_LABELS,
  SLIDE_KINDS,
  normalizeHashtag,
} from "@/lib/content/document";
import { SHARED_RULES, clipWords, firstSentence, splitMessages } from "./common";
import type { AiSkill } from "./types";

const LimitsSchema = z.object({
  kicker: z.number().int().positive().optional(),
  title: z.number().int().positive().optional(),
  body: z.number().int().positive().optional(),
  highlight: z.number().int().positive().optional(),
  footer: z.number().int().positive().optional(),
});

export const CopyInputSchema = z.object({
  format: z.enum(CONTENT_FORMATS),
  channel: z.enum(CHANNELS),
  objective: z.enum(OBJECTIVES),
  title: z.string().max(200),
  briefing: z.object({
    text: z.string().max(6000),
    audience: z.string().max(1000).default(""),
    offer: z.string().max(1000).default(""),
    cta: z.string().max(300).default(""),
    keyMessages: z.string().max(3000).default(""),
  }),
  templateName: z.string(),
  templateDescription: z.string(),
  slidePlan: z.array(z.object({ kind: z.enum(SLIDE_KINDS), limits: LimitsSchema })).min(1).max(10),
  companyName: z.string().max(200).default(""),
  handle: z.string().max(60).default(""),
});
export type CopyInput = z.infer<typeof CopyInputSchema>;

export const CopyOutputSchema = z.object({
  concept: z.string(),
  slides: z.array(
    z.object({
      kind: z.enum(SLIDE_KINDS),
      kicker: z.string(),
      title: z.string(),
      body: z.string(),
      highlight: z.string(),
      footer: z.string(),
      visualDirection: z.string(),
      alt: z.string(),
    }),
  ),
  caption: z.string(),
  hashtags: z.array(z.string()),
  cta: z.string(),
  assumptions: z.array(z.string()),
  claimsToConfirm: z.array(z.string()),
});
export type CopyOutput = z.infer<typeof CopyOutputSchema>;

function describePlan(input: CopyInput): string {
  return input.slidePlan
    .map((s, i) => {
      const fields = FIELD_KEYS.filter((k) => s.limits[k] !== undefined)
        .map((k) => `${k} (${FIELD_LABELS[k]}): até ${s.limits[k]} caracteres`)
        .join("; ");
      const unused = FIELD_KEYS.filter((k) => s.limits[k] === undefined);
      return `Lâmina ${i + 1} — tipo "${s.kind}" (${SLIDE_KIND_LABELS[s.kind]}). Campos exibidos: ${fields}.${unused.length ? ` Deixe vazios: ${unused.join(", ")}.` : ""}`;
    })
    .join("\n");
}

export const copywriterSkill: AiSkill<CopyInput, CopyOutput, z.input<typeof CopyInputSchema>> = {
  id: "copywriter.social",
  version: "1.0.0",
  name: "Copywriter e criador de posts/carrosséis",
  specSection: "9.3 e 9.5",
  description: "Cria o conceito, os textos de cada lâmina, a legenda, as hashtags e o CTA respeitando os limites do template e a voz da marca.",
  kind: "ai",
  allowedTools: [],
  qualityCriteria: [
    "Cada campo dentro do limite de caracteres do template",
    "Uma ideia por lâmina e progressão narrativa",
    "Nenhum dado não confirmado apresentado como fato",
    "CTA coerente com o objetivo e o briefing",
    "Legenda até 2.200 caracteres e no máximo 30 hashtags",
  ],
  errorHandling:
    "Saída validada por esquema; formato inválido gera nova tentativa pela fila. Recusa do modelo ou limite de tokens encerram a tarefa com erro registrado.",
  inputSchema: CopyInputSchema,
  outputSchema: CopyOutputSchema,
  effort: "medium",
  maxTokens: 16000,
  instructions: `Você é o copywriter sênior de uma agência de marketing. Sua tarefa é escrever peças para redes sociais prontas para revisão humana.

${SHARED_RULES}

Formato da resposta:
- Devolva exatamente uma entrada em "slides" para cada lâmina do plano, na mesma ordem e com o mesmo "kind".
- Respeite rigorosamente os limites de caracteres de cada campo; campos não exibidos pelo template ficam vazios ("").
- "highlight" só recebe números, preços ou condições que estejam no briefing ou nas ofertas confirmadas; caso contrário, "".
- "footer" pode trazer a fonte de um dado citado, a assinatura ou o contato da marca presentes no contexto; caso contrário, "".
- "visualDirection" descreve a foto ou o elemento visual recomendado para a lâmina (para o diretor de arte), sem inventar fatos.
- "alt" é o texto alternativo da imagem sugerida.
- "caption" é a legenda do post, com quebras de linha e CTA ao final; "hashtags" traz de 3 a 12 hashtags relevantes começando com #.
- Registre em "assumptions" as decisões tomadas por falta de informação e em "claimsToConfirm" qualquer afirmação que o cliente precise confirmar.`,
  buildTask(input) {
    return `Crie um ${FORMAT_LABELS[input.format]} para ${CHANNEL_LABELS[input.channel]}.
Objetivo: ${OBJECTIVE_LABELS[input.objective]}.
Título interno da pauta: ${input.title}
Template visual: ${input.templateName} — ${input.templateDescription}

Plano de lâminas:
${describePlan(input)}

<briefing>
${input.briefing.text}
${input.briefing.audience ? `\nPúblico desta peça: ${input.briefing.audience}` : ""}${input.briefing.keyMessages ? `\nMensagens-chave:\n${input.briefing.keyMessages}` : ""}${input.briefing.offer ? `\nOferta/condição informada no briefing: ${input.briefing.offer}` : ""}${input.briefing.cta ? `\nCTA desejado: ${input.briefing.cta}` : ""}
</briefing>`;
  },
  demo(input) {
    // Monta textos exclusivamente a partir do briefing, sem acrescentar fatos.
    const messages = splitMessages(input.briefing.keyMessages || input.briefing.text);
    let msgIndex = 0;
    const next = () => messages[msgIndex++ % Math.max(1, messages.length)] ?? input.title;
    const slides = input.slidePlan.map((s) => {
      const lim = s.limits;
      const fit = (text: string, max?: number) => (max ? clipWords(text, max) : "");
      if (s.kind === "cover") {
        return {
          kind: s.kind,
          kicker: fit(OBJECTIVE_LABELS[input.objective], lim.kicker),
          title: fit(input.title || firstSentence(input.briefing.text), lim.title),
          body: fit(firstSentence(input.briefing.text), lim.body),
          highlight: fit(input.briefing.offer, lim.highlight),
          footer: fit(input.companyName, lim.footer),
          visualDirection: "Foto real do cliente relacionada ao tema (demonstração).",
          alt: fit(input.title, 200),
        };
      }
      if (s.kind === "cta") {
        return {
          kind: s.kind,
          kicker: fit("Próximo passo", lim.kicker),
          title: fit(input.briefing.cta || "Fale com a nossa equipe", lim.title),
          body: fit(input.briefing.offer ? `Condição informada: ${input.briefing.offer}` : "", lim.body),
          highlight: fit(input.briefing.offer, lim.highlight),
          footer: fit(input.handle || input.companyName, lim.footer),
          visualDirection: "Lâmina de fechamento com a cor da marca (demonstração).",
          alt: "",
        };
      }
      const message = next();
      return {
        kind: s.kind,
        kicker: "",
        title: fit(firstSentence(message), lim.title),
        body: fit(message, lim.body),
        highlight: "",
        footer: "",
        visualDirection: "",
        alt: "",
      };
    });
    const hashtags = [input.companyName, OBJECTIVE_LABELS[input.objective]]
      .map((t) => normalizeHashtag(t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "")))
      .filter((h): h is string => Boolean(h));
    return {
      concept: `Demonstração montada a partir do briefing (sem IA): ${clipWords(input.briefing.text, 160)}`,
      slides,
      caption: `${clipWords(input.briefing.text, 1200)}${input.briefing.cta ? `\n\n${input.briefing.cta}` : ""}`,
      hashtags,
      cta: input.briefing.cta,
      assumptions: ["Conteúdo gerado pelo provedor de demonstração: textos extraídos do briefing, sem criação por IA."],
      claimsToConfirm: [],
    };
  },
  postProcess(output, input) {
    const hashtags = [...new Set(output.hashtags.map(normalizeHashtag).filter((h): h is string => Boolean(h)))].slice(0, 30);
    // Garante uma lâmina por item do plano, preservando a ordem esperada.
    const slides = input.slidePlan.map((plan, i) => {
      const s = output.slides[i] ?? output.slides.find((x) => x.kind === plan.kind);
      const blank = { kind: plan.kind, kicker: "", title: "", body: "", highlight: "", footer: "", visualDirection: "", alt: "" };
      const merged = { ...blank, ...(s ?? {}), kind: plan.kind };
      for (const key of FIELD_KEYS) if (plan.limits[key] === undefined) merged[key] = "";
      return merged;
    });
    return { ...output, slides, hashtags, caption: output.caption.slice(0, 2200) };
  },
};
