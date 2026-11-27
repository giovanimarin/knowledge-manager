import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function openEditor(page: Page) {
  const path = process.env.KM_WIKI_BROWSER_FIXTURE;
  if (!path)
    throw new Error(
      "Use a integração real para provisionar a fixture do editor.",
    );
  const { tenant, email, password } = JSON.parse(
    await readFile(path, "utf8"),
  ) as { tenant: string; email: string; password: string };
  await page.goto("/");
  await page.getByLabel("Identificador da organização").fill(tenant);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Política de acesso", exact: true })
    .click();
  await page.getByText("Abrir editor colaborativo", { exact: true }).click();
  await page.getByRole("button", { name: "Conectar ao editor" }).click();
  const region = page.getByRole("region", { name: "Editor colaborativo" });
  await expect(region.getByRole("status")).toHaveText("Alterações salvas");
  return region;
}

test("two browser clients share rich autosave and can open a retained comparison", async ({
  page,
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    const a = await openEditor(page),
      b = await openEditor(other);
    await a.getByLabel("Tipo do novo bloco").selectOption("heading");
    await a.getByRole("button", { name: "Adicionar bloco" }).click();
    const heading = a.getByRole("textbox", { name: /Título [0-9]+$/ }).last();
    await heading.fill("Título colaborativo");
    await expect(
      b.getByRole("heading", { name: "Título colaborativo" }),
    ).toBeVisible();
    await b.getByLabel("Tipo do novo bloco").selectOption("checklist");
    await b.getByRole("button", { name: "Adicionar bloco" }).click();
    await b
      .getByRole("textbox", { name: /Checklist [0-9]+$/ })
      .last()
      .fill("Verificar rascunho");
    await b.getByLabel("Concluído", { exact: true }).check();
    await expect(
      a.getByText("☑ Verificar rascunho", { exact: true }),
    ).toBeVisible();
    await a.getByLabel("Tipo do novo bloco").selectOption("mermaid");
    await a.getByRole("button", { name: "Adicionar bloco" }).click();
    await a
      .getByRole("textbox", { name: /Mermaid [0-9]+$/ })
      .last()
      .fill("flowchart LR\nA --> B");
    await expect(
      b.getByRole("img", { name: "Diagrama Mermaid" }),
    ).toBeVisible();
    await a.getByText("Versões, revisão e publicação", { exact: true }).click();
    await a.getByRole("button", { name: "Carregar versões" }).click();
    await a
      .getByRole("button", { name: /Comparar revisão/ })
      .last()
      .click();
    await expect(
      a.getByRole("region", { name: "Comparação de versões" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
