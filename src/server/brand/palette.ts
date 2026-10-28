import { Resvg } from "@resvg/resvg-js";
import { contrastRatio, toHex } from "@/lib/color";

/**
 * Extração de paleta a partir de imagens da marca (logotipo, foto de perfil,
 * posts). Tudo local: a imagem é rasterizada em tamanho pequeno pelo resvg
 * (PNG, JPEG, GIF e SVG; WebP não é lido), as cores são agrupadas por proximidade
 * perceptual (CIELAB) e cada grupo recebe um papel na marca.
 * O resultado é uma SUGESTÃO: a pessoa revisa e salva no perfil da marca.
 */

export interface SourceImage {
  data: Buffer;
  mimeType: string;
  /** Peso relativo (logotipo e foto de perfil pesam mais que posts). */
  weight?: number;
}

export interface Swatch {
  hex: string;
  /** Participação no conjunto (0–1). */
  share: number;
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface PaletteSuggestion {
  colors: BrandColors;
  swatches: Swatch[];
  /** Observações sobre escolhas derivadas (ex.: secundária gerada a partir da primária). */
  notes: string[];
  imagesUsed: number;
}

const SIZE = 96;
const SUPPORTED = /^image\/(png|jpe?g|gif|svg\+xml)$/;

/** Rasteriza uma imagem em até 96×96 (sem cortar) e devolve os pixels RGBA. */
export function rasterize(img: SourceImage): Uint8Array | null {
  if (!SUPPORTED.test(img.mimeType)) return null;
  const href = `data:${img.mimeType};base64,${img.data.toString("base64")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><image href="${href}" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid meet"/></svg>`;
  try {
    return new Resvg(svg, { font: { loadSystemFonts: false } }).render().pixels;
  } catch {
    return null;
  }
}

// --- Conversões de cor (sRGB → CIELAB, iluminante D65) ---------------------

type Lab = { L: number; a: number; b: number };

function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const deltaE = (p: Lab, q: Lab) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
const chroma = (p: Lab) => Math.hypot(p.a, p.b);

interface Cluster {
  r: number;
  g: number;
  b: number;
  weight: number;
  lab: Lab;
}

/** Agrupa os pixels de todas as imagens em cores representativas (maiores primeiro). */
export function extractSwatches(images: SourceImage[], max = 8): { swatches: Swatch[]; clusters: Cluster[]; imagesUsed: number } {
  // Histograma com 5 bits por canal (32 768 caixas), acumulando a média real de cada caixa.
  const bins = new Map<number, { r: number; g: number; b: number; w: number }>();
  let imagesUsed = 0;
  for (const img of images) {
    const px = rasterize(img);
    if (!px) continue;
    imagesUsed++;
    const weight = img.weight ?? 1;
    // Normaliza pela quantidade de pixels visíveis: cada imagem vale pelo seu peso, não pelo tamanho.
    let visible = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i]! >= 200) visible++;
    if (visible === 0) continue;
    const unit = weight / visible;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3]! < 200) continue;
      const r = px[i]!;
      const g = px[i + 1]!;
      const b = px[i + 2]!;
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, w: 0 };
      bin.r += r * unit;
      bin.g += g * unit;
      bin.b += b * unit;
      bin.w += unit;
      bins.set(key, bin);
    }
  }
  // Agrupamento guloso por distância perceptual, das caixas mais frequentes para as raras.
  const sorted = [...bins.values()].sort((x, y) => y.w - x.w).slice(0, 600);
  const clusters: Cluster[] = [];
  for (const bin of sorted) {
    const r = bin.r / bin.w;
    const g = bin.g / bin.w;
    const b = bin.b / bin.w;
    const lab = rgbToLab(r, g, b);
    const near = clusters.find((c) => deltaE(c.lab, lab) < 14);
    if (near) {
      const w = near.weight + bin.w;
      near.r = (near.r * near.weight + r * bin.w) / w;
      near.g = (near.g * near.weight + g * bin.w) / w;
      near.b = (near.b * near.weight + b * bin.w) / w;
      near.weight = w;
      near.lab = rgbToLab(near.r, near.g, near.b);
    } else {
      clusters.push({ r, g, b, weight: bin.w, lab });
    }
  }
  clusters.sort((x, y) => y.weight - x.weight);
  const total = clusters.reduce((s, c) => s + c.weight, 0) || 1;
  const top = clusters.filter((c) => c.weight / total >= 0.004).slice(0, Math.max(max, 12));
  return {
    clusters: top,
    swatches: top.slice(0, max).map((c) => ({ hex: toHex(c), share: Math.round((c.weight / total) * 1000) / 1000 })),
    imagesUsed,
  };
}

