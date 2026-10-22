import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  appRoleGranted: string | null;
  warnings: string[];
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

/**
 * Aplica as migrations pendentes com o papel proprietário (MIGRATION_DATABASE_URL)
 * e concede o papel `prisma_app` ao usuário de login da aplicação (DATABASE_URL).
 * Cada arquivo roda em sua própria transação; checksums impedem edição de
 * migrations já aplicadas.
 */
export async function migrate(opts: { migrationUrl: string; appUrl?: string; log?: (msg: string) => void }): Promise<MigrationResult> {
  const log = opts.log ?? (() => undefined);
  const client = new pg.Client({ connectionString: opts.migrationUrl, application_name: "prisma-os-migrate" });
  await client.connect();
  const result: MigrationResult = { applied: [], skipped: [], appRoleGranted: null, warnings: [] };
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS prisma_meta");
    await client.query(`
      CREATE TABLE IF NOT EXISTS prisma_meta.schema_migrations (
        version    text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    // Serializa execuções concorrentes de migrations.
    await client.query("SELECT pg_advisory_lock(424242)");

    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const appliedRows = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM prisma_meta.schema_migrations",
    );
    const applied = new Map(appliedRows.rows.map((r) => [r.version, r.checksum]));

    for (const file of files) {
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const existing = applied.get(file);
      if (existing) {
        if (existing !== checksum) {
          throw new Error(`Migration ${file} foi alterada após aplicada (checksum divergente). Crie uma nova migration.`);
        }
        result.skipped.push(file);
        continue;
      }
      log(`Aplicando ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO prisma_meta.schema_migrations (version, checksum) VALUES ($1, $2)", [file, checksum]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Falha ao aplicar ${file}: ${(err as Error).message}`);
      }
      result.applied.push(file);
    }

    if (opts.appUrl) {
      const appUser = decodeURIComponent(new URL(opts.appUrl).username);
      const ownerUser = (await client.query<{ u: string }>("SELECT current_user AS u")).rows[0]?.u;
      if (!appUser) {
        result.warnings.push("DATABASE_URL não informa usuário; não foi possível conceder o papel prisma_app.");
      } else if (appUser === ownerUser) {
        result.warnings.push(
          "DATABASE_URL usa o mesmo usuário das migrations (dono das tabelas): o RLS NÃO se aplica a ele. Use um usuário de login separado.",
        );
      } else {
        await client.query(`GRANT prisma_app TO ${pg.escapeIdentifier(appUser)}`);
        result.appRoleGranted = appUser;
      }
    }
    await client.query("SELECT pg_advisory_unlock(424242)");
  } finally {
    await client.end();
  }
  return result;
}
