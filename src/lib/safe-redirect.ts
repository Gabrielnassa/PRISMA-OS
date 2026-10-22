/**
 * Destino interno seguro após o login. Recusa barras invertidas, caracteres de
 * controle e qualquer valor que, interpretado pelo navegador, saia da origem.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next.length > 500) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  try {
    const base = "http://prisma.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    if (url.pathname === "/login" || url.pathname.startsWith("/api/")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
