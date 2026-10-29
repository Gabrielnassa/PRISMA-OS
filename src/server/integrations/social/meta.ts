import { IntegrationError } from "../../errors";
import { form, readJson, sleep, socialFetch } from "./http";

/**
 * Facebook e Instagram pela Graph API oficial (login do Facebook).
 *
 * Conexão: o login devolve um token de usuário; ele é trocado por um token de
 * longa duração e, com ele, cada Página traz o próprio token (que não expira
 * enquanto a pessoa mantiver o acesso). A conta profissional do Instagram
 * vem ligada à Página.
 *
 * Publicação no Instagram: cria-se um contêiner com a URL pública da imagem
 * (a Meta baixa o arquivo), espera-se o status FINISHED e publica-se. No
 * Facebook, as fotos são enviadas direto (arquivo), sem URL pública.
 */

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "business_management",
];

const graph = (version: string, path: string) => `https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`;

type GraphErrorBody = { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string; error_user_title?: string } };

/** Traduz os erros da Graph API. `token_invalid` pede nova conexão da conta. */
export function metaError(status: number, body: GraphErrorBody, action: string): IntegrationError {
  const e = body.error ?? {};
  const detail = e.error_user_msg || e.message;
  const suffix = detail ? ` Mensagem da Meta: ${detail.slice(0, 300)}` : "";
  if (e.code === 190 || e.code === 102 || e.code === 463 || e.code === 467) {
    return new IntegrationError(`A conexão com a Meta expirou ou foi removida. Conecte a conta de novo na aba Redes do cliente.${suffix}`, false, { providerCode: "token_invalid" });
  }
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613 || e.code === 80001 || e.code === 80002) {
    return new IntegrationError(`Limite de uso da API da Meta atingido ao ${action}. Uma nova tentativa é feita em alguns minutos.`, true, { providerCode: "rate_limit" });
  }
  if (e.code === 10 || e.code === 200 || (e.code !== undefined && e.code >= 200 && e.code < 300)) {
    return new IntegrationError(`O app da Meta não tem a permissão necessária para ${action}. Confira as permissões do app e conecte a conta de novo.${suffix}`, false, { providerCode: "permission" });
  }
  if (e.error_subcode === 2207042) {
    return new IntegrationError("A conta atingiu o limite de publicações da Meta nas últimas 24 horas.", false, { providerCode: "publish_limit" });
  }
  return new IntegrationError(`A Meta recusou ao ${action} (HTTP ${status}${e.code ? `, código ${e.code}` : ""}).${suffix}`, status >= 500 || status === 429, { providerCode: "meta_error" });
}

async function call<T>(url: string, init: RequestInit, action: string): Promise<T> {
  const res = await socialFetch(url, { ...init, network: "a Meta", timeoutMs: 60_000 });
  const body = await readJson<T & GraphErrorBody>(res);
  if (!res.ok || body.error) throw metaError(res.status, body, action);
  return body;
}

export function metaAuthUrl(o: { appId: string; redirectUri: string; state: string; version: string }): string {
  const p = new URLSearchParams({ client_id: o.appId, redirect_uri: o.redirectUri, state: o.state, response_type: "code", scope: META_SCOPES.join(",") });
  return `https://www.facebook.com/${o.version}/dialog/oauth?${p}`;
}

/** Código do login → token de usuário de longa duração. */
export async function exchangeMetaCode(o: { appId: string; appSecret: string; redirectUri: string; code: string; version: string }): Promise<{ userToken: string; expiresIn: number | null }> {
  const short = await call<{ access_token: string }>(
    `${graph(o.version, "oauth/access_token")}?${new URLSearchParams({ client_id: o.appId, client_secret: o.appSecret, redirect_uri: o.redirectUri, code: o.code })}`,
    {},
    "concluir o login",
  );
  const long = await call<{ access_token: string; expires_in?: number }>(
    `${graph(o.version, "oauth/access_token")}?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: o.appId, client_secret: o.appSecret, fb_exchange_token: short.access_token })}`,
    {},
    "renovar o acesso",
  );
  return { userToken: long.access_token, expiresIn: long.expires_in ?? null };
}

export interface MetaPage {
  pageId: string;
  name: string;
  pageToken: string;
  pictureUrl: string | null;
  instagram: { id: string; username: string; pictureUrl: string | null } | null;
}

