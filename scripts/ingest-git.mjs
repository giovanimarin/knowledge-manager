import { randomUUID } from "node:crypto";
import { gitSource } from "./ingestion/git.mjs";

const [provider, repository, ref, source] = process.argv.slice(2);
const { KM_BASE_URL, KM_SOURCE_SESSION, KM_GIT_SOURCE_TOKEN } = process.env;
if (
  !KM_BASE_URL ||
  !KM_SOURCE_SESSION ||
  !source ||
  !/^[a-f0-9-]{36}$/i.test(source)
)
  throw new Error("Informe URL local, credencial escopada e ID da fonte");
const prefix = "/v1/ingestion/sources/" + source;
async function api(path, body) {
  const response = await fetch(new URL(prefix + path, KM_BASE_URL), {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + KM_SOURCE_SESSION,
      "Content-Type": "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new Error("Ingestion API refused the operation: " + response.status);
  return response.json();
}
const snapshot = await gitSource({
  provider,
  repository,
  ref,
  credential: KM_GIT_SOURCE_TOKEN,
});
const current = await api("/objects");
if (current.objects.length >= 200)
  throw new Error("Object inventory may be truncated");
const prior = new Map(
  current.objects.map((object) => [object.remote_key, object]),
);
const latest = new Set(snapshot.files.map((file) => file.remoteKey));
const mapped = process.env.KM_GIT_SOURCE_ACL === "mapped-space";
const pending = [];
for (const [key, object] of prior)
  if (!latest.has(key) && object.state !== "deleted")
    pending.push({ remoteKey: key, version: "deleted", operation: "delete" });
for (const file of snapshot.files) {
  const previous = prior.get(file.remoteKey);
  const expectedState = mapped ? "draft" : "quarantine";
  if (previous?.version === file.version && previous.state === expectedState)
    continue;
  const title = file.remoteKey.split("/").at(-1).slice(0, 160);
  const content = mapped ? await snapshot.read(file) : "";
  if (content.length > 50000)
    throw new Error("Git source content exceeds bounds");
  pending.push({
    ...file,
    title,
    content,
    operation: "upsert",
    acl: mapped ? "mapped-space" : "unknown",
  });
}
let cursor = current.cursor;
for (let offset = 0; offset < pending.length; offset += 10) {
  const nextCursor = randomUUID();
  await api("/sync", {
    id: randomUUID(),
    cursor,
    nextCursor,
    entries: pending.slice(offset, offset + 10),
  });
  cursor = nextCursor;
}
console.log(JSON.stringify({ provider, records: pending.length }));
