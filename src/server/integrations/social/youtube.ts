import { IntegrationError } from "../../errors";
import { form, readJson, socialFetch } from "./http";

/**
 * YouTube pela YouTube Data API v3, com login do Google (OAuth 2.0 + PKCE).
 *
 * - Só vídeos: o YouTube não aceita imagens pela API. Vídeos verticais de até
 *   3 minutos entram como Shorts.
 * - Envio em modo "resumable": cria a sessão e manda o arquivo.
 * - Projetos do Google Cloud sem auditoria da API do YouTube só conseguem
 *   publicar como privado; a opção "Público" volta com erro até a auditoria.
 */

export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

type GoogleErrorBody = { error?: string | { code?: number; message?: string; errors?: Array<{ reason?: string }> }; error_description?: string };

export function youtubeError(status: number, body: GoogleErrorBody, action: string): IntegrationError {
  const e = typeof body.error === "object" ? body.error : null;
  const reason = e?.errors?.[0]?.reason ?? (typeof body.error === "string" ? body.error : "");
  const detail = e?.message ?? body.error_description;
  const suffix = detail ? ` Mensagem do Google: ${detail.slice(0, 300)}` : "";
  if (status === 401 || reason === "invalid_grant" || reason === "authError") {
    return new IntegrationError(`A conexão com o YouTube expirou ou foi removida. Conecte o canal de novo na aba Redes do cliente.${suffix}`, false, { providerCode: "token_invalid" });
  }
  if (reason === "quotaExceeded" || reason === "uploadLimitExceeded" || reason === "rateLimitExceeded" || status === 429) {
    return new IntegrationError(`Limite diário da API do YouTube atingido ao ${action}. Tente amanhã ou peça mais cota no Google Cloud.`, false, { providerCode: "quota" });
  }
  if (reason === "youtubeSignupRequired") {
    return new IntegrationError("A conta Google conectada ainda não tem canal no YouTube.", false, { providerCode: "no_channel" });
  }
  return new IntegrationError(`O YouTube recusou ao ${action} (HTTP ${status}${reason ? `, ${reason}` : ""}).${suffix}`, status >= 500, { providerCode: "youtube_error" });
}

export function youtubeAuthUrl(o: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string {
  const p = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: o.state,
    code_challenge: o.codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
}

async function tokenRequest(params: Record<string, string>, action: string): Promise<GoogleTokens> {
  const res = await socialFetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(params), network: "o Google" });
  const r = await readJson<GoogleErrorBody & { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }>(res);
  if (!res.ok || !r.access_token) throw youtubeError(res.status === 400 ? 401 : res.status, r, action);
  return { accessToken: r.access_token, refreshToken: r.refresh_token ?? null, expiresIn: r.expires_in ?? 3600, scopes: (r.scope ?? "").split(" ").filter(Boolean) };
}

export function exchangeGoogleCode(o: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier: string }): Promise<GoogleTokens> {
  return tokenRequest({ client_id: o.clientId, client_secret: o.clientSecret, code: o.code, grant_type: "authorization_code", redirect_uri: o.redirectUri, code_verifier: o.codeVerifier }, "concluir o login");
}

export function refreshGoogle(o: { clientId: string; clientSecret: string; refreshToken: string }): Promise<GoogleTokens> {
  return tokenRequest({ client_id: o.clientId, client_secret: o.clientSecret, grant_type: "refresh_token", refresh_token: o.refreshToken }, "renovar o acesso");
}

async function get<T>(url: string, token: string, action: string): Promise<T> {
  const res = await socialFetch(url, { headers: { Authorization: `Bearer ${token}` }, network: "o YouTube" });
  const r = await readJson<T & GoogleErrorBody>(res);
  if (!res.ok) throw youtubeError(res.status, r, action);
  return r;
}

export async function youtubeChannel(token: string): Promise<{ id: string; title: string; handle: string | null; avatarUrl: string | null; subscribers: number | null }> {
  const r = await get<{ items?: Array<{ id: string; snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }> }>(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
    token,
    "ler o canal",
  );
  const c = r.items?.[0];
  if (!c) throw new IntegrationError("A conta Google conectada ainda não tem canal no YouTube.", false, { providerCode: "no_channel" });
  return {
    id: c.id,
    title: c.snippet?.title ?? c.id,
    handle: c.snippet?.customUrl ?? null,
    avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
    subscribers: c.statistics?.hiddenSubscriberCount ? null : c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null,
  };
}

export const YOUTUBE_PRIVACY_LABELS: Record<string, string> = { public: "Público", unlisted: "Não listado", private: "Privado" };

export async function youtubeUpload(o: {
  token: string;
  video: Buffer;
  mimeType: string;
  title: string;
  description: string;
  privacy: "public" | "unlisted" | "private";
  madeForKids: boolean;
}): Promise<{ videoId: string }> {
  const meta = {
    snippet: { title: o.title.slice(0, 100), description: o.description.slice(0, 5000), categoryId: "22" },
    status: { privacyStatus: o.privacy, selfDeclaredMadeForKids: o.madeForKids },
  };
  const start = await socialFetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${o.token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(o.video.length),
      "X-Upload-Content-Type": o.mimeType,
    },
    body: JSON.stringify(meta),
    network: "o YouTube",
  });
  if (!start.ok) throw youtubeError(start.status, await readJson<GoogleErrorBody>(start), "iniciar o envio");
  const session = start.headers.get("location");
  if (!session) throw new IntegrationError("O YouTube não devolveu o endereço de envio.", true, { providerCode: "youtube_session" });
  const up = await socialFetch(session, {
    method: "PUT",
    headers: { "Content-Type": o.mimeType, "Content-Length": String(o.video.length) },
    body: new Uint8Array(o.video),
    network: "o YouTube",
    timeoutMs: 600_000,
  });
  const r = await readJson<GoogleErrorBody & { id?: string }>(up);
  if (!up.ok || !r.id) throw youtubeError(up.status, r, "enviar o vídeo");
  return { videoId: r.id };
}

export async function youtubeMetrics(token: string, videoId: string): Promise<{ views?: number; likes?: number; comments?: number }> {
  const r = await get<{ items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }> }>(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}`,
    token,
    "ler as métricas",
  );
  const s = r.items?.[0]?.statistics ?? {};
  const n = (v?: string) => (v === undefined ? undefined : Number(v));
  return { views: n(s.viewCount), likes: n(s.likeCount), comments: n(s.commentCount) };
}
