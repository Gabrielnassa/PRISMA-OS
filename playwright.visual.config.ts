import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV } from "./playwright.config";

/**
 * Comparação visual: 10 telas, desktop e celular, com os dados de
 * demonstração (npm run seed:demo) num build de produção. As referências
 * ficam em tests/visual/__snapshots__ e são geradas na imagem Docker do
 * Playwright (a mesma do CI), para não haver diferença só por fonte do
 * sistema: npm run capturas.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/visual",
  snapshotPathTemplate: "{testDir}/__snapshots__/{projectName}/{arg}{ext}",
  timeout: 120_000,
  expect: { timeout: 20_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", caret: "hide" } },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-visual" }]],
  globalSetup: "./tests/visual/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    colorScheme: "dark",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: { ...E2E_ENV, AI_PROVIDER: "none" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "celular", use: { ...devices["Pixel 7"] } },
  ],
});
