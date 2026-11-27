import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import Ajv from "ajv";
import { formats, maxFileBytes } from "../apps/api/dist/wiki/conversions.js";

const contract = JSON.parse(
  readFileSync(new URL("../contracts/wiki.operations.json", import.meta.url)),
);
test("wiki C2 and C3 contracts enumerate protected operations and supported formats", () => {
  for (const operation of Object.values(contract.operations)) {
    assert.ok(operation.path.startsWith("/v1/wiki/"));
    assert.ok(operation.auth);
    assert.ok(operation.negative.includes(401));
  }
  assert.deepEqual(contract.schemas.importFormat.enum, formats);
  assert.equal(contract.schemas.upload.properties.size.maximum, maxFileBytes);
  const validate = new Ajv().compile(contract.schemas.upload);
  const sample = {
    filename: "guia.txt",
    mediaType: "text/plain",
    size: 20,
    checksum: "0".repeat(64),
  };
  assert.equal(validate(sample), true);
  for (const input of [
    { ...sample, size: maxFileBytes + 1 },
    { ...sample, checksum: "invalid" },
    { ...sample, size: 0 },
  ])
    assert.equal(validate(input), false);
});
