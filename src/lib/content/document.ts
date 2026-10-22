import { z } from "zod";
import { FONT_IDS } from "../fonts";
import { HEX_RE } from "../color";

/**
 * Documento estruturado de uma peça. Texto, imagens, logotipo e estilo ficam
 * separados para que cada elemento possa ser editado sem regenerar a peça.
 */

export const CONTENT_FORMATS = ["post", "carousel", "story"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export const FORMAT_LABELS: Record<ContentFormat, string> = {
  post: "Post estático",
  carousel: "Carrossel",
  story: "Story",
};

export const ASPECTS = {
  "1:1": { width: 1080, height: 1080, label: "Quadrado 1:1 (1080×1080)" },
  "4:5": { width: 1080, height: 1350, label: "Retrato 4:5 (1080×1350)" },
  "9:16": { width: 1080, height: 1920, label: "Vertical 9:16 (1080×1920)" },
} as const;
export type Aspect = keyof typeof ASPECTS;
export const ASPECT_IDS = Object.keys(ASPECTS) as Aspect[];

export const FORMAT_ASPECTS: Record<ContentFormat, Aspect[]> = {
  post: ["4:5", "1:1"],
  carousel: ["4:5", "1:1"],
  story: ["9:16"],
};

export const SLIDE_LIMITS: Record<ContentFormat, { min: number; max: number }> = {
  post: { min: 1, max: 1 },
  carousel: { min: 2, max: 10 },
  story: { min: 1, max: 1 },
};

export const SLIDE_KINDS = ["cover", "content", "cta"] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];
export const SLIDE_KIND_LABELS: Record<SlideKind, string> = {
  cover: "Abertura",
  content: "Desenvolvimento",
  cta: "Chamada para ação",
};

export const FIELD_KEYS = ["kicker", "title", "body", "highlight", "footer"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export const FIELD_LABELS: Record<FieldKey, string> = {
  kicker: "Chamada curta (sobretítulo)",
  title: "Título",
  body: "Texto de apoio",
  highlight: "Destaque (número, preço ou condição)",
  footer: "Rodapé (fonte, assinatura ou contato)",
};
/** Limites absolutos; cada template define limites próprios menores. */
export const FIELD_MAX: Record<FieldKey, number> = { kicker: 60, title: 160, body: 600, highlight: 32, footer: 120 };

export const OBJECTIVES = ["awareness", "engagement", "education", "conversion", "authority", "relationship"] as const;
export type Objective = (typeof OBJECTIVES)[number];
export const OBJECTIVE_LABELS: Record<Objective, string> = {
  awareness: "Reconhecimento de marca",
  engagement: "Engajamento",
  education: "Educação do público",
  conversion: "Conversão / vendas",
  authority: "Autoridade",
  relationship: "Relacionamento",
};

export const CHANNELS = ["instagram", "facebook", "linkedin", "tiktok", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  other: "Outro",
};

export const SLIDE_THEMES = ["auto", "light", "dark", "brand"] as const;
export type SlideTheme = (typeof SLIDE_THEMES)[number];
export const SLIDE_THEME_LABELS: Record<SlideTheme, string> = {
  auto: "Padrão do template",
  light: "Claro",
  dark: "Escuro",
  brand: "Cor da marca",
};

const hex = z.string().regex(HEX_RE, "Use o formato #RRGGBB");

export const SlideFieldsSchema = z.object({
  kicker: z.string().max(FIELD_MAX.kicker).default(""),
  title: z.string().max(FIELD_MAX.title).default(""),
  body: z.string().max(FIELD_MAX.body).default(""),
  highlight: z.string().max(FIELD_MAX.highlight).default(""),
  footer: z.string().max(FIELD_MAX.footer).default(""),
});
export type SlideFields = z.infer<typeof SlideFieldsSchema>;

export const SlideSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  kind: z.enum(SLIDE_KINDS),
  fields: SlideFieldsSchema,
  imageAssetId: z.string().uuid().nullable().default(null),
  imageFocus: z
    .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
    .default({ x: 50, y: 50 }),
  imageZoom: z.number().min(1).max(2.5).default(1),
  align: z.enum(["auto", "left", "center"]).default("auto"),
  theme: z.enum(SLIDE_THEMES).default("auto"),
  textScale: z.number().min(0.7).max(1.3).default(1),
  alt: z.string().max(400).default(""),
});
export type Slide = z.infer<typeof SlideSchema>;

export const DocumentStyleSchema = z.object({
  colors: z.object({
    primary: hex,
    secondary: hex,
    accent: hex,
    background: hex,
    text: hex,
  }),
  headingFont: z.enum(FONT_IDS),
  bodyFont: z.enum(FONT_IDS),
  logoAssetId: z.string().uuid().nullable().default(null),
  showLogo: z.boolean().default(true),
  handle: z.string().max(60).default(""),
});
export type DocumentStyle = z.infer<typeof DocumentStyleSchema>;

const HASHTAG_RE = /^#[\p{L}\p{N}_]{1,60}$/u;

export const ContentDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    format: z.enum(CONTENT_FORMATS),
    aspect: z.enum(["1:1", "4:5", "9:16"]),
    templateId: z.string().min(1).max(60),
    style: DocumentStyleSchema,
    slides: z.array(SlideSchema).min(1).max(10),
    caption: z.string().max(2200, "A legenda do Instagram aceita até 2.200 caracteres.").default(""),
    hashtags: z.array(z.string().regex(HASHTAG_RE, "Hashtag inválida")).max(30, "Use no máximo 30 hashtags.").default([]),
    cta: z.string().max(200).default(""),
    notes: z.string().max(3000).default(""),
  })
  .superRefine((doc, ctx) => {
    const limits = SLIDE_LIMITS[doc.format];
    if (doc.slides.length < limits.min || doc.slides.length > limits.max) {
      ctx.addIssue({
        code: "custom",
        path: ["slides"],
        message: `O formato ${FORMAT_LABELS[doc.format]} aceita de ${limits.min} a ${limits.max} lâmina(s).`,
      });
    }
    if (!FORMAT_ASPECTS[doc.format].includes(doc.aspect)) {
      ctx.addIssue({ code: "custom", path: ["aspect"], message: "Proporção incompatível com o formato." });
    }
    const ids = new Set<string>();
    for (const s of doc.slides) {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", path: ["slides"], message: "Identificadores de lâmina duplicados." });
      ids.add(s.id);
    }
  });
export type ContentDocument = z.infer<typeof ContentDocumentSchema>;

export function normalizeHashtag(tag: string): string | null {
  const cleaned = tag.trim().replace(/^#+/, "").replace(/\s+/g, "");
  if (!cleaned) return null;
  const withHash = `#${cleaned}`;
  return HASHTAG_RE.test(withHash) ? withHash : null;
}

/** Hash canônico do documento (chaves ordenadas) para vincular aprovações à versão exata. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function newSlideId(index: number): string {
  return `s${index + 1}-${Math.random().toString(36).slice(2, 8)}`;
}

/** IDs de imagens referenciadas pelo documento (lâminas + logotipo). */
export function referencedAssetIds(doc: ContentDocument): string[] {
  const ids = doc.slides.map((s) => s.imageAssetId).filter((v): v is string => Boolean(v));
  if (doc.style.logoAssetId) ids.push(doc.style.logoAssetId);
  return [...new Set(ids)];
}
