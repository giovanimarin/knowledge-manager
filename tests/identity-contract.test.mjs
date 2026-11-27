import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const doc = JSON.parse(
  await readFile(
    new URL("../contracts/identity.openapi.json", import.meta.url),
  ),
);
const ajv = addFormats(new Ajv({ strict: false }));
const schema = (path, verb) =>
  doc.paths[`/v1${path}`][verb].requestBody.content["application/json"].schema;

test("identity contract defines explicit tenant login and rejects unknown input fields", () => {
  const validate = ajv.compile(schema("/sessions", "post"));
  const input = {
    orgHint: "91c4c9d5-f45e-4f78-ab8f-fcf2337d86fb",
    email: "local@example.invalid",
    password: "example",
  };
  assert.equal(validate(input), true);
  const { orgHint, ...missing } = input;
  assert.equal(validate(missing), false);
  assert.equal(validate({ ...input, admin: true }), false);
  assert.equal(doc.paths["/v1/sessions"].post.security.length, 0);
  assert.equal(doc.security[0].bearer.length, 0);
});

test("identity contract includes Problem Details and bounded input types", () => {
  const validate = ajv.compile(doc.components.schemas.Problem);
  const issue = {
    type: "about:blank",
    title: "Operation forbidden",
    status: 403,
    correlationId: "91c4c9d5-f45e-4f78-ab8f-fcf2337d86fb",
  };
  assert.equal(validate(issue), true);
  assert.equal(validate({ ...issue, credential: "example" }), false);
  assert.equal(
    ajv.compile(schema("/oauth/token", "post"))({ grant_type: "password" }),
    false,
  );
});
