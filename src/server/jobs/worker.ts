import { systemCtx, withTx } from "../db";
import { AppError, IntegrationError } from "../errors";
import { claimNextJob, completeJob, failJob, recoverStaleJobs, workerId, type Job } from "./queue";
import { handleGenerateContent } from "./generate-content";
import { workerAuth } from "./worker-auth";
import { GENERATE_JOB, markGenerationFailed } from "../services/content";

type Handler = (job: Job, auth: NonNullable<Awaited<ReturnType<typeof workerAuth>>>) => Promise<Record<string, unknown>>;

const HANDLERS: Record<string, { run: Handler; onFinalFailure?: (job: Job, message: string) => Promise<void> }> = {
  [GENERATE_JOB]: {
    run: handleGenerateContent,
    onFinalFailure: async (job, message) => {
      const contentItemId = String(job.payload.contentItemId ?? "");
      if (!contentItemId) return;
      await withTx(systemCtx("worker.mark_failed"), (tx) => markGenerationFailed(tx, contentItemId, message));
    },
  },
};

function log(level: "info" | "warn" | "error", msg: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, msg, ...data, at: new Date().toISOString() }));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof IntegrationError) return err.retryable;
  if (err instanceof AppError) return false;
  if (typeof err === "object" && err !== null && "retryable" in err) return Boolean((err as { retryable: unknown }).retryable);
  // Erros desconhecidos (rede, banco) podem ser transitórios.
  return true;
}

/** Processa uma tarefa, se houver. Retorna se algo foi processado. */
export async function processNextJob(worker = workerId()): Promise<boolean> {
  const job = await claimNextJob(worker, Object.keys(HANDLERS));
  if (!job) return false;
  const handler = HANDLERS[job.type];
  const started = Date.now();
  log("info", "job.started", { jobId: job.id, type: job.type, attempt: job.attempts });
  try {
    if (!handler) throw Object.assign(new Error(`Tipo de tarefa desconhecido: ${job.type}`), { retryable: false });
    const auth = await workerAuth(job.organization_id, job.created_by);
    if (!auth) throw Object.assign(new Error("O solicitante não tem mais acesso à organização."), { retryable: false });
    const result = await handler.run(job, auth);
    await completeJob(job, result);
    log("info", "job.succeeded", { jobId: job.id, type: job.type, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { final } = await failJob(job, message, isRetryable(err));
    log(final ? "error" : "warn", final ? "job.failed" : "job.retry_scheduled", { jobId: job.id, type: job.type, attempt: job.attempts, error: message });
    if (final && handler?.onFinalFailure) await handler.onFinalFailure(job, message);
  }
  return true;
}

export async function recoverStale(lockTimeoutMs: number): Promise<void> {
  const { requeued, failed } = await recoverStaleJobs(lockTimeoutMs);
  if (requeued) log("warn", "job.recovered", { requeued });
  for (const job of failed) {
    log("error", "job.failed", { jobId: job.id, type: job.type, error: job.last_error });
    await HANDLERS[job.type]?.onFinalFailure?.(job, job.last_error ?? "Falha");
  }
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
      const processed = await processNextJob(id);
      if (!processed) await new Promise((r) => setTimeout(r, opts.pollMs));
    } catch (err) {
      log("error", "worker.loop_error", { error: (err as Error).message });
      await new Promise((r) => setTimeout(r, opts.pollMs * 3));
    }
  }
  log("info", "worker.stopped", { workerId: id });
}
