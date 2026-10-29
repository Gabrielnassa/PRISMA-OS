import { IntegrationError } from "../../errors";
import { form, readJson, sleep, socialFetch } from "./http";

/**
 * TikTok pela API oficial (Login Kit v2 + Content Posting API).
 *
 * - Token de acesso vale 24 h; o de renovação, 1 ano (renovado sozinho).
 * - Fotos: a TikTok baixa as imagens de uma URL pública (PULL_FROM_URL), e o
 *   domínio precisa estar verificado no app da TikTok.
 * - Vídeo: o arquivo é enviado direto (FILE_UPLOAD), em partes.
 * - Enquanto o app não passa pela auditoria da TikTok, tudo o que é publicado
 *   fica visível só para o dono da conta (SELF_ONLY).
 */

export const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.upload"];
const API = "https://open.tiktokapis.com/v2";

type TikTokBody<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } };

export function tiktokError(status: number, error: TikTokBody<unknown>["error"] | undefined, action: string): IntegrationError {
  const code = error?.code ?? "";
  const detail = error?.message ? ` Mensagem da TikTok: ${error.message.slice(0, 300)}` : "";
  if (code === "access_token_invalid" || code === "invalid_grant" || code === "scope_not_authorized" || status === 401) {
    return new IntegrationError(`A conexão com a TikTok expirou ou perdeu permissão. Conecte a conta de novo na aba Redes do cliente.${detail}`, false, { providerCode: "token_invalid" });
  }
  if (code === "rate_limit_exceeded" || code === "spam_risk_too_many_posts" || status === 429) {
    return new IntegrationError(`Limite de publicações da TikTok atingido ao ${action}. Tente mais tarde.${detail}`, true, { providerCode: "rate_limit" });
  }
  if (code === "url_ownership_unverified") {
    return new IntegrationError("A TikTok exige que o domínio do PRISMA OS seja verificado no app da TikTok antes de publicar fotos. Veja Integrações.", false, { providerCode: "tiktok_domain" });
  }
  if (code === "unaudited_client_can_only_post_to_private_accounts" || code === "privacy_level_option_mismatch") {
    return new IntegrationError(`Enquanto o app não for aprovado pela TikTok, as publicações só podem ser privadas.${detail}`, false, { providerCode: "tiktok_unaudited" });
  }
  return new IntegrationError(`A TikTok recusou ao ${action} (HTTP ${status}${code ? `, ${code}` : ""}).${detail}`, status >= 500, { providerCode: "tiktok_error" });
}

async function api<T>(path: string, token: string, body: unknown, action: string): Promise<T> {
  const res = await socialFetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body ?? {}),
    network: "a TikTok",
  });
  const r = await readJson<TikTokBody<T>>(res);
  if (!res.ok || (r.error?.code && r.error.code !== "ok")) throw tiktokError(res.status, r.error, action);
  return r.data as T;
}

export function tiktokAuthUrl(o: { clientKey: string; redirectUri: string; state: string }): string {
  const p = new URLSearchParams({ client_key: o.clientKey, scope: TIKTOK_SCOPES.join(","), response_type: "code", redirect_uri: o.redirectUri, state: o.state });
  return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  openId: string;
  scopes: string[];
}

