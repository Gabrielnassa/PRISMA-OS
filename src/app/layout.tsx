import type { Metadata, Viewport } from "next";
// Fontes da interface, servidas pelo próprio sistema (sem chamadas externas).
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/sora/latin-400.css";
import "@fontsource/sora/latin-500.css";
import "@fontsource/sora/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PRISMA OS", template: "%s · PRISMA OS" },
  description: "Central de operação de conteúdo para agências: clientes, criação, aprovação e exportação.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#090a0c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
