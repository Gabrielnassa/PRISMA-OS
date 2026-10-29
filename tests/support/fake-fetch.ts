/** `fetch` simulado por rotas (método + expressão regular na URL), com registro das chamadas. */
export interface FakeCall {
  method: string;
  url: URL;
  init: RequestInit;
}

export interface FakeReply {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export interface FakeRoute {
  method?: string;
  match: RegExp;
  reply: (url: URL, init: RequestInit, call: number) => FakeReply | Promise<FakeReply>;
}

export function fakeFetch(routes: FakeRoute[]): { fn: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const counts = new Map<FakeRoute, number>();
  const fn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, url, init });
    const route = routes.find((r) => (r.method ?? "GET") === method && r.match.test(url.href));
    if (!route) throw new Error(`fetch simulado sem rota: ${method} ${url.href}`);
    const n = (counts.get(route) ?? 0) + 1;
    counts.set(route, n);
    const out = await route.reply(url, init, n);
    const body = out.text ?? JSON.stringify(out.json ?? {});
    return new Response(body, { status: out.status ?? 200, headers: { "content-type": "application/json", ...out.headers } });
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

/** Corpo de um envio x-www-form-urlencoded ou multipart como objeto simples. */
export function bodyOf(init: RequestInit): Record<string, string> {
  const b = init.body;
  if (b instanceof URLSearchParams) return Object.fromEntries(b);
  if (b instanceof FormData) return Object.fromEntries([...b.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `[arquivo ${(v as File).type}]`]));
  if (typeof b === "string") {
    try {
      return JSON.parse(b) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return {};
}
