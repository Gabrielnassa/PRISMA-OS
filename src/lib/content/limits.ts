import type { Aspect, FieldKey, SlideKind } from "./document";

/**
 * Fração dos limites-base de caracteres que cabe numa lâmina com todos os
 * campos cheios, por proporção, tipo de lâmina e presença de foto. Ausente = 1.
 * Calibrada renderizando cada template (scripts/calibrate-capacity.ts; conferida
 * em tests/unit/capacity.test.ts).
 */
export type Capacity = Partial<Record<Aspect, Partial<Record<SlideKind, { plain: number; photo: number }>>>>;

export function capacityFactor(capacity: Capacity | undefined, aspect: Aspect, kind: SlideKind, hasPhoto: boolean): number {
  const entry = capacity?.[aspect]?.[kind];
  if (!entry) return 1;
  return hasPhoto ? entry.photo : entry.plain;
}

export function effectiveLimits(
  base: Partial<Record<FieldKey, number>>,
  capacity: Capacity | undefined,
  aspect: Aspect,
  kind: SlideKind,
  hasPhoto: boolean,
): Partial<Record<FieldKey, number>> {
  return scaleLimits(base, capacityFactor(capacity, aspect, kind, hasPhoto));
}

export function scaleLimits(base: Partial<Record<FieldKey, number>>, factor: number): Partial<Record<FieldKey, number>> {
  const out: Partial<Record<FieldKey, number>> = {};
  for (const [k, v] of Object.entries(base) as Array<[FieldKey, number]>) out[k] = factor >= 1 ? v : Math.max(8, Math.floor(v * factor));
  return out;
}
