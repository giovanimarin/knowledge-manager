import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { embed, segments } from "../apps/worker/dist/ingestion/segments.js";
const fixture = JSON.parse(
  readFileSync(
    new URL("../contracts/fixtures/ingestion.json", import.meta.url),
  ),
);
test("ingestion preserves hierarchy, block identity and normalized offsets", () => {
  const blocks = fixture.blocks.map((block) => ({
    id: randomUUID(),
    ...block,
  }));
  const result = segments("Wiki", blocks);
  assert.deepEqual(result[1].heading, ["Wiki", "Operações"]);
  assert.equal(result[1].kind, "table");
  assert.equal(result[1].blockId, blocks[1].id);
  assert.equal(result[1].id, segments("Wiki", [blocks[1]])[0].id);
  const long = { id: randomUUID(), text: "Ação ".repeat(24) };
  const chunks = segments("Wiki", [long], 48, 8);
  assert.ok(chunks.length > 1);
  assert.equal(chunks[1].start, chunks[0].end - 8);
  assert.equal(chunks.at(-1).end, Array.from(long.text).length);
});
test("offline embedding has stable normalized shape for Portuguese/English text", () => {
  const a = embed("Ação segura; secure action.");
  assert.deepEqual(a, embed("Ação segura; secure action."));
  assert.equal(a.length, 64);
  assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-8);
  assert.notDeepEqual(a, embed("distant topic"));
});

test("local Ollama adapter checks configured model and rejects divergent dimensions", async () => {
  const { configuredEmbedding } =
    await import("../apps/worker/dist/ingestion/embedding.js");
  const env = {
    KM_INGEST_EMBED_URL: "http://embedding.invalid",
    KM_INGEST_EMBED_MODEL: "fixture-pt-en",
    KM_INGEST_EMBED_DIMENSION: "3",
  };
  const model = configuredEmbedding(env, async (url, request) => {
    assert.equal(url.pathname, "/api/embed");
    assert.deepEqual(JSON.parse(request.body), {
      model: "fixture-pt-en",
      input: "Ação segura",
      truncate: false,
    });
    assert.equal(request.redirect, "error");
    return Response.json({ embeddings: [[1, 0, -1]] });
  });
  assert.deepEqual(await model.vector("Ação segura"), [1, 0, -1]);
  await assert.rejects(
    configuredEmbedding(env, async () =>
      Response.json({ embeddings: [[1]] }),
    ).vector("Texto"),
    /dimension/,
  );
});

test("published asset extractors handle Office and reject invalid integrity", async () => {
  const { createRequire } = await import("node:module");
  const { createHash } = await import("node:crypto");
  const { zipSync, strToU8 } = createRequire(
    new URL("../apps/worker/package.json", import.meta.url),
  )("fflate");
  const { extract } = await import("../apps/worker/dist/ingestion/extract.js");
  const tenant = randomUUID();
  const fixtures = [
    [
      "wiki.docx",
      {
        "word/document.xml":
          "<w:document xmlns:w='demo'><w:body><w:p><w:r><w:t>Ação segura</w:t></w:r></w:p></w:body></w:document>",
      },
      "Ação segura",
    ],
    [
      "wiki.xlsx",
      {
        "xl/sharedStrings.xml": "<sst><si><t>Área</t></si></sst>",
        "xl/worksheets/sheet1.xml":
          "<worksheet><sheetData><row><c t='s'><v>0</v></c><c><v>7</v></c></row></sheetData></worksheet>",
      },
      "Área | 7",
    ],
    [
      "wiki.pptx",
      {
        "ppt/slides/slide1.xml":
          "<p:sld xmlns:p='demo' xmlns:a='demo2'><a:p><a:r><a:t>Apresentação</a:t></a:r></a:p></p:sld>",
      },
      "Apresentação",
    ],
  ];
  for (const [filename, files, expected] of fixtures) {
    const bytes = Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries(files).map(([name, body]) => [name, strToU8(body)]),
        ),
      ),
    );
    const file = {
      id: randomUUID(),
      filename,
      content_type: "fixture",
      bytes,
      digest: createHash("sha256").update(bytes).digest("hex"),
    };
    assert.equal((await extract(file, tenant)).text, expected);
    await assert.rejects(
      extract({ ...file, digest: "incorrect" }, tenant),
      /integrity/,
    );
  }
  const { exportFiles } = await import("../apps/api/dist/wiki/conversions.js");
  const result = await exportFiles("pdf", [
    { id: randomUUID(), parent_id: null, title: "PDF", content: "Ação segura" },
  ]);
  const bytes = Buffer.from(result.output[0].data, "base64");
  const pdf = {
    id: randomUUID(),
    filename: "wiki.pdf",
    content_type: "application/pdf",
    bytes,
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
  assert.match((await extract(pdf, tenant)).text, /Ação segura/);
});
