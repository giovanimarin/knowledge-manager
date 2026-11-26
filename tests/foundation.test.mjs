import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import * as foundation from "../packages/foundation/dist/index.js";

const openapi = JSON.parse(
  await readFile(
    new URL("../contracts/foundation.openapi.json", import.meta.url),
  ),
);
const operations = JSON.parse(
  await readFile(
    new URL("../contracts/foundation.operations.json", import.meta.url),
  ),
);
const ajv = addFormats(new Ajv());
const examples = [foundation.healthy, foundation.ready, foundation.unavailable];

test("health and readiness payloads match their OpenAPI schemas and examples", () => {
  assert.deepEqual(Object.keys(openapi.paths).sort(), ["/healthz", "/readyz"]);
  const responses = Object.values(openapi.components.responses);
  for (const [index, { content }] of responses.entries()) {
    const { schema, example } = Object.values(content)[0];
    const schemaName = schema.$ref.split("/").at(-1);
    const validate = ajv.compile(openapi.components.schemas[schemaName]);
    assert.deepEqual(examples[index], example);
    assert.ok(validate(examples[index]));
    assert.equal(validate({ ...example, internal: "secret" }), false);
  }
});

test("worker probe accepts contract examples and rejects invalid names and payloads", () => {
  const validate = ajv.compile(operations.probeJob.data);
  const [example] = operations.probeJob.examples;
  assert.ok(validate(example));
  assert.deepEqual(
    foundation.parseProbe(operations.probeJob.name, example),
    example,
  );
  for (const invalid of [
    { id: "../file" },
    { ...example, extra: true },
    null,
    {},
  ]) {
    assert.equal(validate(invalid), false);
    assert.throws(() =>
      foundation.parseProbe(operations.probeJob.name, invalid),
    );
  }
  assert.throws(() => foundation.parseProbe("unexpected", example));
});

test("storage preserves bytes, rejects traversal and prevents overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "km-object-"));
  try {
    const storage = new foundation.FileStorage(root);
    await assert.rejects(storage.ping());
    await mkdir(join(root, "objects"));
    await storage.ping();
    const [{ id }] = operations.probeJob.examples;
    const payload = Buffer.from("synthetic");
    await storage.put(id, payload);
    assert.deepEqual(await storage.get(id), payload);
    await assert.rejects(storage.put(id, Buffer.from("replacement")), {
      code: "EEXIST",
    });
    await assert.rejects(storage.put("../outside", payload));
    assert.throws(() => storage.get("../outside"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
