import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  initDocument,
  project,
  validateBlocks,
} from "../apps/api/dist/editor/blocks.js";

const { Doc, applyUpdate, encodeStateAsUpdate, encodeStateVector } =
  await import("../apps/api/node_modules/yjs/dist/yjs.mjs");
const fixture = JSON.parse(
  readFileSync(new URL("../contracts/fixtures/editor.json", import.meta.url)),
);
test("rich editor fixtures retain stable IDs and reject active URLs and unknown block kinds", () => {
  const entries = fixture.blocks.map((block) => ({
    id: randomUUID(),
    ...block,
  }));
  const initial = initDocument(validateBlocks(entries));
  const mirror = new Doc();
  applyUpdate(mirror, encodeStateAsUpdate(initial));
  assert.deepEqual(project(mirror), entries);
  for (const invalid of fixture.negative) {
    assert.throws(() => validateBlocks([{ id: randomUUID(), ...invalid }]), {
      status: 400,
    });
  }
  assert.throws(() => validateBlocks([entries[0], entries[0]]), {
    status: 400,
  });
  initial.destroy();
  mirror.destroy();
});
test("concurrent Yjs edits commute and duplicate updates do not duplicate text", () => {
  const source = initDocument([
    { id: randomUUID(), kind: "text", text: "base" },
  ]);
  const a = new Doc(),
    b = new Doc();
  for (const target of [a, b]) applyUpdate(target, encodeStateAsUpdate(source));
  const vector = encodeStateVector(source);
  a.getArray("blocks").get(0).get("text").insert(0, "first ");
  b.getArray("blocks").get(0).get("text").insert(0, "second ");
  const updateA = encodeStateAsUpdate(a, vector),
    updateB = encodeStateAsUpdate(b, vector);
  applyUpdate(a, updateB);
  applyUpdate(b, updateA);
  applyUpdate(a, updateB);
  assert.deepEqual(project(a), project(b));
  assert.equal(project(a)[0].text.match(/second /g).length, 1);
  source.destroy();
  a.destroy();
  b.destroy();
});
