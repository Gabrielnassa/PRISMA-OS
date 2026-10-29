import {
  ContentDocumentSchema,
  FIELD_KEYS,
  FIELD_MAX,
  newSlideId,
  type Aspect,
  type ContentDocument,
  type ContentFormat,
  type FieldKey,
  type SlideKind,
} from "@/lib/content/document";
import { effectiveLimits } from "@/lib/content/limits";
import type { TemplateDef } from "../render/kit";
import type { ArtDirection } from "../skills/art-director";
import type { CopyInput, CopyOutput } from "../skills/copywriter";
import { clipWords } from "../skills/common";

/** Sequência de tipos de lâmina por formato. */
export function slideKinds(format: ContentFormat, slideCount: number): SlideKind[] {
  if (format !== "carousel") return ["cover"];
  const n = Math.min(10, Math.max(2, slideCount));
  if (n === 2) return ["cover", "cta"];
  return ["cover", ...Array.from({ length: n - 2 }, () => "content" as const), "cta"];
}

/**
 * Limites de caracteres de cada lâmina já ajustados ao espaço real do layout
 * (proporção e presença de foto), para a IA escrever textos que cabem.
 */
export function slidePlan(template: TemplateDef, kinds: SlideKind[], aspect: Aspect, imageIds: string[]): CopyInput["slidePlan"] {
  const images = assignImages(template, kinds, imageIds);
  return kinds.map((kind, i) => ({ kind, limits: effectiveLimits(template.fieldLimits[kind], template.capacity, aspect, kind, images[i] != null) }));
}

/** Distribui as fotos selecionadas pelas lâminas (abertura primeiro). */
function assignImages(template: TemplateDef, kinds: SlideKind[], imageIds: string[]): Array<string | null> {
  if (template.image === "none" || imageIds.length === 0) return kinds.map(() => null);
  return kinds.map((_, i) => {
    if (template.image === "optional" && i > 0 && imageIds.length <= i) return null;
    return imageIds[i % imageIds.length] ?? null;
  });
}

const clipField = (key: FieldKey, value: string) => clipWords(value, FIELD_MAX[key]);

export function composeDocument(opts: {
  format: ContentFormat;
  art: ArtDirection;
  kinds: SlideKind[];
  imageIds: string[];
  copy: CopyOutput | null;
  fallbackTitle: string;
  notes: string;
}): ContentDocument {
  const { art, kinds } = opts;
  const images = assignImages(art.template, kinds, opts.imageIds);
  const slides = kinds.map((kind, i) => {
    const source = opts.copy?.slides[i];
    const fields = Object.fromEntries(FIELD_KEYS.map((k) => [k, clipField(k, source?.[k] ?? "")])) as Record<FieldKey, string>;
    if (!opts.copy && kind === "cover") fields.title = clipField("title", opts.fallbackTitle);
    return {
      id: newSlideId(i),
      kind,
      fields,
      imageAssetId: images[i] ?? null,
      imageFocus: { x: 50, y: 50 },
      imageZoom: 1,
      align: "auto" as const,
      theme: "auto" as const,
      textScale: 1,
      alt: clipWords(source?.alt ?? "", 400),
    };
  });
  return ContentDocumentSchema.parse({
    schemaVersion: 1,
    format: opts.format,
    aspect: art.aspect,
    templateId: art.template.id,
    style: art.style,
    slides,
    caption: (opts.copy?.caption ?? "").slice(0, 2200),
    hashtags: (opts.copy?.hashtags ?? []).slice(0, 30),
    cta: clipWords(opts.copy?.cta ?? "", 200),
    notes: opts.notes.slice(0, 3000),
  });
}

/** Notas de produção visíveis no editor: conceito, premissas e pontos a confirmar. */
export function productionNotes(copy: CopyOutput | null, art: ArtDirection, isDemo: boolean): string {
  const parts: string[] = [];
  if (isDemo) parts.push("Modo de demonstração: textos extraídos do briefing, sem IA.");
  if (copy?.concept) parts.push(`Conceito: ${copy.concept}`);
  if (copy?.assumptions.length) parts.push(`Premissas:\n${copy.assumptions.map((a) => `- ${a}`).join("\n")}`);
  if (copy?.claimsToConfirm.length) parts.push(`Confirmar com o cliente:\n${copy.claimsToConfirm.map((a) => `- ${a}`).join("\n")}`);
  const visual = copy?.slides.map((s, i) => (s.visualDirection ? `${i + 1}. ${s.visualDirection}` : "")).filter(Boolean) ?? [];
  if (visual.length) parts.push(`Direção visual sugerida:\n${visual.join("\n")}`);
  parts.push(`Direção de arte: ${art.rationale.join(" ")}`);
  return parts.join("\n\n");
}

/** Diferenças legíveis entre duas versões (para histórico e comparação). */
const FIELD_SHORT: Record<(typeof FIELD_KEYS)[number], string> = { kicker: "sobretítulo", title: "título", body: "texto", highlight: "destaque", footer: "rodapé" };

export function diffDocuments(a: ContentDocument, b: ContentDocument): string[] {
  const changes: string[] = [];
  if (a.templateId !== b.templateId) changes.push(`Template: ${a.templateId} → ${b.templateId}`);
  if (a.aspect !== b.aspect) changes.push(`Proporção: ${a.aspect} → ${b.aspect}`);
  if (JSON.stringify(a.style) !== JSON.stringify(b.style)) changes.push("Estilo (cores, fontes ou logotipo)");
  if (a.slides.length !== b.slides.length) changes.push(`Número de lâminas: ${a.slides.length} → ${b.slides.length}`);
  const n = Math.min(a.slides.length, b.slides.length);
  for (let i = 0; i < n; i++) {
    const sa = a.slides[i]!;
    const sb = b.slides[i]!;
    for (const k of FIELD_KEYS) if (sa.fields[k] !== sb.fields[k]) changes.push(`Lâmina ${i + 1}: ${FIELD_SHORT[k]}`);
    if (sa.imageAssetId !== sb.imageAssetId) changes.push(`Lâmina ${i + 1}: imagem`);
    if (JSON.stringify(sa.imageFocus) !== JSON.stringify(sb.imageFocus) || sa.imageZoom !== sb.imageZoom) changes.push(`Lâmina ${i + 1}: recorte da imagem`);
    if (sa.theme !== sb.theme || sa.align !== sb.align || sa.textScale !== sb.textScale) changes.push(`Lâmina ${i + 1}: aparência`);
  }
  if (a.caption !== b.caption) changes.push("Legenda");
  if (a.hashtags.join(" ") !== b.hashtags.join(" ")) changes.push("Hashtags");
  if (a.cta !== b.cta) changes.push("CTA");
  return changes;
}
