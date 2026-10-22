import { describe, expect, it } from "vitest";
import { can, permissionsFor, ROLES } from "@/server/authz/permissions";
import { blend, contrastRatio, worstCaseOverlayContrast } from "@/lib/color";
import { backoffMs } from "@/server/jobs/queue";
import { slugify } from "@/lib/slug";
import { imageSize, isUnsafeSvg, sniffType } from "@/server/media/sniff";
import { svgToPng } from "@/server/render/engine";
import { validatePasswordStrength, hashPassword, verifyPassword } from "@/server/auth/password";

describe("permissões por papel", () => {
  it("somente aprovadores e administradores aprovam", () => {
    expect(ROLES.filter((r) => can(r, "content.approve"))).toEqual(["owner", "admin", "reviewer"]);
  });
  it("leitura não edita nem comenta, mas exporta", () => {
    expect(permissionsFor("viewer")).toEqual(["content.export"]);
  });
  it("criação não gerencia usuários nem custos", () => {
    expect(can("editor", "users.manage")).toBe(false);
    expect(can("editor", "costs.manage")).toBe(false);
    expect(can("editor", "content.edit")).toBe(true);
  });
});

describe("contraste WCAG", () => {
  it("preto sobre branco é 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });
  it("calcula mistura e pior caso sobre foto", () => {
    expect(blend("#000000", 0.5, "#ffffff")).toBe("#808080");
    expect(worstCaseOverlayContrast("#ffffff", "#000000", 0.72)).toBeGreaterThan(4.5);
    expect(worstCaseOverlayContrast("#ffffff", "#000000", 0.2)).toBeLessThan(3);
  });
});

describe("utilitários", () => {
  it("slug sem acentos", () => {
    expect(slugify("Clínica São João & Filhos")).toBe("clinica-sao-joao-filhos");
  });
  it("backoff exponencial limitado", () => {
    expect(backoffMs(1, 0.5)).toBe(10_000);
    expect(backoffMs(2, 0.5)).toBe(20_000);
    expect(backoffMs(20, 0.5)).toBe(600_000);
  });
  it("política de senha", async () => {
    expect(validatePasswordStrength("curta1")).not.toBeNull();
    expect(validatePasswordStrength("somenteletras")).not.toBeNull();
    expect(validatePasswordStrength("senha-forte-123")).toBeNull();
    const h = await hashPassword("senha-forte-123");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("senha-forte-123", h)).toBe(true);
    expect(await verifyPassword("outra-senha-123", h)).toBe(false);
  });
});

describe("validação de arquivos pelo conteúdo", () => {
  it("identifica PNG e lê dimensões", () => {
    const png = svgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="red"/></svg>', 320);
    expect(sniffType(png)?.mime).toBe("image/png");
    expect(imageSize(png, "image/png")).toEqual({ width: 320, height: 200 });
  });
  it("não confia na extensão: texto não é imagem", () => {
    expect(sniffType(Buffer.from("isto não é uma imagem, apenas texto"))).toBeNull();
  });
  it("detecta SVG e recusa scripts", () => {
    const safe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>');
    expect(sniffType(safe)?.mime).toBe("image/svg+xml");
    expect(imageSize(safe, "image/svg+xml")).toEqual({ width: 100, height: 50 });
    expect(isUnsafeSvg(safe)).toBe(false);
    expect(isUnsafeSvg(Buffer.from('<svg onload="alert(1)"></svg>'))).toBe(true);
    expect(isUnsafeSvg(Buffer.from("<svg><script>alert(1)</script></svg>"))).toBe(true);
  });
  it("detecta PDF e JPEG", () => {
    expect(sniffType(Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj"))?.mime).toBe("application/pdf");
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 8, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xc0, 0, 17, 8, 0, 100, 0, 200, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    expect(sniffType(jpeg)?.mime).toBe("image/jpeg");
    expect(imageSize(jpeg, "image/jpeg")).toEqual({ width: 200, height: 100 });
  });
});

describe("redirecionamento e IP de origem", () => {
  it("aceita só caminhos internos após o login", async () => {
    const { safeNextPath } = await import("@/lib/safe-redirect");
    expect(safeNextPath("/conteudos?status=approved#x")).toBe("/conteudos?status=approved#x");
    for (const bad of ["//evil.example", "/\\evil.example", "/\tevil", "https://evil.example", "evil", "/login", "/api/health", "/%0d%0aLocation:x"]) {
      const out = safeNextPath(bad);
      expect(out === "/" || !/evil/.test(out), bad).toBe(true);
      expect(new URL(out, "http://app.test").origin).toBe("http://app.test");
    }
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });

  it("só usa X-Forwarded-For atrás de proxy confiável (último valor)", async () => {
    const { clientIpFrom } = await import("@/server/auth/next");
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" });
    expect(clientIpFrom(h, false)).toBeNull();
    expect(clientIpFrom(h, true)).toBe("203.0.113.9");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "<script>" }), true)).toBeNull();
  });
});

