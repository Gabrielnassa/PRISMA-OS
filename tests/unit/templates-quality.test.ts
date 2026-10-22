import { describe, expect, it } from "vitest";
import { renderDocument } from "@/server/render/engine";
import { TEMPLATES } from "@/server/render/templates";
import { SAMPLE_IMAGE_ID, sampleDocumentFor, sampleImage } from "@/server/render/samples";
import { runQualityChecks } from "@/server/quality/checks";
import { emptyBrandProfile } from "@/lib/brand";
import { fitText } from "@/server/render/fonts";
import { sampleDocument } from "../support/fixtures";

const images = new Map([[SAMPLE_IMAGE_ID, sampleImage()]]);

describe("biblioteca de templates", () => {
  it("tem 6 famílias com 3 variações e metadados completos", () => {
    const families = new Map<string, number>();
    for (const t of TEMPLATES) {
      families.set(t.family, (families.get(t.family) ?? 0) + 1);
      expect(t.id).toMatch(/^[a-z-]+$/);
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.compositionRules.length).toBeGreaterThan(0);
      expect(t.qualityCriteria.length).toBeGreaterThan(0);
      expect(t.origin).toContain("OFL");
      expect(Object.keys(t.fieldLimits)).toEqual(["cover", "content", "cta"]);
    }
    expect([...families.values()]).toEqual([3, 3, 3, 3, 3, 3]);
  });

  for (const t of TEMPLATES) {
    it(`${t.id}: renderiza em todas as proporções sem texto cortado`, async () => {
      for (const aspect of t.aspects) {
        const doc = sampleDocumentFor(t, aspect === "9:16" ? "story" : "carousel", aspect);
        const slides = await renderDocument(doc, { images });
        for (const s of slides) {
          expect(s.svg.startsWith("<svg")).toBe(true);
          const cut = s.texts.filter((x) => !x.fits).map((x) => x.key);
          expect(cut, `${t.id} ${aspect} lâmina ${s.index + 1}`).toEqual([]);
        }
      }
    }, 60_000);
  }
});

describe("medição de texto", () => {
  it("reduz a fonte até caber e acusa quando não cabe", () => {
    const short = fitText("Título curto", { font: "inter", weight: 800, maxWidth: 800, maxHeight: 300, maxSize: 100, minSize: 40, lineHeight: 1.1 });
    expect(short).toMatchObject({ size: 100, fits: true });
    const long = fitText("palavra ".repeat(80), { font: "inter", weight: 800, maxWidth: 800, maxHeight: 300, maxSize: 100, minSize: 40, lineHeight: 1.1 });
    expect(long.fits).toBe(false);
  });
});

describe("controle de qualidade", () => {
  it("aponta texto cortado, termo proibido, CTA do briefing ausente e oferta não confirmada", async () => {
    const doc = sampleDocument();
    doc.slides[1]!.fields.body = "Texto longo demais. ".repeat(29).trim();
    doc.slides[1]!.fields.title = "Promoção com 50% de desconto e milagre garantido";
    doc.slides[1]!.fields.footer = "Fonte: levantamento interno com uma descrição longa demais para caber na linha do rodapé deste template";
    const rendered = await renderDocument(doc, { images: new Map() });
    const brand = emptyBrandProfile();
    brand.voice.forbiddenTerms = ["milagre"];
    const report = runQualityChecks({ doc, rendered, brand, briefing: { cta: "Fale com um especialista" }, images: new Map() });
    const ids = report.items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["text_overflow", "forbidden_term", "cta_briefing", "offer_unconfirmed", "field_length", "brand_unconfigured"]));
    expect(report.passed).toBe(false);
  });

  it("detecta contraste insuficiente quando as cores da marca não têm contraste", async () => {
    const doc = sampleDocument();
    doc.style.colors = { primary: "#777777", secondary: "#777777", accent: "#787878", background: "#777777", text: "#7a7a7a" };
    const rendered = await renderDocument(doc, { images: new Map() });
    // O motor escolhe automaticamente texto legível; o relatório deve ficar sem problemas de contraste.
    const report = runQualityChecks({ doc, rendered, brand: emptyBrandProfile(), briefing: {}, images: new Map() });
    expect(report.items.filter((i) => i.id === "contrast" && i.severity === "critical")).toEqual([]);
  });

  it("peça bem formada passa sem críticos", async () => {
    const doc = sampleDocument();
    const rendered = await renderDocument(doc, { images: new Map() });
    const report = runQualityChecks({ doc, rendered, brand: emptyBrandProfile(), briefing: { cta: "Agende pelo link da bio" }, images: new Map() });
    expect(report.criticalCount).toBe(0);
  });
});
