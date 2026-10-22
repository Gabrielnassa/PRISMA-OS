import { contrastRatio, worstCaseOverlayContrast } from "@/lib/color";
import type { BrandProfile } from "@/lib/brand";
import {
  ASPECTS,
  FIELD_KEYS,
  FIELD_LABELS,
  type ContentDocument,
  type FieldKey,
} from "@/lib/content/document";
import type { RenderedSlide } from "../render/engine";
import { getTemplate } from "../render/templates";
import { effectiveLimits } from "@/lib/content/limits";
import type { TextReport } from "../render/kit";

/**
 * Controle visual e editorial determinístico (seção 11.4 da especificação).
 * Não substitui revisão humana: ortografia completa e coerência semântica
 * dependem da revisão por IA e da aprovação.
 */

export const CHECKER_VERSION = "quality-rules@1.0.0";

export type Severity = "critical" | "warning" | "info";

export interface QualityItem {
  id: string;
  severity: Severity;
  category: "formato" | "texto" | "legibilidade" | "marca" | "imagem" | "cta" | "veracidade" | "legenda";
  message: string;
  suggestion?: string;
  slideIndex?: number;
  field?: FieldKey;
}

export interface QualityReport {
  checkerVersion: string;
  items: QualityItem[];
  criticalCount: number;
  warningCount: number;
  passed: boolean;
  checkedAt: string;
}

export interface QualityInput {
  doc: ContentDocument;
  rendered: RenderedSlide[];
  brand: BrandProfile;
  briefing: { cta?: string; offer?: string };
  images: Map<string, { width: number; height: number }>;
}

