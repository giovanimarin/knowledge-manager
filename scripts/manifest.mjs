import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

const [mode, dir] = process.argv.slice(2);
const path = join(dir, "manifest.json");
async function digest(name) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(join(dir, name)))
    hash.update(bytes);
  return hash.digest("hex");
}
const databaseSha256 = await digest("database.dump");
const storageSha256 = await digest("storage.json");
if (mode === "create") {
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      databaseSha256,
      storageSha256,
    }) + "\n",
    { flag: "wx" },
  );
} else {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(Object.keys(manifest).sort(), [
    "createdAt",
    "databaseSha256",
    "storageSha256",
    "version",
  ]);
  assert.equal(manifest.version, 1);
  assert.ok(Number.isFinite(Date.parse(manifest.createdAt)));
  assert.equal(manifest.databaseSha256, databaseSha256);
  assert.equal(manifest.storageSha256, storageSha256);
  console.log(`Validated snapshot created at ${manifest.createdAt}`);
}
