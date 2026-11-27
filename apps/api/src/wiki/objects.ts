import { mkdir, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { storagePath } from "@km/foundation";
import { id } from "../identity/security.js";

function namespace(tenant: string) {
  return join(storagePath(), "objects", id(tenant));
}

export async function putObject(tenant: string, key: string, bytes: Buffer) {
  const directory = namespace(tenant);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, id(key));
  const file = await open(path, "wx", 0o600).catch(async (error: unknown) => {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ))
      throw error;
    if (!(await readFile(path)).equals(bytes)) throw error;
    return null;
  });
  if (file) {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
  }
}

export const readObject = (tenant: string, key: string) =>
  readFile(join(namespace(tenant), id(key)));

export const removeObject = (tenant: string, key: string) =>
  rm(join(namespace(tenant), id(key)), { force: true });