/** Mistura `hex` com `base` na proporção `t` de `hex` (para derivar tons quando faltam cores). */
function mix(hex: string, base: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(base)];
  return toHex({ r: a[0]! * t + b[0]! * (1 - t), g: a[1]! * t + b[1]! * (1 - t), b: a[2]! * t + b[2]! * (1 - t) });
}

/** Distribui as cores extraídas nos papéis da marca. */
export function assignRoles(clusters: Cluster[]): { colors: BrandColors; notes: string[] } {
  const notes: string[] = [];
  const total = clusters.reduce((s, c) => s + c.weight, 0) || 1;
  const share = (c: Cluster) => c.weight / total;
  const hex = (c: Cluster) => toHex(c);
  const chromatic = clusters.filter((c) => chroma(c.lab) >= 18 && c.lab.L > 12 && c.lab.L < 97);
  const neutrals = clusters.filter((c) => !chromatic.includes(c));

  // Fundo: o neutro claro (ou escuro) mais presente; sem neutros relevantes, um claro padrão.
  const lightNeutral = neutrals.filter((c) => c.lab.L >= 80).sort((x, y) => y.weight - x.weight)[0];
  const darkNeutral = neutrals.filter((c) => c.lab.L <= 22).sort((x, y) => y.weight - x.weight)[0];
  let background: string;
  if (lightNeutral && share(lightNeutral) >= 0.08) background = hex(lightNeutral);
  else if (darkNeutral && share(darkNeutral) >= 0.25 && !lightNeutral) background = hex(darkNeutral);
  else {
    background = "#ffffff";
    notes.push("Fundo branco sugerido: as imagens não têm um fundo neutro predominante.");
  }

  // Primária: a cor cromática mais presente; sem cor, o neutro escuro (marcas em preto e branco).
  const byPresence = [...chromatic].sort((x, y) => y.weight - x.weight);
  let primary = byPresence[0] ? hex(byPresence[0]) : darkNeutral ? hex(darkNeutral) : "#1f2937";
  if (!byPresence[0]) notes.push("Nenhuma cor viva encontrada: a primária usa o tom escuro da marca.");

  // Secundária: outra cor cromática bem diferente da primária; senão, um tom derivado.
  const primaryLab = byPresence[0]?.lab;
  const secondaryCluster = byPresence.slice(1).find((c) => !primaryLab || deltaE(c.lab, primaryLab) >= 20);
  let secondary: string;
  if (secondaryCluster) secondary = hex(secondaryCluster);
  else {
    secondary = mix(primary, background, 0.45);
    notes.push("Secundária derivada da primária (só uma cor de destaque nas imagens).");
  }

  // Destaque: a mais viva (croma ponderado pela presença) entre as que sobraram.
  const used = [primaryLab, secondaryCluster?.lab].filter(Boolean) as Lab[];
  const accentCluster = [...chromatic]
    .filter((c) => used.every((u) => deltaE(c.lab, u) >= 15))
    .sort((x, y) => chroma(y.lab) * Math.sqrt(share(y)) - chroma(x.lab) * Math.sqrt(share(x)))[0];
  let accent: string;
  if (accentCluster) accent = hex(accentCluster);
  else {
    accent = secondaryCluster ? hex(secondaryCluster) : primary;
    notes.push("Destaque repete uma cor da marca (não há uma terceira cor distinta).");
  }

  // Texto: o neutro do lado oposto ao fundo, garantindo contraste mínimo de 4,5:1.
  const darkBg = contrastRatio(background, "#000000") < contrastRatio(background, "#ffffff");
  const candidates = darkBg ? neutrals.filter((c) => c.lab.L >= 85) : neutrals.filter((c) => c.lab.L <= 30);
  let text = candidates.sort((x, y) => y.weight - x.weight).map(hex).find((h) => contrastRatio(h, background) >= 4.5) ?? (darkBg ? "#ffffff" : "#111111");
  if (contrastRatio(text, background) < 4.5) text = darkBg ? "#ffffff" : "#111111";

  // A primária vira fundo de lâminas com texto claro: se for clara demais, avisa.
  if (contrastRatio(primary, "#ffffff") < 3 && contrastRatio(primary, "#111111") >= 4.5) {
    notes.push("A primária é clara: textos sobre ela ficarão escuros.");
  }
  if (primary === background) primary = mix(primary, darkBg ? "#ffffff" : "#000000", 0.7);
  return { colors: { primary, secondary, accent, background, text }, notes };
}

export function suggestPalette(images: SourceImage[]): PaletteSuggestion | null {
  const { swatches, clusters, imagesUsed } = extractSwatches(images);
  if (imagesUsed === 0 || clusters.length === 0) return null;
  const { colors, notes } = assignRoles(clusters);
  return { colors, swatches, notes, imagesUsed };
}
