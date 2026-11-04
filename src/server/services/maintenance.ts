import { systemCtx, withTx } from "../db";
import { storage } from "../storage";

/**
 * Limpeza periódica (o worker roda de hora em hora): logins de redes que não
 * terminaram, links vencidos há mais de 30 dias, avisos lidos com mais de 90
 * dias, sessões expiradas, tentativas de login antigas e as imagens
 * temporárias de publicações que já terminaram.
 */
export async function runMaintenance(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const finishedPublications = await withTx(systemCtx("maintenance"), async (tx) => {
    const run = async (name: string, sql: string) => {
      out[name] = (await tx.query(sql)).rowCount ?? 0;
    };
    await run("oauthStates", "DELETE FROM oauth_states WHERE expires_at < now() - interval '1 day' OR used_at < now() - interval '1 day'");
    await run("approvalLinks", "DELETE FROM approval_links WHERE expires_at < now() - interval '30 days'");
    await run("reportLinks", "DELETE FROM report_links WHERE expires_at < now() - interval '30 days'");
    await run("notifications", "DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < now() - interval '90 days'");
    await run("sessions", "DELETE FROM sessions WHERE expires_at < now() - interval '7 days'");
    await run("loginAttempts", "DELETE FROM login_attempts WHERE created_at < now() - interval '30 days'");
    const pubs = await tx.query<{ id: string }>(
      "SELECT id FROM publications WHERE status IN ('published', 'failed', 'cancelled') AND updated_at < now() - interval '1 day' AND updated_at > now() - interval '8 days'",
    );
    return pubs.rows.map((r) => r.id);
  });
  for (const id of finishedPublications) {
    for (let i = 1; i <= 10; i++) await storage().delete(`publish/${id}/${i}.jpg`).catch(() => undefined);
  }
  out.publishFolders = finishedPublications.length;
  return out;
}
