/**
 * Regenera as referências da comparação visual e copia as capturas para
 * docs/img/telas, dentro da imagem Docker do Playwright (a mesma do CI).
 * Requer Docker, o PostgreSQL local (bancos de teste) e `npm run build`.
 *
 *   npm run capturas            → docs/img/telas
 *   npm run capturas -- antes   → docs/img/antes (o "antes" de um redesenho)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "node_modules/@playwright/test/package.json"), "utf8"));
const image = `mcr.microsoft.com/playwright:v${pkg.version}-noble`;
if (!fs.existsSync(path.join(root, ".next/BUILD_ID"))) {
  console.error("Rode npm run build antes.");
  process.exit(1);
}
execFileSync(
  "docker",
  [
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
    image,
    "npx",
    "playwright",
    "test",
    "-c",
    "playwright.visual.config.ts",
    "--update-snapshots",
  ],
  { stdio: "inherit" },
);
const from = path.join(root, "tests/visual/__snapshots__");
const folder = /^[a-z0-9-]{1,40}$/.test(process.argv[2] ?? "") ? process.argv[2] : "telas";
const to = path.join(root, "docs/img", folder);
for (const project of fs.readdirSync(from)) {
  fs.mkdirSync(path.join(to, project), { recursive: true });
  for (const f of fs.readdirSync(path.join(from, project)))
    fs.copyFileSync(path.join(from, project, f), path.join(to, project, f));
}
console.log(`Capturas atualizadas em ${path.relative(root, to)}`);
