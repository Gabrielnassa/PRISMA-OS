import type { Metadata, Viewport } from "next";
// Fontes da interface, servidas pelo próprio sistema (sem chamadas externas).
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PRISMA OS", template: "%s · PRISMA OS" },
  description: "Central de operação de conteúdo para agências: clientes, criação, aprovação e exportação.",
  icons: { icon: "/icon.svg" },
};

// Segue o tema do sistema (claro ou escuro); as cores são as de --bg em globals.css.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f1011" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
