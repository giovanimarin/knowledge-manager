import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { pushSnapshot } from "../scripts/ingestion/push.mjs";

test("incremental sync commits removals before downloading and keeps the native checkpoint on failure", async (t) => {
  let cursor = "previous";
  let nativeCursor = "native-old";
  const committed = [];
  const records = new Map([
    ["removed", { remote_key: "removed", version: "1", state: "draft" }],
    ["unchanged", { remote_key: "unchanged", version: "1", state: "draft" }],
  ]);
  const server = createServer(async (req, res) => {
    if (req.url.endsWith("/objects")) {
      res.end(
        JSON.stringify({
          cursor,
          nativeCursor,
          credentialVersion: 1,
          objects: [...records.values()],
        }),
      );
      return;
    }
    let data = "";
    for await (const part of req) data += part;
    const change = JSON.parse(data);
    if (change.cursor !== cursor || change.credentialVersion !== 1) {
      res.writeHead(409).end();
      return;
    }
    for (const entry of change.entries) {
      committed.push(entry.remoteKey);
      records.set(entry.remoteKey, {
        remote_key: entry.remoteKey,
        version: entry.version,
        state: entry.operation === "delete" ? "deleted" : "draft",
      });
    }
    if (change.nativeCheckpoint) {
      assert.equal(change.nativeCheckpoint.before, nativeCursor);
      nativeCursor = change.nativeCheckpoint.after;
    }
    cursor = change.nextCursor;
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = "http://127.0.0.1:" + server.address().port;
  let fail = true;
  const snapshot = {
    before: "native-old",
    checkpoint: "native-new",
    delta: true,
    removed: ["removed"],
    files: [{ remoteKey: "updated", version: "2" }],
    async read() {
      assert.deepEqual(committed, ["removed"]);
      if (fail) throw new Error("provider failed during download");
      return "updated content";
    },
  };
  const options = {
    snapshot,
    source: "fixture",
    base,
    session: "synthetic",
    mapped: true,
    expectedCredentialVersion: 1,
  };
  await assert.rejects(
    pushSnapshot({ ...options, expectedSyncCursor: "outdated" }),
    /Source changed/,
  );
  assert.deepEqual(committed, []);
  await assert.rejects(
    pushSnapshot({ ...options, expectedSyncCursor: cursor }),
    /provider failed/,
  );
  assert.equal(nativeCursor, "native-old");
  assert.equal(records.get("removed").state, "deleted");
  assert.equal(records.get("unchanged").state, "draft");
  fail = false;
  await pushSnapshot({ ...options, expectedSyncCursor: cursor });
  assert.deepEqual(committed, ["removed", "updated"]);
  assert.equal(nativeCursor, "native-new");
});
