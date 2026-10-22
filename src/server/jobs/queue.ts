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

/** Reserva a próxima tarefa disponível (SKIP LOCKED permite vários workers). */
export async function claimNextJob(worker: string, types?: string[]): Promise<Job | null> {
  return withTx(systemCtx("jobs.claim"), async (tx) => {
    const job = await maybeOne<Job>(
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
    if (job) {
      await tx.query("INSERT INTO job_attempts (job_id, organization_id, attempt, worker_id) VALUES ($1, $2, $3, $4)", [
        job.id,
        job.organization_id,
        job.attempts,
        worker,
      ]);
    }
    return job;
  });
}

/** Atraso exponencial com variação: 10s, 20s, 40s... (máx. 10 min). */
export function backoffMs(attempt: number, random = Math.random()): number {
  const base = Math.min(10 * 60_000, 10_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + random * 0.4));
}

export async function completeJob(job: Job, result: Record<string, unknown>): Promise<void> {
  await withTx(systemCtx("jobs.complete"), async (tx) => {
    await tx.query(
      `UPDATE jobs SET status = 'succeeded', result = $2, finished_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $1 AND status = 'running'`,
      [job.id, JSON.stringify(result)],
    );
    await tx.query(
      `UPDATE job_attempts SET status = 'succeeded', finished_at = now(), duration_ms = (extract(epoch from now() - started_at) * 1000)::int
       WHERE job_id = $1 AND attempt = $2`,
      [job.id, job.attempts],
    );
  });
}

/**
 * Registra a falha. Se for recuperável e houver tentativas, reagenda com
 * backoff; caso contrário encerra como `failed`. Retorna se foi definitiva.
 */
export async function failJob(job: Job, error: string, retryable: boolean): Promise<{ final: boolean }> {
  const canRetry = retryable && job.attempts < job.max_attempts;
  await withTx(systemCtx("jobs.fail"), async (tx) => {
    if (canRetry) {
      await tx.query(
        `UPDATE jobs SET status = 'queued', last_error = $2, run_after = now() + make_interval(secs => $3), locked_at = NULL, locked_by = NULL
         WHERE id = $1`,
        [job.id, error.slice(0, 2000), backoffMs(job.attempts) / 1000],
      );
    } else {
      await tx.query(
        `UPDATE jobs SET status = 'failed', last_error = $2, finished_at = now(), locked_at = NULL, locked_by = NULL WHERE id = $1`,
        [job.id, error.slice(0, 2000)],
      );
    }
    await tx.query(
      `UPDATE job_attempts SET status = 'failed', error = $3, finished_at = now(), duration_ms = (extract(epoch from now() - started_at) * 1000)::int
       WHERE job_id = $1 AND attempt = $2`,
      [job.id, job.attempts, error.slice(0, 2000)],
    );
  });
  return { final: !canRetry };
}

/**
 * Recupera tarefas presas em `running` (worker interrompido): reenfileira se
 * houver tentativas restantes, senão marca como falha. Retorna as finalizadas.
 */
export async function recoverStaleJobs(lockTimeoutMs: number): Promise<{ requeued: number; failed: Job[] }> {
  return withTx(systemCtx("jobs.recover"), async (tx) => {
    const stale = await many<Job>(
      tx,
      `SELECT * FROM jobs WHERE status = 'running' AND locked_at < now() - make_interval(secs => $1) FOR UPDATE SKIP LOCKED`,
      [lockTimeoutMs / 1000],
    );
    const failed: Job[] = [];
    let requeued = 0;
    for (const job of stale) {
      await tx.query(
        `UPDATE job_attempts SET status = 'abandoned', finished_at = now(), error = 'Worker interrompido ou tempo limite excedido'
         WHERE job_id = $1 AND attempt = $2 AND status = 'running'`,
        [job.id, job.attempts],
      );
      if (job.attempts < job.max_attempts) {
        await tx.query(`UPDATE jobs SET status = 'queued', locked_at = NULL, locked_by = NULL, last_error = 'Recuperada após interrupção' WHERE id = $1`, [job.id]);
        requeued++;
      } else {
        await tx.query(
          `UPDATE jobs SET status = 'failed', locked_at = NULL, locked_by = NULL, finished_at = now(), last_error = 'Interrompida repetidamente; tentativas esgotadas' WHERE id = $1`,
          [job.id],
        );
        failed.push({ ...job, status: "failed", last_error: "Interrompida repetidamente; tentativas esgotadas" });
      }
    }
    return { requeued, failed };
  });
}

/** Reprocessamento manual de uma tarefa que falhou (Workflow E). */
export async function retryFailedJob(tx: Queryable, jobId: string): Promise<boolean> {
  const res = await tx.query(
    `UPDATE jobs SET status = 'queued', attempts = 0, run_after = now(), finished_at = NULL, last_error = NULL WHERE id = $1 AND status = 'failed'`,
    [jobId],
  );
  return (res.rowCount ?? 0) > 0;
}
