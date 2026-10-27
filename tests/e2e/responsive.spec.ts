import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("interface utilizável no celular, sem rolagem horizontal", async ({ page }) => {
  await login(page);
  for (const path of ["/", "/clientes", "/criar", "/conteudos", "/aprovacoes", "/templates", "/skills", "/skills/nova", "/custos", "/integracoes"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `rolagem horizontal em ${path}`).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Clientes" }).click();
  await expect(page).toHaveURL(/\/clientes$/);
});
