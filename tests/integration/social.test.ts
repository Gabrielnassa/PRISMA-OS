import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { many, systemCtx, withTx } from "../../src/server/db";
import { ForbiddenError, ValidationError } from "../../src/server/errors";
import { createClient } from "../../src/server/services/clients";
import { createContent, decideApproval, getContent, submitForApproval } from "../../src/server/services/content";
import { appCredentials, listAppStatus, saveAppCredentials } from "../../src/server/services/integration-apps";
import { choosePage, disconnectAccount, finishConnection, listAccounts, pendingPages, startConnection } from "../../src/server/services/social-accounts";
import { cancelPublication, listPublications, readSignedFile, refreshMetrics, schedulePublications } from "../../src/server/services/publications";
import { processNextJob } from "../../src/server/jobs/worker";
import { setSocialFetch } from "../../src/server/integrations/social/http";
import { addMember, newOrg } from "./helpers";
import { bodyOf, fakeFetch } from "../support/fake-fetch";
import type { AuthContext } from "../../src/server/auth/types";

afterEach(() => setSocialFetch(undefined));

async function drain(worker = "teste-redes") {
  while (await processNextJob(worker)) {
    // processa a fila
  }
}

async function approvedCarousel(owner: AuthContext, clientId: string) {
  const { contentId } = await createContent(owner, {
    clientId,
    title: "Bolão da semana",
    channel: "instagram",
    format: "carousel",
    objective: "conversion",
    briefing: { text: "Explicar como entrar no bolão da loja, com horário de atendimento e endereço.", cta: "Fale com a gente" },
    slideCount: 3,
    mode: "ai",
    requestId: crypto.randomUUID(),
  });
  await drain(); // provedor de demonstração escreve os textos
  const piece = await getContent(owner, contentId);
  const { approvalId } = await submitForApproval(owner, contentId, { versionId: piece.current!.id });
  await decideApproval(owner, approvalId, { decision: "approved", note: "Ok" });
  return contentId;
}

const PAGES = [
  { id: "111", name: "Coli Loterias", access_token: "page-token-111", picture: { data: { url: "https://scontent.example/p.jpg" } }, instagram_business_account: { id: "17841400000000001", username: "coliloterias", profile_picture_url: "https://scontent.example/ig.jpg" } },
  { id: "222", name: "Outra Página", access_token: "page-token-222" },
];

function metaLogin(pages = PAGES) {
  return fakeFetch([
    { match: /graph\.facebook\.com\/v23\.0\/oauth\/access_token\?.*code=/, reply: () => ({ json: { access_token: "short-token" } }) },
    { match: /graph\.facebook\.com\/v23\.0\/oauth\/access_token\?.*fb_exchange_token/, reply: () => ({ json: { access_token: "long-user-token", expires_in: 5_184_000 } }) },
    { match: /graph\.facebook\.com\/v23\.0\/me\/accounts/, reply: () => ({ json: { data: pages } }) },
  ]);
}

async function connectMeta(owner: AuthContext, clientId: string, pages = PAGES) {
  await saveAppCredentials(owner, "meta", { publicId: "1234567890", secret: "segredo-do-app-meta" });
  const url = new URL(await startConnection(owner, clientId, "meta"));
  const state = url.searchParams.get("state")!;
  setSocialFetch(metaLogin(pages).fn);
  return { state, outcome: await finishConnection(owner, "meta", { code: "codigo", state }) };
}

