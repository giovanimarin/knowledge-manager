import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  const fixture = process.env.KM_WIKI_BROWSER_FIXTURE;
  if (!fixture)
    throw new Error(
      "Run scripts/integration.sh to provision the wiki browser fixture.",
    );
  const { tenant, email, password, hiddenSpace } = JSON.parse(
    await readFile(fixture, "utf8"),
  ) as { tenant: string; email: string; password: string; hiddenSpace: string };
  await page.goto("/");
  await page.getByLabel("Identificador da organização").fill(tenant);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const wiki = page.getByRole("region", { name: "Wiki" });
  await expect(wiki.getByRole("heading", { name: "Wiki" })).toBeVisible();
  return { wiki, hiddenSpace };
}

test("U3 opens an authorized document, adds a comment and previews a clean attachment", async ({
  page,
}) => {
  const { wiki } = await login(page);
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
  await wiki.getByLabel("Arquivos").setInputFiles({
    name: "navegador.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Prévia segura"),
  });
  await wiki.getByRole("button", { name: "Enviar anexos" }).click();
  const attachment = wiki
    .getByRole("listitem")
    .filter({ hasText: "navegador.txt" });
  await expect(
    attachment.getByRole("button", { name: "Prévia de texto" }),
  ).toBeVisible();
  await attachment.getByRole("button", { name: "Prévia de texto" }).click();
  await expect(
    wiki.getByRole("region", { name: "Prévia do anexo" }),
  ).toContainText("Prévia segura");
  await wiki.getByLabel("Novo comentário").fill("Comentário pelo navegador");
  await wiki.getByLabel("Bloco do comentário").selectOption({ index: 1 });
  await wiki.getByRole("button", { name: "Comentar", exact: true }).click();
  await expect(
    wiki.getByText("Comentário pelo navegador", { exact: true }),
  ).toBeVisible();
  const thread = wiki
    .getByRole("listitem")
    .filter({ hasText: "Comentário pelo navegador" });
  await expect(thread).toContainText("Comentário no bloco");
  await thread.getByRole("button", { name: "Resolver comentário" }).click();
  await expect(
    thread.getByRole("button", { name: "Reabrir comentário" }),
  ).toBeVisible();
  await thread.getByText("Histórico do comentário").click();
  await expect(
    thread.getByText("Comentário pelo navegador · Aberto"),
  ).toBeVisible();
});

test("U4 imports a draft, exposes export losses and denies another space", async ({
  page,
}) => {
  const { wiki, hiddenSpace } = await login(page);
  await expect(wiki.getByRole("option", { name: "Pesquisa" })).toHaveCount(0);
  await wiki
    .getByLabel("Espaço", { exact: true })
    .selectOption({ label: "Operações" });
  await wiki.getByLabel("Formato de importação").selectOption("html");
  await wiki.getByLabel("Arquivo de importação").setInputFiles({
    name: "Guia-browser.html",
    mimeType: "text/html",
    buffer: Buffer.from(
      "<h1>Exemplo</h1><p>Café e ação</p><script>não renderizar</script>",
    ),
  });
  await wiki.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(wiki.getByRole("status")).toHaveText(
    "Importação concluída como rascunho.",
  );
  await wiki.getByRole("button", { name: "Guia-browser", exact: true }).click();
  await expect(wiki.getByRole("article")).toContainText("Café e ação");
  await expect(wiki.getByRole("article")).not.toContainText("não renderizar");
  await wiki.getByLabel("Formato de exportação").selectOption("word");
  await wiki.getByRole("button", { name: "Exportar documento" }).click();
  await expect(wiki.getByRole("status")).toHaveText("Exportação concluída.");
  const download = page.waitForEvent("download");
  await wiki.getByRole("button", { name: /Baixar .*\.docx$/ }).click();
  await expect((await download).suggestedFilename()).toMatch(/\.docx$/);
  await page.route(
    "**/v1/wiki/import-jobs",
    (route) =>
      route.continue({
        postData: JSON.stringify({
          ...route.request().postDataJSON(),
          spaceId: hiddenSpace,
        }),
      }),
    { times: 1 },
  );
  await wiki.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(wiki.getByRole("alert")).toHaveText(
    "Operação indisponível para este acesso.",
  );
});