async function tokenRequest(params: Record<string, string>, action: string): Promise<TikTokTokens> {
  const res = await socialFetch(`${API}/oauth/token/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(params), network: "a TikTok" });
  const r = await readJson<{ access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; open_id?: string; scope?: string; error?: string; error_description?: string }>(res);
  if (!res.ok || !r.access_token || r.error) {
    throw tiktokError(res.status, { code: r.error === "invalid_grant" ? "invalid_grant" : (r.error ?? ""), message: r.error_description }, action);
  }
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? "",
    expiresIn: r.expires_in ?? 86_400,
    refreshExpiresIn: r.refresh_expires_in ?? 31_536_000,
    openId: r.open_id ?? "",
    scopes: (r.scope ?? "").split(",").filter(Boolean),
  };
}

export function exchangeTikTokCode(o: { clientKey: string; clientSecret: string; code: string; redirectUri: string }): Promise<TikTokTokens> {
  return tokenRequest({ client_key: o.clientKey, client_secret: o.clientSecret, code: o.code, grant_type: "authorization_code", redirect_uri: o.redirectUri }, "concluir o login");
}

export function refreshTikTok(o: { clientKey: string; clientSecret: string; refreshToken: string }): Promise<TikTokTokens> {
  return tokenRequest({ client_key: o.clientKey, client_secret: o.clientSecret, grant_type: "refresh_token", refresh_token: o.refreshToken }, "renovar o acesso");
}

export async function tiktokUser(token: string): Promise<{ openId: string; username: string | null; displayName: string; avatarUrl: string | null }> {
  const res = await socialFetch(`${API}/user/info/?fields=open_id,avatar_url,display_name,username`, { headers: { Authorization: `Bearer ${token}` }, network: "a TikTok" });
  const r = await readJson<TikTokBody<{ user?: { open_id?: string; avatar_url?: string; display_name?: string; username?: string } }>>(res);
  if (!res.ok || (r.error?.code && r.error.code !== "ok")) throw tiktokError(res.status, r.error, "ler o perfil");
  const u = r.data?.user ?? {};
  return { openId: u.open_id ?? "", username: u.username ?? null, displayName: u.display_name ?? u.username ?? "", avatarUrl: u.avatar_url ?? null };
}

export interface CreatorInfo {
  nickname: string;
  username: string;
  privacyOptions: string[];
  commentDisabled: boolean;
  maxVideoSeconds: number | null;
}

/** Exigida pela TikTok antes de cada publicação: opções de privacidade da conta. */
export async function tiktokCreatorInfo(token: string): Promise<CreatorInfo> {
  const d = await api<{ creator_nickname?: string; creator_username?: string; privacy_level_options?: string[]; comment_disabled?: boolean; max_video_post_duration_sec?: number }>(
    "/post/publish/creator_info/query/",
    token,
    {},
    "consultar a conta",
  );
  return {
    nickname: d.creator_nickname ?? "",
    username: d.creator_username ?? "",
    privacyOptions: d.privacy_level_options ?? [],
    commentDisabled: Boolean(d.comment_disabled),
    maxVideoSeconds: d.max_video_post_duration_sec ?? null,
  };
}

export const TIKTOK_PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Público",
  MUTUAL_FOLLOW_FRIENDS: "Amigos",
  FOLLOWER_OF_CREATOR: "Seguidores",
  SELF_ONLY: "Só eu",
};

export async function tiktokPublishPhotos(o: { token: string; imageUrls: string[]; title: string; description: string; privacy: string; disableComment: boolean }): Promise<string> {
  if (o.imageUrls.length < 1 || o.imageUrls.length > 35) throw new IntegrationError("A TikTok aceita de 1 a 35 imagens por post.", false);
  const d = await api<{ publish_id: string }>(
    "/post/publish/content/init/",
    o.token,
    {
      post_info: { title: o.title.slice(0, 90), description: o.description.slice(0, 4000), privacy_level: o.privacy, disable_comment: o.disableComment, auto_add_music: true },
      source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: o.imageUrls },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    },
    "publicar as fotos",
  );
  return d.publish_id;
}

/** Divisão em partes exigida pela TikTok: 5 a 64 MB; a última absorve o resto; abaixo de 5 MB, uma parte só. */
export function tiktokChunks(size: number): { chunkSize: number; count: number } {
  const MB = 1024 * 1024;
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

export async function tiktokPublishVideo(o: { token: string; video: Buffer; mimeType: string; title: string; privacy: string; disableComment: boolean }): Promise<string> {
  const { chunkSize, count } = tiktokChunks(o.video.length);
  const d = await api<{ publish_id: string; upload_url: string }>(
    "/post/publish/video/init/",
    o.token,
    {
      post_info: { title: o.title.slice(0, 2200), privacy_level: o.privacy, disable_comment: o.disableComment, disable_duet: false, disable_stitch: false },
      source_info: { source: "FILE_UPLOAD", video_size: o.video.length, chunk_size: chunkSize, total_chunk_count: count },
    },
    "enviar o vídeo",
  );
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? o.video.length - 1 : start + chunkSize - 1;
    const part = o.video.subarray(start, end + 1);
    const res = await socialFetch(d.upload_url, {
      method: "PUT",
      headers: { "Content-Type": o.mimeType, "Content-Length": String(part.length), "Content-Range": `bytes ${start}-${end}/${o.video.length}` },
      body: new Uint8Array(part),
      network: "a TikTok",
      timeoutMs: 300_000,
    });
    if (!res.ok && res.status !== 206) throw new IntegrationError(`A TikTok recusou o envio do vídeo (HTTP ${res.status}).`, res.status >= 500, { providerCode: "tiktok_upload" });
  }
  return d.publish_id;
}

export type TikTokStatus = { status: string; failReason: string | null; postIds: string[] };

export async function tiktokStatus(token: string, publishId: string): Promise<TikTokStatus> {
  const d = await api<{ status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }>("/post/publish/status/fetch/", token, { publish_id: publishId }, "acompanhar a publicação");
  return { status: d.status ?? "PROCESSING_UPLOAD", failReason: d.fail_reason ?? null, postIds: (d.publicaly_available_post_id ?? []).map(String) };
}

/** Espera a TikTok terminar de processar (até `maxWaitMs`). */
export async function waitTikTok(token: string, publishId: string, maxWaitMs = 90_000, pollMs = 4_000): Promise<TikTokStatus> {
  const started = Date.now();
  for (;;) {
    const s = await tiktokStatus(token, publishId);
    if (s.status === "PUBLISH_COMPLETE" || s.status === "SEND_TO_USER_INBOX") return s;
    if (s.status === "FAILED") throw new IntegrationError(`A TikTok não publicou: ${s.failReason ?? "motivo não informado"}.`, false, { providerCode: "tiktok_failed" });
    if (Date.now() - started > maxWaitMs) return s;
    await sleep(pollMs);
  }
}
