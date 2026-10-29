import crypto from "node:crypto";
import { z } from "zod";
import { many, maybeOne, one, systemCtx, userCtx, withTx, type Queryable } from "../db";
import type { AuthContext } from "../auth/types";
import { assertCan } from "../authz/permissions";
import { env } from "../env";
import { ConflictError, IntegrationError, IntegrationNotConfiguredError, NotFoundError, ValidationError } from "../errors";
import { open, randomToken, seal, sha256 } from "../crypto/secrets";
import { audit, userActor } from "./audit";
import { requireClient } from "./clients";
import { appCredentials, publicBase, redirectUri, type AppProvider } from "./integration-apps";
import { exchangeMetaCode, listMetaPages, metaAuthUrl, type MetaPage } from "../integrations/social/meta";
import { exchangeTikTokCode, refreshTikTok, tiktokAuthUrl, tiktokCreatorInfo, tiktokUser } from "../integrations/social/tiktok";
import { exchangeGoogleCode, refreshGoogle, youtubeAuthUrl, youtubeChannel } from "../integrations/social/youtube";

/**
 * Contas dos clientes nas redes, conectadas pelo login oficial de cada
 * plataforma (quem conecta é alguém com acesso à conta do cliente). Os tokens
 * ficam criptografados; a tela só vê nome, @ e foto.
 */

export const NETWORKS = ["instagram", "facebook", "tiktok", "youtube"] as const;
export type Network = (typeof NETWORKS)[number];
export const NETWORK_LABELS: Record<Network, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube" };
export const NETWORK_PROVIDER: Record<Network, AppProvider> = { instagram: "meta", facebook: "meta", tiktok: "tiktok", youtube: "google" };

const STATE_TTL_MIN = 15;
const tokenContext = (orgId: string, clientId: string, network: Network) => `acct:${orgId}:${clientId}:${network}`;
const stateContext = (stateId: string) => `oauth:${stateId}`;

export interface SocialAccount {
  id: string;
  clientId: string;
  network: Network;
  externalId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  status: "active" | "reconnect";
  lastError: string | null;
  connectedByName: string | null;
  connectedAt: string;
  details: Record<string, unknown>;
}

type AccountRow = {
  id: string; client_id: string; network: Network; external_id: string; username: string | null; display_name: string; avatar_url: string | null; profile_url: string | null;
  status: "active" | "reconnect"; last_error: string | null; connected_by_name: string | null; connected_at: Date; details: Record<string, unknown>;
};

const mapAccount = (r: AccountRow): SocialAccount => ({
  id: r.id,
  clientId: r.client_id,
  network: r.network,
  externalId: r.external_id,
  username: r.username,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  profileUrl: r.profile_url,
  status: r.status,
  lastError: r.last_error,
  connectedByName: r.connected_by_name,
  connectedAt: r.connected_at.toISOString(),
  details: r.details,
});

const ACCOUNT_SELECT = `SELECT a.id, a.client_id, a.network, a.external_id, a.username, a.display_name, a.avatar_url, a.profile_url, a.status, a.last_error,
  u.name AS connected_by_name, a.connected_at, a.details FROM social_accounts a LEFT JOIN users u ON u.id = a.connected_by`;

export async function listAccounts(auth: AuthContext, clientId: string): Promise<SocialAccount[]> {
  return withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const rows = await many<AccountRow>(tx, `${ACCOUNT_SELECT} WHERE a.client_id = $1 ORDER BY array_position(ARRAY['instagram','facebook','tiktok','youtube'], a.network)`, [clientId]);
    return rows.map(mapAccount);
  });
}

