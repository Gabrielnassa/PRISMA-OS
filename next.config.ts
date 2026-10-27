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

const nextConfig: NextConfig = {
  // Native/heavy server packages must not be bundled.
  serverExternalPackages: ["@resvg/resvg-js", "pg", "satori", "@shuding/opentype.js"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
      ...(publicHost ? { allowedOrigins: [publicHost] } : {}),
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
