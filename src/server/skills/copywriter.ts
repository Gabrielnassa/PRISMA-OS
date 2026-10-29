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
import { SHARED_RULES, briefingBlock, clipWords, escapeData, firstSentence, splitMessages } from "./common";
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
  version: "1.1.0",
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
Template visual: ${input.templateName} — ${input.templateDescription}

Plano de lâminas:
${describePlan(input)}

<pauta>
Título interno: ${escapeData(input.title)}
</pauta>
${briefingBlock(input.briefing)}`;
  },
  demo(input) {
    // Monta textos exclusivamente a partir do briefing, sem acrescentar fatos.
    const messages = splitMessages(input.briefing.keyMessages || input.briefing.text);
    let msgIndex = 0;
    const next = () => messages[msgIndex++ % Math.max(1, messages.length)] ?? input.title;
    const slides = input.slidePlan.map((s) => {
      const lim = s.limits;
      const fit = (text: string, max?: number) => (max ? clipWords(text, max) : "");
      // Oferta nunca é cortada (perderia prazo ou condição): ou cabe inteira, ou fica fora do destaque.
      const whole = (text: string, max?: number) => (max && text.trim().length <= max ? text.trim() : "");
      const offer = input.briefing.offer.trim();
      const offerStatement = offer ? `Condição informada: ${offer}` : "";
      if (s.kind === "cover") {
        const highlight = whole(offer, lim.highlight);
        return {
          kind: s.kind,
          kicker: fit(OBJECTIVE_LABELS[input.objective], lim.kicker),
          title: fit(input.title || firstSentence(input.briefing.text), lim.title),
          body: offer && !highlight && whole(offerStatement, lim.body) ? offerStatement : fit(firstSentence(input.briefing.text), lim.body),
          highlight,
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
          body: whole(offerStatement, lim.body),
          highlight: whole(offer, lim.highlight),
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
      concept: `Rascunho montado a partir do briefing: ${clipWords(input.briefing.text, 160)}`,
      slides,
      caption: `${clipWords(input.briefing.text, 1200)}${input.briefing.cta ? `\n\n${input.briefing.cta}` : ""}`,
      hashtags,
      cta: input.briefing.cta,
      assumptions: ["Modo de demonstração: textos extraídos do briefing, sem IA."],
      claimsToConfirm: [],
    };
  },
  postProcess(output, input) {
    const hashtags = [...new Set(output.hashtags.map(normalizeHashtag).filter((h): h is string => Boolean(h)))].slice(0, 30);
    // Garante uma lâmina por item do plano. Com a quantidade certa, alinha pela
    // posição; senão, pelo tipo (capa, conteúdos em ordem, CTA), deixando em
    // branco o que faltar, sem repetir o texto de outra lâmina.
    const plan = input.slidePlan;
    const sameLength = output.slides.length === plan.length;
    const pools = {
      cover: output.slides.filter((x) => x.kind === "cover"),
      content: output.slides.filter((x) => x.kind === "content"),
      cta: output.slides.filter((x) => x.kind === "cta"),
    };
    const slides = plan.map((p, i) => {
      const s = sameLength ? output.slides[i] : pools[p.kind].shift();
      const blank = { kind: p.kind, kicker: "", title: "", body: "", highlight: "", footer: "", visualDirection: "", alt: "" };
      const merged = { ...blank, ...(s ?? {}), kind: p.kind };
      for (const key of FIELD_KEYS) if (p.limits[key] === undefined) merged[key] = "";
      return merged;
    });
    const assumptions = sameLength
      ? output.assumptions
      : [...output.assumptions, `A IA devolveu ${output.slides.length} de ${plan.length} lâminas; as que ficaram sem texto estão em branco para revisão.`];
    return { ...output, slides, assumptions, hashtags, caption: output.caption.slice(0, 2200) };
  },
};
