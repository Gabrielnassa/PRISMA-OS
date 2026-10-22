/**
 * Renderiza todos os templates com conteúdo de exemplo (claramente fictício)
 * para revisão visual. Uso: npm run render:samples -- <diretório-de-saída>
 */
import fs from "node:fs";
import path from "node:path";
import { renderDocument, svgToPng } from "../src/server/render/engine";
import { TEMPLATES } from "../src/server/render/templates";
import { SAMPLE_IMAGE_ID, sampleDocumentFor, sampleImage } from "../src/server/render/samples";

const outDir = path.resolve(process.argv[2] ?? "render-samples");
const only = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });
const images = new Map([[SAMPLE_IMAGE_ID, sampleImage()]]);

for (const t of TEMPLATES) {
  if (only && !t.id.includes(only)) continue;
  for (const aspect of t.aspects) {
    const format = aspect === "9:16" ? "story" : "carousel";
    if (!t.formats.includes(format)) continue;
    const doc = sampleDocumentFor(t, format, aspect);
    const slides = await renderDocument(doc, { images });
    slides.forEach((s, i) => {
      const file = path.join(outDir, `${t.id}_${aspect.replace(":", "x")}_${i + 1}.png`);
      fs.writeFileSync(file, svgToPng(s.svg, 540));
      const bad = s.texts.filter((x) => !x.fits).map((x) => x.key);
      if (bad.length || s.issues.length) console.log(`${path.basename(file)}: transbordo=${bad.join(",") || "-"} ocorrências=${s.issues.join(",") || "-"}`);
    });
  }
}
console.log(`Amostras em ${outDir}`);
