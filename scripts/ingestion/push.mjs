import { randomUUID } from "node:crypto";
export async function pushSnapshot({
  snapshot,
  source,
  base,
  session,
  mapped,
}) {
  const prefix = "/v1/ingestion/sources/" + source;
  async function api(path, body) {
    const response = await fetch(new URL(prefix + path, base), {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + session,
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw new Error(
        "Ingestion API refused the operation: " + response.status,
      );
    return response.json();
  }
  const records = [];
  let after;
  let cursor;
  for (let page = 0; page < 10; page++) {
    const result = await api(
      "/objects" + (after ? "?after=" + encodeURIComponent(after) : ""),
    );
    if (page && cursor !== result.cursor)
      throw new Error("Concurrent import changed the inventory");
    cursor = result.cursor;
    records.push(...result.objects);
    after = result.after;
    if (!after) break;
  }
  if (after) throw new Error("Object inventory may be truncated");
  const prior = new Map(records.map((object) => [object.remote_key, object]));
  const latest = new Set(snapshot.files.map((file) => file.remoteKey));

  const pending = [];
  for (const [key, object] of prior)
    if (!latest.has(key) && object.state !== "deleted")
      pending.push({ remoteKey: key, version: "deleted", operation: "delete" });
  for (const file of snapshot.files) {
    const previous = prior.get(file.remoteKey);
    const expectedState = mapped ? "draft" : "quarantine";
    if (previous?.version === file.version && previous.state === expectedState)
      continue;
    const title = (
      file.title ||
      file.remoteKey.split("/").at(-1) ||
      file.remoteKey
    ).slice(0, 160);
    const content = mapped ? await snapshot.read(file) : "";
    if (content.length > 50000)
      throw new Error("Source content exceeds bounds");
    pending.push({
      ...file,
      title,
      content,
      operation: "upsert",
      acl: mapped ? "mapped-space" : "unknown",
    });
  }
  cursor ??= null;
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
  return pending.length;
}
