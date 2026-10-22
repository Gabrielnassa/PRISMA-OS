/**
 * Calcula a capacidade de texto de cada template (fração dos limites-base que
 * cabe com todos os campos cheios) por proporção e tipo de lâmina. Use ao criar
 * ou alterar templates e copie o resultado para o campo `capacity` do template.
 * Uso: npx tsx scripts/calibrate-capacity.ts [filtro-de-id]
 */
import { TEMPLATES } from "../src/server/render/templates";
import { maxFactor } from "../src/server/render/calibration";
import type { Capacity } from "../src/lib/content/limits";
import type { SlideKind } from "../src/lib/content/document";

const only = process.argv[2];
for (const t of TEMPLATES) {
  if (only && !t.id.includes(only)) continue;
  const result: Capacity = {};
  for (const aspect of t.aspects) {
    for (const kind of ["cover", "content", "cta"] as SlideKind[]) {
      const plain = await maxFactor(t, aspect, kind, false);
      const photo = t.image === "none" ? plain : await maxFactor(t, aspect, kind, true);
      if (plain < 1 || photo < 1) (result[aspect] ??= {})[kind] = { plain, photo };
    }
  }
  console.log(`${t.id}: ${Object.keys(result).length ? JSON.stringify(result) : "sem redução"}`);
}
