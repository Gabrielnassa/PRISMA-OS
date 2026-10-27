import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Endereço público da aplicação. Atrás de um proxy que reescreve o host (ex.:
// GitHub Codespaces), as Server Actions só aceitam a origem declarada aqui.
const publicHost = (() => {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
  } catch {
    return null;
  }
})();
// O túnel de portas do Codespaces faz o contrário: põe o endereço público em
// x-forwarded-host e troca o Origin por localhost:3000. Só vale dentro de um
// Codespace (a porta é privada e o cookie de sessão é SameSite=Lax).
const allowedOrigins = [
  ...(publicHost ? [publicHost] : []),
  ...(process.env.CODESPACE_NAME ? ["localhost:3000"] : []),
];

const nextConfig: NextConfig = {
  // Native/heavy server packages must not be bundled.
  serverExternalPackages: ["@resvg/resvg-js", "pg", "satori", "@shuding/opentype.js"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
      ...(allowedOrigins.length ? { allowedOrigins } : {}),
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
