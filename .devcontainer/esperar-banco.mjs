// Espera o PostgreSQL do Codespace aceitar conexões (até 2 minutos).
import pg from "pg";

const fim = Date.now() + 120_000;
for (;;) {
  const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    await c.connect();
    await c.end();
    break;
  } catch (err) {
    if (Date.now() > fim) {
      console.error(`O banco não respondeu: ${err.message}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
