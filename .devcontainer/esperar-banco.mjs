// Espera o PostgreSQL do Codespace aceitar conexões (até 2 minutos).
// Com --uma-vez, tenta uma única vez (usado por verificar.sh).
import pg from "pg";

const umaVez = process.argv.includes("--uma-vez");
const fim = Date.now() + (umaVez ? 0 : 120_000);
for (;;) {
  const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL, connectionTimeoutMillis: 5000 });
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
