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

/**
 * Variante para a saída estruturada da OpenAI em modo estrito: todo campo de
 * objeto precisa constar em `required`. Campos opcionais passam a aceitar
 * `null`, e `nullsToUndefined` desfaz isso antes da validação Zod.
 */
export function toOpenAiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return requireAll(toOutputJsonSchema(schema)) as Record<string, unknown>;
}

function requireAll(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(requireAll);
  if (!node || typeof node !== "object") return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  if (src.items) out.items = requireAll(src.items);
  if (src.anyOf) out.anyOf = requireAll(src.anyOf);
  if (src.properties) {
    const required = new Set((src.required as string[] | undefined) ?? []);
    const props = src.properties as Record<string, unknown>;
    out.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => {
        const inner = requireAll(v) as Record<string, unknown>;
        if (required.has(k)) return [k, inner];
        const options = Array.isArray(inner.anyOf) ? inner.anyOf : [inner];
        return [k, { anyOf: [...options, { type: "null" }] }];
      }),
    );
    out.required = Object.keys(props);
  }
  return out;
}

/** Remove chaves com `null` (campos opcionais devolvidos vazios pela OpenAI). */
export function nullsToUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(nullsToUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, nullsToUndefined(v)]),
  );
}