/** Contas de todos os clientes que a pessoa acessa (para a tela de publicações). */
export async function listAllAccounts(auth: AuthContext): Promise<Array<SocialAccount & { clientName: string }>> {
  return withTx(userCtx(auth.userId), async (tx) => {
    const rows = await many<AccountRow & { client_name: string }>(
      tx,
      `${ACCOUNT_SELECT.replace("FROM social_accounts a", "FROM social_accounts a JOIN clients c ON c.id = a.client_id").replace("SELECT ", "SELECT c.name AS client_name, ")}
       WHERE a.organization_id = $1 AND c.status <> 'archived' ORDER BY lower(c.name), a.network`,
      [auth.organizationId],
    );
    return rows.map((r) => ({ ...mapAccount(r), clientName: r.client_name }));
  });
}

// ---------------------------------------------------------------------------
// Login nas plataformas
// ---------------------------------------------------------------------------

async function credentialsOrThrow(orgId: string, provider: AppProvider) {
  const creds = await appCredentials(orgId, provider);
  if (!creds) {
    const name = provider === "meta" ? "Meta" : provider === "tiktok" ? "TikTok" : "Google";
    throw new IntegrationNotConfiguredError(`Cadastre as chaves do app da ${name} em Integrações antes de conectar contas.`);
  }
  return creds;
}

function requireRedirect(provider: AppProvider): string {
  const base = publicBase();
  const uri = redirectUri(provider);
  if (!uri) throw new IntegrationNotConfiguredError("Defina APP_URL (o endereço do sistema) na configuração do servidor para conectar contas.");
  if (!base.https && !base.local) throw new IntegrationNotConfiguredError("Para conectar contas, o sistema precisa estar num endereço com HTTPS (APP_URL começando com https://).");
  return uri;
}

/** Começa a conexão: devolve o endereço do login oficial da plataforma. */
export async function startConnection(auth: AuthContext, clientId: string, provider: AppProvider): Promise<string> {
  assertCan(auth.role, "social.connect");
  const creds = await credentialsOrThrow(auth.organizationId, provider);
  const uri = requireRedirect(provider);
  const state = randomToken();
  const verifier = provider === "google" ? randomToken(48) : null;
  await withTx(userCtx(auth.userId), async (tx) => {
    const client = await requireClient(tx, auth, clientId);
    if (client.status === "archived") throw new ConflictError("Cliente arquivado.");
    await tx.query("DELETE FROM oauth_states WHERE user_id = $1 AND (expires_at < now() OR used_at IS NOT NULL)", [auth.userId]);
    const row = await one<{ id: string }>(
      tx,
      `INSERT INTO oauth_states (state_hash, organization_id, client_id, user_id, provider, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6)) RETURNING id`,
      [sha256(state), auth.organizationId, clientId, auth.userId, provider, STATE_TTL_MIN],
    );
    if (verifier) await tx.query("UPDATE oauth_states SET verifier_sealed = $2 WHERE id = $1", [row.id, seal(verifier, stateContext(row.id))]);
  });
  const version = env().META_GRAPH_VERSION;
  if (provider === "meta") return metaAuthUrl({ appId: creds.publicId, redirectUri: uri, state, version });
  if (provider === "tiktok") return tiktokAuthUrl({ clientKey: creds.publicId, redirectUri: uri, state });
  const challenge = crypto.createHash("sha256").update(verifier!).digest("base64url");
  return youtubeAuthUrl({ clientId: creds.publicId, redirectUri: uri, state, codeChallenge: challenge });
}

export type ConnectionOutcome =
  | { kind: "connected"; clientId: string; networks: Network[]; message: string }
  | { kind: "choose"; clientId: string; stateId: string };

type PendingPage = Omit<MetaPage, "pageToken"> & { pageToken: string };