/** Texto grande segundo a WCAG, convertido para a escala da peça (1080 px ≈ 3× a tela do celular). */
function isLargeText(t: TextReport): boolean {
  return t.size >= 68 || (t.size >= 54 && t.weight >= 700);
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function containsTerm(haystack: string, term: string): boolean {
  const t = normalize(term).trim();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(normalize(haystack));
}

/** Linguagem de condição comercial (aplicada ao texto sem acentos). */
const COMMERCIAL_RE =
  /(r\$\s?\d|\d+\s?%\s?(de\s)?(off|desconto)|\bdesconto|\bgratis\b|\bparcel|\bpromo(cao|cional)|\bcupom|ultimas unidades|\d+\s?x\s?(sem juros|de\b|r\$)|\bsem juros\b|\breais\b|\boferta|\bprecos?\b|leve\s+\d+\s+pague|black\s?friday|\bliquidacao|por apenas|\bcashback|\bbrinde)/;
const NUMBER_RE = /\d/;
/** Dados que parecem estatística: percentuais, milhares, "x mais", "mil/milhões" (anos não contam). */
const STAT_RE = /(\d+([.,]\d+)?\s?%)|(\b\d{1,3}(\.\d{3})+\b)|(\b\d+([.,]\d+)?\s?(mil|milhoes|milhao|bilhoes|bilhao)\b)|(\b\d+([.,]\d+)?\s?x\s?mais\b)|(\b(?!19\d\d\b|20\d\d\b)\d{4,}\b)/;
const SOURCE_RE = /\b(fonte|segundo|conforme|dados|pesquisa|levantamento|relatorio|estudo|ibge|censo)\b/;

export function runQualityChecks(input: QualityInput): QualityReport {
  const { doc, rendered, brand } = input;
  const items: QualityItem[] = [];
  const add = (item: QualityItem) => items.push(item);
  const { template, known } = getTemplate(doc.templateId);
  const slideNo = (i: number) => `lâmina ${i + 1}`;

  // ---- Formato e dimensões
  if (!known) add({ id: "template_unknown", severity: "critical", category: "formato", message: `Template "${doc.templateId}" não existe na biblioteca.`, suggestion: "Escolha um template da biblioteca." });
  if (!template.formats.includes(doc.format)) add({ id: "template_format", severity: "critical", category: "formato", message: `O template "${template.name}" não suporta o formato escolhido.` });
  if (!template.aspects.includes(doc.aspect)) add({ id: "template_aspect", severity: "critical", category: "formato", message: `O template "${template.name}" não suporta a proporção ${doc.aspect}.` });
  const dims = ASPECTS[doc.aspect];
  for (const r of rendered) {
    if (r.width !== dims.width || r.height !== dims.height) {
      add({ id: "dimensions", severity: "critical", category: "formato", slideIndex: r.index, message: `Dimensões da ${slideNo(r.index)} (${r.width}×${r.height}) diferem do formato (${dims.width}×${dims.height}).` });
    }
  }
  if (doc.format === "carousel" && doc.slides[0]?.kind !== "cover") {
    add({ id: "carousel_cover", severity: "warning", category: "texto", message: "O carrossel não começa com uma lâmina de abertura.", suggestion: "Use uma abertura com gancho forte na primeira lâmina." });
  }

  // ---- Texto: obrigatórios, limites, campos não exibidos, repetição
  const limitsFor = (i: number) => {
    const slide = doc.slides[i]!;
    return effectiveLimits(template.fieldLimits[slide.kind], template.capacity, doc.aspect, slide.kind, Boolean(slide.imageAssetId) && template.image !== "none");
  };
  doc.slides.forEach((slide, i) => {
    const limits = limitsFor(i);
    if (!slide.fields.title.trim()) {
      add({ id: "title_required", severity: "critical", category: "texto", slideIndex: i, field: "title", message: `A ${slideNo(i)} está sem título.` });
    }
    for (const key of FIELD_KEYS) {
      const value = slide.fields[key].trim();
      if (!value) continue;
      const limit = limits[key];
      if (limit === undefined) {
        add({ id: "field_hidden", severity: "warning", category: "texto", slideIndex: i, field: key, message: `"${FIELD_LABELS[key]}" da ${slideNo(i)} não aparece neste template.`, suggestion: "Apague o campo ou escolha outro template." });
      } else if (value.length > limit) {
        add({
          id: "field_length",
          severity: value.length > limit * 1.5 ? "critical" : "warning",
          category: "texto",
          slideIndex: i,
          field: key,
          message: `"${FIELD_LABELS[key]}" da ${slideNo(i)} tem ${value.length} caracteres (recomendado até ${limit}).`,
          suggestion: "Encurte o texto para manter a leitura rápida.",
        });
      }
      if (/\s{2,}/.test(value.replace(/\n/g, " "))) {
        add({ id: "double_space", severity: "info", category: "texto", slideIndex: i, field: key, message: `Espaços duplos em "${FIELD_LABELS[key]}" da ${slideNo(i)}.` });
      }
      const repeated = /(?<![\p{L}\p{N}])(\p{L}{2,})\s+\1(?![\p{L}\p{N}])/iu.exec(value);
      if (repeated) {
        add({ id: "repeated_word", severity: "warning", category: "texto", slideIndex: i, field: key, message: `Palavra repetida ("${repeated[1]} ${repeated[1]}") em "${FIELD_LABELS[key]}" da ${slideNo(i)}.` });
      }
      const count = (re: RegExp) => (value.match(re) ?? []).length;
      if (count(/\(/g) !== count(/\)/g) || count(/“/g) !== count(/”/g) || count(/"/g) % 2 === 1) {
        add({ id: "unbalanced", severity: "info", category: "texto", slideIndex: i, field: key, message: `Parênteses ou aspas sem fechamento em "${FIELD_LABELS[key]}" da ${slideNo(i)}.` });
      }
    }
  });
  const titles = doc.slides.map((s) => normalize(s.fields.title.trim())).filter(Boolean);
  if (new Set(titles).size !== titles.length) {
    add({ id: "duplicate_titles", severity: "warning", category: "texto", message: "Há lâminas com títulos idênticos.", suggestion: "Cada lâmina deve avançar a narrativa." });
  }

  // ---- Legibilidade: transbordo, contraste e tamanho mínimo
  for (const r of rendered) {
    for (const t of r.texts) {
      if (!t.fits) {
        add({
          id: "text_overflow",
          severity: "critical",
          category: "legibilidade",
          slideIndex: r.index,
          field: t.field,
          message: `"${FIELD_LABELS[t.field]}" da ${slideNo(r.index)} não cabe na área disponível (texto cortado).`,
          suggestion: "Reduza o texto ou a escala tipográfica da lâmina.",
        });
      }
      const ratio =
        t.background.kind === "solid"
          ? contrastRatio(t.color, t.background.color)
          : worstCaseOverlayContrast(t.color, t.background.color, t.background.alpha);
      const required = isLargeText(t) ? 3 : 4.5;
      if (ratio < required) {
        add({
          id: "contrast",
          severity: ratio < required * 0.75 ? "critical" : "warning",
          category: "legibilidade",
          slideIndex: r.index,
          field: t.field,
          message: `Contraste de ${ratio.toFixed(1)}:1 em "${FIELD_LABELS[t.field]}" da ${slideNo(r.index)} (mínimo ${required}:1).`,
          suggestion: t.background.kind === "overlay" ? "Use uma foto mais escura ou outro template." : "Troque o tema da lâmina (claro/escuro/marca) ou ajuste as cores.",
        });
      }
      if (t.size < 22) {
        add({ id: "small_text", severity: "warning", category: "legibilidade", slideIndex: r.index, field: t.field, message: `Texto muito pequeno (${t.size}px) em "${FIELD_LABELS[t.field]}" da ${slideNo(r.index)}: pode ficar ilegível no celular.` });
      }
      if (t.unsupported.length) {
        add({
          id: "unsupported_chars",
          severity: "critical",
          category: "legibilidade",
          slideIndex: r.index,
          field: t.field,
          message: `"${FIELD_LABELS[t.field]}" da ${slideNo(r.index)} tem caracteres que a fonte não desenha (${t.unsupported.join(" ")}): sairiam como caixas na peça.`,
          suggestion: "Remova emojis e símbolos especiais do texto da arte (na legenda eles podem ser usados).",
        });
      }
    }
    if (r.issues.includes("handle_truncated")) {
      add({ id: "handle_truncated", severity: "warning", category: "marca", slideIndex: r.index, message: `A assinatura da marca foi abreviada na ${slideNo(r.index)} por falta de espaço.`, suggestion: "Use o logotipo ou uma assinatura mais curta." });
    }
  }

  // ---- Imagens e logotipo
  for (const r of rendered) {
    const slide = doc.slides[r.index]!;
    if (r.issues.includes("missing_image") && template.image === "required") {
      add({ id: "image_required", severity: "critical", category: "imagem", slideIndex: r.index, message: `O template "${template.name}" exige foto e a ${slideNo(r.index)} está sem imagem.`, suggestion: "Selecione uma foto real da biblioteca do cliente." });
    }
    if (r.issues.includes("image_unavailable")) {
      add({ id: "image_unavailable", severity: "critical", category: "imagem", slideIndex: r.index, message: `A imagem da ${slideNo(r.index)} não está disponível no armazenamento.` });
    }
    if (slide.imageAssetId) {
      // Ampliação efetiva: área ocupada × zoom em relação ao tamanho real da foto.
      const upscale = Math.max(0, ...r.photos.map((p) => Math.max((p.boxW * p.zoom) / p.imgW, (p.boxH * p.zoom) / p.imgH)));
      if (upscale > 1.3) {
        const meta = input.images.get(slide.imageAssetId);
        add({
          id: "image_resolution",
          severity: "warning",
          category: "imagem",
          slideIndex: r.index,
          message: `A foto da ${slideNo(r.index)} está ampliada ${upscale.toFixed(1).replace(".", ",")}× (${meta ? `${meta.width}×${meta.height} px` : "resolução original"}) e pode ficar sem nitidez.`,
          suggestion: "Use uma foto de maior resolução ou reduza o zoom.",
        });
      }
      if (!slide.alt.trim()) {
        add({ id: "image_alt", severity: "info", category: "imagem", slideIndex: r.index, message: `Descreva a imagem da ${slideNo(r.index)} (texto alternativo) para acessibilidade.` });
      }
    }
  }
  if (rendered.some((r) => r.issues.includes("logo_unavailable"))) {
    add({ id: "logo_unavailable", severity: "critical", category: "marca", message: "O arquivo do logotipo não está disponível." });
  }

  // ---- Identidade da marca
  if (brand.visual.configured) {
    const b = brand.visual.colors;
    const d = doc.style.colors;
    const diff = (["primary", "secondary", "accent", "background", "text"] as const).filter((k) => b[k].toLowerCase() !== d[k].toLowerCase());
    if (diff.length) add({ id: "brand_colors", severity: "warning", category: "marca", message: `Cores diferentes do perfil da marca (${diff.join(", ")}).`, suggestion: "Restaure as cores da marca, salvo decisão de campanha." });
    if (brand.visual.headingFont !== doc.style.headingFont || brand.visual.bodyFont !== doc.style.bodyFont) {
      add({ id: "brand_fonts", severity: "warning", category: "marca", message: "Fontes diferentes das definidas no perfil da marca." });
    }
  } else {
    add({ id: "brand_unconfigured", severity: "warning", category: "marca", message: "A identidade visual do cliente ainda não foi configurada; a peça usa cores e fontes provisórias." });
  }
  if (brand.visual.logoAssetId && (!doc.style.showLogo || doc.style.logoAssetId !== brand.visual.logoAssetId)) {
    add({ id: "brand_logo", severity: "warning", category: "marca", message: "O logotipo da marca não está aplicado nesta peça." });
  }
  const allText = [...doc.slides.flatMap((s) => FIELD_KEYS.map((k) => s.fields[k])), doc.caption, doc.cta, doc.hashtags.join(" ")].join("\n");
  const normalizedAll = normalize(allText);
  for (const term of brand.voice.forbiddenTerms) {
    if (containsTerm(allText, term)) {
      add({ id: "forbidden_term", severity: "critical", category: "marca", message: `Termo proibido pela marca encontrado: "${term}".`, suggestion: "Substitua por um termo aprovado." });
    }
  }

  // ---- CTA e correspondência com o briefing
  const hasCtaSlide = doc.slides.some((s) => s.kind === "cta");
  if (!doc.cta.trim() && !hasCtaSlide) {
    add({ id: "cta_missing", severity: "warning", category: "cta", message: "A peça não tem chamada para ação (CTA).", suggestion: "Inclua um CTA na legenda ou uma lâmina final de ação." });
  }
  const briefCta = input.briefing.cta?.trim();
  if (briefCta && briefCta.length >= 4) {
    const words = normalize(briefCta).split(/\s+/).filter((w) => w.length > 3);
    const hay = normalize(allText);
    const matched = words.filter((w) => hay.includes(w)).length;
    if (words.length > 0 && matched / words.length < 0.5) {
      add({ id: "cta_briefing", severity: "warning", category: "cta", message: `O CTA pedido no briefing ("${briefCta}") não aparece na peça.` });
    }
  }

  // ---- Veracidade: números sem fonte, condições comerciais não confirmadas, depoimentos
  doc.slides.forEach((slide, i) => {
    const limits = limitsFor(i);
    const shown = (k: FieldKey) => (limits[k] !== undefined ? slide.fields[k] : "");
    const footer = normalize(shown("footer"));
    const hasSource = SOURCE_RE.test(footer);
    const highlight = normalize(shown("highlight"));
    const flagged =
      (NUMBER_RE.test(highlight) && !COMMERCIAL_RE.test(highlight)) ||
      (["kicker", "title", "body"] as const).some((k) => {
        const v = normalize(shown(k));
        return STAT_RE.test(v) && !COMMERCIAL_RE.test(v);
      });
    if (flagged && !hasSource && slide.kind !== "cta") {
      add({
        id: "number_source",
        severity: "warning",
        category: "veracidade",
        slideIndex: i,
        message: `A ${slideNo(i)} apresenta dado numérico sem fonte identificada no rodapé.`,
        suggestion: 'Informe a fonte e o período (ex.: "Fonte: IBGE, 2024") ou remova o número.',
      });
    }
  });
  if (COMMERCIAL_RE.test(normalizedAll) && !brand.channels.confirmedOffers.trim() && !input.briefing.offer?.trim()) {
    add({ id: "offer_unconfirmed", severity: "warning", category: "veracidade", message: "A peça menciona preço/condição comercial, mas não há oferta confirmada no briefing nem no perfil da marca.", suggestion: "Confirme a condição com o cliente antes de aprovar." });
  }
  if (template.id === "video-depoimento") {
    add({ id: "testimonial", severity: "info", category: "veracidade", message: "Depoimento: confirme que o texto é literal, real e autorizado pela pessoa citada." });
  }

  // ---- Legenda
  if (!doc.caption.trim()) add({ id: "caption_missing", severity: "warning", category: "legenda", message: "A legenda está vazia." });
  const lowered = doc.hashtags.map((h) => h.toLowerCase());
  if (new Set(lowered).size !== lowered.length) add({ id: "hashtag_duplicate", severity: "info", category: "legenda", message: "Há hashtags repetidas." });

  add({ id: "human_review", severity: "info", category: "texto", message: "Ortografia completa, coerência entre imagem e texto e adequação ao público exigem revisão humana (ou revisão por IA, quando configurada)." });

  const criticalCount = items.filter((i) => i.severity === "critical").length;
  const warningCount = items.filter((i) => i.severity === "warning").length;
  return { checkerVersion: CHECKER_VERSION, items, criticalCount, warningCount, passed: criticalCount === 0, checkedAt: new Date().toISOString() };
}
