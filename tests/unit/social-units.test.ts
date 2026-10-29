import { beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "../../src/server/env";
import { open, seal, sign, verifySignature } from "../../src/server/crypto/secrets";
import { buildIcs } from "../../src/server/services/calendar-feed";
import { tiktokChunks } from "../../src/server/integrations/social/tiktok";
import { isAllowedWebhookUrl } from "../../src/server/services/webhooks";
import { compatibility, needsPublicUrl } from "../../src/server/services/publications";
import { metaError } from "../../src/server/integrations/social/meta";
import { plural } from "../../src/lib/text";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
  process.env.APP_SECRET_KEY = "chave-de-teste-unitario-com-mais-de-32-caracteres";
  resetEnvCache();
});

describe("cofre de segredos", () => {
  it("abre só com o mesmo contexto e detecta adulteração", () => {
    const s = seal("token-secreto", "acct:1:2:instagram");
    expect(s.startsWith("v1:")).toBe(true);
    expect(s).not.toContain("token-secreto");
    expect(open(s, "acct:1:2:instagram")).toBe("token-secreto");
    expect(() => open(s, "acct:1:3:instagram")).toThrow();
    const tampered = `${s.slice(0, -2)}${s.endsWith("A") ? "B" : "A"}A`;
    expect(() => open(tampered, "acct:1:2:instagram")).toThrow();
    expect(seal("x", "c")).not.toBe(seal("x", "c"));
  });

  it("assinatura de links", () => {
    const sig = sign("pub/1.jpg/123");
    expect(verifySignature("pub/1.jpg/123", sig)).toBe(true);
    expect(verifySignature("pub/2.jpg/123", sig)).toBe(false);
    expect(verifySignature("pub/1.jpg/123", "curta")).toBe(false);
  });
});

describe("agenda ICS", () => {
  it("escapa texto, cria eventos de dia inteiro e com horário e dobra linhas longas", () => {
    const ics = buildIcs(
      "Agência",
      [
        { uid: "a@x", summary: "Coli; Loterias, bolão", date: "2026-10-31" },
        { uid: "b@x", summary: "Publicar".padEnd(120, "!"), at: new Date("2026-11-02T13:00:00Z"), minutes: 15 },
      ],
      new Date("2026-10-29T12:00:00Z"),
    );
    expect(ics).toContain(String.raw`SUMMARY:Coli\; Loterias\, bolão`);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101");
    expect(ics).toContain("DTSTART:20261102T130000Z\r\nDTEND:20261102T131500Z");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("regras das redes", () => {
  it("divide vídeos para a TikTok", () => {
    const MB = 1024 * 1024;
    expect(tiktokChunks(3 * MB)).toEqual({ chunkSize: 3 * MB, count: 1 });
    expect(tiktokChunks(64 * MB)).toEqual({ chunkSize: 64 * MB, count: 1 });
    const big = tiktokChunks(105 * MB);
    expect(big).toEqual({ chunkSize: 10 * MB, count: 10 });
    // A última parte absorve o resto e fica abaixo de 128 MB.
    expect(105 * MB - (big.count - 1) * big.chunkSize).toBeLessThan(128 * MB);
  });

  it("formatos aceitos por rede", () => {
    expect(compatibility("youtube", "image", "4:5")).toMatch(/só recebe vídeos/);
    expect(compatibility("instagram", "image", "9:16")).toMatch(/story/);
    expect(compatibility("instagram", "story", "9:16")).toBeNull();
    expect(compatibility("facebook", "carousel", "1:1")).toBeNull();
    expect(needsPublicUrl("instagram", "video")).toBe(true);
    expect(needsPublicUrl("tiktok", "video")).toBe(false);
    expect(needsPublicUrl("facebook", "image")).toBe(false);
  });

  it("webhooks só em endereços públicos com HTTPS", () => {
    expect(isAllowedWebhookUrl("https://n8n.agencia.com.br/webhook/abc")).toBe(true);
    for (const bad of ["http://n8n.agencia.com.br", "https://localhost/x", "https://10.0.0.5/x", "https://192.168.1.10/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://user:pw@site.com", "https://intranet/x"]) {
      expect(isAllowedWebhookUrl(bad)).toBe(false);
    }
  });

  it("erros da Meta: token inválido pede reconexão; limite tenta de novo", () => {
    expect(metaError(400, { error: { code: 190 } }, "publicar")).toMatchObject({ code: "token_invalid", retryable: false });
    expect(metaError(400, { error: { code: 4 } }, "publicar")).toMatchObject({ code: "rate_limit", retryable: true });
    expect(metaError(500, { error: { code: 1, message: "Unknown" } }, "publicar").message).toContain("Mensagem da Meta: Unknown");
  });

  it("plural sem parênteses", () => {
    expect(plural(1, "peça", "peças")).toBe("1 peça");
    expect(plural(1200, "peça", "peças")).toBe("1.200 peças");
  });
});
