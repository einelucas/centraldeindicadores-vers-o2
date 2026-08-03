import { test, expect } from "@playwright/test";

/**
 * E2E de autenticação.
 *
 * Estes testes exercitam a UI e a proteção de rotas sem exigir dados
 * pré-existentes. Fluxos que dependem de um usuário real no banco (login
 * bem-sucedido, importação) estão em `import.spec.ts` e são condicionados a
 * variáveis de ambiente com credenciais de teste.
 */

test.describe("Autenticação", () => {
  test("a tela de login é exibida", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Central de Indicadores" }),
    ).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("rota protegida redireciona para /login quando não autenticado", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("credenciais inválidas exibem mensagem de erro", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("naoexiste@example.com");
    await page.getByLabel("Senha").fill("senhaerrada123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(
      page.getByText("E-mail ou senha inválidos."),
    ).toBeVisible();
  });
});
