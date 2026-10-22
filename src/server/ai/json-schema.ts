import { z } from "zod";

/**
 * Converte um esquema Zod no subconjunto de JSON Schema aceito pela saída
 * estruturada da API (tipos, propriedades, `required`, `items`, `enum`,
 * `const`, `anyOf`, `additionalProperties: false`). Restrições não suportadas
 * (tamanhos, mínimos e máximos) saem do esquema enviado e continuam valendo na
 * validação Zod feita depois da resposta. Diferente do utilitário do SDK,
 * preserva `enum`, para que a IA não invente valores fora da lista.
 */
const KEEP = new Set(["type", "properties", "required", "items", "enum", "const", "anyOf", "description", "format"]);
const FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

function strict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strict);
  if (!node || typeof node !== "object") return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (!KEEP.has(key)) continue;
    if (key === "format" && !FORMATS.has(String(value))) continue;
    if (key === "properties") {
      out.properties = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, strict(v)]));
    } else if (key === "items" || key === "anyOf") {
      out[key] = strict(value);
    } else {
      out[key] = value;
    }
  }
  if (src.type === "object" || "properties" in src) out.additionalProperties = false;
  // Listas: apenas minItems 0 ou 1 é aceito; o restante é validado pelo Zod.
  if (src.type === "array" && (src.minItems === 0 || src.minItems === 1)) out.minItems = src.minItems;
  return out;
}

export function toOutputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Record<string, unknown>;
  return strict(json) as Record<string, unknown>;
}
