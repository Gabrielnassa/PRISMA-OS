import os from "node:os";
import { many, maybeOne, one, systemCtx, withTx, type Queryable } from "../db";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Job {
  id: string;
  organization_id: string;
  client_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  result: Record<string, unknown> | null;
  idempotency_key: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

export interface EnqueueInput {
  organizationId: string;
  clientId: string | null;
  type: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  createdBy: string | null;
  maxAttempts?: number;
}

/** Enfileira uma tarefa; a mesma chave de idempotência nunca gera duas tarefas. */
export async function enqueueJob(tx: Queryable, input: EnqueueInput): Promise<{ job: Job; created: boolean }> {
  const inserted = await maybeOne<Job>(
    tx,
    `INSERT INTO jobs (organization_id, client_id, type, payload, idempotency_key, created_by, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (organization_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [input.organizationId, input.clientId, input.type, JSON.stringify(input.payload), input.idempotencyKey, input.createdBy, input.maxAttempts ?? 3],
  );
  if (inserted) return { job: inserted, created: true };
  const existing = await one<Job>(tx, "SELECT * FROM jobs WHERE organization_id = $1 AND idempotency_key = $2", [input.organizationId, input.idempotencyKey]);
  return { job: existing, created: false };
}

export function workerId(): string {
  return `${os.hostname()}:${process.pid}`;
}

/** Tarefa reservada por um worker: a conclusão só vale para esta tentativa. */
export interface ClaimedJob extends Job {
  locked_by: string;
  attemptId: string;
}

/** Executado na MESMA transação que encerra a tarefa como falha definitiva. */
export type FinalFailureHook = (tx: Queryable, job: Job, message: string) => Promise<void>;

/** Reserva a próxima tarefa disponível (SKIP LOCKED permite vários workers). */
export async function claimNextJob(worker: string, types?: string[]): Promise<ClaimedJob | null> {
  return withTx(systemCtx("jobs.claim"), async (tx) => {
    const job = await maybeOne<Job & { locked_by: string }>(
      tx,
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = $1, last_error = NULL
       WHERE id = (
         SELECT id FROM jobs
         WHERE status = 'queued' AND run_after <= now() AND ($2::text[] IS NULL OR type = ANY($2))
         ORDER BY run_after, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`,
      [worker, types ?? null],
    );
    if (!job) return null;
    const attempt = await one<{ id: string }>(
      tx,
      "INSERT INTO job_attempts (job_id, organization_id, attempt, worker_id) VALUES ($1, $2, $3, $4) RETURNING id::text",
      [job.id, job.organization_id, job.attempts, worker],
    );
    return { ...job, attemptId: attempt.id };
  });
}

/** Condição de posse: o mesmo worker, na mesma tentativa, ainda executando. */
const OWNED = "id = $1 AND status = 'running' AND locked_by = $2 AND attempts = $3";

/**
 * Renova a reserva enquanto o worker trabalha (evita que uma chamada lenta,
 * mas viva, seja tomada por outro worker). Retorna se a reserva ainda é deste.
 */
export async function heartbeatJob(job: ClaimedJob): Promise<boolean> {
  return withTx(systemCtx("jobs.heartbeat"), async (tx) => {
    const res = await tx.query(`UPDATE jobs SET locked_at = now() WHERE ${OWNED}`, [job.id, job.locked_by, job.attempts]);
    return (res.rowCount ?? 0) > 0;
  });
}

/** Atraso exponencial com variação: 10s, 20s, 40s... (máx. 10 min). */
export function backoffMs(attempt: number, random = Math.random()): number {
  const base = Math.min(10 * 60_000, 10_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + random * 0.4));
}

const DURATION = "(extract(epoch from now() - started_at) * 1000)::bigint";

/** Conclui a tarefa. Retorna false se a reserva já não pertencia a este worker. */
export async function completeJob(job: ClaimedJob, result: Record<string, unknown>): Promise<boolean> {
  return withTx(systemCtx("jobs.complete"), async (tx) => {
    const res = await tx.query(
      `UPDATE jobs SET status = 'succeeded', result = $4, finished_at = now(), locked_at = NULL, locked_by = NULL WHERE ${OWNED}`,
      [job.id, job.locked_by, job.attempts, JSON.stringify(result)],
    );
    const owned = (res.rowCount ?? 0) > 0;
    await tx.query(
      `UPDATE job_attempts SET status = $2, finished_at = now(), duration_ms = ${DURATION}, error = $3 WHERE id = $1 AND status = 'running'`,
      [job.attemptId, owned ? "succeeded" : "abandoned", owned ? null : "Reserva perdida antes da conclusão"],
    );
    return owned;
  });
}

