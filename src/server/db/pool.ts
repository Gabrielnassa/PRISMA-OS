import "server-only";
import pg from "pg";
import { env } from "../env";

// bigint (contagens) -> number. `numeric` continua string para não perder precisão.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: env().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "prisma-os",
    });
    pool.on("error", (err) => {
      console.error(JSON.stringify({ level: "error", msg: "db.pool_error", error: err.message }));
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}
