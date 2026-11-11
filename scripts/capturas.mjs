/**
 * Comparação visual nas mesmas condições do CI: o navegador da imagem Docker
 * do Playwright e um PostgreSQL 16.4 da imagem oficial (a ordenação de texto
 * do banco muda a ordem das listas, então o banco local não serve de base).
 * Requer Docker e `npm run build`.
 *
 *   npm run capturas            → regenera as referências e copia para docs/img/telas
 *   npm run capturas -- antes   → idem, para docs/img/antes (o "antes" de um redesenho)
 *   npm run capturas -- --conferir   → só compara com as referências (o que o CI faz)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "node_modules/@playwright/test/package.json"), "utf8"));
const image = `mcr.microsoft.com/playwright:v${pkg.version}-noble`;
const check = process.argv.includes("--conferir");
const folderArg = process.argv.slice(2).find((a) => /^[a-z0-9-]{1,40}$/.test(a));
if (!fs.existsSync(path.join(root, ".next/BUILD_ID"))) {
  console.error("Rode npm run build antes.");
  process.exit(1);
}

const DB = "prisma-capturas-db";
const PORT = process.env.CAPTURAS_DB_PORT ?? "55432";
const docker = (args, opts = {}) => execFileSync("docker", args, { stdio: "inherit", ...opts });
const quiet = (args) => {
  try {
    execFileSync("docker", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

quiet(["rm", "-f", DB]);
docker(
  ["run", "-d", "--name", DB, "-e", "POSTGRES_PASSWORD=postgres", "-p", `127.0.0.1:${PORT}:5432`, "postgres:16.4"],
  {
    stdio: "ignore",
  },
);
try {
  // A imagem do Postgres sobe, reinicia uma vez e só então aceita conexões pela rede.
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = quiet(["exec", DB, "psql", "-U", "postgres", "-h", "127.0.0.1", "-c", "select 1"]);
    if (!ready) execFileSync("sleep", ["1"]);
  }
  if (!ready) throw new Error("O PostgreSQL das capturas não ficou pronto.");
  const dbEnv = {
    PGSUPERUSER_URL: `postgres://postgres:postgres@localhost:${PORT}/postgres`,
    E2E_DATABASE_URL: `postgres://prisma_app_login:prisma_app_dev@localhost:${PORT}/prisma_os_e2e`,
    E2E_MIGRATION_DATABASE_URL: `postgres://prisma_owner:prisma_owner_dev@localhost:${PORT}/prisma_os_e2e`,
  };
  execFileSync("node", [path.join(root, "scripts/setup-ci-db.mjs")], {
    stdio: "inherit",
    env: { ...process.env, ...dbEnv },
  });
  docker([
    "run",
    "--rm",
    "--network",
    "host",
    "--ipc",
    "host",
    "-v",
    `${root}:/work`,
    "-w",
    "/work",
    "-e",
    "E2E_PORT",
    "-e",
    `E2E_DATABASE_URL=${dbEnv.E2E_DATABASE_URL}`,
    "-e",
    `E2E_MIGRATION_DATABASE_URL=${dbEnv.E2E_MIGRATION_DATABASE_URL}`,
    image,
    "npx",
    "playwright",
    "test",
    "-c",
    "playwright.visual.config.ts",
    ...(check ? [] : ["--update-snapshots"]),
  ]);
} finally {
  quiet(["rm", "-f", DB]);
}

if (!check) {
  const from = path.join(root, "tests/visual/__snapshots__");
  const to = path.join(root, "docs/img", folderArg ?? "telas");
  for (const project of fs.readdirSync(from)) {
    fs.mkdirSync(path.join(to, project), { recursive: true });
    for (const f of fs.readdirSync(path.join(from, project)))
      fs.copyFileSync(path.join(from, project, f), path.join(to, project, f));
  }
  console.log(`Capturas atualizadas em ${path.relative(root, to)}`);
}
