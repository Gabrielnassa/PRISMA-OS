import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "../env";
import { resolveSession, SESSION_COOKIE } from "./service";
import type { AuthContext } from "./types";

/** Sessão da requisição atual (memoizada por requisição). */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(token);
});

/**
 * Exige sessão. Quem está com senha temporária só pode trocá-la ou sair
 * (`allowPasswordChange` é usado apenas por essas duas ações).
 */
export async function requireAuth(opts: { allowPasswordChange?: boolean } = {}): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.mustChangePassword && !opts.allowPasswordChange) redirect("/trocar-senha");
  return auth;
}

/**
 * IP do cliente para limite de tentativas e auditoria. Cabeçalhos de proxy só
 * são aceitos com TRUST_PROXY=true; nesse caso vale a entrada mais à direita de
 * X-Forwarded-For (a adicionada pelo proxy confiável), nunca a enviada pelo cliente.
 */
export function clientIpFrom(h: Pick<Headers, "get">, trustProxy: boolean): string | null {
  if (!trustProxy) return null;
  const xff = h.get("x-forwarded-for");
  const last = xff?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  const ip = last || h.get("x-real-ip")?.trim() || null;
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
}

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIpFrom(h, env().TRUST_PROXY), userAgent: h.get("user-agent") };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
