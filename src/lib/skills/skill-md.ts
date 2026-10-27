/**
 * Leitura e escrita do formato SKILL.md (o das skills do Claude): um bloco de
 * metadados entre linhas `---` (YAML com `name` e `description`) seguido das
 * instruções em Markdown. Só esses campos são usados; scripts e arquivos
 * extras de uma skill não são executados pelo PRISMA OS.
 */

export const SKILL_LIMITS = { name: 80, description: 500, instructions: 20000 } as const;

export interface ParsedSkillMd {
  name: string;
  description: string;
  instructions: string;
  warnings: string[];
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    const inner = v.slice(1, -1);
    return v.startsWith('"') ? inner.replace(/\\"/g, '"').replace(/\\n/g, "\n") : inner.replace(/''/g, "'");
  }
  return v;
}

/** YAML mínimo: `chave: valor`, valores entre aspas e blocos `|` / `>`. Chaves aninhadas são ignoradas. */
function parseFrontmatter(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const raw = m[2]!.replace(/\s+#.*$/, "");
    if (/^[|>][+-]?$/.test(raw.trim())) {
      const folded = raw.trim().startsWith(">");
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]!) || lines[i + 1]!.trim() === "")) {
        block.push(lines[++i]!.trim());
      }
      out[key] = folded ? block.join(" ").replace(/\s+/g, " ").trim() : block.join("\n").trim();
    } else {
      out[key] = unquote(raw);
    }
  }
  return out;
}

/** "brand-voice-writer" vira "Brand voice writer"; nomes com espaços ou acentos ficam como estão. */
function humanizeName(name: string): string {
  const n = name.trim();
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(n)) {
    const words = n.replace(/[-_]+/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return n;
}

function clip(value: string, max: number, label: string, warnings: string[]): string {
  if (value.length <= max) return value;
  warnings.push(`${label} tinha ${value.length} caracteres e foi cortado em ${max}.`);
  return value.slice(0, max);
}

export function parseSkillMd(text: string): ParsedSkillMd {
  const warnings: string[] = [];
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  let meta: Record<string, string> = {};
  let body = src;
  const lines = src.split("\n");
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end > 0) {
      meta = parseFrontmatter(lines.slice(1, end));
      body = lines.slice(end + 1).join("\n");
    } else {
      warnings.push("O bloco de metadados (---) não foi fechado; o arquivo inteiro virou instruções.");
    }
  } else {
    warnings.push("O arquivo não tem o bloco de metadados (---) com name e description; preencha o nome e a descrição.");
  }
  body = body.trim();
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? "";
  // `name` no padrão do Claude é um identificador (minúsculas e hífens); se o
  // título do corpo corresponde a ele, o título é o nome legível original.
  let name = meta.name ? (heading && skillSlug(heading) === meta.name.trim().toLowerCase() ? heading : humanizeName(meta.name)) : "";
  if (!name) name = heading;
  return {
    name: clip(name, SKILL_LIMITS.name, "O nome", warnings),
    description: clip(meta.description ?? "", SKILL_LIMITS.description, "A descrição", warnings),
    instructions: clip(body, SKILL_LIMITS.instructions, "As instruções", warnings),
    warnings,
  };
}

/** Nome de arquivo/identificador no padrão das skills do Claude (minúsculas, hífens). */
export function skillSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "skill"
  );
}

/** Gera um SKILL.md que pode ser importado de volta (aqui ou em outra ferramenta). */
export function toSkillMd(skill: { name: string; description: string; instructions: string }): string {
  const description = skill.description.replace(/\s+/g, " ").trim();
  return `---\nname: ${skillSlug(skill.name)}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${skill.name}\n\n${skill.instructions.trim()}\n`;
}
