import { migrate } from "../src/server/db/migrate";
import { loadDotEnv } from "./load-env";

loadDotEnv();

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (!migrationUrl) {
  console.error("Defina MIGRATION_DATABASE_URL (usuário proprietário do schema) para executar as migrations.");
  process.exit(1);
}

migrate({ migrationUrl, appUrl: process.env.DATABASE_URL, log: (m) => console.log(m) })
  .then((r) => {
    console.log(`Migrations aplicadas: ${r.applied.length ? r.applied.join(", ") : "nenhuma"} (já aplicadas: ${r.skipped.length})`);
    if (r.appRoleGranted) console.log(`Papel prisma_app concedido a "${r.appRoleGranted}".`);
    for (const w of r.warnings) console.warn(`AVISO: ${w}`);
  })
  .catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
