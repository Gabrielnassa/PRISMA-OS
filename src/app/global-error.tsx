"use client";

/**
 * Falhas no layout raiz ou no layout da aplicação (ex.: banco indisponível ao
 * verificar a sessão). Substitui o documento inteiro, então traz o próprio
 * <html>, <body> e estilos mínimos, sem depender do CSS global.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0f1011",
          color: "#e8e9eb",
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        }}
      >
        <title>Erro · PRISMA OS</title>
        <main role="alert" style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1
            style={{
              fontWeight: 600,
              fontSize: 20,
              lineHeight: "28px",
              margin: "0 0 8px",
              color: "#e8e9eb",
            }}
          >
            O PRISMA OS está temporariamente indisponível
          </h1>
          <p style={{ fontSize: 13, lineHeight: "20px", color: "#9b9ea4", margin: 0 }}>
            A falha foi registrada{error.digest ? ` (código ${error.digest})` : ""}. Tente novamente em instantes; se
            persistir, avise o administrador.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              height: 32,
              padding: "0 12px",
              borderRadius: 4,
              border: "1px solid #62656c",
              background: "transparent",
              color: "#e8e9eb",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