describe("chaves dos apps", () => {
  it("salva criptografado, mostra só o final e exige administração", async () => {
    const { owner } = await newOrg();
    await saveAppCredentials(owner, "tiktok", { publicId: "awabcdef123", secret: "segredo-tiktok-1234" });
    const status = await listAppStatus(owner);
    expect(status.find((s) => s.provider === "tiktok")).toMatchObject({ configured: true, source: "saved", publicId: "awabcdef123", secretHint: "••••1234" });
    expect(status.find((s) => s.provider === "tiktok")!.redirectUri).toBe("https://prisma.teste.example/api/conexoes/tiktok/retorno");
    const raw = await withTx(systemCtx("teste"), (tx) => many<{ secret_sealed: string }>(tx, "SELECT secret_sealed FROM integration_apps WHERE organization_id = $1", [owner.organizationId]));
    expect(raw[0]!.secret_sealed).not.toContain("segredo");
    expect(await appCredentials(owner.organizationId, "tiktok")).toEqual({ publicId: "awabcdef123", secret: "segredo-tiktok-1234" });
    // Atualizar sem a chave secreta mantém a anterior.
    await saveAppCredentials(owner, "tiktok", { publicId: "awnovo456" });
    expect(await appCredentials(owner.organizationId, "tiktok")).toEqual({ publicId: "awnovo456", secret: "segredo-tiktok-1234" });

    const editor = await addMember(owner, "editor");
    await expect(saveAppCredentials(editor, "meta", { publicId: "123", secret: "x".repeat(12) })).rejects.toBeInstanceOf(ForbiddenError);
    const other = await newOrg("Outra");
    expect(await appCredentials(other.owner.organizationId, "tiktok")).toBeNull();
  });
});

describe("conexão das contas", () => {
  it("Meta com uma Página conecta Facebook e Instagram; o login não pode ser reutilizado", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    const { state, outcome } = await connectMeta(owner, clientId, [PAGES[0]!]);
    expect(outcome).toMatchObject({ kind: "connected", networks: ["facebook", "instagram"] });
    const accounts = await listAccounts(owner, clientId);
    expect(accounts.map((a) => [a.network, a.username ?? a.displayName])).toEqual([
      ["instagram", "coliloterias"],
      ["facebook", "Coli Loterias"],
    ]);
    const sealed = await withTx(systemCtx("teste"), (tx) => many<{ access_sealed: string }>(tx, "SELECT access_sealed FROM social_accounts WHERE client_id = $1", [clientId]));
    expect(sealed.every((s) => !s.access_sealed.includes("page-token"))).toBe(true);
    await expect(finishConnection(owner, "meta", { code: "codigo", state })).rejects.toThrow(/já foi usado/);

    // Outra organização não vê as contas.
    const other = await newOrg("Outra");
    await expect(listAccounts(other.owner, clientId)).rejects.toThrow();
  });

  it("Meta com várias Páginas pede a escolha", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    const { outcome } = await connectMeta(owner, clientId);
    expect(outcome.kind).toBe("choose");
    const stateId = (outcome as { stateId: string }).stateId;
    const pending = await pendingPages(owner, stateId);
    expect(pending.pages.map((p) => [p.name, p.instagram])).toEqual([
      ["Coli Loterias", "coliloterias"],
      ["Outra Página", null],
    ]);
    // Os tokens das Páginas nunca vão para a tela.
    expect(JSON.stringify(pending)).not.toContain("page-token");
    const r = await choosePage(owner, stateId, "111");
    expect(r.networks).toEqual(["facebook", "instagram"]);
    expect(await listAccounts(owner, clientId)).toHaveLength(2);
  });

  it("TikTok e YouTube (com PKCE) guardam acesso e renovação; leitura não conecta", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    await saveAppCredentials(owner, "tiktok", { publicId: "awclientkey", secret: "segredo-tiktok-1234" });
    await saveAppCredentials(owner, "google", { publicId: "123-abc.apps.googleusercontent.com", secret: "GOCSPX-segredo" });

    const tt = new URL(await startConnection(owner, clientId, "tiktok"));
    expect(tt.origin + tt.pathname).toBe("https://www.tiktok.com/v2/auth/authorize/");
    expect(tt.searchParams.get("scope")).toBe("user.info.basic,video.publish,video.upload");
    setSocialFetch(
      fakeFetch([
        { method: "POST", match: /open\.tiktokapis\.com\/v2\/oauth\/token\//, reply: () => ({ json: { access_token: "tt-access", refresh_token: "tt-refresh", expires_in: 86400, refresh_expires_in: 31536000, open_id: "open-1", scope: "user.info.basic,video.publish" } }) },
        { match: /open\.tiktokapis\.com\/v2\/user\/info\//, reply: () => ({ json: { data: { user: { open_id: "open-1", display_name: "Coli", username: "coli.loterias", avatar_url: "https://p16.example/a.jpg" } }, error: { code: "ok" } } }) },
        { method: "POST", match: /creator_info\/query/, reply: () => ({ json: { data: { creator_nickname: "Coli", privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] }, error: { code: "ok" } } }) },
      ]).fn,
    );
    expect(await finishConnection(owner, "tiktok", { code: "c", state: tt.searchParams.get("state") })).toMatchObject({ kind: "connected", networks: ["tiktok"] });

    const g = new URL(await startConnection(owner, clientId, "google"));
    expect(g.searchParams.get("code_challenge_method")).toBe("S256");
    expect(g.searchParams.get("access_type")).toBe("offline");
    const google = fakeFetch([
      { method: "POST", match: /oauth2\.googleapis\.com\/token/, reply: () => ({ json: { access_token: "ya29.x", refresh_token: "1//refresh", expires_in: 3599, scope: "https://www.googleapis.com/auth/youtube.upload" } }) },
      { match: /youtube\/v3\/channels/, reply: () => ({ json: { items: [{ id: "UC123", snippet: { title: "Coli Loterias", customUrl: "@coli" }, statistics: { subscriberCount: "120" } }] } }) },
    ]);
    setSocialFetch(google.fn);
    await finishConnection(owner, "google", { code: "c", state: g.searchParams.get("state") });
    // O verificador PKCE enviado bate com o desafio do início.
    const verifier = bodyOf(google.calls[0]!.init).code_verifier!;
    const challenge = (await import("node:crypto")).createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(g.searchParams.get("code_challenge"));

    const accounts = await listAccounts(owner, clientId);
    expect(accounts.map((a) => a.network)).toEqual(["tiktok", "youtube"]);
    expect(accounts[0]!.details).toMatchObject({ privacyOptions: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] });

    const viewer = await addMember(owner, "viewer");
    await expect(startConnection(viewer, clientId, "tiktok")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(disconnectAccount(viewer, accounts[0]!.id)).rejects.toBeInstanceOf(ForbiddenError);
    await disconnectAccount(owner, accounts[0]!.id);
    expect(await listAccounts(owner, clientId)).toHaveLength(1);
  });
});