/** Volta do login: confere o pedido, troca o código pelo acesso e guarda a conta. */
export async function finishConnection(auth: AuthContext, provider: AppProvider, input: { code?: string | null; state?: string | null; error?: string | null }): Promise<ConnectionOutcome> {
  assertCan(auth.role, "social.connect");
  if (!input.state) throw new ValidationError("Retorno do login sem identificação. Comece a conexão de novo.");
  const st = await withTx(userCtx(auth.userId), async (tx) => {
    const row = await maybeOne<{ id: string; client_id: string; provider: string; verifier_sealed: string | null; expired: boolean; used: boolean }>(
      tx,
      "SELECT id, client_id, provider, verifier_sealed, expires_at < now() AS expired, used_at IS NOT NULL AS used FROM oauth_states WHERE state_hash = $1 FOR UPDATE",
      [sha256(input.state!)],
    );
    if (!row || row.provider !== provider) throw new ValidationError("Este retorno de login não confere. Comece a conexão de novo pela página do cliente.");
    if (row.used) throw new ConflictError("Este login já foi usado. Comece a conexão de novo.");
    if (row.expired) throw new ConflictError("O login demorou mais de 15 minutos. Comece a conexão de novo.");
    await tx.query("UPDATE oauth_states SET used_at = now() WHERE id = $1", [row.id]);
    return row;
  });
  if (input.error || !input.code) {
    throw new ValidationError(input.error === "access_denied" || input.error === "user_denied" ? "A autorização foi cancelada na plataforma." : "A plataforma não autorizou a conexão. Tente de novo.");
  }
  const creds = await credentialsOrThrow(auth.organizationId, provider);
  const uri = requireRedirect(provider);
  const clientId = st.client_id;

  if (provider === "meta") {
    const { userToken } = await exchangeMetaCode({ appId: creds.publicId, appSecret: creds.secret, redirectUri: uri, code: input.code, version: env().META_GRAPH_VERSION });
    const pages = await listMetaPages(userToken, env().META_GRAPH_VERSION);
    if (pages.length === 0) {
      throw new ValidationError("Nenhuma Página do Facebook foi liberada nesse login. Na janela da Meta, marque a Página do cliente (e a conta do Instagram ligada a ela).");
    }
    if (pages.length === 1) return { kind: "connected", clientId, ...(await connectMetaPage(auth, clientId, pages[0]!)) };
    await withTx(userCtx(auth.userId), (tx) =>
      tx.query("UPDATE oauth_states SET pending_sealed = $2, expires_at = now() + interval '15 minutes' WHERE id = $1", [st.id, seal(JSON.stringify(pages), stateContext(st.id))]),
    );
    return { kind: "choose", clientId, stateId: st.id };
  }

  if (provider === "tiktok") {
    const t = await exchangeTikTokCode({ clientKey: creds.publicId, clientSecret: creds.secret, code: input.code, redirectUri: uri });
    const user = await tiktokUser(t.accessToken);
    const creator = await tiktokCreatorInfo(t.accessToken).catch(() => null);
    await saveAccount(auth, clientId, {
      network: "tiktok",
      externalId: t.openId || user.openId,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      profileUrl: user.username ? `https://www.tiktok.com/@${user.username}` : null,
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresIn: t.expiresIn,
      refreshExpiresIn: t.refreshExpiresIn,
      scopes: t.scopes,
      details: creator ? { privacyOptions: creator.privacyOptions, nickname: creator.nickname, commentDisabled: creator.commentDisabled, maxVideoSeconds: creator.maxVideoSeconds } : {},
    });
    return { kind: "connected", clientId, networks: ["tiktok"], message: `TikTok ${user.username ? `@${user.username}` : user.displayName} conectado.` };
  }

  const verifier = st.verifier_sealed ? open(st.verifier_sealed, stateContext(st.id)) : "";
  const g = await exchangeGoogleCode({ clientId: creds.publicId, clientSecret: creds.secret, code: input.code, redirectUri: uri, codeVerifier: verifier });
  if (!g.refreshToken) throw new IntegrationError("O Google não liberou o acesso contínuo. Remova o acesso do app na conta Google e conecte de novo.", false);
  const ch = await youtubeChannel(g.accessToken);
  await saveAccount(auth, clientId, {
    network: "youtube",
    externalId: ch.id,
    username: ch.handle,
    displayName: ch.title,
    avatarUrl: ch.avatarUrl,
    profileUrl: ch.handle ? `https://www.youtube.com/${ch.handle}` : `https://www.youtube.com/channel/${ch.id}`,
    accessToken: g.accessToken,
    refreshToken: g.refreshToken,
    expiresIn: g.expiresIn,
    refreshExpiresIn: null,
    scopes: g.scopes,
    details: { subscribers: ch.subscribers },
  });
  return { kind: "connected", clientId, networks: ["youtube"], message: `Canal ${ch.title} conectado.` };
}

