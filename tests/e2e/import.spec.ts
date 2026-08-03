import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

/**
 * E2E do fluxo autenticado: login + importação de RDO.
 *
 * Requer um banco com um usuário de teste. Defina as variáveis abaixo para
 * habilitar; sem elas, a suíte é ignorada (não falha o CI por falta de dados).
 *
 *   E2E_USER_EMAIL     e-mail de um usuário existente
 *   E2E_USER_PASSWORD  senha correspondente
 */
const EMAIL = process.env.E2E_USER_EMAIL;
const PASSWORD = process.env.E2E_USER_PASSWORD;

test.describe("Importação de RDO (autenticado)", () => {
  test.skip(!EMAIL || !PASSWORD, "defina E2E_USER_EMAIL e E2E_USER_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(EMAIL!);
    await page.getByLabel("Senha").fill(PASSWORD!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("importa a planilha e reimportar ignora tudo", async ({ page }) => {
    await page.goto("/dashboard/rdo");

    const fixture = resolve(process.cwd(), "tests/fixtures/rdo/valid.xlsx");

    // Primeira importação: registros inseridos.
    await page.getByLabel(/arquivo|upload|planilha/i).setInputFiles(fixture);
    await page.getByRole("button", { name: /importar|enviar|finalizar/i }).click();
    await expect(page.getByText(/inserido/i)).toBeVisible({ timeout: 30_000 });

    // Segunda importação do mesmo arquivo: tudo ignorado.
    await page.getByLabel(/arquivo|upload|planilha/i).setInputFiles(fixture);
    await page.getByRole("button", { name: /importar|enviar|finalizar/i }).click();
    await expect(page.getByText(/ignorado/i)).toBeVisible({ timeout: 30_000 });
  });
});
