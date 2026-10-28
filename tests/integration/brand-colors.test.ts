import { afterEach, describe, expect, it } from "vitest";
import { many, systemCtx, withTx } from "../../src/server/db";
import { resetEnvCache } from "../../src/server/env";
import { ForbiddenError, IntegrationNotConfiguredError, NotFoundError, ValidationError } from "../../src/server/errors";
import { svgToPng } from "../../src/server/render/engine";
import { createClient } from "../../src/server/services/clients";
import { deleteMedia, uploadMedia } from "../../src/server/services/media";
import { updateMember } from "../../src/server/services/users";
import { suggestColorsFromInstagram, suggestColorsFromMedia } from "../../src/server/services/brand-colors";
import { addMember, newOrg } from "./helpers";

/** Logotipo: círculo de uma cor sobre fundo branco. */
function logo(color: string, accent?: string): Buffer {
  return svgToPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ffffff"/><circle cx="100" cy="100" r="70" fill="${color}"/>${accent ? `<rect x="40" y="150" width="120" height="30" fill="${accent}"/>` : ""}</svg>`,
    200,
  );
}

function configureMeta(on: boolean) {
  if (on) {
    process.env.META_ACCESS_TOKEN = "EAAtokenexemplo1234567890";
    process.env.META_IG_USER_ID = "17841400000000000";
  } else {
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_IG_USER_ID;
  }
  resetEnvCache();
}