/**
 * Registra a falha. Se for recuperável e houver tentativas, reagenda com
 * backoff; caso contrário encerra como `failed` e executa `onFinal` na mesma
 * transação (o conteúdo nunca fica preso em "gerando").
 */
export async function failJob(
  job: ClaimedJob,
  error: string,
  retryable: boolean,
  onFinal?: FinalFailureHook,
): Promise<{ final: boolean; owned: boolean }> {
  const canRetry = retryable && job.attempts < job.max_attempts;
  const message = error.slice(0, 2000);
  return withTx(systemCtx("jobs.fail"), async (tx) => {
    const res = canRetry
      ? await tx.query(
          `UPDATE jobs SET status = 'queued', last_error = $4, run_after = now() + make_interval(secs => $5), locked_at = NULL, locked_by = NULL
           WHERE ${OWNED}`,
          [job.id, job.locked_by, job.attempts, message, backoffMs(job.attempts) / 1000],
        )
      : await tx.query(
          `UPDATE jobs SET status = 'failed', last_error = $4, finished_at = now(), locked_at = NULL, locked_by = NULL WHERE ${OWNED}`,
          [job.id, job.locked_by, job.attempts, message],
        );
    const owned = (res.rowCount ?? 0) > 0;
    await tx.query(
      `UPDATE job_attempts SET status = $2, error = $3, finished_at = now(), duration_ms = ${DURATION} WHERE id = $1 AND status = 'running'`,
      [job.attemptId, owned ? "failed" : "abandoned", owned ? message : `Reserva perdida: ${message}`.slice(0, 2000)],
    );
    if (owned && !canRetry && onFinal) await onFinal(tx, job, message);
    return { final: owned && !canRetry, owned };
  });
}

/**
 * Recupera tarefas presas em `running` (worker interrompido): reenfileira se
 * houver tentativas restantes, senão marca como falha e executa `onFinal`.
 * Cada tarefa é tratada na própria transação: um erro não trava as demais.
 */
export async function recoverStaleJobs(
  lockTimeoutMs: number,
  onFinal?: (type: string) => FinalFailureHook | undefined,
): Promise<{ requeued: number; failed: Job[]; errors: Array<{ jobId: string; error: string }> }> {
  const candidates = await withTx(systemCtx("jobs.recover"), (tx) =>
    many<{ id: string }>(tx, `SELECT id FROM jobs WHERE status = 'running' AND locked_at < now() - make_interval(secs => $1)`, [lockTimeoutMs / 1000]),
  );
  const failed: Job[] = [];
  const errors: Array<{ jobId: string; error: string }> = [];
  let requeued = 0;
  for (const { id } of candidates) {
    try {
      await withTx(systemCtx("jobs.recover"), async (tx) => {
        const job = await maybeOne<Job>(
          tx,
          `SELECT * FROM jobs WHERE id = $1 AND status = 'running' AND locked_at < now() - make_interval(secs => $2) FOR UPDATE SKIP LOCKED`,
          [id, lockTimeoutMs / 1000],
        );
        if (!job) return;
        await tx.query(
          `UPDATE job_attempts SET status = 'abandoned', finished_at = now(), duration_ms = ${DURATION}, error = 'Worker interrompido ou tempo limite excedido'
           WHERE job_id = $1 AND attempt = $2 AND status = 'running'`,
          [job.id, job.attempts],
        );
        if (job.attempts < job.max_attempts) {
          await tx.query(`UPDATE jobs SET status = 'queued', locked_at = NULL, locked_by = NULL, last_error = 'Recuperada após interrupção' WHERE id = $1`, [job.id]);
          requeued++;
          return;
        }
        const message = "Interrompida repetidamente; tentativas esgotadas";
        await tx.query(`UPDATE jobs SET status = 'failed', locked_at = NULL, locked_by = NULL, finished_at = now(), last_error = $2 WHERE id = $1`, [job.id, message]);
        await onFinal?.(job.type)?.(tx, job, message);
        failed.push({ ...job, status: "failed", last_error: message });
      });
    } catch (err) {
      errors.push({ jobId: id, error: (err as Error).message });
    }
  }
  return { requeued, failed, errors };
}

/** Tentativas extras concedidas a cada reprocessamento manual (Workflow E). */
export const MANUAL_RETRY_ATTEMPTS = 3;
