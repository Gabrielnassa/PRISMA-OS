import { expect, test, type Page } from "@playwright/test";

/**
 * As 10 telas principais com os dados de demonstração. Datas e tempos
 * relativos (que mudam a cada dia) ficam mascarados; o resto precisa bater
 * com a referência. Para atualizar as referências: npm run capturas.
 */
const DEMO = { email: "demo@prisma.local", password: "demonstracao-123" };

const MESES = "janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";

function dynamic(page: Page) {
  return [
    page.getByText(/\d{2}\/\d{2}\/\d{4}/),
    page.getByText(/^(agora|ontem|há \d+ (min|h|dias))$/),
    page.getByText(/^(até|para) \d{2}\/\d{2}/),
    page.getByText(new RegExp(`(feira|sábado|domingo), \\d+ de (${MESES})`, "i")),
    page.getByText(new RegExp(`^(relatório de )?(${MESES}) de \\d{4}$`, "i")),
    page.locator("[data-calendario]"),
  ];
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(DEMO.email);
  await page.getByLabel("Senha").fill(DEMO.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function snap(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  // Textos que dependem da máquina (caminho da pasta de arquivos, tempo de resposta do banco)
  // mudam a quebra de linha: viram um texto fixo antes da foto.
  await page
    .locator("[data-ambiente]")
    .evaluateAll((els) => els.forEach((e) => (e.textContent = "Detalhe do ambiente")));
  // Dígitos de largura fixa: sem isso, a hora do dia muda a largura de uma data e, no celular, a
  // quebra de linha (e a altura da página) muda junto. As máscaras cobrem o texto, não o layout.
  await page.addStyleTag({
    content:
      "nextjs-portal{display:none!important} *{transition:none!important;font-variant-numeric:tabular-nums!important}",
  });
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask: dynamic(page) });
}

test("login", async ({ page }) => {
  await page.goto("/login");
  await snap(page, "01-login");
});

test.describe("telas com login", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("início", async ({ page }) => snap(page, "02-inicio"));

  test("clientes", async ({ page }) => {
    await page.goto("/clientes");
    await snap(page, "03-clientes");
  });

  test("cliente", async ({ page }) => {
    await page.goto("/clientes");
    await page.getByRole("link", { name: "Coli Loterias" }).first().click();
    await expect(page.getByRole("heading", { name: "Coli Loterias" })).toBeVisible();
    await snap(page, "04-cliente");
  });

  test("conteúdos", async ({ page }) => {
    await page.goto("/conteudos");
    await snap(page, "05-conteudos");
  });

  test("peça", async ({ page }) => {
    await page.goto("/conteudos?status=approved");
    await page.locator("main a[href^='/conteudos/']:visible").first().click();
    await expect(page).toHaveURL(/\/conteudos\/[0-9a-f-]+$/);
    await snap(page, "06-peca");
  });

  test("aprovações", async ({ page }) => {
    await page.goto("/aprovacoes");
    await snap(page, "07-aprovacoes");
  });

  test("calendário", async ({ page }) => {
    await page.goto("/calendario");
    await snap(page, "08-calendario");
  });

  test("publicações", async ({ page }) => {
    await page.goto("/publicacoes");
    await snap(page, "09-publicacoes");
  });

  test("integrações", async ({ page }) => {
    await page.goto("/integracoes");
    await snap(page, "10-integracoes");
  });
});
