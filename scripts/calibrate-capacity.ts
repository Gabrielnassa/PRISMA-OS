/**
 * Calcula a capacidade de texto de cada template (fração dos limites-base que
 * cabe com todos os campos cheios). Use ao criar ou alterar templates e copie o
 * resultado para o campo `capacity` do template.
 * Uso: npx tsx scripts/calibrate-capacity.ts [filtro-de-id]
 */
import { TEMPLATES } from "../src/server/render/templates";
import { maxFactor } from "../src/server/render/calibration";
import type { SlideKind } from "../src/lib/content/document";

const only = process.argv[2];
for (const t of TEMPLATES) {
  if (only && !t.id.includes(only)) continue;
  const result: Record<string, { plain: number; photo: number }> = {};
  for (const aspect of t.aspects) {
    const kinds: SlideKind[] = ["cover", "content", "cta"];
    const plain = Math.min(...(await Promise.all(kinds.map((k) => maxFactor(t, aspect, k, false)))));
    const photo = t.image === "none" ? plain : Math.min(...(await Promise.all(kinds.map((k) => maxFactor(t, aspect, k, true)))));
    result[aspect] = { plain, photo };
  }
  console.log(`${t.id}: ${JSON.stringify(result)}`);
}
