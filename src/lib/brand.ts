import { z } from "zod";
import { FONT_IDS } from "./fonts";
import { HEX_RE } from "./color";

const text = (max: number) => z.string().trim().max(max).default("");
const hex = z.string().regex(HEX_RE, "Use o formato #RRGGBB");
const termList = z.array(z.string().trim().min(1).max(80)).max(100).default([]);

export const TEMPLATE_FAMILIES = ["editorial", "natural", "educativo", "produto", "video", "tech"] as const;
export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number];

export const FAMILY_LABELS: Record<TemplateFamily, string> = {
  editorial: "Editorial premium",
  natural: "Natural e humano",
  educativo: "Educativo e estratégico",
  produto: "Produto e oferta",
  video: "Vídeo social profissional",
  tech: "Tech / Prisma",
};

export const BrandVisualSchema = z.object({
  colors: z
    .object({
      primary: hex.default("#1f2937"),
      secondary: hex.default("#4b5563"),
      accent: hex.default("#2563eb"),
      background: hex.default("#ffffff"),
      text: hex.default("#111827"),
    })
    .default({ primary: "#1f2937", secondary: "#4b5563", accent: "#2563eb", background: "#ffffff", text: "#111827" }),
  headingFont: z.enum(FONT_IDS).default("inter"),
  bodyFont: z.enum(FONT_IDS).default("inter"),
  logoAssetId: z.string().uuid().nullable().default(null),
  photoStyle: text(1000),
  iconStyle: text(500),
  imageTreatment: text(500),
  titleCtaStyle: text(1000),
  approvedReferences: text(2000),
  restrictedElements: text(2000),
  preferredFamilies: z.array(z.enum(["editorial", "natural", "educativo", "produto", "video", "tech"])).max(6).default([]),
  configured: z.boolean().default(false),
});

export const BrandProfileSchema = z.object({
  business: z
    .object({
      companyName: text(200),
      segment: text(200),
      products: text(3000),
      services: text(3000),
      region: text(300),
      goals: text(2000),
    })
    .default({ companyName: "", segment: "", products: "", services: "", region: "", goals: "" }),
  audience: z
    .object({
      targetAudience: text(2000),
      personas: text(4000),
      valueProposition: text(2000),
      differentiators: text(2000),
    })
    .default({ targetAudience: "", personas: "", valueProposition: "", differentiators: "" }),
  voice: z
    .object({
      tone: text(2000),
      restrictions: text(2000),
      preferredTerms: termList,
      forbiddenTerms: termList,
    })
    .default({ tone: "", restrictions: "", preferredTerms: [], forbiddenTerms: [] }),
  visual: BrandVisualSchema.default(BrandVisualSchema.parse({})),
  channels: z
    .object({
      instagram: text(200),
      facebook: text(200),
      linkedin: text(200),
      tiktok: text(200),
      website: text(300),
      frequency: text(500),
      confirmedOffers: text(3000),
    })
    .default({ instagram: "", facebook: "", linkedin: "", tiktok: "", website: "", frequency: "", confirmedOffers: "" }),
  references: z
    .object({
      competitors: text(3000),
      referenceUrls: text(3000),
      responsibles: text(2000),
    })
    .default({ competitors: "", referenceUrls: "", responsibles: "" }),
});

export type BrandProfile = z.infer<typeof BrandProfileSchema>;
export type BrandVisual = z.infer<typeof BrandVisualSchema>;

export function emptyBrandProfile(): BrandProfile {
  return BrandProfileSchema.parse({});
}

/** Percentual de preenchimento dos campos essenciais do perfil. */
export function brandCompleteness(p: BrandProfile): { percent: number; missing: string[] } {
  const checks: Array<[string, boolean]> = [
    ["Nome da empresa", p.business.companyName.length > 0],
    ["Segmento", p.business.segment.length > 0],
    ["Produtos ou serviços", p.business.products.length > 0 || p.business.services.length > 0],
    ["Público-alvo", p.audience.targetAudience.length > 0],
    ["Proposta de valor", p.audience.valueProposition.length > 0],
    ["Tom de voz", p.voice.tone.length > 0],
    ["Identidade visual (cores e fontes)", p.visual.configured],
    ["Logotipo", p.visual.logoAssetId !== null],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  return { percent: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}
