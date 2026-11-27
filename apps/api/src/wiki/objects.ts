import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { storagePath } from "@km/foundation";
import { id } from "../identity/security.js";

function namespace(tenant: string) {
  return join(storagePath(), "objects", id(tenant));
}

export async function putObject(tenant: string, key: string, bytes: Buffer) {
  const directory = namespace(tenant);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, id(key)), bytes, { flag: "wx", mode: 0o600 });
}

export const readObject = (tenant: string, key: string) =>
  readFile(join(namespace(tenant), id(key)));

export const removeObject = (tenant: string, key: string) =>
  rm(join(namespace(tenant), id(key)), { force: true });
