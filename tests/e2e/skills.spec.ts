import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const SKILL_MD = `---
name: legendas-da-padaria
description: "Três legendas para posts de padaria, com chamada para pedido."
---

# Legendas da padaria

Escreva 3 opções de legenda curtas, com chamada para encomenda pelo WhatsApp.
`;

/**
 * Skills da agência: importar um SKILL.md, executar para um cliente (provedor
 * de demonstração), ver o histórico, transformar o resultado em briefing de uma
 * peça, editar (nova versão) e baixar o SKILL.md.
 */
test("skills da agência: importar, executar, histórico, versão e virar peça", async ({ page }) => {
  await login(page);
  await page.goto("/clientes");
  await page.getByLabel("Nome do cliente").fill("Padaria Fermento");
  await page.getByLabel("Segmento").fill("Alimentação");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]+\?aba=marca/);
  const clientId = page.url().split("?")[0]!.split("/").pop()!;

  // Importar SKILL.md: preenche o formulário, nada é salvo antes de clicar.
  await page.goto("/skills");
  await page.getByRole("link", { name: "Nova skill" }).first().click();
  await expect(page).toHaveURL(/\/skills\/nova$/);
  await page.locator("#skill-file").setInputFiles({ name: "SKILL.md", mimeType: "text/markdown", buffer: Buffer.from(SKILL_MD) });
  await expect(page.getByText("SKILL.md importado. Revise os campos abaixo e salve.")).toBeVisible();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Legendas da padaria");
  await expect(page.getByLabel("Descrição")).toHaveValue("Três legendas para posts de padaria, com chamada para pedido.");
  await expect(page.getByLabel("Instruções")).toHaveValue(/chamada para encomenda pelo WhatsApp/);
  await page.getByRole("button", { name: "Criar skill" }).click();
  await expect(page).toHaveURL(/\/skills\/[0-9a-f-]+\?nova=1$/);
  const skillUrl = page.url().split("?")[0]!;
  await expect(page.getByText("importada de SKILL.md")).toBeVisible();

  // Build de produção (E2E_PROD=1): o provedor de demonstração é bloqueado, então
  // sem chave da IA o botão fica desativado e a tela explica o motivo.
  if (process.env.E2E_PROD === "1") {
    await expect(page.getByText("Para executar skills, configure a chave da Anthropic.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Executar skill" })).toBeDisabled();
  } else {
    // Executar: o resultado aparece com copiar e criar peça.
    await page.getByLabel("Cliente").selectOption({ label: "Padaria Fermento" });
    await page.getByLabel("Pedido").fill("Promoção do pão de queijo às sextas-feiras.");
    await page.getByRole("button", { name: "Executar skill" }).click();
    await expect(page.getByText("Resultado de demonstração (sem IA).")).toBeVisible();
    await expect(page.getByText(/Pedido recebido:\s*Promoção do pão de queijo às sextas-feiras\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar" })).toBeVisible();

    // O resultado vira briefing de uma peça, já no cliente certo.
    await page.getByRole("link", { name: "Criar peça com este texto" }).click();
    await expect(page).toHaveURL(/\/criar\?de=/);
    await expect(page.getByLabel("Briefing")).toHaveValue(/Promoção do pão de queijo às sextas-feiras\./);
    await expect(page.locator("#clientId")).toHaveValue(clientId);

    // Histórico
    await page.goto(`${skillUrl}?aba=historico`);
    await page.getByText("Promoção do pão de queijo às sextas-feiras.").first().click();
    await expect(page.getByText("concluída")).toBeVisible();
  }

  // Editar cria a versão 2; a 1 continua guardada.
  await page.goto(`${skillUrl}?aba=editar`);
  await page.getByLabel("Instruções").fill("Escreva 3 opções de legenda curtas, com chamada para encomenda pelo WhatsApp. Use no máximo 2 emojis.");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Skill salva (versão 2).")).toBeVisible();
  await page.goto(`${skillUrl}?aba=versoes`);
  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  await expect(page.getByText("v1", { exact: true })).toBeVisible();

  // SKILL.md para baixar (pode ser importado de volta).
  const res = await page.request.get(`/api/skills/${skillUrl.split("/").pop()}/skill-md`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("legendas-da-padaria-v2.SKILL.md");
  const md = await res.text();
  expect(md).toContain("name: legendas-da-padaria");
  expect(md).toContain("Use no máximo 2 emojis.");

  // Na lista
  await page.goto("/skills");
  await expect(page.getByRole("link", { name: /Legendas da padaria/ })).toBeVisible();
});
