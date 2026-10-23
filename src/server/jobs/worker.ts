import { AppError, IntegrationError } from "../errors";
import { claimNextJob, completeJob, failJob, heartbeatJob, recoverStaleJobs, workerId, type FinalFailureHook, type Job } from "./queue";
import { handleGenerateContent } from "./generate-content";
import { workerAuth } from "./worker-auth";
import { GENERATE_JOB, markGenerationFailed } from "../services/content";

type Handler = (job: Job, auth: NonNullable<Awaited<ReturnType<typeof workerAuth>>>) => Promise<Record<string, unknown>>;

const HANDLERS: Record<string, { run: Handler; onFinalFailure?: FinalFailureHook }> = {
  [GENERATE_JOB]: {
    run: handleGenerateContent,
    // Roda na mesma transação que encerra a tarefa (contexto de sistema).
    onFinalFailure: async (tx, job, message) => {
      const contentItemId = String(job.payload.contentItemId ?? "");
      if (contentItemId) await markGenerationFailed(tx, contentItemId, message);
    },
  },
};

function log(level: "info" | "warn" | "error", msg: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, ...data, at: new Date().toISOString() }));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof IntegrationError) return err.retryable;
  if (typeof err === "object" && err !== null && "retryable" in err) return Boolean((err as { retryable: unknown }).retryable);
  if (err instanceof AppError) return false;
  // Erros desconhecidos (rede, banco) podem ser transitórios.
  return true;
}

/** Mensagem segura para a interface: erros internos não expõem detalhes técnicos. */
function userMessageFor(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (typeof err === "object" && err !== null && (err as { userSafe?: boolean }).userSafe && err instanceof Error) return err.message;
  return "Falha interna ao gerar o conteúdo. O detalhe técnico foi registrado; tente novamente ou avise o administrador.";
}

/** Processa uma tarefa, se houver. Retorna se algo foi processado. */
export async function processNextJob(worker = workerId(), opts: { heartbeatMs?: number } = {}): Promise<boolean> {
  const job = await claimNextJob(worker, Object.keys(HANDLERS));
  if (!job) return false;
  const handler = HANDLERS[job.type];
  const started = Date.now();
  log("info", "job.started", { jobId: job.id, type: job.type, attempt: job.attempts });
  // Renova a reserva enquanto a tarefa roda; se outro worker a assumiu, o resultado deste é descartado.
  const heartbeat = setInterval(() => {
    heartbeatJob(job)
      .then((owned) => {
        if (!owned) log("warn", "job.lock_lost", { jobId: job.id, attempt: job.attempts });
      })
      .catch((err: unknown) => log("warn", "job.heartbeat_failed", { jobId: job.id, error: (err as Error).message }));
  }, opts.heartbeatMs ?? 30_000);
  try {
    if (!handler) throw Object.assign(new Error(`Tipo de tarefa desconhecido: ${job.type}`), { retryable: false });
    const auth = await workerAuth(job.organization_id, job.created_by);
    if (!auth) throw Object.assign(new Error("O solicitante não tem mais acesso à organização."), { retryable: false, userSafe: true });
    const result = await handler.run(job, auth);
    const owned = await completeJob(job, result);
    log(owned ? "info" : "warn", owned ? "job.succeeded" : "job.lock_lost", { jobId: job.id, type: job.type, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { final, owned } = await failJob(job, message, isRetryable(err), handler?.onFinalFailure, userMessageFor(err));
    const event = !owned ? "job.lock_lost" : final ? "job.failed" : "job.retry_scheduled";
    log(final ? "error" : "warn", event, { jobId: job.id, type: job.type, attempt: job.attempts, error: message });
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

export async function recoverStale(lockTimeoutMs: number): Promise<void> {
  const { requeued, failed, errors } = await recoverStaleJobs(lockTimeoutMs, (type) => HANDLERS[type]?.onFinalFailure);
  if (requeued) log("warn", "job.recovered", { requeued });
  for (const job of failed) log("error", "job.failed", { jobId: job.id, type: job.type, error: job.last_error });
  for (const e of errors) log("error", "job.recover_failed", e);
}

export async function runWorkerLoop(opts: { pollMs: number; lockTimeoutMs: number; signal: AbortSignal }): Promise<void> {
  const id = workerId();
  log("info", "worker.started", { workerId: id });
  let lastRecovery = 0;
  while (!opts.signal.aborted) {
    try {
      if (Date.now() - lastRecovery > 30_000) {
        await recoverStale(opts.lockTimeoutMs);
        lastRecovery = Date.now();
      }
      const processed = await processNextJob(id, { heartbeatMs: Math.max(5_000, Math.floor(opts.lockTimeoutMs / 4)) });
      if (!processed) await new Promise((r) => setTimeout(r, opts.pollMs));
    } catch (err) {
      log("error", "worker.loop_error", { error: (err as Error).message });
      await new Promise((r) => setTimeout(r, opts.pollMs * 3));
    }
  }
  log("info", "worker.stopped", { workerId: id });
}
