import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";

export const ADMIN = { email: "admin@e2e.prisma", password: "senha-e2e-12345" };

export async function login(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** PNG gerado localmente (sem imagens de terceiros). */
export function png(width: number, height: number, svgBody: string): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svgBody}</svg>`;
  return Buffer.from(new Resvg(svg).render().asPng());
}

export async function shot(page: Page, name: string) {
  if (process.env.CAPTURE_SCREENSHOTS === "1") await page.screenshot({ path: `docs/img/${name}.png`, fullPage: false });
}
