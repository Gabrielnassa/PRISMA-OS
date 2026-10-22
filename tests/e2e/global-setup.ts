import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { E2E_ENV } from "../../playwright.config";

export const E2E_ADMIN = { email: "admin@e2e.prisma", password: "senha-e2e-12345", name: "Admin E2E" };

/** Recria o banco de testes E2E, cria o administrador e inicia o worker. */
export default async function globalSetup(): Promise<void> {
  const client = new pg.Client({ connectionString: E2E_ENV.MIGRATION_DATABASE_URL });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS prisma_meta CASCADE; CREATE SCHEMA public;");
  await client.end();
  fs.rmSync(path.resolve(E2E_ENV.STORAGE_LOCAL_DIR), { recursive: true, force: true });
  Object.assign(process.env, E2E_ENV);
  const { migrate } = await import("../../src/server/db/migrate");
  await migrate({ migrationUrl: E2E_ENV.MIGRATION_DATABASE_URL, appUrl: E2E_ENV.DATABASE_URL });
  // Mesmo procedimento documentado para o primeiro administrador.
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/create-admin.ts", "--org", "Agência E2E", "--name", E2E_ADMIN.name, "--email", E2E_ADMIN.email], {
    env: { ...process.env, ...E2E_ENV, ADMIN_PASSWORD: E2E_ADMIN.password },
    stdio: "inherit",
  });

  const worker = spawn("npx", ["tsx", "--conditions=react-server", "scripts/worker.ts"], { env: { ...process.env, ...E2E_ENV }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const log = fs.createWriteStream(path.resolve("test-results-worker.log"));
  worker.stdout.pipe(log);
  worker.stderr.pipe(log);
  fs.writeFileSync(path.resolve(".e2e-worker.pid"), String(worker.pid));
}
