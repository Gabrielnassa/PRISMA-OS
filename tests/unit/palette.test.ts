import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { suggestPalette, rasterize } from "@/server/brand/palette";
import { contrastRatio, parseHex } from "@/lib/color";

/** PNG gerado localmente a partir de um SVG (sem imagens de terceiros). */
function png(body: string, w = 400, h = 400): Buffer {
  return Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`).render().asPng());
}

/** Distância simples em RGB para comparar com a cor esperada. */
function near(hex: string, expected: string, tol = 40) {
  const a = parseHex(hex);
  const b = parseHex(expected);
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) <= tol;
}

describe("paleta a partir de imagens", () => {
  it("logotipo em duas cores sobre branco: primária, outra cor e fundo claro", () => {
    const logo = png('<rect width="400" height="400" fill="#ffffff"/><rect x="40" y="60" width="320" height="200" fill="#1e3a8a"/><circle cx="200" cy="320" r="50" fill="#f97316"/>');
    const s = suggestPalette([{ data: logo, mimeType: "image/png", weight: 3 }])!;
    expect(s).not.toBeNull();
    expect(near(s.colors.primary, "#1e3a8a")).toBe(true);
    expect([s.colors.secondary, s.colors.accent].some((c) => near(c, "#f97316"))).toBe(true);
    expect(near(s.colors.background, "#ffffff")).toBe(true);
    expect(contrastRatio(s.colors.text, s.colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(s.swatches[0]!.share).toBeGreaterThan(0.2);
    expect(s.imagesUsed).toBe(1);
  });

  it("marca em preto e branco: primária escura, com aviso", () => {
    const logo = png('<rect width="400" height="400" fill="#ffffff"/><rect x="80" y="80" width="240" height="240" fill="#111111"/>');
    const s = suggestPalette([{ data: logo, mimeType: "image/png" }])!;
    expect(near(s.colors.primary, "#111111")).toBe(true);
    expect(s.notes.join(" ")).toMatch(/Nenhuma cor viva/);
  });

  it("fundo escuro dominante: texto claro com contraste", () => {
    const img = png('<rect width="400" height="400" fill="#0b0b0b"/><rect x="100" y="150" width="200" height="100" fill="#d4a017"/>');
    const s = suggestPalette([{ data: img, mimeType: "image/png" }])!;
    expect(near(s.colors.background, "#0b0b0b")).toBe(true);
    expect(near(s.colors.primary, "#d4a017")).toBe(true);
    expect(contrastRatio(s.colors.text, s.colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("o peso de cada imagem conta mais que o tamanho (logotipo domina posts)", () => {
    const logo = png('<rect width="400" height="400" fill="#ffffff"/><rect x="50" y="50" width="300" height="300" fill="#047857"/>', 200, 200);
    const post = png('<rect width="800" height="800" fill="#be123c"/>', 800, 800);
    const s = suggestPalette([
      { data: logo, mimeType: "image/png", weight: 3 },
      { data: post, mimeType: "image/png", weight: 1 },
    ])!;
    expect(near(s.colors.primary, "#047857")).toBe(true);
    expect(s.imagesUsed).toBe(2);
  });

  it("logotipo em SVG também é lido; formatos não suportados são ignorados", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#7c3aed"/></svg>');
    const s = suggestPalette([{ data: svg, mimeType: "image/svg+xml" }])!;
    expect(near(s.colors.primary, "#7c3aed")).toBe(true);
    expect(rasterize({ data: Buffer.from("%PDF-1.4"), mimeType: "application/pdf" })).toBeNull();
    expect(suggestPalette([{ data: Buffer.from("x"), mimeType: "application/pdf" }])).toBeNull();
    expect(suggestPalette([])).toBeNull();
  });

  it("todas as cores sugeridas são hexadecimais válidos", () => {
    const img = png('<rect width="400" height="400" fill="#f6efe6"/><rect y="200" width="400" height="200" fill="#3b2a20"/><circle cx="300" cy="100" r="60" fill="#e07a3f"/>');
    const s = suggestPalette([{ data: img, mimeType: "image/png" }])!;
    for (const v of Object.values(s.colors)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });
});
