import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  exportFiles,
  importArchive,
  importItem,
} from "../apps/api/dist/wiki/conversions.js";
const { zipSync, strToU8 } = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
)("fflate");
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../contracts/fixtures/wiki-formats/fidelity.json",
      import.meta.url,
    ),
  ),
);
const encode = (bytes) => Buffer.from(bytes).toString("base64");
const pack = (files) =>
  encode(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([path, content]) => [
          path,
          strToU8(content),
        ]),
      ),
    ),
  );
const root = {
  id: "root",
  parent_id: null,
  title: fixture.title,
  content: fixture.text,
};
test("wiki Word round trip preserves Portuguese text and declares layout loss", async () => {
  const result = await exportFiles("word", [root]);
  assert.deepEqual(
    await importItem("word", {
      title: root.title,
      data: result.output[0].data,
    }),
    { title: root.title, content: root.content },
  );
  assert.ok(result.extraLosses.includes("rich-layout"));
});
test("wiki imports sanitized HTML and ZIP exports preserve hierarchy", async () => {
  const html = await importItem("html", {
    title: fixture.title,
    content: fixture.html,
  });
  assert.match(html.content, /# Operações/);
  assert.match(html.content, /Ação rápida & segura/);
  assert.doesNotMatch(html.content, /javascript:|conteúdo ativo/);
  const child = { ...root, id: "child", parent_id: "root", title: "Filho" };
  const result = await exportFiles("zip", [child, root]);
  const pages = await importArchive("zip", result.output[0].data);
  assert.deepEqual(pages, [
    { title: root.title, content: root.content },
    { title: child.title, content: child.content, parentIndex: 0 },
  ]);
});
test("wiki supports Confluence and Notion local exports and rejects archive traversal", async () => {
  const conf = await importArchive("confluence", pack(fixture.confluence));
  const notion = await importArchive("notion", pack(fixture.notion));
  assert.match(conf[0].content, /Versão aprovada/);
  assert.equal(notion[1].parentIndex, 0);
  await assert.rejects(
    importArchive("zip", pack({ "../escaped.md": "invalid" })),
    { status: 400 },
  );
});
