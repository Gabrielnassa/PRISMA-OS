/**
 * Cria a organização e o primeiro administrador (proprietário).
 * Uso: npm run admin:create -- --org "Minha Agência" --name "Nome" --email email@dominio.com
 * A senha é lida da variável ADMIN_PASSWORD ou solicitada no terminal (não ecoada).
 */
import { loadDotEnv } from "./load-env";
import { askNewPassword } from "./prompt";

loadDotEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const org = arg("org");
const name = arg("name");
const email = arg("email");
if (!org || !name || !email) {
  console.error('Uso: npm run admin:create -- --org "Agência" --name "Seu Nome" --email voce@dominio.com');
  process.exit(1);
}
// ADMIN_PASSWORD vazia vale como não informada: a senha é pedida (duas vezes) no terminal.
const password = process.env.ADMIN_PASSWORD || (await askNewPassword());

const { createOrganizationWithOwner } = await import("../src/server/services/organizations");
const { closePool } = await import("../src/server/db/pool");
try {
  const r = await createOrganizationWithOwner({ organizationName: org, ownerName: name, ownerEmail: email, password });
  console.log(`Organização criada (${r.organizationId}). Proprietário: ${email}`);
} catch (err) {
  console.error(`Não foi possível criar: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
