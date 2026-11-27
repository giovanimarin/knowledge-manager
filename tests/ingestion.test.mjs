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
