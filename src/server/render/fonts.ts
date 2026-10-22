import fs from "node:fs";
import path from "node:path";
import { parse, type Font as OtFont } from "@shuding/opentype.js";
import { FONT_CATALOG, type FontId } from "@/lib/fonts";

/**
 * Carrega as fontes empacotadas (pacotes @fontsource, licença SIL OFL 1.1)
 * para o Satori e para a medição de texto. Os subconjuntos "latin" e
 * "latin-ext" cobrem o português.
 */

type Weight = 400 | 600 | 700 | 800;
export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: Weight;
  style: "normal";
}

const SUBSETS = ["latin", "latin-ext"] as const;
const fileCache = new Map<string, Buffer>();
const otCache = new Map<string, OtFont>();

function fontsDir(id: FontId): string {
  return path.join(process.cwd(), "node_modules", "@fontsource", id, "files");
}

export function resolveWeight(id: FontId, wanted: number): Weight {
  const available = FONT_CATALOG[id].weights;
  let best = available[0]!;
  for (const w of available) if (Math.abs(w - wanted) < Math.abs(best - wanted)) best = w;
  return best as Weight;
}

function readFont(id: FontId, weight: Weight, subset: (typeof SUBSETS)[number]): Buffer {
  const key = `${id}-${subset}-${weight}`;
  let buf = fileCache.get(key);
  if (!buf) {
    const file = path.join(fontsDir(id), `${id}-${subset}-${weight}-normal.woff`);
    if (!fs.existsSync(file)) throw new Error(`Fonte não encontrada: ${file}. Execute npm install.`);
    buf = fs.readFileSync(file);
    fileCache.set(key, buf);
  }
  return buf;
}

/** Nome interno usado no Satori (um por família). */
export function familyName(id: FontId): string {
  return `f-${id}`;
}

export function satoriFonts(ids: FontId[]): SatoriFont[] {
  const out: SatoriFont[] = [];
  for (const id of new Set(ids)) {
    for (const w of FONT_CATALOG[id].weights) {
      for (const subset of SUBSETS) {
        out.push({ name: familyName(id), data: readFont(id, w as Weight, subset), weight: w as Weight, style: "normal" });
      }
    }
  }
  return out;
}

function otFont(id: FontId, weight: Weight): OtFont {
  const key = `${id}-${weight}`;
  let f = otCache.get(key);
  if (!f) {
    const buf = readFont(id, weight, "latin");
    f = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    otCache.set(key, f);
  }
  return f;
}

export interface MeasureOptions {
  font: FontId;
  weight: number;
  size: number;
  letterSpacingEm?: number;
  uppercase?: boolean;
}

export function measureWidth(text: string, o: MeasureOptions): number {
  const t = o.uppercase ? text.toLocaleUpperCase("pt-BR") : text;
  const font = otFont(o.font, resolveWeight(o.font, o.weight));
  const base = font.getAdvanceWidth(t, o.size, { kerning: true });
  return base + (o.letterSpacingEm ?? 0) * o.size * Math.max(0, [...t].length - 1);
}

/** Quebra gulosa por palavras, respeitando quebras de linha manuais. */
export function wrapLines(text: string, maxWidth: number, o: MeasureOptions): { lines: string[]; widest: number; brokenWord: boolean } {
  const lines: string[] = [];
  let widest = 0;
  let brokenWord = false;
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureWidth(candidate, o) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (measureWidth(word, o) > maxWidth) brokenWord = true;
      current = word;
    }
    if (current) lines.push(current);
  }
  for (const l of lines) widest = Math.max(widest, measureWidth(l, o));
  return { lines, widest, brokenWord };
}

export interface FitOptions {
  font: FontId;
  weight: number;
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  lineHeight: number;
  letterSpacingEm?: number;
  uppercase?: boolean;
}

export interface FitResult {
  size: number;
  lines: number;
  height: number;
  fits: boolean;
}

/**
 * Maior tamanho de fonte (entre max e min) em que o texto cabe na caixa.
 * Se não couber nem no mínimo, retorna `fits: false` para o controle de qualidade.
 */
export function fitText(text: string, o: FitOptions): FitResult {
  const trimmed = text.trim();
  if (!trimmed) return { size: o.maxSize, lines: 0, height: 0, fits: true };
  // Margem de segurança: a quebra do Satori pode diferir alguns pixels da medição.
  const width = o.maxWidth * 0.97;
  let size = Math.round(o.maxSize);
  for (; size >= o.minSize; size -= 2) {
    const m = { font: o.font, weight: o.weight, size, letterSpacingEm: o.letterSpacingEm, uppercase: o.uppercase };
    const { lines, brokenWord } = wrapLines(trimmed, width, m);
    const height = lines.length * size * o.lineHeight;
    if (!brokenWord && height <= o.maxHeight) return { size, lines: lines.length, height, fits: true };
  }
  size = Math.round(o.minSize);
  const { lines } = wrapLines(trimmed, width, { font: o.font, weight: o.weight, size, letterSpacingEm: o.letterSpacingEm, uppercase: o.uppercase });
  return { size, lines: lines.length, height: lines.length * size * o.lineHeight, fits: false };
}
