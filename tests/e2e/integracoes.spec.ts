import { expect, test } from "@playwright/test";
import { login, shot } from "./helpers";

/**
 * Chaves dos apps em Integrações, aba Redes do cliente, publicações, e-mail,
 * webhooks e agenda. As plataformas (Meta, TikTok, Google) não são chamadas:
 * o teste confere o que o sistema mostra e guarda antes do login oficial.
 */
test("integrações: chaves dos apps, redes do cliente, avisos e agenda", async ({ page }) => {
  await login(page);
  await page.goto("/integracoes");
  await expect(page.getByRole("heading", { name: "Redes sociais" })).toBeVisible();

  const meta = page.locator("section").filter({ has: page.getByRole("heading", { name: "Instagram e Facebook" }) });
  await meta.getByLabel("ID do app").fill("1234567890123");
  await meta.getByLabel("Chave secreta do app").fill("segredo-do-app-meta-123");
  await meta.getByRole("button", { name: "Salvar chaves" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Chaves da Meta salvas." })).toBeVisible();
  await expect(meta.getByText("Conectado")).toBeVisible();
  await expect(meta.locator("code").filter({ hasText: "/api/conexoes/meta/retorno" })).toBeVisible();
  // A chave secreta nunca volta para a tela: só o final.
  await expect(meta.getByLabel("Chave secreta do app")).toHaveValue("");
  await expect(meta.getByText("Salva: ••••-123. Deixe vazio para manter.")).toBeVisible();
  await page.getByRole("heading", { name: "Redes sociais" }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -24));
  await shot(page, "13-integracoes");

  // E-mail e webhook.
  const email = page.locator("section").filter({ has: page.getByRole("heading", { name: "E-mail", exact: true }) });
  await email.getByLabel("Servidor SMTP").fill("smtp.hostinger.com");
  await email.getByLabel("Usuário (e-mail)").fill("contato@agencia.com.br");
  await email.getByLabel("Senha").fill("senha-do-email");
  await email.getByLabel("Remetente").fill("Agência <contato@agencia.com.br>");
  await email.getByRole("button", { name: "Salvar e-mail" }).click();
  await expect(page.getByRole("status").filter({ hasText: "E-mail configurado." })).toBeVisible();

  const hooks = page.locator("section").filter({ has: page.getByRole("heading", { name: "Webhooks" }) });
  await hooks.getByLabel("Endereço").fill("https://hooks.exemplo.com/prisma");
  await hooks.getByRole("button", { name: "Adicionar webhook" }).click();
  await expect(hooks.getByText(/^whsec_/)).toBeVisible();
  await expect(hooks.getByText("https://hooks.exemplo.com/prisma")).toBeVisible();

  // Aba Redes do cliente: Meta pronta para conectar; TikTok e YouTube sem chaves.
  await page.goto("/clientes");
  await page.getByLabel("Nome do cliente").fill("Coli Loterias Redes");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]+\?aba=marca/);
  const clientUrl = page.url().split("?")[0]!;
  await page.goto(`${clientUrl}?aba=redes`);
  const connect = page.getByRole("link", { name: "Conectar Instagram e Facebook" });
  await expect(connect).toHaveAttribute("href", /\/api\/conexoes\/meta\/iniciar\?cliente=/);
  await expect(page.getByText("Falta cadastrar as chaves do app em")).toHaveCount(2);
  await shot(page, "14-redes-do-cliente");

  // Relatório do mês do cliente (página clara, imprimível).
  await page.getByRole("link", { name: "Relatório do mês" }).first().click().catch(async () => page.goto(`/relatorios/${clientUrl.split("/").pop()}`));
  await page.goto(`/relatorios/${clientUrl.split("/").pop()}`);
  await expect(page.getByRole("heading", { name: /Relatório de/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir ou salvar PDF" })).toBeVisible();
  await page.getByRole("button", { name: "Link para o cliente" }).click();
  const reportUrl = (await page.getByText(/\/relatorio\/[A-Za-z0-9_-]{20,}/).first().textContent())!.split(" ")[0]!;
  const visitor = await page.context().browser()!.newContext();
  const outsider = await visitor.newPage();
  await outsider.goto(`http://localhost:${process.env.E2E_PORT ?? 3100}${new URL(reportUrl).pathname}`);
  await expect(outsider.getByText("Coli Loterias Redes")).toBeVisible();
  await visitor.close();
  await shot(page, "15-relatorio");

  // Busca rápida (Ctrl+K), avisos e histórico.
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Buscar" }).fill("Coli Loterias Redes");
  await expect(page.getByRole("option").filter({ hasText: "Coli Loterias Redes" }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]+$/);
  await page.goto("/avisos");
  await expect(page.getByRole("heading", { name: "Avisos" })).toBeVisible();
  await page.goto("/historico");
  await expect(page.getByText("Chaves de app salvas").first()).toBeVisible();

  // Publicações: vazio, com o envio de vídeo disponível.
  await page.goto("/publicacoes");
  await expect(page.getByText("Nenhuma publicação")).toBeVisible();
  await page.getByRole("link", { name: "Publicar vídeo" }).click();
  await expect(page.getByRole("heading", { name: "Publicar vídeo da biblioteca" })).toBeVisible();

  // Agenda: endereço privado em ICS.
  await page.goto("/calendario");
  await page.getByText("Ver no Google Agenda ou no celular").click();
  await page.getByRole("button", { name: "Gerar endereço da agenda" }).click();
  const feed = (await page.locator("code").filter({ hasText: ".ics" }).textContent())!;
  const ics = await page.request.get(new URL(feed).pathname);
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VCALENDAR");
});