/** Páginas que a pessoa administra, com a conta do Instagram ligada a cada uma. */
export async function listMetaPages(userToken: string, version: string): Promise<MetaPage[]> {
  type Raw = {
    data?: Array<{ id: string; name: string; access_token?: string; picture?: { data?: { url?: string } }; instagram_business_account?: { id: string; username?: string; profile_picture_url?: string } }>;
    paging?: { next?: string };
  };
  const pages: MetaPage[] = [];
  let url: string | undefined = `${graph(version, "me/accounts")}?${new URLSearchParams({ fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}", limit: "100" })}`;
  for (let i = 0; url && i < 5; i++) {
    const body: Raw = await call<Raw>(url, { headers: { Authorization: `Bearer ${userToken}` } }, "listar as Páginas");
    for (const p of body.data ?? []) {
      if (!p.access_token) continue;
      const ig = p.instagram_business_account;
      pages.push({
        pageId: p.id,
        name: p.name,
        pageToken: p.access_token,
        pictureUrl: p.picture?.data?.url ?? null,
        instagram: ig ? { id: ig.id, username: ig.username ?? ig.id, pictureUrl: ig.profile_picture_url ?? null } : null,
      });
    }
    url = body.paging?.next;
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

export type IgKind = "image" | "carousel" | "story" | "video";

/** Estado salvo entre tentativas: um contêiner já criado não é criado de novo. */
export interface IgState {
  containerId?: string;
  children?: string[];
  mediaId?: string;
}

async function waitContainer(o: { id: string; token: string; version: string; maxWaitMs: number; pollMs?: number }): Promise<"FINISHED" | "PUBLISHED" | "IN_PROGRESS"> {
  const started = Date.now();
  for (;;) {
    const s = await call<{ status_code?: string; status?: string }>(
      `${graph(o.version, o.id)}?fields=status_code,status`,
      { headers: { Authorization: `Bearer ${o.token}` } },
      "acompanhar o envio",
    );
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return s.status_code;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new IntegrationError(`O Instagram não aceitou o arquivo (${s.status_code}${s.status ? `: ${s.status}` : ""}). Confira formato e proporção.`, false, { providerCode: "ig_container_error" });
    }
    if (Date.now() - started > o.maxWaitMs) return "IN_PROGRESS";
    await sleep(o.pollMs ?? 3_000);
  }
}

/**
 * Publica no Instagram. `onState` grava o progresso (contêineres criados) para
 * que uma nova tentativa continue de onde parou, sem post duplicado.
 */
export async function publishInstagram(o: {
  igUserId: string;
  token: string;
  version: string;
  kind: IgKind;
  imageUrls: string[];
  videoUrl?: string;
  caption: string;
  state: IgState;
  onState: (s: IgState) => Promise<void>;
  pollMs?: number;
}): Promise<{ mediaId: string; permalink: string | null }> {
  const auth = { Authorization: `Bearer ${o.token}` };
  const media = (params: Record<string, string | boolean | undefined>) =>
    call<{ id: string }>(graph(o.version, `${o.igUserId}/media`), { method: "POST", headers: auth, body: form(params) }, "preparar a publicação");
  const state: IgState = { ...o.state };

  if (!state.mediaId) {
    if (!state.containerId) {
      if (o.kind === "carousel") {
        if (o.imageUrls.length < 2 || o.imageUrls.length > 10) throw new IntegrationError("Carrossel no Instagram precisa de 2 a 10 imagens.", false);
        state.children = state.children ?? [];
        for (let i = state.children.length; i < o.imageUrls.length; i++) {
          state.children.push((await media({ image_url: o.imageUrls[i], is_carousel_item: true })).id);
          await o.onState(state);
        }
        for (const child of state.children) {
          if ((await waitContainer({ id: child, token: o.token, version: o.version, maxWaitMs: 60_000, pollMs: o.pollMs })) === "IN_PROGRESS") {
            throw new IntegrationError("O Instagram ainda está processando as imagens. Nova tentativa em instantes.", true, { providerCode: "ig_processing" });
          }
        }
        state.containerId = (await media({ media_type: "CAROUSEL", children: state.children.join(","), caption: o.caption })).id;
      } else if (o.kind === "story") {
        state.containerId = (await media({ image_url: o.imageUrls[0], media_type: "STORIES" })).id;
      } else if (o.kind === "video") {
        if (!o.videoUrl) throw new IntegrationError("Vídeo sem endereço para o Instagram baixar.", false);
        state.containerId = (await media({ media_type: "REELS", video_url: o.videoUrl, caption: o.caption, share_to_feed: true })).id;
      } else {
        state.containerId = (await media({ image_url: o.imageUrls[0], caption: o.caption })).id;
      }
      await o.onState(state);
    }
    const ready = await waitContainer({ id: state.containerId, token: o.token, version: o.version, maxWaitMs: o.kind === "video" ? 240_000 : 60_000, pollMs: o.pollMs });
    if (ready === "IN_PROGRESS") throw new IntegrationError("O Instagram ainda está processando o arquivo. Nova tentativa em instantes.", true, { providerCode: "ig_processing" });
    state.mediaId = (await call<{ id: string }>(graph(o.version, `${o.igUserId}/media_publish`), { method: "POST", headers: auth, body: form({ creation_id: state.containerId }) }, "publicar")).id;
    await o.onState(state);
  }
  let permalink: string | null = null;
  try {
    permalink = (await call<{ permalink?: string }>(`${graph(o.version, state.mediaId)}?fields=permalink`, { headers: auth }, "ler o link do post")).permalink ?? null;
  } catch {
    // O post já está no ar; o link é só conveniência.
  }
  return { mediaId: state.mediaId, permalink };
}

export interface PostMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  views?: number;
}

