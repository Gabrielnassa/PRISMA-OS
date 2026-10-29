"use client";

/**
 * Falhas no layout raiz ou no layout da aplicação (ex.: banco indisponível ao
 * verificar a sessão). Substitui o documento inteiro, então traz o próprio
 * <html>, <body> e estilos mínimos, sem depender do CSS global.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#090a0c", color: "#e5e5e7", fontFamily: "Inter, system-ui, sans-serif" }}>
        <title>Erro · PRISMA OS</title>
        <main role="alert" style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontFamily: "Sora, Inter, system-ui, sans-serif", fontWeight: 500, fontSize: 28, lineHeight: 1.2, letterSpacing: "-0.03em", margin: "0 0 10px", color: "#ffffff" }}>O PRISMA OS está temporariamente indisponível</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "#a3a9b6", margin: 0 }}>
            A falha foi registrada{error.digest ? ` (código ${error.digest})` : ""}. Tente novamente em instantes; se persistir, avise o administrador.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, padding: "8px 14px", borderRadius: 999, border: "1px solid #4a4b50", background: "transparent", color: "#ffffff", fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
