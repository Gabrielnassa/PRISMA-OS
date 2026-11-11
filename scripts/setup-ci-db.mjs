/**
 * Prepara o PostgreSQL do CI (ou de um contêiner novo): papéis e bancos de
 * teste, como o scripts/setup-local-db.sh, mas sem precisar do psql.
 * Conecta como superusuário em PGSUPERUSER_URL
 * (padrão: postgres://postgres:postgres@localhost:5432/postgres).
 * As senhas são as de desenvolvimento; nunca use em produção.
 */
import pg from "pg";

const url = process.env.PGSUPERUSER_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const [role, extra, password] of [
    ["prisma_owner", "CREATEROLE", "prisma_owner_dev"],
    ["prisma_app_login", "", "prisma_app_dev"],
  ]) {
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (!exists.rowCount) await client.query(`CREATE ROLE ${role} LOGIN ${extra} PASSWORD '${password}'`);
  }
  for (const db of ["prisma_os", "prisma_os_test", "prisma_os_e2e"]) {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!exists.rowCount) await client.query(`CREATE DATABASE ${db} OWNER prisma_owner`);
  }
  console.log("Papéis e bancos de teste prontos.");
} finally {
  await client.end();
}
