import { randomUUID } from "node:crypto";
export async function pushSnapshot({
  snapshot,
  source,
  base,
  session,
  mapped,
  signals = [],
  expectedCredentialVersion,
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
  let cursor, nativeCursor, credentialVersion;
  for (let page = 0; page < 10; page++) {
    const result = await api(
      "/objects" + (after ? "?after=" + encodeURIComponent(after) : ""),
    );
    if (
      page &&
      (cursor !== result.cursor ||
        nativeCursor !== result.nativeCursor ||
        credentialVersion !== result.credentialVersion)
    )
      throw new Error("Concurrent import changed the inventory");
    cursor = result.cursor;
    nativeCursor = result.nativeCursor;
    credentialVersion = result.credentialVersion;
    records.push(...result.objects);
    after = result.after;
    if (!after) break;
  }
  if (after) throw new Error("Object inventory may be truncated");
  if (
    expectedCredentialVersion != null &&
    expectedCredentialVersion !== (credentialVersion ?? 0)
  )
    throw new Error("Source credential rotated during synchronization");
  const prior = new Map(records.map((object) => [object.remote_key, object]));
  const latest = new Set(snapshot.files.map((file) => file.remoteKey));

  const pending = [];
  for (const [key, object] of prior)
    if (
      (snapshot.delta ? snapshot.removed?.includes(key) : !latest.has(key)) &&
      object.state !== "deleted"
    )
      pending.push({ remoteKey: key, version: "deleted", operation: "delete" });
  for (const file of snapshot.files) {
    const previous = prior.get(file.remoteKey);
    const allowed = snapshot.allowsSpace
      ? await snapshot.allowsSpace(file)
      : mapped;
    const expectedState = allowed ? "draft" : "quarantine";
    if (previous?.version === file.version && previous.state === expectedState)
      continue;
    const title = (
      file.title ||
      file.remoteKey.split("/").at(-1) ||
      file.remoteKey
    ).slice(0, 160);
    const content = allowed ? await snapshot.read(file) : "";
    if (content.length > 50000)
      throw new Error("Source content exceeds bounds");
    pending.push({
      ...file,
      title,
      content,
      operation: "upsert",
      acl: allowed ? "mapped-space" : "unknown",
    });
  }
  cursor ??= null;
  if (
    credentialVersion &&
    snapshot.checkpoint &&
    (snapshot.before ?? null) !== nativeCursor
  )
    throw new Error("Concurrent import changed the provider checkpoint");
  const checkpoint =
    credentialVersion &&
    snapshot.checkpoint &&
    snapshot.checkpoint !== nativeCursor
      ? { before: nativeCursor ?? null, after: snapshot.checkpoint }
      : null;
  const length = Math.max(pending.length, checkpoint || signals.length ? 1 : 0);
  for (let offset = 0; offset < length; offset += 10) {
    const nextCursor = randomUUID();
    await api("/sync", {
      id: randomUUID(),
      cursor,
      nextCursor,
      entries: pending.slice(offset, offset + 10),
      ...(credentialVersion ? { credentialVersion } : {}),
      ...(offset + 10 >= length
        ? {
            ...(checkpoint ? { nativeCheckpoint: checkpoint } : {}),
            ...(signals.length ? { signals } : {}),
          }
        : {}),
    });
    cursor = nextCursor;
  }
  return pending.length;
}