/** Imita a Graph API e o CDN da Meta. */
function fakeMeta(profile: Buffer, posts: Buffer[]): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: string) => {
    const url = String(input);
    urls.push(url);
    if (url.startsWith("https://graph.facebook.com/")) {
      return new Response(
        JSON.stringify({
          business_discovery: {
            username: "cafe.daesquina",
            name: "Café da Esquina",
            profile_picture_url: "https://scontent.cdninstagram.com/perfil.png",
            media: { data: posts.map((_, i) => ({ media_type: "IMAGE", media_url: `https://scontent.cdninstagram.com/p${i}.png` })) },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const m = /\/p(\d+)\.png$/.exec(url);
    const body = url.endsWith("/perfil.png") ? profile : m ? posts[Number(m[1])] : undefined;
    if (!body) return new Response("não encontrado", { status: 404 });
    return new Response(new Uint8Array(body), { status: 200, headers: { "content-type": "image/png" } });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

describe("sugestão de cores da marca", () => {
  afterEach(() => configureMeta(false));

  it("extrai as cores das imagens escolhidas, com o logotipo pesando mais", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Café da Esquina" });
    const l = await uploadMedia(owner, clientId, { filename: "logo.png", data: logo("#c2410c", "#0f766e") }, { kind: "logo" });
    const p = await uploadMedia(owner, clientId, { filename: "foto.png", data: logo("#1d4ed8") }, {});

    const s = await suggestColorsFromMedia(owner, clientId, [l.id, p.id]);
    expect(s.imagesUsed).toBe(2);
    // Laranja do logotipo (peso 3) vence o azul da foto (peso 1).
    expect(s.colors.primary).toMatch(/^#c[0-9a-f]4[0-9a-f]0[0-9a-f]$/);
    expect(s.colors.background).toBe("#ffffff");
    expect(s.swatches.length).toBeGreaterThanOrEqual(3);
  });

  it("não lê imagens de outro cliente nem arquivos excluídos", async () => {
    const { owner } = await newOrg();
    const a = await createClient(owner, { name: "Cliente A" });
    const b = await createClient(owner, { name: "Cliente B" });
    const fromB = await uploadMedia(owner, b.id, { filename: "b.png", data: logo("#7c3aed") }, {});
    await expect(suggestColorsFromMedia(owner, a.id, [fromB.id])).rejects.toBeInstanceOf(ValidationError);

    const gone = await uploadMedia(owner, a.id, { filename: "a.png", data: logo("#16a34a") }, {});
    await deleteMedia(owner, gone.id);
    await expect(suggestColorsFromMedia(owner, a.id, [gone.id])).rejects.toBeInstanceOf(ValidationError);
    await expect(suggestColorsFromMedia(owner, a.id, [])).rejects.toBeInstanceOf(ValidationError);
    await expect(suggestColorsFromMedia(owner, a.id, ["não-é-uuid"])).rejects.toBeInstanceOf(ValidationError);
  });

  it("respeita papéis e o isolamento entre organizações", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Cliente" });
    const img = await uploadMedia(owner, clientId, { filename: "logo.png", data: logo("#be123c") }, { kind: "logo" });
    const viewer = await addMember(owner, "viewer");
    await updateMember(owner, viewer.userId, { role: "viewer", isActive: true, clientIds: [clientId] });
    await expect(suggestColorsFromMedia(viewer, clientId, [img.id])).rejects.toBeInstanceOf(ForbiddenError);

    const other = await newOrg("Outra Agência");
    await expect(suggestColorsFromMedia(other.owner, clientId, [img.id])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("pelo @: sem a API da Meta configurada, não consulta nada", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Cliente" });
    const { fetchImpl, urls } = fakeMeta(logo("#000000"), []);
    await expect(suggestColorsFromInstagram(owner, clientId, "@cafe", { fetchImpl })).rejects.toBeInstanceOf(IntegrationNotConfiguredError);
    expect(urls).toEqual([]);
  });

  it("pelo @: lê foto de perfil e posts, guarda a foto como logotipo se pedido e registra auditoria", async () => {
    configureMeta(true);
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Café da Esquina" });
    const { fetchImpl, urls } = fakeMeta(logo("#c2410c"), [logo("#0f766e"), logo("#c2410c", "#facc15")]);

    const r = await suggestColorsFromInstagram(owner, clientId, "https://www.instagram.com/Cafe.DaEsquina/", { fetchImpl, saveProfilePicture: true });
    expect(r.username).toBe("cafe.daesquina");
    expect(r.name).toBe("Café da Esquina");
    expect(r.postsRead).toBe(2);
    expect(r.imagesUsed).toBe(3);
    expect(r.colors.primary).toMatch(/^#c[0-9a-f]4[0-9a-f]0[0-9a-f]$/);
    expect(urls[0]).toContain("business_discovery.username(cafe.daesquina)");
    expect(r.savedLogoId).toBeTruthy();

    const rows = await withTx(systemCtx("teste"), (tx) =>
      many<{ kind: string; filename: string; license_note: string | null }>(tx, "SELECT kind, filename, license_note FROM media_assets WHERE id = $1", [r.savedLogoId]),
    );
    expect(rows[0]).toMatchObject({ kind: "logo", filename: "instagram-cafe.daesquina.png" });
    expect(rows[0]!.license_note).toContain("API oficial da Meta");

    const logs = await withTx(systemCtx("teste"), (tx) =>
      many<{ metadata: Record<string, unknown> }>(tx, "SELECT metadata FROM audit_logs WHERE client_id = $1 AND action = 'brand.colors_from_instagram'", [clientId]),
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]!.metadata).toMatchObject({ username: "cafe.daesquina", postsRead: 2, savedLogo: true });

    // Sem pedir para guardar: nenhuma mídia nova.
    const again = await suggestColorsFromInstagram(owner, clientId, "cafe.daesquina", { fetchImpl });
    expect(again.savedLogoId).toBeNull();
  });

  it("pelo @: a pessoa de Criação sugere, mas só guarda a foto quem pode enviar arquivos", async () => {
    configureMeta(true);
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Cliente" });
    const editor = await addMember(owner, "editor");
    await updateMember(owner, editor.userId, { role: "editor", isActive: true, clientIds: [clientId] });
    const reviewer = await addMember(owner, "reviewer");
    await updateMember(owner, reviewer.userId, { role: "reviewer", isActive: true, clientIds: [clientId] });
    const { fetchImpl } = fakeMeta(logo("#4338ca"), [logo("#4338ca")]);

    const r = await suggestColorsFromInstagram(editor, clientId, "@marca", { fetchImpl, saveProfilePicture: true });
    expect(r.savedLogoId).toBeTruthy();
    await expect(suggestColorsFromInstagram(reviewer, clientId, "@marca", { fetchImpl })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
