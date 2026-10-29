import { expect, test } from "@playwright/test";
import { login, png, shot } from "./helpers";

/**
 * Pacote mensal → linha editorial (IA em desenvolvimento; sem IA no build de
 * produção, onde o modo demonstração é bloqueado) → aprovação → peças criadas
 * com a foto do cliente → vídeo marcado como feito.
 */
test("linha editorial do mês: do pacote às peças", async ({ page }) => {
  const prod = process.env.E2E_PROD === "1";
  await login(page);
  await page.goto("/clientes");
  await page.getByLabel("Nome do cliente").fill("Coli Loterias");
  await page.getByLabel("Segmento").fill("Loterias");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]+\?aba=marca/);
  const clientUrl = page.url().split("?")[0]!;

  await page.goto(`${clientUrl}?aba=arquivos`);
  await page.locator("#files").setInputFiles({ name: "loja.png", mimeType: "image/png", buffer: png(1200, 1200, '<rect width="1200" height="1200" fill="#1e3a8a"/><circle cx="600" cy="600" r="300" fill="#facc15"/>') });
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("loja.png: enviado")).toBeVisible();
  // Sem conta de serviço do Google: a pasta pode ser ligada, a importação explica o que falta.
  await expect(page.getByText("O Google Drive ainda não está conectado")).toBeVisible();

  await page.goto(`${clientUrl}?aba=editorial`);
  await expect(page.getByText("Defina o pacote mensal do cliente")).toBeVisible();
  await page.getByLabel("Carrosséis").fill("2");
  await page.getByLabel("Vídeos").fill("1");
  await page.getByRole("button", { name: "Salvar pacote" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pacote salvo." })).toBeVisible();
  await expect(page.getByText("3 peças", { exact: true })).toBeVisible();

  if (prod) {
    await expect(page.getByRole("button", { name: "Propor pautas com IA" })).toBeDisabled();
    await page.getByRole("button", { name: "Montar manualmente" }).click();
    await expect(page.getByRole("status").filter({ hasText: "3 espaços criados pelo pacote" })).toBeVisible();
    // Pautas em branco: completar as duas que viram peça.
    for (let i = 0; i < 2; i++) {
      const blankCarousel = page.locator("main li").filter({ hasText: "Carrossel" }).filter({ hasText: "Pauta a definir" }).first();
      await blankCarousel.getByRole("button", { name: "Editar" }).click();
      const item = page.locator("li").filter({ has: page.getByRole("button", { name: "Salvar pauta" }) });
      await item.getByLabel("Título").fill(`Bolão da semana ${i + 1}`);
      await item.getByLabel("Briefing").fill("Explicar como entrar no bolão da loja, com horário de atendimento e endereço.");
      await item.getByRole("button", { name: "Salvar pauta" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Pauta salva." }).first()).toBeVisible();
    }
  } else {
    await page.getByLabel("Tema ou pedidos do mês (opcional)").fill("Bolão da Mega da Virada. Conheça a equipe da loja.");
    await page.getByRole("button", { name: "Propor pautas com IA" }).click();
    await expect(page.getByRole("status").filter({ hasText: "3 pautas propostas em modo de demonstração" })).toBeVisible();
  }
  await shot(page, "11-linha-editorial");

  await page.getByRole("button", { name: "Aprovar e criar peças" }).click();
  await page.getByRole("dialog", { name: "Confirmação" }).getByRole("button", { name: "Aprovar e criar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 peças enviadas para criação. 1 vídeo fica para marcar quando feito." })).toBeVisible();
  await expect(page.getByText("Virou peça")).toHaveCount(2);

  await page.getByRole("button", { name: "Marcar feito" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marcado como feito." })).toBeVisible();
  await expect(page.getByText("3 de 3")).toBeVisible();

  await page.goto(`${clientUrl}?aba=conteudos`);
  await expect(page.locator("main table a")).toHaveCount(2);

  // Calendário do mês com as 3 pautas, e o painel com o andamento do pacote.
  await page.goto("/calendario");
  await expect(page.getByRole("link", { name: /Coli Loterias/ })).toHaveCount(3);
  await shot(page, "12-calendario");
  await page.goto("/");
  await expect(page.getByText("Linha editorial aprovada")).toBeVisible();
  await expect(page.getByText("3 de 3")).toBeVisible();
});
