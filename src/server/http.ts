import "server-only";
import { NextResponse } from "next/server";
import { env } from "./env";
import { AppError, UnauthenticatedError, ForbiddenError, toUserMessage } from "./errors";
import { getAuth } from "./auth/next";
import type { AuthContext } from "./auth/types";

/** Autenticação para Route Handlers (mesma sessão por cookie). */
export async function apiAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new UnauthenticatedError();
  return auth;
}

/**
 * Proteção CSRF para rotas que alteram estado: exige Origin igual ao host
 * da aplicação (ou APP_URL). Server Actions já têm verificação equivalente do Next.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new ForbiddenError("Requisição sem origem identificável.");
  const originHost = new URL(origin).host;
  const allowed = new Set<string>();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) allowed.add(host);
  const appUrl = env().APP_URL;
  if (appUrl) allowed.add(new URL(appUrl).host);
  if (!allowed.has(originHost)) throw new ForbiddenError("Origem não autorizada.");
}

export function jsonError(err: unknown): NextResponse {
  if (!(err instanceof AppError)) {
    console.error(JSON.stringify({ level: "error", msg: "api.unexpected_error", error: (err as Error)?.message, stack: (err as Error)?.stack }));
  }
  const status = err instanceof AppError ? err.status : 500;
  const code = err instanceof AppError ? err.code : "internal_error";
  return NextResponse.json({ error: { code, message: toUserMessage(err) } }, { status });
}
