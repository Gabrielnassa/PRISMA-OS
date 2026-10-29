import { many, systemCtx, withTx } from "../db";
import { publicBase } from "./integration-apps";
import { queueEmail } from "./email";

/**
 * Avisos por e-mail para a equipe. Só saem com o e-mail (SMTP) configurado
 * em Integrações; falhar aqui nunca desfaz a ação que gerou o aviso.
 */

const link = (path: string) => `${publicBase().url ?? ""}${path}`;

async function safe(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", msg: "notification.failed", error: (err as Error).message }));
  }
}

async function emailsOf(organizationId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  return withTx(systemCtx("notify.recipients"), async (tx) =>
    (
      await many<{ email: string }>(
        tx,
        `SELECT u.email FROM users u JOIN memberships m ON m.user_id = u.id AND m.organization_id = $1 AND m.deactivated_at IS NULL WHERE u.id = ANY($2::uuid[]) AND u.is_active`,
        [organizationId, userIds],
      )
    ).map((r) => r.email),
  );
}

/** Peça enviada para aprovação: avisa quem aprova e tem acesso ao cliente (menos quem pediu). */
export async function notifyApprovalRequested(o: { organizationId: string; clientId: string; contentId: string; title: string; clientName: string; requestedBy: string; requestedByName: string; versionNumber: number; note: string }): Promise<void> {
  await safe(async () => {
    const rows = await withTx(systemCtx("notify.approvers"), (tx) =>
      many<{ email: string }>(
        tx,
        `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id AND u.is_active
         WHERE m.organization_id = $1 AND m.deactivated_at IS NULL AND u.id <> $3
           AND (m.role IN ('owner', 'admin') OR (m.role = 'reviewer' AND EXISTS (SELECT 1 FROM client_access ca WHERE ca.client_id = $2 AND ca.user_id = u.id)))`,
        [o.organizationId, o.clientId, o.requestedBy],
      ),
    );
    await queueEmail(o.organizationId, {
      to: rows.map((r) => r.email),
      subject: `Para aprovar: ${o.title} (${o.clientName})`,
      text: [
        `${o.requestedByName} enviou a versão ${o.versionNumber} de "${o.title}" (${o.clientName}) para aprovação.`,
        o.note ? `\nObservação: ${o.note}` : "",
        `\nAbrir a peça: ${link(`/conteudos/${o.contentId}`)}`,
      ].join("\n"),
    });
  });
}

export async function notifyApprovalDecided(organizationId: string, o: { requestedBy: string | null; contentId: string; title: string; clientName: string; decision: "approved" | "rejected"; by: string; note: string }): Promise<void> {
  await safe(async () => {
    if (!o.requestedBy) return;
    await queueEmail(organizationId, {
      to: await emailsOf(organizationId, [o.requestedBy]),
      subject: `${o.decision === "approved" ? "Aprovada" : "Pedido de ajuste"}: ${o.title} (${o.clientName})`,
      text: [
        `${o.by} ${o.decision === "approved" ? "aprovou" : "pediu ajustes em"} "${o.title}" (${o.clientName}).`,
        o.note ? `\nComentário: ${o.note}` : "",
        `\nAbrir a peça: ${link(`/conteudos/${o.contentId}`)}`,
      ].join("\n"),
    });
  });
}

export async function notifyPublicationFailed(organizationId: string, o: { requestedBy: string | null; network: string; account: string; title: string; error: string }): Promise<void> {
  await safe(async () => {
    if (!o.requestedBy) return;
    await queueEmail(organizationId, {
      to: await emailsOf(organizationId, [o.requestedBy]),
      subject: `Publicação não saiu: ${o.title} (${o.network})`,
      text: `A publicação de "${o.title}" em ${o.network} (${o.account}) falhou.\n\nMotivo: ${o.error}\n\nVer publicações: ${link("/publicacoes")}`,
    });
  });
}
