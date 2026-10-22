import type pg from "pg";
import { getPool } from "./pool";

/**
 * Contexto de banco de cada transação. As políticas de RLS leem estes valores.
 * - user: requisições autenticadas (acesso limitado às organizações/clientes do usuário)
 * - system: login, worker e scripts administrativos; o chamador é responsável
 *   pela autorização e deve informar o motivo (registrado em logs de depuração).
 */
export type DbContext =
  | { kind: "user"; userId: string }
  | { kind: "system"; reason: string };

export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

export type Tx = Queryable & { readonly context: DbContext };

export async function withTx<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.system', $2, true)",
      [ctx.kind === "user" ? ctx.userId : "", ctx.kind === "system" ? "on" : "off"],
    );
    const tx: Tx = Object.assign(
      {
        query: <R extends pg.QueryResultRow>(text: string, values?: unknown[]) => client.query<R>(text, values),
      },
      { context: ctx },
    );
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export const systemCtx = (reason: string): DbContext => ({ kind: "system", reason });
export const userCtx = (userId: string): DbContext => ({ kind: "user", userId });

export async function one<R extends pg.QueryResultRow>(tx: Queryable, text: string, values?: unknown[]): Promise<R> {
  const res = await tx.query<R>(text, values);
  const row = res.rows[0];
  if (!row) throw new Error("Registro esperado não encontrado");
  return row;
}

export async function maybeOne<R extends pg.QueryResultRow>(tx: Queryable, text: string, values?: unknown[]): Promise<R | null> {
  const res = await tx.query<R>(text, values);
  return res.rows[0] ?? null;
}

export async function many<R extends pg.QueryResultRow>(tx: Queryable, text: string, values?: unknown[]): Promise<R[]> {
  const res = await tx.query<R>(text, values);
  return res.rows;
}

/** Código de erro do Postgres, quando houver. */
export function pgErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}
