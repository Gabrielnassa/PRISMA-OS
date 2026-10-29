/** Formatos de uma linha editorial: os do motor de layout e vídeo (feito fora do sistema por enquanto). */
export const EDITORIAL_FORMATS = ["post", "carousel", "story", "video"] as const;
export type EditorialFormat = (typeof EDITORIAL_FORMATS)[number];
export const EDITORIAL_FORMAT_LABELS: Record<EditorialFormat, string> = { post: "Post", carousel: "Carrossel", story: "Story", video: "Vídeo" };

/** "2026-11" → "Novembro de 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