/** Páginas encontradas no login da Meta, para a pessoa escolher a do cliente. */
export async function pendingPages(auth: AuthContext, stateId: string): Promise<{ clientId: string; pages: Array<{ pageId: string; name: string; pictureUrl: string | null; instagram: string | null }> }> {
  const { clientId, pages } = await loadPending(auth, stateId);
  return { clientId, pages: pages.map((p) => ({ pageId: p.pageId, name: p.name, pictureUrl: p.pictureUrl, instagram: p.instagram?.username ?? null })) };
}

async function loadPending(auth: AuthContext, stateId: string): Promise<{ clientId: string; pages: PendingPage[] }> {
  if (!z.string().uuid().safeParse(stateId).success) throw new NotFoundError("Escolha de Página não encontrada.");
  const row = await withTx(userCtx(auth.userId), (tx) =>
    maybeOne<{ client_id: string; pending_sealed: string | null; expired: boolean }>(tx, "SELECT client_id, pending_sealed, expires_at < now() AS expired FROM oauth_states WHERE id = $1", [stateId]),
  );
  if (!row?.pending_sealed) throw new NotFoundError("Escolha de Página não encontrada. Comece a conexão de novo.");
  if (row.expired) throw new ConflictError("A escolha expirou. Comece a conexão de novo.");
  return { clientId: row.client_id, pages: JSON.parse(open(row.pending_sealed, stateContext(stateId))) as PendingPage[] };
}

export async function choosePage(auth: AuthContext, stateId: string, pageId: string): Promise<{ clientId: string; networks: Network[]; message: string }> {
  assertCan(auth.role, "social.connect");
  const { clientId, pages } = await loadPending(auth, stateId);
  const page = pages.find((p) => p.pageId === pageId);
  if (!page) throw new ValidationError("Escolha uma das Páginas da lista.");
  const r = await connectMetaPage(auth, clientId, page);
  await withTx(userCtx(auth.userId), (tx) => tx.query("DELETE FROM oauth_states WHERE id = $1", [stateId]));
  return { clientId, ...r };
}

async function connectMetaPage(auth: AuthContext, clientId: string, page: PendingPage): Promise<{ networks: Network[]; message: string }> {
  await saveAccount(auth, clientId, {
    network: "facebook",
    externalId: page.pageId,
    username: null,
    displayName: page.name,
    avatarUrl: page.pictureUrl,
    profileUrl: `https://www.facebook.com/${page.pageId}`,
    accessToken: page.pageToken,
    refreshToken: null,
    expiresIn: null,
    refreshExpiresIn: null,
    scopes: [],
    details: { pageId: page.pageId },
  });
  if (!page.instagram) {
    return { networks: ["facebook"], message: `Página ${page.name} conectada. Ela não tem conta profissional do Instagram ligada; ligue nas configurações da Página e conecte de novo para incluir o Instagram.` };
  }
  await saveAccount(auth, clientId, {
    network: "instagram",
    externalId: page.instagram.id,
    username: page.instagram.username,
    displayName: page.instagram.username,
    avatarUrl: page.instagram.pictureUrl,
    profileUrl: `https://www.instagram.com/${page.instagram.username}/`,
    accessToken: page.pageToken,
    refreshToken: null,
    expiresIn: null,
    refreshExpiresIn: null,
    scopes: [],
    details: { pageId: page.pageId },
  });
  return { networks: ["facebook", "instagram"], message: `Página ${page.name} e Instagram @${page.instagram.username} conectados.` };
}

