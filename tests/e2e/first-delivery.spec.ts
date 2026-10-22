import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { login, png, shot } from "./helpers";

/**
 * Teste de aceitação da primeira entrega (seções 27 e 30): cadastrar cliente,
 * configurar a marca, pedir conteúdo, gerar texto, criar carrossel, editar,
 * verificar qualidade, aprovar a versão exata, exportar e consultar o histórico.
 */
test("ciclo completo: briefing → texto → arte → revisão → aprovação → exportação", async ({ page }) => {
  await login(page);
  await shot(page, "01-dashboard-vazio");

  // 1. Cliente
  await page.goto("/clientes");
  await page.getByLabel("Nome do cliente").fill("Clínica Bem Viver");
  await page.getByLabel("Segmento").fill("Saúde");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]+\?aba=marca/);
  const clientUrl = page.url().split("?")[0]!;

  // 2. Arquivos: logotipo e foto real (gerados localmente)
  await page.goto(`${clientUrl}?aba=arquivos`);
  await page.locator("#files").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png(600, 200, '<rect width="600" height="200" fill="#0f766e"/><circle cx="100" cy="100" r="60" fill="#ffffff"/>') });
  await page.getByLabel("Tipo").selectOption("logo");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("logo.png: enviado")).toBeVisible();
  await page.locator("#files").setInputFiles({ name: "equipe.png", mimeType: "image/png", buffer: png(1400, 1400, '<rect width="1400" height="1400" fill="#7d8f99"/><circle cx="700" cy="560" r="300" fill="#e8dccb"/><rect x="300" y="900" width="800" height="400" rx="40" fill="#3f4b52"/>') });
  await page.getByLabel("Tipo").selectOption("image");
  await page.getByLabel("Descrição (texto alternativo)").fill("Equipe da clínica na recepção");
  await page.getByLabel("Origem / licença").fill("Foto própria do cliente");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("equipe.png: enviado")).toBeVisible();
  await shot(page, "02-arquivos");

  // 3. Perfil da marca
  await page.goto(`${clientUrl}?aba=marca`);
  await page.getByLabel("Público-alvo").fill("Famílias do bairro que buscam atendimento próximo e humano.");
  await page.getByLabel("Proposta de valor").fill("Atendimento acolhedor com agenda flexível.");
  await page.getByLabel("Tom de voz").fill("Acolhedor, claro e sem jargão técnico.");
  await page.getByLabel("Termos proibidos").fill("milagre, cura garantida");
  await page.locator("#c-primary").fill("#0f766e");
  await page.locator("#c-accent").fill("#b45309");
  await page.locator("#c-background").fill("#f8fafc");
  await page.locator("#c-text").fill("#0f172a");
  await page.getByLabel("Fonte dos títulos").selectOption("nunito");
  await page.getByLabel("Logotipo").selectOption({ label: "logo.png (logotipo)" });
  await page.getByLabel("Instagram").fill("@bemviver");
  await page.getByText("Identidade visual definida").click();
  await page.getByRole("button", { name: "Salvar perfil da marca" }).click();
  await expect(page.getByText("Perfil da marca salvo.")).toBeVisible();
  await shot(page, "03-perfil-da-marca");

  // 4. Pedido de conteúdo (carrossel)
  await page.goto("/criar");
  await page.getByLabel("Formato").selectOption("carousel");
  await page.getByLabel("Número de lâminas").fill("4");
  await page.getByLabel("Título interno da pauta").fill("Cuidados com a saúde no inverno");
  await page.getByLabel("Briefing", { exact: true }).fill("Dicas práticas para a família se cuidar no inverno. Hidratação também importa no frio. Vacinação em dia protege todos. Procure atendimento ao notar febre persistente.");
  await page.getByLabel("CTA desejado").fill("Agende pelo WhatsApp");
  await page.getByRole("checkbox", { name: /Equipe da clínica/ }).check({ force: true });
  await shot(page, "04-central-de-criacao");
  await page.getByRole("button", { name: "Gerar (modo demonstração)" }).click();
  await expect(page).toHaveURL(/\/conteudos\/[0-9a-f-]+$/);
  const contentUrl = page.url();

  // 5. Geração assíncrona pelo worker → Em revisão
  await expect(page.getByText("Em revisão").first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByAltText("Pré-visualização da lâmina 1")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Versão gerada em modo demonstração")).toBeVisible();
  await shot(page, "05-editor");

  // 6. Edição manual → nova versão
  const title = page.locator("#f-title");
  await title.fill("Inverno com saúde: 3 cuidados simples");
  await page.locator("#f-kicker").fill("Guia rápido");
  await page.getByLabel("Nota da alteração (opcional)").fill("Título mais direto");
  await page.getByRole("button", { name: "Salvar nova versão" }).click();
  await expect(page.getByText("Versão 2 salva.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar nova versão" })).toBeDisabled();

  // 7. Controle de qualidade sem críticos e envio para aprovação
  await expect(page.getByText("Sem críticos").first()).toBeVisible();
  await page.getByRole("button", { name: "Solicitar aprovação" }).click();
  await expect(page.getByText("Aguardando aprovação da versão 2")).toBeVisible();

  // 8. Aprovação vinculada à versão exata
  await page.getByLabel("Comentário da decisão").fill("Aprovado para publicação.");
  await page.getByRole("button", { name: "Aprovar versão 2" }).click();
  await expect(page.getByText("Versão aprovada", { exact: true })).toBeVisible();
  await shot(page, "06-aprovado");

  // 9. Exportação da versão aprovada (PNGs reais + legenda)
  const contentId = contentUrl.split("/").pop()!;
  const res = await page.request.get(`/api/contents/${contentId}/export?format=zip`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/zip");
  const zip = await JSZip.loadAsync(await res.body());
  const pngs = Object.keys(zip.files).filter((f) => f.endsWith(".png"));
  expect(pngs).toHaveLength(4);
  expect(pngs.every((f) => f.includes("-v2-aprovado"))).toBe(true);
  const first = await zip.file(pngs.sort()[0]!)!.async("nodebuffer");
  expect(first.readUInt32BE(16)).toBe(1080);
  expect(first.readUInt32BE(20)).toBe(1350);

  // 10. Histórico: versões, aprovação e auditoria
  await page.reload();
  await expect(page.getByText("Aprovado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Exportação da versão aprovada")).toBeVisible();
  await page.getByRole("link", { name: "Comparar com v1" }).click();
  await expect(page.getByText("Comparação: v1 → v2")).toBeVisible();
  await expect(page.getByText(/Lâmina 1: title/).first()).toBeVisible();

  // 11. Dashboard reflete os dados reais
  await page.goto("/");
  await expect(page.getByText("Aprovados no mês")).toBeVisible();
  await shot(page, "07-dashboard");
});
