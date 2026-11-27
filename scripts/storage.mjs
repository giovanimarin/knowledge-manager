import { readFile, readdir, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const root = process.env.STORAGE_PATH;
const objects = join(root, "objects");
const marker = join(root, ".ready");
const pending = join(root, ".restore-pending");
const objectId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks);
};

switch (process.argv[2]) {
  case "verify-start":
    await mkdir(objects, { recursive: true });
    if (
      await readFile(pending).then(
        () => true,
        (error) => {
          if (error.code !== "ENOENT") throw error;
          return false;
        },
      )
    )
      throw new Error("Restore incomplete; use an empty project");
    await writeFile(marker, "");
    break;
  case "complete-restore":
    await rm(pending);
    await writeFile(marker, "");
    break;
  case "maintenance":
    await mkdir(objects, { recursive: true });
    await rm(marker, { force: true });
    await writeFile(pending, "");
    break;
  case "snapshot": {
    const entries = [];
    for (const entry of await readdir(objects, { withFileTypes: true })) {
      if (!entry.isFile() || !objectId.test(entry.name))
        throw new Error("Unexpected storage entry");
      const bytes = await readFile(join(objects, entry.name));
      entries.push({
        id: entry.name,
        sha256: hash(bytes),
        data: bytes.toString("base64"),
      });
    }
    entries.sort((a, b) => a.id.localeCompare(b.id));
    console.log(JSON.stringify(entries));
    break;
  }
  case "restore": {
    if ((await readdir(objects)).length)
      throw new Error("Restore requires empty storage");
    const entries = JSON.parse(await stdin());
    if (!Array.isArray(entries)) throw new Error("Invalid storage snapshot");
    const decoded = new Map();
    for (const entry of entries) {
      if (
        !objectId.test(entry.id) ||
        decoded.has(entry.id) ||
        typeof entry.data !== "string"
      ) {
        throw new Error("Invalid object in storage snapshot");
      }
      const bytes = Buffer.from(entry.data, "base64");
      if (
        entry.sha256 !== hash(bytes) ||
        bytes.toString("base64") !== entry.data
      ) {
        throw new Error("Object checksum mismatch");
      }
      decoded.set(entry.id, bytes);
    }
    for (const [id, bytes] of decoded)
      await writeFile(join(objects, id), bytes, { flag: "wx", mode: 0o600 });
    break;
  }
  case "check": {
    const content = await stdin();
    for (const line of content.toString().trim().split("\n").filter(Boolean)) {
      const [id, checksum] = line.split("|");
      if (
        !objectId.test(id) ||
        hash(await readFile(join(objects, id))) !== checksum
      ) {
        throw new Error("Database and storage disagree");
      }
    }
    break;
  }
  default:
    throw new Error("Unknown storage operation");
}
