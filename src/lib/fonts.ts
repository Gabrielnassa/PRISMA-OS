/** Famílias tipográficas disponíveis para as peças (todas sob licença SIL OFL 1.1). */
export const FONT_IDS = [
  "inter",
  "dm-sans",
  "montserrat",
  "nunito",
  "space-grotesk",
  "playfair-display",
  "lora",
  "bebas-neue",
] as const;
export type FontId = (typeof FONT_IDS)[number];

export const FONT_CATALOG: Record<FontId, { label: string; category: "sans" | "serif" | "display"; weights: number[] }> = {
  inter: { label: "Inter", category: "sans", weights: [400, 600, 800] },
  "dm-sans": { label: "DM Sans", category: "sans", weights: [400, 600, 800] },
  montserrat: { label: "Montserrat", category: "sans", weights: [400, 600, 800] },
  nunito: { label: "Nunito", category: "sans", weights: [400, 600, 800] },
  "space-grotesk": { label: "Space Grotesk", category: "sans", weights: [400, 600, 700] },
  "playfair-display": { label: "Playfair Display", category: "serif", weights: [400, 600, 800] },
  lora: { label: "Lora", category: "serif", weights: [400, 600, 700] },
  "bebas-neue": { label: "Bebas Neue", category: "display", weights: [400] },
};

export function isFontId(v: string): v is FontId {
  return (FONT_IDS as readonly string[]).includes(v);
}
