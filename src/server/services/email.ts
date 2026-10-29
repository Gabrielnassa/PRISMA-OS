import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { maybeOne, systemCtx, userCtx, withTx } from "../db";
import type { AuthContext } from "../auth/types";
import { assertCan } from "../authz/permissions";
import { IntegrationError, IntegrationNotConfiguredError, ValidationError } from "../errors";
import { hint, open, seal, secretsConfigured } from "../crypto/secrets";
import { enqueueJob, type Job } from "../jobs/queue";
import { audit, userActor } from "./audit";

/**
 * E-mail pelo servidor SMTP da agência (o da Hostinger, Gmail com senha de
 * app, Microsoft 365...). Avisos saem pela fila; sem SMTP configurado,
 * simplesmente não saem.
 */

export const EMAIL_JOB = "email.send";

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}

type Sender = (cfg: SmtpConfig, msg: MailMessage) => Promise<void>;

let senderOverride: Sender | undefined;
/** Os testes trocam o envio real por um registro em memória. */
export function setMailSender(s: Sender | undefined): void {
  senderOverride = s;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

const context = (orgId: string) => `app:${orgId}:smtp`;

const SettingsSchema = z.object({
  host: z.string().trim().min(3, "Informe o servidor SMTP.").max(200).regex(/^[A-Za-z0-9.-]+$/, "Servidor inválido."),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().min(3, "Informe o usuário.").max(200),
  from: z.string().trim().max(200).regex(/^(.+<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/, "Use um remetente como Agência <contato@agencia.com.br>."),
});

export async function getSmtpStatus(auth: AuthContext): Promise<{ configured: boolean; host: string; port: number; secure: boolean; user: string; from: string; passwordHint: string | null }> {
  assertCan(auth.role, "integrations.manage");
  const row = await withTx(userCtx(auth.userId), (tx) =>
    maybeOne<{ public_id: string; settings: { host?: string; port?: number; secure?: boolean; from?: string }; secret_hint: string | null; has: boolean }>(
      tx,
      "SELECT public_id, settings, secret_hint, secret_sealed IS NOT NULL AS has FROM integration_apps WHERE organization_id = $1 AND provider = 'smtp'",
      [auth.organizationId],
    ),
  );
  return {
    configured: Boolean(row?.has && row.settings.host),
    host: row?.settings.host ?? "",
    port: row?.settings.port ?? 465,
    secure: row?.settings.secure ?? true,
    user: row?.public_id ?? "",
    from: row?.settings.from ?? "",
    passwordHint: row?.secret_hint ?? null,
  };
}

export async function saveSmtp(auth: AuthContext, raw: { host: string; port: string | number; secure: boolean; user: string; from: string; password?: string }): Promise<void> {
  assertCan(auth.role, "integrations.manage");
  const parsed = SettingsSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]!.message, { [String(parsed.error.issues[0]!.path[0])]: parsed.error.issues[0]!.message });
  if (!secretsConfigured()) throw new ValidationError("Antes, defina APP_SECRET_KEY na configuração do servidor.");
  const s = parsed.data;
  const password = raw.password?.trim() || undefined;
  await withTx(userCtx(auth.userId), async (tx) => {
    const existing = await maybeOne<{ secret_sealed: string | null }>(tx, "SELECT secret_sealed FROM integration_apps WHERE organization_id = $1 AND provider = 'smtp'", [auth.organizationId]);
    if (!password && !existing?.secret_sealed) throw new ValidationError("Informe a senha do e-mail.", { password: "Obrigatória." });
    await tx.query(
      `INSERT INTO integration_apps (organization_id, provider, public_id, secret_sealed, secret_hint, settings, updated_by)
       VALUES ($1, 'smtp', $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id, provider) DO UPDATE SET public_id = EXCLUDED.public_id, settings = EXCLUDED.settings, updated_by = EXCLUDED.updated_by,
         secret_sealed = coalesce(EXCLUDED.secret_sealed, integration_apps.secret_sealed), secret_hint = coalesce(EXCLUDED.secret_hint, integration_apps.secret_hint)`,
      [auth.organizationId, s.user, password ? seal(password, context(auth.organizationId)) : null, password ? hint(password) : null, JSON.stringify({ host: s.host, port: s.port, secure: s.secure, from: s.from }), auth.userId],
    );
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "integration.smtp_saved", entityType: "integration", entityId: "smtp", metadata: { host: s.host, user: s.user } });
  });
}

