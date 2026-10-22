import { ContentDocumentSchema, FIELD_KEYS, type Aspect, type ContentDocument, type FieldKey, type SlideKind } from "@/lib/content/document";
import { effectiveLimits, scaleLimits } from "@/lib/content/limits";
import type { TemplateDef } from "./kit";
import { renderSlide } from "./engine";
import { SAMPLE_IMAGE_ID, sampleImage } from "./samples";

/**
 * Ferramentas de calibração dos limites de caracteres: preenchem cada campo
 * com texto realista em português até o limite e verificam se a lâmina cabe.
 */
const WORDS =
  "cuidado prático para equipe atendimento próximo resultado confiável planejamento semanal clientes satisfeitos processo simples orientação clara qualidade diária".split(
    " ",
  );

export function fillToLength(n: number, seed = 0): string {
  let out = "";
  let i = seed;
  while (true) {
    const w = WORDS[i++ % WORDS.length]!;
    const next = out ? `${out} ${w}` : w;
    if (next.length > n) break;
    out = next;
  }
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const KIND_INDEX: Record<SlideKind, number> = { cover: 0, content: 1, cta: 2 };

export function capacityDoc(t: TemplateDef, aspect: Aspect, kind: SlideKind, photo: boolean, factor?: number): ContentDocument {
  const format = aspect === "9:16" ? "story" : "carousel";
  const kinds: SlideKind[] = format === "carousel" ? ["cover", "content", "cta"] : [kind];
  const slides = kinds.map((k, i) => {
    const base = t.fieldLimits[k];
    const limits = factor === undefined ? effectiveLimits(base, t.capacity, aspect, k, photo && t.image !== "none") : scaleLimits(base, factor);
    const fields = Object.fromEntries(FIELD_KEYS.map((f) => [f, limits[f] !== undefined ? fillToLength(limits[f]!, i * 3 + FIELD_KEYS.indexOf(f)) : ""])) as Record<FieldKey, string>;
    if (fields.highlight) fields.highlight = fillToLength(limits.highlight!, 7);
    return { id: `s${i + 1}-cal`, kind: k, fields, imageAssetId: photo && t.image !== "none" ? SAMPLE_IMAGE_ID : null };
  });
  return ContentDocumentSchema.parse({
    schemaVersion: 1,
    format,
    aspect,
    templateId: t.id,
    style: {
      colors: { primary: "#2b2d42", secondary: "#8d99ae", accent: "#7c3aed", background: "#f7f7f5", text: "#16161a" },
      headingFont: "montserrat",
      bodyFont: "inter",
      logoAssetId: null,
      showLogo: true,
      handle: "@marca",
    },
    slides,
    caption: "",
    hashtags: [],
    cta: "",
    notes: "",
  });
}

export async function slideFits(doc: ContentDocument, kind: SlideKind): Promise<{ fits: boolean; failing: string[] }> {
  const index = doc.format === "carousel" ? KIND_INDEX[kind] : 0;
  const rendered = await renderSlide(doc, index, { images: new Map([[SAMPLE_IMAGE_ID, sampleImage()]]) });
  const failing = rendered.texts.filter((x) => !x.fits).map((x) => x.key);
  return { fits: failing.length === 0, failing };
}

/** Maior fator (passo de 0,05) em que todos os campos cheios cabem. */
export async function maxFactor(t: TemplateDef, aspect: Aspect, kind: SlideKind, photo: boolean): Promise<number> {
  for (let f = 1; f >= 0.2; f = Math.round((f - 0.05) * 100) / 100) {
    const { fits } = await slideFits(capacityDoc(t, aspect, kind, photo, f), kind);
    if (fits) return f;
  }
  return 0.2;
}