interface SaveInput {
  network: Network;
  externalId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  refreshExpiresIn: number | null;
  scopes: string[];
  details: Record<string, unknown>;
}

async function saveAccount(auth: AuthContext, clientId: string, a: SaveInput): Promise<void> {
  const ctx = tokenContext(auth.organizationId, clientId, a.network);
  await withTx(userCtx(auth.userId), async (tx) => {
    await requireClient(tx, auth, clientId);
    const r = await one<{ id: string }>(
      tx,
      `INSERT INTO social_accounts (organization_id, client_id, network, external_id, username, display_name, avatar_url, profile_url, access_sealed, refresh_sealed,
                                    token_expires_at, refresh_expires_at, scopes, details, status, last_error, connected_by, connected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               CASE WHEN $11::int IS NULL THEN NULL ELSE now() + make_interval(secs => $11::int) END,
               CASE WHEN $12::int IS NULL THEN NULL ELSE now() + make_interval(secs => $12::int) END,
               $13, $14, 'active', NULL, $15, now())
       ON CONFLICT (client_id, network) DO UPDATE SET
         external_id = EXCLUDED.external_id, username = EXCLUDED.username, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url,
         profile_url = EXCLUDED.profile_url, access_sealed = EXCLUDED.access_sealed, refresh_sealed = EXCLUDED.refresh_sealed,
         token_expires_at = EXCLUDED.token_expires_at, refresh_expires_at = EXCLUDED.refresh_expires_at, scopes = EXCLUDED.scopes,
         details = EXCLUDED.details, status = 'active', last_error = NULL, connected_by = EXCLUDED.connected_by, connected_at = now()
       RETURNING id`,
      [
        auth.organizationId, clientId, a.network, a.externalId, a.username, a.displayName.slice(0, 300), a.avatarUrl, a.profileUrl,
        seal(a.accessToken, ctx), a.refreshToken ? seal(a.refreshToken, ctx) : null, a.expiresIn, a.refreshExpiresIn, a.scopes, JSON.stringify(a.details), auth.userId,
      ],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId,
      action: "social.connected",
      entityType: "social_account",
      entityId: r.id,
      metadata: { network: a.network, account: a.username ?? a.displayName },
    });
  });
}

export async function disconnectAccount(auth: AuthContext, accountId: string): Promise<{ clientId: string }> {
  assertCan(auth.role, "social.connect");
  if (!z.string().uuid().safeParse(accountId).success) throw new NotFoundError("Conta não encontrada.");
  return withTx(userCtx(auth.userId), async (tx) => {
    const row = await maybeOne<{ client_id: string; network: Network; username: string | null; display_name: string }>(
      tx,
      "DELETE FROM social_accounts WHERE id = $1 AND organization_id = $2 RETURNING client_id, network, username, display_name",
      [accountId, auth.organizationId],
    );
    if (!row) throw new NotFoundError("Conta não encontrada.");
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      clientId: row.client_id,
      action: "social.disconnected",
      entityType: "social_account",
      entityId: accountId,
      metadata: { network: row.network, account: row.username ?? row.display_name },
    });
    return { clientId: row.client_id };
  });
}

// ---------------------------------------------------------------------------
// Acesso para publicar (servidor e worker)
// ---------------------------------------------------------------------------

export interface AccountAccess {
  id: string;
  organizationId: string;
  clientId: string;
  network: Network;
  externalId: string;
  label: string;
  token: string;
  details: Record<string, unknown>;
}

