import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { E2E_ENV } from "../../playwright.config";

/** Banco de testes do zero, migrations e os dados de demonstração (sem worker: nada muda durante as capturas). */
export default async function globalSetup(): Promise<void> {
  const client = new pg.Client({ connectionString: E2E_ENV.MIGRATION_DATABASE_URL });
  await client.connect();
  await client.query(
    "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS prisma_meta CASCADE; CREATE SCHEMA public;",
  );
  await client.end();
  fs.rmSync(path.resolve(E2E_ENV.STORAGE_LOCAL_DIR), { recursive: true, force: true });
  Object.assign(process.env, E2E_ENV);
  const { migrate } = await import("../../src/server/db/migrate");
  await migrate({ migrationUrl: E2E_ENV.MIGRATION_DATABASE_URL, appUrl: E2E_ENV.DATABASE_URL });
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-demo.ts"], {
    env: { ...process.env, ...E2E_ENV },
    stdio: "inherit",
  });
}
