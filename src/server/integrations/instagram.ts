import { env } from "../env";
import { IntegrationError, IntegrationNotConfiguredError, ValidationError } from "../errors";

/**
 * Consulta de perfis do Instagram pela API oficial da Meta ("Business
 * Discovery", Graph API com login do Facebook). Funciona para contas
 * comerciais ou de criador; contas pessoais e privadas não são retornadas.
 *
 * Configuração (variáveis de ambiente, nunca no código):
 * - META_ACCESS_TOKEN: token de acesso da conta da agência (instagram_basic,
 *   pages_read_engagement).
 * - META_IG_USER_ID: ID numérico da conta comercial do Instagram da agência
 *   (quem faz a consulta).
 * - META_GRAPH_VERSION: versão da Graph API (padrão v23.0).
 *
 * Nada é raspado do site do Instagram: sem as credenciais, a consulta não
 * acontece e a tela orienta a usar uma imagem.
 */

export interface InstagramProfile {
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  /** URLs de imagens dos posts recentes (fotos; capas de vídeo). */
  mediaImageUrls: string[];
}

type MetaConfig = { ok: true; token: string; igUserId: string; version: string } | { ok: false; problem: string };

function metaConfig(): MetaConfig {
  const e = env();
  const missing = [!e.META_ACCESS_TOKEN && "META_ACCESS_TOKEN", !e.META_IG_USER_ID && "META_IG_USER_ID"].filter(Boolean);
  if (missing.length) return { ok: false, problem: `Defina ${missing.join(" e ")} no ambiente do servidor para consultar perfis pelo @.` };
  if (!/^\d{5,30}$/.test(e.META_IG_USER_ID!)) {
    return { ok: false, problem: "META_IG_USER_ID deve ser o ID numérico da conta do Instagram da agência (não o @). Veja como obter em docs/OPERATIONS.md." };
  }
  if (e.META_ACCESS_TOKEN!.length < 20 || /\s/.test(e.META_ACCESS_TOKEN!)) {
    return { ok: false, problem: "META_ACCESS_TOKEN parece incompleto ou com espaços. Cole o token inteiro, sem aspas." };
  }
  return { ok: true, token: e.META_ACCESS_TOKEN!, igUserId: e.META_IG_USER_ID!, version: e.META_GRAPH_VERSION };
}

export function instagramStatus(): { configured: boolean; detail: string } {
  const c = metaConfig();
  if (!c.ok) return { configured: false, detail: c.problem };
  return { configured: true, detail: `Consulta de perfis comerciais pela Graph API ${c.version} (conta da agência ${c.igUserId}).` };
}

/** Aceita "@marca", "marca", "instagram.com/marca" ou o link completo do perfil. */
export function normalizeHandle(input: string): string {
  let h = input.trim();
  const m = /instagram\.com\/([^/?#\s]+)/i.exec(h);
  if (m) h = m[1]!;
  h = h.replace(/^@+/, "").replace(/\/+$/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(h)) {
    throw new ValidationError("Informe um @ válido do Instagram (letras, números, ponto e sublinhado).", { handle: "@ inválido." });
  }
  return h.toLowerCase();
}

/** Só baixa imagens servidas pelos domínios da Meta (as URLs vêm da resposta da API). */
export function isMetaCdnUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(fbcdn\.net|cdninstagram\.com)$/i.test(u.hostname);
  } catch {
    return false;
  }
}

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; type?: string } };

function graphError(status: number, body: GraphError): IntegrationError {
  const code = body.error?.code;
  const sub = body.error?.error_subcode;
  if (code === 190 || code === 102) {
    return new IntegrationError("O token de acesso da Meta expirou ou é inválido. Gere um novo e atualize META_ACCESS_TOKEN.", false, { providerCode: "meta_token" });
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return new IntegrationError("Limite de consultas da Meta atingido. Tente de novo em alguns minutos.", true, { providerCode: "meta_rate_limit" });
  }
  if (code === 10 || code === 200) {
    return new IntegrationError("O aplicativo da Meta não tem a permissão necessária para consultar perfis (instagram_basic e pages_read_engagement).", false, { providerCode: "meta_permission" });
  }
  if (code === 100 || code === 110 || sub === 2207013) {
    return new IntegrationError("Não encontrei uma conta comercial ou de criador com esse @. Contas pessoais e privadas não aparecem pela API da Meta.", false, { providerCode: "meta_not_found" });
  }
  return new IntegrationError(`A Meta recusou a consulta (HTTP ${status}${code ? `, código ${code}` : ""}).`, status >= 500, { providerCode: "meta_error" });
}

/** Busca dados públicos de um perfil comercial: foto de perfil e imagens dos posts recentes. */
export async function fetchInstagramProfile(handle: string, opts: { fetchImpl?: typeof fetch; limit?: number } = {}): Promise<InstagramProfile> {
  const c = metaConfig();
  if (!c.ok) {
    throw new IntegrationNotConfiguredError(
      "A consulta ao Instagram ainda não está configurada (API oficial da Meta). Veja Integrações. Enquanto isso, envie o logotipo ou um print do perfil e use “De imagens do cliente”.",
    );
  }
  const username = normalizeHandle(handle);
  const limit = Math.min(Math.max(opts.limit ?? 9, 1), 25);
  const fields = `business_discovery.username(${username}){username,name,profile_picture_url,media.limit(${limit}){media_type,media_url,thumbnail_url}}`;
  const url = `https://graph.facebook.com/${c.version}/${c.igUserId}?fields=${encodeURIComponent(fields)}`;
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new IntegrationError("Não foi possível falar com a API da Meta (rede ou tempo esgotado).", true, { cause: err, providerCode: "meta_network" });
  }
  const body = (await res.json().catch(() => ({}))) as GraphError & {
    business_discovery?: {
      username?: string;
      name?: string;
      profile_picture_url?: string;
      media?: { data?: Array<{ media_type?: string; media_url?: string; thumbnail_url?: string }> };
    };
  };
  if (!res.ok || body.error) throw graphError(res.status, body);
  const bd = body.business_discovery;
  if (!bd) throw graphError(404, { error: { code: 100 } });
  const mediaImageUrls = (bd.media?.data ?? [])
    .map((m) => (m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url))
    .filter((u): u is string => typeof u === "string" && isMetaCdnUrl(u));
  return {
    username: bd.username ?? username,
    name: bd.name ?? null,
    profilePictureUrl: bd.profile_picture_url && isMetaCdnUrl(bd.profile_picture_url) ? bd.profile_picture_url : null,
    mediaImageUrls,
  };
}

/** Baixa uma imagem do CDN da Meta com limite de tamanho e tempo. */
export async function downloadMetaImage(url: string, opts: { fetchImpl?: typeof fetch; maxBytes?: number } = {}): Promise<{ data: Buffer; mimeType: string } | null> {
  if (!isMetaCdnUrl(url)) return null;
  const doFetch = opts.fetchImpl ?? fetch;
  const max = opts.maxBytes ?? 5 * 1024 * 1024;
  try {
    const res = await doFetch(url, { signal: AbortSignal.timeout(10_000) });
    // Redirecionamentos só valem se terminarem no próprio CDN da Meta.
    if (!res.ok || (res.url && !isMetaCdnUrl(res.url))) return null;
    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!/^image\/(png|jpe?g|gif)$/.test(mimeType)) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > max) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length === 0 || data.length > max) return null;
    return { data, mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType };
  } catch {
    return null;
  }
}