/** Token válido da conta, renovado quando está para vencer (TikTok e YouTube). */
export async function accountAccess(tx: Queryable, accountId: string): Promise<AccountAccess> {
  const row = await maybeOne<{
    id: string; organization_id: string; client_id: string; network: Network; external_id: string; username: string | null; display_name: string;
    access_sealed: string; refresh_sealed: string | null; expiring: boolean; status: string; details: Record<string, unknown>;
  }>(
    tx,
    `SELECT id, organization_id, client_id, network, external_id, username, display_name, access_sealed, refresh_sealed, status, details,
            (token_expires_at IS NOT NULL AND token_expires_at < now() + interval '5 minutes') AS expiring
     FROM social_accounts WHERE id = $1 FOR UPDATE`,
    [accountId],
  );
  if (!row) throw new IntegrationError("A conta foi desconectada. Conecte de novo e reagende.", false, { providerCode: "account_missing" });
  if (row.status === "reconnect") throw new IntegrationError("A conta precisa ser conectada de novo na aba Redes do cliente.", false, { providerCode: "token_invalid" });
  const ctx = tokenContext(row.organization_id, row.client_id, row.network);
  let token = open(row.access_sealed, ctx);
  if (row.expiring && row.refresh_sealed && (row.network === "tiktok" || row.network === "youtube")) {
    const creds = await appCredentials(row.organization_id, NETWORK_PROVIDER[row.network]);
    if (!creds) throw new IntegrationNotConfiguredError("As chaves do app foram removidas de Integrações.");
    const refresh = open(row.refresh_sealed, ctx);
    const t =
      row.network === "tiktok"
        ? await refreshTikTok({ clientKey: creds.publicId, clientSecret: creds.secret, refreshToken: refresh })
        : await refreshGoogle({ clientId: creds.publicId, clientSecret: creds.secret, refreshToken: refresh });
    token = t.accessToken;
    const newRefresh = "refreshToken" in t && t.refreshToken ? t.refreshToken : refresh;
    await tx.query(
      `UPDATE social_accounts SET access_sealed = $2, refresh_sealed = $3, token_expires_at = now() + make_interval(secs => $4::int) WHERE id = $1`,
      [row.id, seal(token, ctx), seal(newRefresh, ctx), t.expiresIn],
    );
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    network: row.network,
    externalId: row.external_id,
    label: row.username ? `@${row.username.replace(/^@/, "")}` : row.display_name,
    token,
    details: row.details,
  };
}

/** Marca a conta para reconexão quando a plataforma recusa o token. */
export async function markNeedsReconnect(accountId: string, message: string): Promise<void> {
  await withTx(systemCtx("social.reconnect"), (tx) => tx.query("UPDATE social_accounts SET status = 'reconnect', last_error = $2 WHERE id = $1", [accountId, message.slice(0, 1000)]));
}

/** Opções de privacidade da TikTok (consulta exigida antes de publicar). */
export async function tiktokOptions(auth: AuthContext, accountId: string): Promise<{ privacyOptions: string[]; nickname: string; commentDisabled: boolean; maxVideoSeconds: number | null }> {
  assertCan(auth.role, "social.publish");
  const access = await withTx(userCtx(auth.userId), async (tx) => {
    const ok = await maybeOne(tx, "SELECT 1 FROM social_accounts WHERE id = $1 AND organization_id = $2 AND network = 'tiktok'", [accountId, auth.organizationId]);
    if (!ok) throw new NotFoundError("Conta não encontrada.");
    return withTx(systemCtx("social.tiktok_options"), (sys) => accountAccess(sys, accountId));
  });
  const info = await tiktokCreatorInfo(access.token);
  await withTx(systemCtx("social.tiktok_options"), (tx) =>
    tx.query("UPDATE social_accounts SET details = details || $2::jsonb WHERE id = $1", [accountId, JSON.stringify({ privacyOptions: info.privacyOptions, nickname: info.nickname, commentDisabled: info.commentDisabled, maxVideoSeconds: info.maxVideoSeconds })]),
  );
  return { privacyOptions: info.privacyOptions, nickname: info.nickname, commentDisabled: info.commentDisabled, maxVideoSeconds: info.maxVideoSeconds };
}