export async function instagramMetrics(o: { mediaId: string; token: string; version: string }): Promise<PostMetrics> {
  const auth = { Authorization: `Bearer ${o.token}` };
  const basic = await call<{ like_count?: number; comments_count?: number }>(`${graph(o.version, o.mediaId)}?fields=like_count,comments_count`, { headers: auth }, "ler as métricas");
  const m: PostMetrics = { likes: basic.like_count, comments: basic.comments_count };
  try {
    const ins = await call<{ data?: Array<{ name: string; values?: Array<{ value?: number }>; total_value?: { value?: number } }> }>(
      `${graph(o.version, `${o.mediaId}/insights`)}?metric=reach,saved,shares`,
      { headers: auth },
      "ler o alcance",
    );
    for (const d of ins.data ?? []) {
      const v = d.total_value?.value ?? d.values?.[0]?.value;
      if (typeof v !== "number") continue;
      if (d.name === "reach") m.reach = v;
      if (d.name === "saved") m.saves = v;
      if (d.name === "shares") m.shares = v;
    }
  } catch {
    // Alcance exige instagram_manage_insights; sem ele ficam curtidas e comentários.
  }
  return m;
}

// ---------------------------------------------------------------------------
// Facebook (Página)
// ---------------------------------------------------------------------------

export interface FbState {
  photoIds?: string[];
  postId?: string;
}

function fileForm(fields: Record<string, string>, file: { data: Buffer; name: string; type: string }): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set("source", new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
  return fd;
}

/** Publica na Página: foto, várias fotos num post, story de foto ou vídeo (arquivo enviado direto). */
export async function publishFacebook(o: {
  pageId: string;
  token: string;
  version: string;
  kind: IgKind;
  images: Buffer[];
  video?: { data: Buffer; name: string; type: string; title: string };
  caption: string;
  state: FbState;
  onState: (s: FbState) => Promise<void>;
}): Promise<{ postId: string; permalink: string | null }> {
  const auth = { Authorization: `Bearer ${o.token}` };
  const state: FbState = { ...o.state };
  const jpg = (data: Buffer, i: number) => ({ data, name: `imagem-${i + 1}.jpg`, type: "image/jpeg" });
  if (!state.postId) {
    if (o.kind === "video") {
      if (!o.video) throw new IntegrationError("Vídeo não encontrado para enviar ao Facebook.", false);
      const r = await call<{ id: string }>(
        `https://graph-video.facebook.com/${o.version}/${o.pageId}/videos`,
        { method: "POST", headers: auth, body: fileForm({ description: o.caption, title: o.video.title }, o.video) },
        "enviar o vídeo",
      );
      state.postId = r.id;
    } else if (o.kind === "story") {
      state.photoIds = state.photoIds ?? [(await call<{ id: string }>(graph(o.version, `${o.pageId}/photos`), { method: "POST", headers: auth, body: fileForm({ published: "false" }, jpg(o.images[0]!, 0)) }, "enviar a imagem")).id];
      await o.onState(state);
      const r = await call<{ post_id?: string; id?: string }>(graph(o.version, `${o.pageId}/photo_stories`), { method: "POST", headers: auth, body: form({ photo_id: state.photoIds[0] }) }, "publicar o story");
      state.postId = r.post_id ?? r.id ?? state.photoIds[0];
    } else if (o.images.length === 1) {
      const r = await call<{ id: string; post_id?: string }>(graph(o.version, `${o.pageId}/photos`), { method: "POST", headers: auth, body: fileForm({ caption: o.caption }, jpg(o.images[0]!, 0)) }, "publicar a foto");
      state.postId = r.post_id ?? r.id;
    } else {
      state.photoIds = state.photoIds ?? [];
      for (let i = state.photoIds.length; i < o.images.length; i++) {
        state.photoIds.push((await call<{ id: string }>(graph(o.version, `${o.pageId}/photos`), { method: "POST", headers: auth, body: fileForm({ published: "false" }, jpg(o.images[i]!, i)) }, "enviar as imagens")).id);
        await o.onState(state);
      }
      const body = form({ message: o.caption });
      state.photoIds.forEach((id, i) => body.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
      state.postId = (await call<{ id: string }>(graph(o.version, `${o.pageId}/feed`), { method: "POST", headers: auth, body }, "publicar o post")).id;
    }
    await o.onState(state);
  }
  const postId = state.postId!;
  let permalink: string | null = null;
  try {
    permalink = (await call<{ permalink_url?: string }>(`${graph(o.version, postId)}?fields=permalink_url`, { headers: auth }, "ler o link do post")).permalink_url ?? null;
  } catch {
    // Post no ar; o link é só conveniência.
  }
  return { postId, permalink };
}

export async function facebookMetrics(o: { postId: string; token: string; version: string }): Promise<PostMetrics> {
  const r = await call<{ shares?: { count?: number }; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }>(
    `${graph(o.version, o.postId)}?fields=${encodeURIComponent("shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)")}`,
    { headers: { Authorization: `Bearer ${o.token}` } },
    "ler as métricas",
  );
  return { likes: r.reactions?.summary?.total_count, comments: r.comments?.summary?.total_count, shares: r.shares?.count ?? 0 };
}
