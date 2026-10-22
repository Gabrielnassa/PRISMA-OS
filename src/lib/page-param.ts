/** Número de página a partir da URL: inteiro entre 1 e 10.000 (qualquer outro valor vira 1). */
export function pageParam(value: string | undefined): number {
  const n = /^\d{1,5}$/.test(value ?? "") ? Number(value) : 1;
  return Math.min(10_000, Math.max(1, n));
}
