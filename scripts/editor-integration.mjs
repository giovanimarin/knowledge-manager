import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { WebSocket } = require("ws");
const Y = require("yjs");
const [, , identity, browser, mode] = process.argv;
const { tenant, adminA, adminB, adminMemberA, accessC } = JSON.parse(
  readFileSync(identity, "utf8"),
);
const { root, email, password } = JSON.parse(readFileSync(browser, "utf8"));
const protocol = JSON.parse(
  readFileSync(new URL("../contracts/editor.protocol.json", import.meta.url)),
);
const durations = {};
const base = process.env.KM_BASE_URL;
const db = (query) =>
  execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      process.env.KM_ENV_FILE,
      "exec",
      "-T",
      "db",
      "psql",
      "-XAtq",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "km_bootstrap",
      "-d",
      "km",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
async function request(method, path, body, token = adminA, status = 200) {
  const response = await fetch(base + "/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, status, path);
  return response.json();
}
async function connect(token) {
  const ws = new WebSocket(
    base.replace(/^http/, "ws") + "/v1/collaboration/" + root,
  );
  const frames = [];
  ws.on("message", (bytes) => frames.push(JSON.parse(bytes.toString())));
  const closed = new Promise((resolve) => ws.on("close", resolve));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ type: "auth", token }));
  return { ws, frames, closed };
}
async function frame(client, predicate) {
  const end = performance.now() + 8000;
  while (performance.now() < end) {
    const found = client.frames.find(predicate);
    if (found) return found;
    if (client.ws.readyState === WebSocket.CLOSED)
      throw new Error("Socket closed before expected frame");
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.fail("Expected collaboration frame");
}
if (mode === "dedicated") {
  const a = await connect(adminA);
  const c = await connect(accessC);
  assert.equal(await a.closed, 4401);
  assert.equal(await c.closed, 4403);
  assert.equal(c.frames.length, 0);
  console.log("Editor G3: dedicated rejeitou sessão e documento shared");
  process.exit(0);
}
const reader = await request(
  "POST",
  "/sessions",
  { orgHint: tenant, email, password },
  null,
);
const actor = await request("GET", "/me", undefined, reader.accessToken);
const original = await request("GET", "/wiki/pages/" + root);
const fixtures = JSON.parse(
  readFileSync(new URL("../contracts/fixtures/editor.json", import.meta.url)),
);
const a = await connect(adminA);
const b = await connect(reader.accessToken);
try {
  const invalidSession = await connect("inactive");
  assert.equal(await invalidSession.closed, 4401);
  assert.equal(invalidSession.frames.length, 0);
  const denied = await connect(adminB);
  assert.equal(await denied.closed, 4403);
  assert.equal(denied.frames.length, 0);
  const syncA = await frame(a, (x) => x.type === "sync");
  const syncB = await frame(b, (x) => x.type === "sync");
  assert.deepEqual(
    Object.keys(syncA).sort(),
    protocol.serverFrames.sync.slice().sort(),
  );
  const d1 = new Y.Doc(),
    d2 = new Y.Doc();
  Y.applyUpdate(d1, Buffer.from(syncA.snapshot, "base64"));
  Y.applyUpdate(d2, Buffer.from(syncB.snapshot, "base64"));
  const selected = d1.getArray("blocks").get(0).get("id");
  a.ws.send(JSON.stringify({ type: "cursor", blockId: selected, offset: 1 }));
  assert.ok(
    await frame(
      b,
      (x) =>
        x.type === "presence" &&
        x.participants.some((p) => p.cursor?.blockId === selected),
    ),
  );
  const updates = [
    [a, d1, " A"],
    [b, d2, " B"],
  ].map(([client, doc, text]) => {
    const vector = Y.encodeStateVector(doc);
    doc.getArray("blocks").get(0).get("text").insert(0, text);
    return {
      client,
      packet: {
        type: "update",
        operationId: randomUUID(),
        generation: syncA.generation,
        update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString(
          "base64",
        ),
      },
    };
  });
  let started = performance.now();
  for (const { client, packet } of updates)
    client.ws.send(JSON.stringify(packet));
  const receipts = await Promise.all(
    updates.map(({ client, packet }) =>
      frame(
        client,
        (x) => x.type === "ack" && x.operationId === packet.operationId,
      ),
    ),
  );
  durations.concurrentAcksMs = Math.round(performance.now() - started);
  for (const receipt of receipts)
    assert.deepEqual(
      Object.keys(receipt).sort(),
      protocol.serverFrames.ack.slice().sort(),
    );
  const high = Math.max(...receipts.map((x) => x.sequence));
  for (const client of [a, b]) {
    const snapshot = await frame(
      client,
      (x) => x.type === "sync" && x.sequence === high,
    );
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(snapshot.snapshot, "base64"));
    const merged = doc.getArray("blocks").get(0).get("text").toString();
    assert.match(merged, / A/);
    assert.match(merged, / B/);
    doc.destroy();
  }
  a.ws.send(JSON.stringify(updates[0].packet));
  await frame(
    a,
    (x) => x.type === "ack" && x.operationId === updates[0].packet.operationId,
  );
  assert.equal(
    db(
      `select count(*) from km.editor_receipts where tenant_id='${tenant}' and page_id='${root}'`,
    ),
    "2",
  );
  b.ws.close();
  await b.closed;
  started = performance.now();
  const reopened = await connect(reader.accessToken);
  assert.equal(
    (await frame(reopened, (x) => x.type === "sync")).sequence,
    high,
  );
  durations.reconnectMs = Math.round(performance.now() - started);
  const deny = randomUUID(),
    role = randomUUID();
  db(`insert into km.identity_roles(tenant_id,id,name,actions) values ('${tenant}','${role}','Editor proof',array['content.read','content.edit']);
  insert into km.identity_grants(tenant_id,id,role_id,member_id,resource_id,effect) values ('${tenant}','${deny}','${role}','${actor.id}','${root}','deny')`);
  started = performance.now();
  reopened.ws.send(
    JSON.stringify({ ...updates[1].packet, operationId: randomUUID() }),
  );
  assert.equal(await reopened.closed, 4403);
  durations.revocationMs = Math.round(performance.now() - started);
  await request(
    "GET",
    "/editor/pages/" + root + "/versions",
    undefined,
    reader.accessToken,
    404,
  );
  db(`delete from km.identity_grants where id='${deny}'`);
  const rich = new Y.Doc();
  const hit = await frame(a, (x) => x.type === "sync" && x.sequence === high);
  Y.applyUpdate(rich, Buffer.from(hit.snapshot, "base64"));
  const vector = Y.encodeStateVector(rich);
  for (const block of fixtures.blocks) {
    const data = new Y.Map();
    data.set("id", randomUUID());
    data.set("kind", block.kind);
    data.set("text", new Y.Text(block.text));
    if (block.checked !== undefined) data.set("checked", block.checked);
    if (block.url) data.set("url", block.url);
    rich.getArray("blocks").push([data]);
  }
  const op = randomUUID();
  a.ws.send(
    JSON.stringify({
      type: "update",
      operationId: op,
      generation: hit.generation,
      update: Buffer.from(Y.encodeStateAsUpdate(rich, vector)).toString(
        "base64",
      ),
    }),
  );
  const result = await frame(
    a,
    (x) => x.type === "ack" && x.operationId === op,
  );
  const view = await request("GET", "/wiki/pages/" + root);
  assert.deepEqual(
    view.blocks.slice(-fixtures.blocks.length).map(({ id, ...block }) => {
      assert.ok(id);
      return block;
    }),
    fixtures.blocks,
  );
  assert.ok(
    (
      await request(
        "GET",
        "/editor/pages/" + root + "/versions/" + original.revision + "/diff",
      )
    ).changes.length,
  );
  const permissions = randomUUID();
  db(`insert into km.identity_roles(tenant_id,id,name,actions) values ('${tenant}','${permissions}','Release proof',array['content.approve','content.publish']);
    insert into km.identity_grants(tenant_id,id,role_id,member_id,resource_id,effect) values
     ('${tenant}',gen_random_uuid(),'${permissions}','${adminMemberA}','${root}','allow'),
     ('${tenant}',gen_random_uuid(),'${permissions}','${actor.id}','${root}','allow')`);
  const route = "/editor/pages/" + root;
  await request("PATCH", "/editor/spaces/" + original.space_id + "/policy", {
    approvalRequired: true,
    retentionDays: 30,
  });
  await request(
    "POST",
    route + "/publication",
    { expectedRevision: result.sequence },
    adminA,
    403,
  );
  const review = await request("POST", route + "/reviews", {
    reviewerId: actor.id,
    expectedRevision: result.sequence,
  });
  const restored = await request(
    "POST",
    route + "/versions/" + original.revision + "/restore",
    { expectedRevision: result.sequence },
  );
  await request(
    "POST",
    route + "/reviews/" + review.id + "/decision",
    { approved: true },
    adminA,
    404,
  );
  await request(
    "POST",
    route + "/reviews/" + review.id + "/decision",
    { approved: true },
    reader.accessToken,
  );
  const published = await request("POST", route + "/publication", {
    revision: review.revision,
    expectedRevision: restored.revision,
  });
  const live = await request("GET", route + "/publication");
  assert.equal(live.revision, review.revision);
  assert.equal(live.content, view.content);
  assert.equal(
    (await request("GET", "/wiki/pages/" + root)).content,
    original.content,
  );
  assert.equal(
    db(
      `select count(*) from km.editor_outbox where publication_id='${published.id}' and kind='published'`,
    ),
    "1",
  );
  await request("DELETE", route + "/publication", {
    expectedRevision: restored.revision,
  });
  await request("GET", route + "/publication", undefined, adminA, 404);
  const scheduled = await request("POST", route + "/publication", {
    revision: review.revision,
    expectedRevision: restored.revision,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    reviewAt: new Date(Date.now() + 1800000).toISOString(),
  });
  db(
    `update km.editor_publications set review_at=now()-interval '1 second' where id='${scheduled.id}'`,
  );
  execFileSync("bash", ["scripts/local.sh", "editor-maintenance"], {
    stdio: "inherit",
  });
  assert.equal(
    db(
      `select count(*) from km.editor_outbox where publication_id='${scheduled.id}' and kind='review.due'`,
    ),
    "1",
  );
  const notices = await request("GET", "/editor/notifications");
  assert.ok(notices.some((item) => item.kind === "review.due"));
  db(
    `update km.editor_publications set expires_at=now()-interval '1 second' where id='${scheduled.id}'`,
  );
  await request("GET", route + "/publication", undefined, adminA, 404);
  execFileSync("bash", ["scripts/local.sh", "editor-maintenance"], {
    stdio: "inherit",
  });
  assert.equal(
    db(
      `select count(*) from km.editor_outbox where publication_id='${scheduled.id}' and kind='withdrawn'`,
    ),
    "1",
  );
  a.ws.close();
  await a.closed;
  const compose = (...args) =>
    execFileSync(
      "docker",
      ["compose", "--env-file", process.env.KM_ENV_FILE, ...args],
      { stdio: "inherit" },
    );
  started = performance.now();
  compose("restart", "api");
  compose("up", "-d", "--wait", "--no-build", "api");
  const afterRestart = await connect(adminA);
  try {
    assert.equal(
      (await frame(afterRestart, (x) => x.type === "sync")).sequence,
      restored.revision,
    );
  } finally {
    afterRestart.ws.close();
  }
  durations.restartAndSyncMs = Math.round(performance.now() - started);
  if (process.env.KM_EDITOR_G3_REPORT)
    writeFileSync(
      process.env.KM_EDITOR_G3_REPORT,
      JSON.stringify(
        {
          clients: 2,
          durations,
          checks: [
            "converged",
            "deduplication",
            "reconnect",
            "revocation",
            "restart",
            "approval",
            "expiry",
          ],
        },
        null,
        2,
      ) + "\n",
    );
  console.log("Editor métricas " + JSON.stringify(durations));
  console.log(
    "Editor G3: dois clientes reais, CRDT, presença/cursor, replay, reconexão, revogação, versões e publicação imutável",
  );
} finally {
  a.ws.close();
  b.ws.close();
}
