import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/server/env";
import { IntegrationError, IntegrationNotConfiguredError, ValidationError } from "@/server/errors";
import { downloadMetaImage, fetchInstagramProfile, instagramStatus, isMetaCdnUrl, normalizeHandle } from "@/server/integrations/instagram";

const saved = { token: process.env.META_ACCESS_TOKEN, id: process.env.META_IG_USER_ID, db: process.env.DATABASE_URL };

function configure(on: boolean) {
  // env() exige DATABASE_URL; os testes unitários não usam banco.
  process.env.DATABASE_URL ??= "postgres://teste:teste@localhost:5432/teste";
  if (on) {
    process.env.META_ACCESS_TOKEN = "EAAtokenexemplo1234567890";
    process.env.META_IG_USER_ID = "17841400000000000";
  } else {
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_IG_USER_ID;
  }
  resetEnvCache();
}

/** Resposta falsa no formato da Graph API. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("@ do Instagram", () => {
  it("aceita @, nome solto e link do perfil", () => {
    expect(normalizeHandle("@Cafe.DaEsquina")).toBe("cafe.daesquina");
    expect(normalizeHandle("cafe_esquina")).toBe("cafe_esquina");
    expect(normalizeHandle("https://www.instagram.com/cafe.daesquina/?hl=pt")).toBe("cafe.daesquina");
    expect(() => normalizeHandle("café esquina")).toThrow(ValidationError);
    expect(() => normalizeHandle("@")).toThrow(ValidationError);
  });

  it("só aceita imagens do CDN da Meta", () => {
    expect(isMetaCdnUrl("https://scontent-gru2-1.cdninstagram.com/v/t51/foto.jpg")).toBe(true);
    expect(isMetaCdnUrl("https://scontent.xx.fbcdn.net/v/foto.jpg")).toBe(true);
    expect(isMetaCdnUrl("http://scontent.xx.fbcdn.net/foto.jpg")).toBe(false);
    expect(isMetaCdnUrl("https://fbcdn.net.atacante.com/foto.jpg")).toBe(false);
    expect(isMetaCdnUrl("https://169.254.169.254/latest")).toBe(false);
  });
});

describe("consulta pela API oficial da Meta", () => {
  beforeEach(() => configure(true));
  afterEach(() => {
    if (saved.token) process.env.META_ACCESS_TOKEN = saved.token;
    else delete process.env.META_ACCESS_TOKEN;
    if (saved.id) process.env.META_IG_USER_ID = saved.id;
    else delete process.env.META_IG_USER_ID;
    if (saved.db) process.env.DATABASE_URL = saved.db;
    else delete process.env.DATABASE_URL;
    resetEnvCache();
  });

  it("sem credenciais não consulta nada e explica o que falta", async () => {
    configure(false);
    expect(instagramStatus().configured).toBe(false);
    expect(instagramStatus().detail).toMatch(/META_ACCESS_TOKEN e META_IG_USER_ID/);
    let called = false;
    await expect(fetchInstagramProfile("cafe", { fetchImpl: (async () => ((called = true), json({}))) as typeof fetch })).rejects.toBeInstanceOf(IntegrationNotConfiguredError);
    expect(called).toBe(false);
  });

  it("valor inválido não derruba o sistema: a integração fica desligada e explica o motivo", async () => {
    process.env.META_IG_USER_ID = "@minha.agencia";
    resetEnvCache();
    expect(instagramStatus()).toEqual({ configured: false, detail: expect.stringMatching(/ID numérico/) });
    process.env.META_IG_USER_ID = "17841400000000000";
    process.env.META_ACCESS_TOKEN = "curto";
    process.env.META_GRAPH_VERSION = "23";
    resetEnvCache();
    expect(instagramStatus().detail).toMatch(/incompleto/);
    delete process.env.META_GRAPH_VERSION;
    configure(true);
    expect(instagramStatus().configured).toBe(true);
  });

  it("monta a consulta Business Discovery com o token no cabeçalho e lê foto e posts", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seenUrl = String(url);
      seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      return json({
        business_discovery: {
          username: "cafe.daesquina",
          name: "Café da Esquina",
          profile_picture_url: "https://scontent.cdninstagram.com/perfil.jpg",
          media: {
            data: [
              { media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/p1.jpg" },
              { media_type: "VIDEO", media_url: "https://scontent.cdninstagram.com/v.mp4", thumbnail_url: "https://scontent.cdninstagram.com/capa.jpg" },
              { media_type: "CAROUSEL_ALBUM", media_url: "https://outro-site.com/x.jpg" },
            ],
          },
          id: "1784",
        },
        id: "17841400000000000",
      });
    }) as typeof fetch;
    const p = await fetchInstagramProfile("@Cafe.DaEsquina", { fetchImpl });
    expect(seenUrl).toContain("https://graph.facebook.com/v23.0/17841400000000000?fields=");
    expect(decodeURIComponent(seenUrl)).toContain("business_discovery.username(cafe.daesquina){username,name,profile_picture_url,media.limit(9){media_type,media_url,thumbnail_url}}");
    expect(seenUrl).not.toContain("access_token");
    expect(seenAuth).toBe("Bearer EAAtokenexemplo1234567890");
    expect(p).toEqual({
      username: "cafe.daesquina",
      name: "Café da Esquina",
      profilePictureUrl: "https://scontent.cdninstagram.com/perfil.jpg",
      mediaImageUrls: ["https://scontent.cdninstagram.com/p1.jpg", "https://scontent.cdninstagram.com/capa.jpg"],
    });
  });

  it("traduz os erros da Meta em mensagens claras", async () => {
    const cases: Array<[unknown, number, RegExp]> = [
      [{ error: { code: 190, message: "Error validating access token" } }, 400, /token de acesso da Meta expirou/],
      [{ error: { code: 100, error_subcode: 2207013 } }, 400, /conta comercial ou de criador/],
      [{ error: { code: 4 } }, 400, /Limite de consultas/],
      [{ error: { code: 10 } }, 403, /permissão necessária/],
      [{ error: { code: 1 } }, 500, /HTTP 500, código 1/],
    ];
    for (const [body, status, msg] of cases) {
      const err = await fetchInstagramProfile("cafe", { fetchImpl: (async () => json(body, status)) as typeof fetch }).catch((e) => e);
      expect(err).toBeInstanceOf(IntegrationError);
      expect((err as Error).message).toMatch(msg);
    }
    const net = await fetchInstagramProfile("cafe", { fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as typeof fetch }).catch((e) => e);
    expect((net as IntegrationError).retryable).toBe(true);
  });

  it("baixa só imagens do CDN, com tipo e tamanho conferidos", async () => {
    const img = (type: string, body = "abc") => (async () => new Response(body, { status: 200, headers: { "content-type": type } })) as typeof fetch;
    expect(await downloadMetaImage("https://example.com/a.jpg", { fetchImpl: img("image/jpeg") })).toBeNull();
    expect(await downloadMetaImage("https://scontent.cdninstagram.com/a.jpg", { fetchImpl: img("text/html") })).toBeNull();
    expect(await downloadMetaImage("https://scontent.cdninstagram.com/a.jpg", { fetchImpl: img("image/jpeg", "x".repeat(50)), maxBytes: 10 })).toBeNull();
    const ok = await downloadMetaImage("https://scontent.cdninstagram.com/a.jpg", { fetchImpl: img("image/jpeg; charset=binary") });
    expect(ok?.mimeType).toBe("image/jpeg");
    expect(ok?.data.toString()).toBe("abc");
  });
});