export async function removeSmtp(auth: AuthContext): Promise<void> {
  assertCan(auth.role, "integrations.manage");
  await withTx(userCtx(auth.userId), (tx) => tx.query("DELETE FROM integration_apps WHERE organization_id = $1 AND provider = 'smtp'", [auth.organizationId]));
}

export async function smtpConfig(organizationId: string): Promise<SmtpConfig | null> {
  const row = await withTx(systemCtx("email.config"), (tx) =>
    maybeOne<{ public_id: string; settings: { host?: string; port?: number; secure?: boolean; from?: string }; secret_sealed: string | null }>(
      tx,
      "SELECT public_id, settings, secret_sealed FROM integration_apps WHERE organization_id = $1 AND provider = 'smtp'",
      [organizationId],
    ),
  );
  if (!row?.secret_sealed || !row.settings.host) return null;
  return { host: row.settings.host, port: row.settings.port ?? 465, secure: row.settings.secure ?? true, user: row.public_id, password: open(row.secret_sealed, context(organizationId)), from: row.settings.from || row.public_id };
}

async function deliver(cfg: SmtpConfig, msg: MailMessage): Promise<void> {
  if (senderOverride) return senderOverride(cfg, msg);
  const transport = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: { user: cfg.user, pass: cfg.password }, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 });
  try {
    await transport.sendMail({ from: cfg.from, to: msg.to, subject: msg.subject, text: msg.text, replyTo: msg.replyTo });
  } catch (err) {
    const code = (err as { code?: string; responseCode?: number }).code;
    const auth = code === "EAUTH" || (err as { responseCode?: number }).responseCode === 535;
    throw new IntegrationError(auth ? "O servidor de e-mail recusou o usuário ou a senha." : `Falha ao enviar o e-mail (${code ?? "erro de conexão"}).`, !auth, { cause: err, providerCode: auth ? "smtp_auth" : "smtp" });
  } finally {
    transport.close();
  }
}

/** Teste imediato com um e-mail para quem está configurando. */
export async function testSmtp(auth: AuthContext): Promise<void> {
  assertCan(auth.role, "integrations.manage");
  const cfg = await smtpConfig(auth.organizationId);
  if (!cfg) throw new IntegrationNotConfiguredError("Salve as configurações do e-mail antes de testar.");
  await deliver(cfg, { to: [auth.email], subject: "Teste de e-mail do PRISMA OS", text: `Olá, ${auth.userName}.\n\nO envio de e-mails do PRISMA OS está funcionando.` });
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Enfileira um e-mail (só se a agência tiver SMTP configurado). */
export async function queueEmail(organizationId: string, msg: MailMessage): Promise<boolean> {
  const to = [...new Set(msg.to.map((t) => t.trim().toLowerCase()).filter((t) => EMAIL_RE.test(t)))].slice(0, 20);
  if (to.length === 0) return false;
  return withTx(systemCtx("email.queue"), async (tx) => {
    const has = await maybeOne(tx, "SELECT 1 FROM integration_apps WHERE organization_id = $1 AND provider = 'smtp' AND secret_sealed IS NOT NULL", [organizationId]);
    if (!has) return false;
    await enqueueJob(tx, {
      organizationId,
      clientId: null,
      type: EMAIL_JOB,
      payload: { ...msg, to, subject: msg.subject.slice(0, 200), text: msg.text.slice(0, 20_000) },
      idempotencyKey: `email:${crypto.randomUUID()}`,
      createdBy: null,
      maxAttempts: 4,
    });
    return true;
  });
}

export async function handleEmail(job: Job): Promise<Record<string, unknown>> {
  const cfg = await smtpConfig(job.organization_id);
  if (!cfg) return { skipped: "smtp_not_configured" };
  const p = job.payload as unknown as MailMessage;
  await deliver(cfg, p);
  return { sent: p.to.length };
}
