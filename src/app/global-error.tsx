"use client";

/**
 * Falhas no layout raiz ou no layout da aplicação (ex.: banco indisponível ao
 * verificar a sessão). Substitui o documento inteiro, então traz o próprio
 * <html>, <body> e estilos mínimos, sem depender do CSS global.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#0b0c0f", color: "#e8e8ec", fontFamily: "system-ui, sans-serif" }}>
        <title>Erro · PRISMA OS</title>
        <main role="alert" style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>O PRISMA OS está temporariamente indisponível</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "#b4b4bf", margin: 0 }}>
            A falha foi registrada{error.digest ? ` (código ${error.digest})` : ""}. Tente novamente em instantes; se persistir, avise o administrador.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: "1px solid #3a3a46", background: "#1a1a22", color: "#e8e8ec", fontSize: 14, cursor: "pointer" }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
