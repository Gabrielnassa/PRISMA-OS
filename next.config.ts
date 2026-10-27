import type { NextConfig } from "next";
import { extraAllowedHosts } from "./src/lib/allowed-origins";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Origens aceitas pelas Server Actions além do host da requisição (endereço
// público em APP_URL e o túnel do Codespaces): ver src/lib/allowed-origins.ts.
const allowedOrigins = extraAllowedHosts({ APP_URL: process.env.APP_URL, CODESPACE_NAME: process.env.CODESPACE_NAME });

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
