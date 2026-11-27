import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";

const entrypoints = new Set(["@km/foundation"]);
const layers = {
  "apps/api": new Set([
    "@km/foundation",
    "@nestjs/common",
    "@node-rs/argon2",
    "otpauth",
    "jose",
    "@nestjs/core",
    "reflect-metadata",
  ]),
  "apps/worker": entrypoints,
  "apps/web": new Set(["react", "react-dom/client"]),
  "packages/foundation": new Set([
    "@opentelemetry/api",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/sdk-trace-node",
    "kysely",
    "pg",
    "ioredis",
    "bullmq",
  ]),
};

async function verify(root, dir, allowed) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await verify(root, path, allowed);
      continue;
    }
    if (!/\.tsx?$/.test(path)) continue;
    const source = ts.createSourceFile(
      path,
      await readFile(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function check(ref) {
      assert.ok(ts.isStringLiteralLike(ref), `Nonliteral import in ${path}`);
      const specifier = ref.text;
      if (specifier.startsWith(".")) {
        const target = new URL(
          specifier,
          new URL(path, `file://${process.cwd()}/`),
        );
        assert.ok(
          target.pathname.startsWith(`${process.cwd()}/${root}/src/`),
          `Cross-layer import in ${path}`,
        );
      } else {
        assert.ok(
          specifier.startsWith("node:") || allowed.has(specifier),
          `${path}: ${specifier}`,
        );
      }
    }
    function visit(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      )
        check(node.moduleSpecifier);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText() === "require")
      ) {
        check(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}

test("workspace modules only consume public dependency entry points", async () => {
  for (const [layer, allowed] of Object.entries(layers))
    await verify(layer, `${layer}/src`, allowed);
});
