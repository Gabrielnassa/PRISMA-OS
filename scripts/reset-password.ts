/**
 * Define uma nova senha para uma conta (operação local, no terminal do servidor).
 * Uso: npm run user:reset-password -- --email email@dominio.com
 * A senha é lida da variável NEW_PASSWORD ou solicitada no terminal (duas vezes, sem eco).
 */
import { loadDotEnv } from "./load-env";
import { askNewPassword } from "./prompt";

loadDotEnv();

const i = process.argv.indexOf("--email");
const email = i >= 0 ? process.argv[i + 1] : undefined;
if (!email) {
  console.error("Uso: npm run user:reset-password -- --email voce@dominio.com");
  process.exit(1);
}
const password = process.env.NEW_PASSWORD || (await askNewPassword());

const { operatorResetPassword } = await import("../src/server/auth/service");
const { closePool } = await import("../src/server/db/pool");
try {
  if (await operatorResetPassword(email, password)) {
    console.log(`Senha de ${email} redefinida. As sessões abertas foram encerradas.`);
  } else {
    console.error(`Nenhuma conta com o e-mail ${email}.`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`Não foi possível redefinir: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
