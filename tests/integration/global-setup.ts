import pg from "pg";
import { migrate } from "../../src/server/db/migrate";

export const TEST_MIGRATION_URL =
  process.env.TEST_MIGRATION_DATABASE_URL ?? "postgres://prisma_owner:prisma_owner_dev@localhost:5432/prisma_os_test";
export const TEST_APP_URL = process.env.TEST_DATABASE_URL ?? "postgres://prisma_app_login:prisma_app_dev@localhost:5432/prisma_os_test";

/** Recria o schema do banco de testes e aplica todas as migrations. */
export default async function setup(): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_MIGRATION_URL });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("DROP SCHEMA IF EXISTS prisma_meta CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.end();
  const result = await migrate({ migrationUrl: TEST_MIGRATION_URL, appUrl: TEST_APP_URL });
  if (result.warnings.length) throw new Error(result.warnings.join("\n"));
}
