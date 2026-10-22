import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAuth, jsonError } from "@/server/http";
import { maybeOne, userCtx, withTx } from "@/server/db";
import { NotFoundError } from "@/server/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await apiAuth();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new NotFoundError("Conteúdo não encontrado.");
    const row = await withTx(userCtx(auth.userId), (tx) =>
      maybeOne<{ status: string; last_error: string | null; job_status: string | null; attempts: number | null; max_attempts: number | null; job_error: string | null; run_after: Date | null }>(
        tx,
        `SELECT ci.status, ci.last_error, j.status AS job_status, j.attempts, j.max_attempts, j.last_error AS job_error, j.run_after
         FROM content_items ci
         LEFT JOIN LATERAL (SELECT * FROM jobs WHERE organization_id = ci.organization_id AND payload->>'contentItemId' = ci.id::text ORDER BY created_at DESC LIMIT 1) j ON true
         WHERE ci.id = $1 AND ci.organization_id = $2`,
        [id, auth.organizationId],
      ),
    );
    if (!row) throw new NotFoundError("Conteúdo não encontrado.");
    return NextResponse.json(
      {
        status: row.status,
        lastError: row.last_error,
        job: row.job_status ? { status: row.job_status, attempts: row.attempts, maxAttempts: row.max_attempts, lastError: row.job_error, runAfter: row.run_after } : null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return jsonError(err);
  }
}
