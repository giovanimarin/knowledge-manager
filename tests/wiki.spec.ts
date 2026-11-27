import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("member opens an authorized wiki document and posts a comment", async ({
  page,
}) => {
  const fixture = process.env.KM_WIKI_BROWSER_FIXTURE;
  if (!fixture)
    throw new Error(
      "Run scripts/integration.sh to provision the wiki browser fixture.",
    );
  const { tenant, email, password } = JSON.parse(
    await readFile(fixture, "utf8"),
  ) as { tenant: string; email: string; password: string };
  await page.goto("/");
  await page.getByLabel("Identificador da organização").fill(tenant);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const wiki = page.getByRole("region", { name: "Wiki" });
  await expect(wiki.getByRole("heading", { name: "Wiki" })).toBeVisible();
  await expect(
    wiki.getByRole("button", { name: "Recuperação", exact: true }),
  ).toHaveCount(0);
  await wiki.getByLabel("Buscar documentos").fill("Access checklist");
  await wiki.getByRole("button", { name: "Buscar", exact: true }).click();
  await wiki
    .getByRole("button", { name: "Política de acesso", exact: true })
    .click();
  await expect(
    wiki.getByRole("heading", { name: "Política de acesso" }),
  ).toBeVisible();
  await wiki.getByLabel("Novo comentário").fill("Comentário pelo navegador");
  await wiki.getByRole("button", { name: "Comentar", exact: true }).click();
  await expect(
    wiki.getByText("Comentário pelo navegador", { exact: true }),
  ).toBeVisible();
});
