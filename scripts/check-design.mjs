/**
 * Trava do sistema visual (docs/design/SISTEMA.md), rodada no `npm run lint`.
 * Em src/app e src/components, recusa classes fora do sistema:
 * tamanhos avulsos, fonte de vitrine, pílulas, raios fora de 4 e 6 px, cores
 * diretas do Tailwind e hexadecimal em classe.
 *
 *   node scripts/check-design.mjs           confere os arquivos
 */
import fs from "node:fs";
import path from "node:path";

const COLORS =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|ink|iris|ember";
const PROPS = "bg|text|border|ring|divide|fill|stroke|outline|accent|placeholder|decoration|from|via|to|shadow|caret";

const RULES = [
  {
    re: /(?<![\w-])text-\[/,
    msg: "tamanho avulso; use text-xs, text-sm, text-base, text-md ou text-lg",
  },
  { re: /(?<![\w-])text-(?:xl|[2-9]xl)(?![\w-])/, msg: "só existem cinco tamanhos (xs, sm, base, md, lg)" },
  { re: /(?<![\w-])font-display(?![\w-])/, msg: "fonte de vitrine; a interface usa só font-sans e font-mono" },
  {
    re: /(?<![\w-])rounded-(?:lg|xl|2xl|3xl|card|\[)/,
    msg: "raio fora do sistema; use rounded-sm (4 px) ou rounded-md (6 px, menu e diálogo)",
  },
  {
    re: new RegExp(`(?<![\\w-])(?:${PROPS})-(?:${COLORS})-\\d`),
    msg: "cor direta; use os tokens (fg, muted, faint, line, control, surface, accent, danger, warn, ok)",
  },
  { re: /(?<![\w-])[a-z-]+-\[#[0-9a-fA-F]{3,8}\]/, msg: "hexadecimal em classe; use os tokens" },
];

/** rounded-full só em elemento quadrado (size-*): avatar, ponto de estado, interruptor. */
const PILL = /(?<![\w-])rounded-full(?![\w-])/;

/** Erros de um arquivo: [{ line, msg, text }]. Linhas de comentário são ignoradas. */
export function checkSource(source) {
  const errors = [];
  source.split("\n").forEach((text, i) => {
    const t = text.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    for (const r of RULES) if (r.re.test(text)) errors.push({ line: i + 1, msg: r.msg, text: t });
    if (PILL.test(text) && !/(?<![\w-])size-/.test(text))
      errors.push({
        line: i + 1,
        msg: "pílula; rounded-full só em elemento quadrado (size-*): avatar, ponto de estado e interruptor",
        text: t,
      });
  });
  return errors;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (isMain) {
  const root = path.resolve(import.meta.dirname, "..");
  let total = 0;
  for (const dir of ["src/app", "src/components"]) {
    for (const file of walk(path.join(root, dir))) {
      for (const e of checkSource(fs.readFileSync(file, "utf8"))) {
        total++;
        console.error(`${path.relative(root, file)}:${e.line}  ${e.msg}\n    ${e.text.slice(0, 160)}`);
      }
    }
  }
  if (total) {
    console.error(`\ncheck-design: ${total} problema(s). Regras em docs/design/SISTEMA.md.`);
    process.exit(1);
  }
  console.log("check-design: tudo dentro do sistema visual.");
}
