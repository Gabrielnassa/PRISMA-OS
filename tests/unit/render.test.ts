import { describe, expect, it } from "vitest";
import { renderDocument, svgToPng } from "@/server/render/engine";
import { sampleDocument } from "../support/fixtures";

describe("motor de renderização", () => {
  it("renderiza todas as lâminas com texto medido e sem transbordo", async () => {
    const doc = sampleDocument();
    const slides = await renderDocument(doc, { images: new Map() });
    expect(slides).toHaveLength(3);
    for (const s of slides) {
      expect(s.svg.startsWith("<svg")).toBe(true);
      expect(s.texts.length).toBeGreaterThan(0);
      for (const t of s.texts) expect(t.fits, `${s.index}:${t.key}`).toBe(true);
    }
    const png = svgToPng(slides[0]!.svg, 1080);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1350);
  });
});
