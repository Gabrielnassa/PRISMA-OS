import { z } from "zod";
import { maybeOne, many, systemCtx, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import { assertCan } from "../authz/permissions";
import { env } from "../env";
import { ValidationError } from "../errors";
import { hint, open, seal, secretsConfigured } from "../crypto/secrets";
import { audit, userActor } from "./audit";

/**
 * Chaves dos apps da agência em cada plataforma. Cadastradas em Integrações
 * (ficam criptografadas no banco) ou definidas na configuração do servidor,
 * que tem prioridade. Nunca voltam para a tela depois de salvas: aparece só o
 * final da chave secreta.
 */

export const APP_PROVIDERS = ["meta", "tiktok", "google"] as const;
export type AppProvider = (typeof APP_PROVIDERS)[number];

export const APP_PROVIDER_INFO: Record<AppProvider, { label: string; networks: string; publicLabel: string; secretLabel: string; env: [string, string] }> = {
  meta: { label: "Meta", networks: "Instagram e Facebook", publicLabel: "ID do app", secretLabel: "Chave secreta do app", env: ["META_APP_ID", "META_APP_SECRET"] },
  tiktok: { label: "TikTok", networks: "TikTok", publicLabel: "Client key", secretLabel: "Client secret", env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"] },
  google: { label: "Google", networks: "YouTube", publicLabel: "ID do cliente OAuth", secretLabel: "Chave secreta do cliente", env: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"] },
};

const context = (orgId: string, provider: string) => `app:${orgId}:${provider}`;

function envCredentials(provider: AppProvider): { publicId: string; secret: string } | null {
  const e = env();
  const [idKey, secretKey] = APP_PROVIDER_INFO[provider].env;
  const publicId = e[idKey as keyof typeof e] as string | undefined;
  const secret = e[secretKey as keyof typeof e] as string | undefined;
  return publicId && secret ? { publicId, secret } : null;
}

/** Endereço público do sistema (para os retornos de login e as imagens que as redes baixam). */
export function publicBase(): { url: string | null; https: boolean; local: boolean } {
  const raw = env().APP_URL;
  if (!raw) return { url: null, https: false, local: true };
  const u = new URL(raw);
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u.hostname) || u.hostname.endsWith(".local");
  return { url: u.origin, https: u.protocol === "https:", local };
}

export function redirectUri(provider: AppProvider): string | null {
  const base = publicBase().url;
  return base ? `${base}/api/conexoes/${provider}/retorno` : null;
}

export interface AppStatus {
  provider: AppProvider;
  configured: boolean;
  source: "env" | "saved" | null;
  publicId: string | null;
  secretHint: string | null;
  updatedAt: string | null;
  redirectUri: string | null;
}

export async function listAppStatus(auth: AuthContext): Promise<AppStatus[]> {
  assertCan(auth.role, "integrations.manage");
  const rows = await withTx(userCtx(auth.userId), (tx) =>
    many<{ provider: AppProvider; public_id: string; secret_hint: string | null; updated_at: Date; has_secret: boolean }>(
      tx,
      "SELECT provider, public_id, secret_hint, updated_at, secret_sealed IS NOT NULL AS has_secret FROM integration_apps WHERE organization_id = $1",
      [auth.organizationId],
    ),
  );
  return APP_PROVIDERS.map((p) => {
    const fromEnv = envCredentials(p);
    const row = rows.find((r) => r.provider === p);
    if (fromEnv) return { provider: p, configured: true, source: "env", publicId: fromEnv.publicId, secretHint: hint(fromEnv.secret), updatedAt: null, redirectUri: redirectUri(p) };
    return {
      provider: p,
      configured: Boolean(row?.public_id && row.has_secret),
      source: row ? "saved" : null,
      publicId: row?.public_id || null,
      secretHint: row?.secret_hint ?? null,
      updatedAt: row?.updated_at.toISOString() ?? null,
      redirectUri: redirectUri(p),
    };
  });
}

const SaveSchema = z.object({
  publicId: z.string().trim().min(3, "Informe o identificador do app.").max(300).regex(/^[A-Za-z0-9._:-]+$/, "Use só o identificador, sem espaços."),
  secret: z.string().trim().max(500).optional(),
});

export async function saveAppCredentials(auth: AuthContext, provider: AppProvider, raw: { publicId: string; secret?: string }): Promise<void> {
  assertCan(auth.role, "integrations.manage");
  if (!APP_PROVIDERS.includes(provider)) throw new ValidationError("Plataforma desconhecida.");
  const parsed = SaveSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]!.message, { publicId: parsed.error.issues[0]!.message });
  const { publicId } = parsed.data;
  const secret = parsed.data.secret || undefined;
  if (secret && (secret.length < 8 || /\s/.test(secret))) throw new ValidationError("A chave secreta parece incompleta. Cole a chave inteira, sem espaços.", { secret: "Chave incompleta." });
  if (!secretsConfigured()) throw new ValidationError("Antes, defina APP_SECRET_KEY na configuração do servidor (veja o aviso no topo de Integrações).");
  await withTx(userCtx(auth.userId), async (tx) => {
    const existing = await maybeOne<{ secret_sealed: string | null }>(tx, "SELECT secret_sealed FROM integration_apps WHERE organization_id = $1 AND provider = $2", [auth.organizationId, provider]);
    if (!secret && !existing?.secret_sealed) throw new ValidationError("Informe a chave secreta do app.", { secret: "Obrigatória." });
    await tx.query(
      `INSERT INTO integration_apps (organization_id, provider, public_id, secret_sealed, secret_hint, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id, provider) DO UPDATE
         SET public_id = EXCLUDED.public_id,
             secret_sealed = coalesce(EXCLUDED.secret_sealed, integration_apps.secret_sealed),
             secret_hint = coalesce(EXCLUDED.secret_hint, integration_apps.secret_hint),
             updated_by = EXCLUDED.updated_by`,
      [auth.organizationId, provider, publicId, secret ? seal(secret, context(auth.organizationId, provider)) : null, secret ? hint(secret) : null, auth.userId],
    );
    await audit(tx, userActor(auth), {
      organizationId: auth.organizationId,
      action: "integration.app_saved",
      entityType: "integration",
      entityId: provider,
      metadata: { publicId, secretChanged: Boolean(secret) },
    });
  });
}

export async function removeAppCredentials(auth: AuthContext, provider: AppProvider): Promise<void> {
  assertCan(auth.role, "integrations.manage");
  await withTx(userCtx(auth.userId), async (tx) => {
    await tx.query("DELETE FROM integration_apps WHERE organization_id = $1 AND provider = $2", [auth.organizationId, provider]);
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "integration.app_removed", entityType: "integration", entityId: provider });
  });
}

/** Credenciais para falar com a plataforma (uso interno do servidor). */
export async function appCredentials(organizationId: string, provider: AppProvider): Promise<{ publicId: string; secret: string } | null> {
  const fromEnv = envCredentials(provider);
  if (fromEnv) return fromEnv;
  const row = await withTx(systemCtx("integration.credentials"), (tx) =>
    maybeOne<{ public_id: string; secret_sealed: string | null }>(tx, "SELECT public_id, secret_sealed FROM integration_apps WHERE organization_id = $1 AND provider = $2", [organizationId, provider]),
  );
  if (!row?.public_id || !row.secret_sealed) return null;
  return { publicId: row.public_id, secret: open(row.secret_sealed, context(organizationId, provider)) };
}
