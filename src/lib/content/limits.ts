import type { Aspect, FieldKey } from "./document";

/**
 * Fração dos limites-base de caracteres que cabe numa lâmina com todos os
 * campos cheios, por proporção e presença de foto. Calibrada renderizando cada
 * template (veja tests/unit/capacity.test.ts).
 */
export type Capacity = Partial<Record<Aspect, { plain: number; photo: number }>>;

export function capacityFactor(capacity: Capacity | undefined, aspect: Aspect, hasPhoto: boolean): number {
  const entry = capacity?.[aspect];
  if (!entry) return 1;
  return hasPhoto ? entry.photo : entry.plain;
}

export function effectiveLimits(
  base: Partial<Record<FieldKey, number>>,
  capacity: Capacity | undefined,
  aspect: Aspect,
  hasPhoto: boolean,
): Partial<Record<FieldKey, number>> {
  const f = capacityFactor(capacity, aspect, hasPhoto);
  const out: Partial<Record<FieldKey, number>> = {};
  for (const [k, v] of Object.entries(base) as Array<[FieldKey, number]>) out[k] = Math.max(8, Math.floor(v * f));
  return out;
}
