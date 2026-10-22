/** Utilitários de cor (WCAG 2.1) usados pelo motor de layout e pelo controle de qualidade. */

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  if (!HEX_RE.test(hex)) throw new Error(`Cor inválida: ${hex}`);
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Cor resultante de `top` com opacidade `alpha` sobre `bottom`. */
export function blend(top: string, alpha: number, bottom: string): string {
  const t = parseHex(top);
  const b = parseHex(bottom);
  return toHex({
    r: t.r * alpha + b.r * (1 - alpha),
    g: t.g * alpha + b.g * (1 - alpha),
    b: t.b * alpha + b.b * (1 - alpha),
  });
}

/**
 * Contraste no pior caso para texto sobre foto com película (overlay):
 * como a foto é desconhecida, considera-se fundo preto e branco puros.
 */
export function worstCaseOverlayContrast(text: string, overlay: string, alpha: number): number {
  return Math.min(contrastRatio(text, blend(overlay, alpha, "#000000")), contrastRatio(text, blend(overlay, alpha, "#ffffff")));
}

/** Escolhe preto/branco (ou as cores fornecidas) com melhor contraste sobre `bg`. */
export function readableOn(bg: string, light = "#ffffff", dark = "#111111"): string {
  return contrastRatio(light, bg) >= contrastRatio(dark, bg) ? light : dark;
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mix(a: string, b: string, t: number): string {
  return blend(b, t, a);
}
