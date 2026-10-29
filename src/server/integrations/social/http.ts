import { IntegrationError } from "../../errors";

/**
 * Chamadas HTTP às APIs das redes. Os testes trocam o `fetch` por um simulado
 * (setSocialFetch); nada aqui fala com a rede de outro jeito.
 */
let override: typeof fetch | undefined;

export function setSocialFetch(f: typeof fetch | undefined): void {
  override = f;
}

export async function socialFetch(url: string, init: RequestInit & { timeoutMs?: number; network: string }): Promise<Response> {
  const { timeoutMs = 30_000, network, ...rest } = init;
  try {
    return await (override ?? fetch)(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new IntegrationError(`Não foi possível falar com ${network} (rede ou tempo esgotado). Uma nova tentativa é feita em instantes.`, true, { cause: err, providerCode: "network" });
  }
}

export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text.slice(0, 500) } as T;
  }
}

export function form(data: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) if (v !== undefined) p.set(k, String(v));
  return p;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
