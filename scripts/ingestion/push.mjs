import { randomUUID } from "node:crypto";
export async function pushSnapshot({
  snapshot,
  source,
  base,
  session,
  mapped,
  nativePrincipals,
  signals = [],
  expectedCredentialVersion,
  expectedSyncCursor,
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
  if (expectedSyncCursor !== undefined && expectedSyncCursor !== cursor)
    throw new Error("Source changed after this synchronization started");
  if (
    credentialVersion &&
    snapshot.checkpoint &&
    (snapshot.before ?? null) !== nativeCursor
  )
    throw new Error("Concurrent import changed the provider checkpoint");
  const prior = new Map(records.map((object) => [object.remote_key, object]));
  const latest = new Set(snapshot.files.map((file) => file.remoteKey));

  const pending = [],
    reads = [];
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
    const change = {
      ...file,
      title,
      content: "",
      operation: "upsert",
      acl: allowed ? "mapped-space" : "unknown",
      ...(allowed && nativePrincipals?.length ? { nativePrincipals } : {}),
    };
    if (allowed) reads.push(change);
    else pending.push(change);
  }
  cursor ??= null;
  const checkpoint =
    credentialVersion &&
    snapshot.checkpoint &&
    snapshot.checkpoint !== nativeCursor
      ? { before: nativeCursor ?? null, after: snapshot.checkpoint }
      : null;
  const batches = [pending, reads].flatMap((changes) =>
    Array.from({ length: Math.ceil(changes.length / 10) }, (_, index) =>
      changes.slice(index * 10, index * 10 + 10),
    ),
  );
  if (!batches.length && (checkpoint || signals.length)) batches.push([]);
  for (const [index, changes] of batches.entries()) {
    const nextCursor = randomUUID();
    const entries = [];
    for (const change of changes) {
      const content =
        change.acl === "mapped-space"
          ? await snapshot.read(change)
          : change.content;
      if (content?.length > 50000)
        throw new Error("Source content exceeds bounds");
      entries.push({
        ...change,
        ...(content === undefined ? {} : { content }),
      });
    }
    await api("/sync", {
      id: randomUUID(),
      cursor,
      nextCursor,
      entries,
      ...(credentialVersion ? { credentialVersion } : {}),
      ...(index === batches.length - 1
        ? {
            ...(checkpoint ? { nativeCheckpoint: checkpoint } : {}),
            ...(signals.length ? { signals } : {}),
          }
        : {}),
    });
    cursor = nextCursor;
  }
  return pending.length + reads.length;
}
