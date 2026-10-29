import { one, systemCtx, withTx } from "../db";
import { storage } from "../storage";
import { providerStatus } from "../ai/gateway";

export interface HealthCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Verificações operacionais sem expor segredos (usadas por /api/health e Integrações). */
export async function healthChecks(): Promise<{ ok: boolean; checks: HealthCheck[] }> {
  const checks: HealthCheck[] = [];
  try {
    const started = Date.now();
    const db = await withTx(systemCtx("health"), (tx) =>
      one<{ bypass: boolean; owns: boolean; version: string; stale: number }>(
        tx,
        `SELECT r.rolbypassrls AS bypass,
                EXISTS (SELECT 1 FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = current_user) AS owns,
                current_setting('server_version') AS version,
                (SELECT count(*)::int FROM jobs WHERE status = 'queued' AND run_after < now() - interval '2 minutes') AS stale
         FROM pg_roles r WHERE r.rolname = current_user`,
      ),
    );
    checks.push({ name: "Banco de dados", ok: true, detail: `PostgreSQL ${db.version} respondeu em ${Date.now() - started} ms.` });
    const rlsOk = !db.bypass && !db.owns;
    checks.push({
      name: "Isolamento (RLS)",
      ok: rlsOk,
      detail: rlsOk ? "A conexão da aplicação está sujeita às políticas de RLS." : "A conexão da aplicação é dona das tabelas ou ignora RLS. Use um usuário de login separado.",
    });
    checks.push({
      name: "Worker de tarefas",
      ok: db.stale === 0,
      detail: db.stale === 0 ? "Nenhuma tarefa atrasada na fila." : `${db.stale === 1 ? "1 tarefa aguarda" : `${db.stale} tarefas aguardam`} há mais de 2 minutos. Confira se o processamento em segundo plano está ligado.`,
    });
  } catch (err) {
    checks.push({ name: "Banco de dados", ok: false, detail: `Falha de conexão: ${(err as Error).message}` });
  }
  const st = await storage().healthCheck();
  checks.push({ name: `Armazenamento (${storage().name})`, ok: st.ok, detail: st.detail });
  const ai = providerStatus();
  checks.push({ name: "Provedor de IA", ok: ai.configured && !ai.isDemo, detail: ai.detail });
  return { ok: checks.filter((c) => c.name !== "Provedor de IA").every((c) => c.ok), checks };
}
