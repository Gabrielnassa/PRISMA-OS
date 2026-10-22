import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://prisma_app_login:prisma_app_dev@localhost:5432/prisma_os_e2e",
  MIGRATION_DATABASE_URL: process.env.E2E_MIGRATION_DATABASE_URL ?? "postgres://prisma_owner:prisma_owner_dev@localhost:5432/prisma_os_e2e",
  STORAGE_LOCAL_DIR: process.env.E2E_STORAGE_DIR ?? "./.e2e-storage",
  AI_PROVIDER: "demo",
  APP_URL: `http://localhost:${PORT}`,
  WORKER_POLL_MS: "300",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } } : {}),
  },
  // E2E_PROD=1 testa o build de produção (rode `npm run build` antes).
  webServer: {
    command: process.env.E2E_PROD === "1" ? `npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: E2E_ENV,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } }, testIgnore: /responsive/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive/ },
  ],
});