describe("publicação", () => {
  it("só peça aprovada; Instagram (carrossel por URL assinada) e Facebook (arquivo) publicam pela fila", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    await connectMeta(owner, clientId, [PAGES[0]!]);
    const accounts = await listAccounts(owner, clientId);
    const ig = accounts.find((a) => a.network === "instagram")!;
    const fb = accounts.find((a) => a.network === "facebook")!;

    // Rascunho não publica.
    const { contentId: draftId } = await createContent(owner, { clientId, title: "Rascunho", channel: "instagram", format: "post", objective: "education", briefing: { text: "Texto do rascunho com mais de dez letras." }, slideCount: 1, mode: "manual", requestId: crypto.randomUUID() });
    await expect(schedulePublications(owner, { contentId: draftId, accountIds: [ig.id], when: "now", caption: "x" })).rejects.toThrow(/aprovadas/);

    const contentId = await approvedCarousel(owner, clientId);
    const fetched: Array<{ ok: boolean; jpeg: boolean }> = [];
    let media = 0;
    const meta = fakeFetch([
      {
        method: "POST",
        match: /graph\.facebook\.com\/v23\.0\/17841400000000001\/media$/,
        reply: async (_u, init) => {
          const b = bodyOf(init);
          if (b.image_url) {
            // A Meta baixa a imagem pela URL assinada: precisa abrir e ser JPEG.
            const u = new URL(b.image_url);
            const parts = u.pathname.split("/");
            const f = await readSignedFile(parts[4]!, parts[5]!, u.searchParams.get("exp"), u.searchParams.get("sig"));
            fetched.push({ ok: Boolean(f), jpeg: f ? (await sharp(f.data).metadata()).format === "jpeg" : false });
          }
          return { json: { id: `container-${++media}` } };
        },
      },
      { match: /graph\.facebook\.com\/v23\.0\/container-\d+\?fields=status_code/, reply: () => ({ json: { status_code: "FINISHED" } }) },
      { method: "POST", match: /17841400000000001\/media_publish/, reply: () => ({ json: { id: "ig-media-1" } }) },
      { match: /ig-media-1\?fields=permalink$/, reply: () => ({ json: { permalink: "https://www.instagram.com/p/abc/" } }) },
      { method: "POST", match: /v23\.0\/111\/photos/, reply: (_u, _i, n) => ({ json: { id: `photo-${n}` } }) },
      { method: "POST", match: /v23\.0\/111\/feed/, reply: () => ({ json: { id: "111_999" } }) },
      { match: /111_999\?fields=permalink_url/, reply: () => ({ json: { permalink_url: "https://www.facebook.com/111/posts/999" } }) },
      { match: /ig-media-1\?fields=like_count/, reply: () => ({ json: { like_count: 12, comments_count: 3 } }) },
      { match: /ig-media-1\/insights/, reply: () => ({ json: { data: [{ name: "reach", values: [{ value: 340 }] }] } }) },
    ]);
    setSocialFetch(meta.fn);
    const r = await schedulePublications(owner, { contentId, accountIds: [ig.id, fb.id], when: "now", caption: "Legenda #bolao" });
    expect(r.ids).toHaveLength(2);
    await drain();

    const pubs = await listPublications(owner, { contentId });
    expect(pubs.map((p) => [p.network, p.status, p.externalUrl])).toEqual(
      expect.arrayContaining([
        ["instagram", "published", "https://www.instagram.com/p/abc/"],
        ["facebook", "published", "https://www.facebook.com/111/posts/999"],
      ]),
    );
    expect(fetched).toHaveLength(3);
    expect(fetched.every((f) => f.ok && f.jpeg)).toBe(true);
    const carousel = meta.calls.find((c) => c.method === "POST" && bodyOf(c.init).media_type === "CAROUSEL")!;
    expect(bodyOf(carousel.init)).toMatchObject({ children: "container-1,container-2,container-3", caption: "Legenda #bolao" });
    const feed = meta.calls.find((c) => c.url.pathname.endsWith("/111/feed"))!;
    expect(Object.keys(bodyOf(feed.init)).filter((k) => k.startsWith("attached_media"))).toHaveLength(3);

    // Métricas sob demanda.
    const igPub = pubs.find((p) => p.network === "instagram")!;
    expect(await refreshMetrics(owner, igPub.id)).toMatchObject({ likes: 12, comments: 3, reach: 340 });
    // Depois de publicado, o link das imagens não abre mais (arquivos removidos).
    expect(await readSignedFile(igPub.id, "1.jpg", String(Math.floor(Date.now() / 1000) + 60), "x")).toBeNull();
  });

  it("valida rede e formato, agenda, cancela e marca a conta para reconectar quando o token cai", async () => {
    const { owner } = await newOrg();
    const { id: clientId } = await createClient(owner, { name: "Coli Loterias" });
    await connectMeta(owner, clientId, [PAGES[0]!]);
    const accounts = await listAccounts(owner, clientId);
    const ig = accounts.find((a) => a.network === "instagram")!;
    const contentId = await approvedCarousel(owner, clientId);

    await expect(schedulePublications(owner, { contentId, accountIds: [ig.id], when: "2020-01-01T10:00:00-03:00", caption: "" })).rejects.toBeInstanceOf(ValidationError);
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const { ids } = await schedulePublications(owner, { contentId, accountIds: [ig.id], when: later, caption: "" });
    expect(await processNextJob("teste-agenda")).toBe(false); // ainda não é a hora
    await cancelPublication(owner, ids[0]!);
    expect((await listPublications(owner, { contentId }))[0]).toMatchObject({ status: "cancelled" });

    const viewer = await addMember(owner, "viewer");
    await expect(schedulePublications(viewer, { contentId, accountIds: [ig.id], when: "now", caption: "" })).rejects.toBeInstanceOf(ForbiddenError);

    setSocialFetch(fakeFetch([{ method: "POST", match: /\/media$/, reply: () => ({ status: 400, json: { error: { code: 190, message: "Error validating access token" } } }) }]).fn);
    await schedulePublications(owner, { contentId, accountIds: [ig.id], when: "now", caption: "" });
    await drain();
    const failed = (await listPublications(owner, { contentId, status: "failed" }))[0]!;
    expect(failed.error).toMatch(/Conecte a conta de novo/);
    expect((await listAccounts(owner, clientId)).find((a) => a.id === ig.id)!.status).toBe("reconnect");
    await expect(schedulePublications(owner, { contentId, accountIds: [ig.id], when: "now", caption: "" })).rejects.toThrow(/conecte a conta de novo/);
  });
});
