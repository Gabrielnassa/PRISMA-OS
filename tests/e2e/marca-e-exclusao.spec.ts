import { expect, test } from "@playwright/test";
import { login, png, shot } from "./helpers";

/**
 * Cores da marca sugeridas a partir do logotipo, exclusão de peças (em lote e
 * pela página da peça) e exclusão do cliente com confirmação pelo nome.
 * Roda depois da primeira entrega: só mexe no cliente que ela mesma cria.
 */
test("cores pelo logotipo, exclusão de peças e do cliente", async ({ page }) => {
  await login(page);
  await page.goto("/clientes");
  await page.getByLabel("Nome do cliente").fill("Café Aurora");
  await page.getByLabel("Segmento").fill("Cafeteria");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]+\?aba=marca/);
  const clientUrl = page.url().split("?")[0]!;
  const clientId = clientUrl.split("/").pop()!;

  // Logotipo laranja e verde-escuro sobre fundo branco (gerado localmente).
  await page.goto(`${clientUrl}?aba=arquivos`);
  await page.locator("#files").setInputFiles({
    name: "aurora.png",
    mimeType: "image/png",
    buffer: png(600, 300, '<rect width="600" height="300" fill="#ffffff"/><circle cx="150" cy="150" r="110" fill="#c2410c"/><rect x="300" y="110" width="260" height="80" fill="#14532d"/>'),
  });
  await page.getByLabel("Tipo").selectOption("logo");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("aurora.png: enviado")).toBeVisible();

  // Pelo @ só com a API oficial da Meta configurada; pela imagem funciona já.
  await page.goto(`${clientUrl}?aba=marca`);
  await expect(page.getByRole("button", { name: "Buscar cores" })).toBeDisabled();
  await expect(page.getByText(/conecte a API oficial da Meta/)).toBeVisible();
  await page.getByRole("button", { name: "Extrair cores (1)" }).click();
  await expect(page.getByText("1 imagem(ns) da biblioteca")).toBeVisible();
  await page.getByRole("button", { name: "Usar estas cores" }).click();
  await expect(page.getByText("Cores aplicadas abaixo.", { exact: false })).toBeVisible();
  await expect(page.locator("#c-primary")).toHaveValue(/^#c[0-9a-f]4[0-9a-f]0[0-9a-f]$/i);
  await expect(page.locator("#c-background")).toHaveValue("#ffffff");
  await shot(page, "08-cores-sugeridas");
  await page.getByRole("button", { name: "Salvar perfil da marca" }).click();
  await expect(page.getByText("Perfil da marca salvo.")).toBeVisible();

  // Três peças pelo template (sem IA: funciona também no build de produção).
  for (const title of ["Promoção de inverno", "Novo blend da casa", "Pão de queijo às sextas"]) {
    await page.goto(`/criar?cliente=${clientId}`);
    await expect(page.locator("#clientId")).toHaveValue(clientId);
    await page.getByLabel("Título interno da pauta").fill(title);
    await page.getByLabel("Briefing", { exact: true }).fill("Divulgar o cardápio de inverno com bebidas quentes e pães artesanais da casa.");
    await page.getByRole("button", { name: "Começar pelo template (sem IA)" }).click();
    await expect(page).toHaveURL(/\/conteudos\/[0-9a-f-]+$/);
  }

  // Pela página da peça: confirmação e volta para a lista.
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  // Confirmação na janela própria do sistema.
  await page.getByRole("dialog", { name: "Confirmação" }).getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(page).toHaveURL(/\/conteudos\?excluido=1$/);
  await expect(page.getByText("Conteúdo excluído")).toBeVisible();
  await expect(page.getByRole("link", { name: "Pão de queijo às sextas" })).toHaveCount(0);

  // Em lote, só as peças deste cliente; a confirmação fica na própria barra.
  await page.goto(`/conteudos?cliente=${clientId}`);
  await page.getByLabel("Selecionar todos desta página").check();
  await expect(page.getByText("2 selecionados")).toBeVisible();
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(page.getByText(/Excluir 2 conteúdos de vez\?/)).toBeVisible();
  await shot(page, "09-exclusao-em-lote");
  await page.getByRole("button", { name: "Sim, excluir" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 conteúdos excluídos." })).toBeVisible();
  await expect(page.getByText("Nenhum conteúdo encontrado")).toBeVisible();
  await page.goto("/conteudos");
  await expect(page.locator("main table a").first()).toBeVisible();

  // Cliente: lista o que será apagado e só libera com o nome digitado.
  await page.goto(clientUrl);
  await expect(page.getByText("Será apagado:")).toBeVisible();
  await expect(page.getByText("1 arquivo da biblioteca")).toBeVisible();
  const remove = page.getByRole("button", { name: "Excluir cliente definitivamente" });
  await expect(remove).toBeDisabled();
  const confirmation = page.getByLabel(/Para confirmar, digite/);
  await confirmation.fill("Café");
  await expect(remove).toBeDisabled();
  await confirmation.fill("café aurora");
  await expect(remove).toBeEnabled();
  await shot(page, "10-excluir-cliente");
  await remove.click();
  await expect(page).toHaveURL(/\/clientes\?excluido=1$/);
  await expect(page.getByText("Cliente excluído")).toBeVisible();
  await expect(page.getByRole("link", { name: "Café Aurora" })).toHaveCount(0);
  await page.goto(clientUrl);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});
