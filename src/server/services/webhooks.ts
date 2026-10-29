import crypto from "node:crypto";
import { z } from "zod";
import { many, maybeOne, one, systemCtx, userCtx, withTx, type Queryable } from "../db";
import type { AuthContext } from "../auth/types";
import { assertCan } from "../authz/permissions";
import { IntegrationError, NotFoundError, ValidationError } from "../errors";
import { open, randomToken, seal } from "../crypto/secrets";
import { enqueueJob, type Job } from "../jobs/queue";
import { socialFetch } from "../integrations/social/http";
import { audit, userActor } from "./audit";

/**
 * Avisos automáticos para outros sistemas (n8n, Zapier, Make, um script da
 * agência): a cada evento, um POST em JSON assinado com HMAC-SHA256 no
 * cabeçalho X-Prisma-Signature. A entrega roda na fila, com novas tentativas.
 */

export const WEBHOOK_JOB = "webhook.deliver";

export const WEBHOOK_EVENTS = ["approval.requested", "approval.decided", "publication.published", "publication.failed", "editorial.approved"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "approval.requested": "Peça enviada para aprovação",
  "approval.decided": "Peça aprovada ou reprovada",
  "publication.published": "Post publicado",
  "publication.failed": "Publicação com falha",
  "editorial.approved": "Linha editorial aprovada",
};

const secretContext = (orgId: string) => `webhook:${orgId}`;

/** Bloqueia endereços internos (o servidor não deve ser usado para alcançar a própria rede). */
export function isAllowedWebhookUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h)) return false;
  if (h.includes(":") && (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:"))) return false;
  return true;
}

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastAt: string | null;
  createdAt: string;
}

export async function listWebhooks(auth: AuthContext): Promise<Webhook[]> {
  assertCan(auth.role, "integrations.manage");
  const rows = await withTx(userCtx(auth.userId), (tx) =>
    many<{ id: string; url: string; events: WebhookEvent[]; active: boolean; last_status: number | null; last_error: string | null; last_at: Date | null; created_at: Date }>(
      tx,
      "SELECT id, url, events, active, last_status, last_error, last_at, created_at FROM webhooks WHERE organization_id = $1 ORDER BY created_at",
      [auth.organizationId],
    ),
  );
  return rows.map((r) => ({ id: r.id, url: r.url, events: r.events, active: r.active, lastStatus: r.last_status, lastError: r.last_error, lastAt: r.last_at?.toISOString() ?? null, createdAt: r.created_at.toISOString() }));
}

const CreateSchema = z.object({
  url: z.string().trim().max(2000).refine(isAllowedWebhookUrl, "Use um endereço público começando com https://."),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Escolha pelo menos um evento."),
});

/** Cria o webhook e devolve o segredo de assinatura (mostrado uma única vez). */
export async function createWebhook(auth: AuthContext, raw: { url: string; events: string[] }): Promise<{ id: string; secret: string }> {
  assertCan(auth.role, "integrations.manage");
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]!.message, { [String(parsed.error.issues[0]!.path[0])]: parsed.error.issues[0]!.message });
  const secret = `whsec_${randomToken(24)}`;
  return withTx(userCtx(auth.userId), async (tx) => {
    const count = await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM webhooks WHERE organization_id = $1", [auth.organizationId]);
    if (count.n >= 10) throw new ValidationError("Limite de 10 webhooks por agência.");
    const r = await one<{ id: string }>(
      tx,
      "INSERT INTO webhooks (organization_id, url, secret_sealed, events, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [auth.organizationId, parsed.data.url, seal(secret, secretContext(auth.organizationId)), [...new Set(parsed.data.events)], auth.userId],
    );
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "webhook.created", entityType: "webhook", entityId: r.id, metadata: { url: parsed.data.url, events: parsed.data.events } });
    return { id: r.id, secret };
  });
}

export async function deleteWebhook(auth: AuthContext, id: string): Promise<void> {
  assertCan(auth.role, "integrations.manage");
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError("Webhook não encontrado.");
  await withTx(userCtx(auth.userId), async (tx) => {
    const r = await maybeOne<{ url: string }>(tx, "DELETE FROM webhooks WHERE id = $1 AND organization_id = $2 RETURNING url", [id, auth.organizationId]);
    if (!r) throw new NotFoundError("Webhook não encontrado.");
    await audit(tx, userActor(auth), { organizationId: auth.organizationId, action: "webhook.deleted", entityType: "webhook", entityId: id, metadata: { url: r.url } });
  });
}

