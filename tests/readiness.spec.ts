import { expect, test } from "@playwright/test";

test("status page uses the real API and supports checking again", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Estado do ambiente" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Ambiente disponível");
  const response = page.waitForResponse("**/readyz");
  await page.getByRole("button", { name: "Verificar novamente" }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole("status")).toHaveText("Ambiente disponível");
});

test("status page exposes dependency failure without internal details", async ({
  page,
}) => {
  await page.route("**/readyz", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/problem+json",
      json: { type: "about:blank", title: "Service Unavailable", status: 503 },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Ambiente indisponível");
  await expect(
    page.getByRole("button", { name: "Verificar novamente" }),
  ).toBeEnabled();
});

test("organization login rejects invalid credentials without exposing tenant data", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Identificador da organização")
    .fill("91c4c9d5-f45e-4f78-ab8f-fcf2337d86fb");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("does-not-exist@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("intentionally-invalid");
  const response = page.waitForResponse("**/v1/sessions");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await response).status()).toBe(401);
  await expect(page.getByRole("alert")).toContainText(
    "A operação foi recusada",
  );
});
