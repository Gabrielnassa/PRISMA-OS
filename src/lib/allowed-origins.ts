/**
 * Hosts aceitos no cabeçalho Origin de requisições que alteram estado, além do
 * próprio host da requisição. Usado pelas Server Actions (next.config.ts) e
 * pelas rotas de API (assertSameOrigin), para as duas seguirem a mesma regra.
 *
 * - APP_URL: endereço público atrás de um proxy que reescreve o host.
 * - GitHub Codespaces: o túnel de portas manda o endereço público em
 *   x-forwarded-host e troca o Origin por localhost:3000. Só vale dentro de um
 *   Codespace (a porta é privada por padrão e o cookie de sessão é SameSite=Lax).
 */
export function extraAllowedHosts(vars: { APP_URL?: string; CODESPACE_NAME?: string }): string[] {
  const hosts: string[] = [];
  if (vars.APP_URL) {
    try {
      hosts.push(new URL(vars.APP_URL).host);
    } catch {
      // APP_URL inválida é recusada pela validação de configuração da aplicação.
    }
  }
  if (vars.CODESPACE_NAME) hosts.push("localhost:3000");
  return hosts;
}