/** Enfileira o aviso para cada webhook ativo que assina o evento. Nunca derruba a ação de origem. */
export async function emitEvent(organizationId: string, event: WebhookEvent, data: Record<string, unknown>, tx?: Queryable): Promise<void> {
  const run = async (q: Queryable) => {
    const hooks = await many<{ id: string }>(q, "SELECT id FROM webhooks WHERE organization_id = $1 AND active AND $2 = ANY(events)", [organizationId, event]);
    const at = new Date().toISOString();
    for (const h of hooks) {
      await enqueueJob(q, {
        organizationId,
        clientId: null,
        type: WEBHOOK_JOB,
        payload: { webhookId: h.id, event, at, data },
        idempotencyKey: `webhook:${h.id}:${crypto.randomUUID()}`,
        createdBy: null,
        maxAttempts: 4,
      });
    }
  };
  try {
    // Dentro de uma transação de sistema, entra junto com a ação; senão, em transação própria.
    if (tx && "context" in tx && (tx as { context: { kind: string } }).context.kind === "system") await run(tx);
    else await withTx(systemCtx("webhook.emit"), run);
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", msg: "webhook.emit_failed", event, error: (err as Error).message }));
  }
}

export function signBody(secret: string, body: string, timestamp: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export async function handleWebhook(job: Job): Promise<Record<string, unknown>> {
  const p = job.payload as { webhookId: string; event: string; at: string; data: Record<string, unknown> };
  const hook = await withTx(systemCtx("webhook.deliver"), (tx) =>
    maybeOne<{ url: string; secret_sealed: string; active: boolean }>(tx, "SELECT url, secret_sealed, active FROM webhooks WHERE id = $1", [p.webhookId]),
  );
  if (!hook || !hook.active) return { skipped: true };
  if (!isAllowedWebhookUrl(hook.url)) throw Object.assign(new Error("Endereço do webhook não permitido."), { retryable: false, userSafe: true });
  const body = JSON.stringify({ id: job.id, event: p.event, at: p.at, organizationId: job.organization_id, data: p.data });
  const timestamp = String(Math.floor(Date.now() / 1000));
  let status = 0;
  let error: string | null = null;
  try {
    const res = await socialFetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PRISMA-OS-Webhook/1",
        "X-Prisma-Event": p.event,
        "X-Prisma-Timestamp": timestamp,
        "X-Prisma-Signature": signBody(open(hook.secret_sealed, secretContext(job.organization_id)), body, timestamp),
      },
      body,
      redirect: "manual",
      network: "o webhook",
      timeoutMs: 10_000,
    });
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  await withTx(systemCtx("webhook.deliver"), (tx) => tx.query("UPDATE webhooks SET last_status = $2, last_error = $3, last_at = now() WHERE id = $1", [p.webhookId, status || null, error]));
  if (error) throw new IntegrationError(`Webhook não entregue: ${error}`, status === 0 || status >= 500 || status === 429);
  return { status };
}

/** Envia um evento de teste ("ping") agora, pela fila. */
export async function testWebhook(auth: AuthContext, id: string): Promise<void> {
  assertCan(auth.role, "integrations.manage");
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError("Webhook não encontrado.");
  await withTx(userCtx(auth.userId), async (tx) => {
    const ok = await maybeOne(tx, "SELECT 1 FROM webhooks WHERE id = $1 AND organization_id = $2", [id, auth.organizationId]);
    if (!ok) throw new NotFoundError("Webhook não encontrado.");
  });
  await withTx(systemCtx("webhook.test"), (tx) =>
    enqueueJob(tx, {
      organizationId: auth.organizationId,
      clientId: null,
      type: WEBHOOK_JOB,
      payload: { webhookId: id, event: "ping", at: new Date().toISOString(), data: { message: "Teste do PRISMA OS" } },
      idempotencyKey: `webhook:${id}:${crypto.randomUUID()}`,
      createdBy: null,
      maxAttempts: 1,
    }),
  );
}
