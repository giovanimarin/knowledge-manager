import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
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
  assert.ok(
    [status].flat().includes(response.status),
    `${path}: ${response.status}, esperado ${status}`,
  );
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
  await request(
    "GET",
    "/ingestion/pages/" + root + "/chunks",
    undefined,
    accessC,
    404,
  );
  await request(
    "GET",
    "/ingestion/pages/" + root + "/chunks",
    undefined,
    adminA,
    401,
  );

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
  const replay = updates[0].packet;
  const priorAck = a.frames.findIndex(
    (frame) => frame.type === "ack" && frame.operationId === replay.operationId,
  );
  assert.ok(priorAck >= 0);
  a.frames.splice(priorAck, 1);
  a.ws.send(JSON.stringify(replay));
  const repeated = await frame(
    a,
    (entry) => entry.type === "ack" && entry.operationId === replay.operationId,
  );
  assert.equal(repeated.sequence, receipts[0].sequence);
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
  db(`insert into km.identity_roles(tenant_id,id,name,actions) values ('${tenant}','${permissions}','Release proof',array['content.approve','content.publish','knowledge.govern']);
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
  const ingestPath = "/ingestion/pages/" + root;
  assert.deepEqual(await request("GET", ingestPath + "/chunks"), []);
  await request("GET", ingestPath + "/chunks", undefined, adminB, 404);
  db(`create function km.test_ingest_retry() returns trigger language plpgsql as $$
     begin raise exception 'synthetic ingest transaction failure'; end $$;
     create trigger test_ingest_retry before insert on km.ingest_generations
     for each row execute function km.test_ingest_retry()`);
  const ingestSpace = await request("POST", "/wiki/spaces", {
    title: "Fixture ingestão isolada",
  });
  db(`insert into km.identity_grants(tenant_id,id,role_id,member_id,resource_id,effect)
    values ('${tenant}',gen_random_uuid(),'${permissions}','${adminMemberA}','${ingestSpace.id}','allow')`);
  const connector = await request("POST", "/ingestion/sources", {
    spaceId: ingestSpace.id,
    title: "Fixture REST",
  });
  const syncRoute = "/ingestion/sources/" + connector.id;
  const remote = {
    remoteKey: "first",
    version: "v1",
    operation: "upsert",
    acl: "mapped-space",
    title: "Fonte importada",
    content: "A prova vem da origem.",
  };
  const batch = {
    id: randomUUID(),
    cursor: null,
    nextCursor: "p1",
    entries: [remote, { ...remote, remoteKey: "unmapped", acl: "unknown" }],
  };
  await request("POST", syncRoute + "/sync", batch);
  assert.equal(
    (await request("POST", syncRoute + "/sync", batch)).replayed,
    true,
  );
  await request(
    "POST",
    syncRoute + "/sync",
    { ...batch, id: randomUUID() },
    adminA,
    409,
  );
  const mapped = (await request("GET", syncRoute + "/objects")).objects;
  assert.equal(
    mapped.find((row) => row.remote_key === "unmapped").state,
    "quarantine",
  );
  const created = mapped.find((row) => row.remote_key === "first").page_id;
  assert.deepEqual(
    await request("GET", "/ingestion/pages/" + created + "/chunks"),
    [],
  );
  await request("POST", syncRoute + "/sync", {
    id: randomUUID(),
    cursor: "p1",
    nextCursor: "p2",
    entries: [{ remoteKey: "first", version: "v2", operation: "delete" }],
  });
  await request("GET", "/wiki/pages/" + created, undefined, adminA, 404);
  await request("POST", "/wiki/pages/" + created + "/restore", {}, adminA, 404);
  await request("GET", syncRoute + "/objects", undefined, adminB, 404);
  const assetPath = "/wiki/pages/" + root + "/attachments";
  const captured = await request("POST", assetPath, {
    filename: "origin.txt",
    contentType: "text/plain",
    data: Buffer.from("FROZEN ATTACHMENT").toString("base64"),
  });
  assert.equal(captured.scanState, "clean");
  const same = await request("POST", assetPath, {
    filename: "duplicate.txt",
    contentType: "text/plain",
    data: Buffer.from("FROZEN ATTACHMENT").toString("base64"),
  });
  assert.equal(same.scanState, "clean");
  const scanImage = await request("POST", assetPath, {
    filename: "ocr.png",
    contentType: "image/png",
    data: readFileSync(
      new URL("../contracts/fixtures/ingestion/ocr-pt-en.png", import.meta.url),
    ).toString("base64"),
  });
  assert.equal(scanImage.scanState, "clean");
  const scannedPdf = await request("POST", assetPath, {
    filename: "ocr.pdf",
    contentType: "application/pdf",
    data: readFileSync(
      new URL("../contracts/fixtures/ingestion/ocr-pt-en.pdf", import.meta.url),
    ).toString("base64"),
  });
  assert.equal(scannedPdf.scanState, "clean");
  const mixedPdf = await request("POST", assetPath, {
    filename: "mixed.pdf",
    contentType: "application/pdf",
    data: readFileSync(
      new URL(
        "../contracts/fixtures/ingestion/mixed-pt-en.pdf",
        import.meta.url,
      ),
    ).toString("base64"),
  });
  assert.equal(mixedPdf.scanState, "clean");
  const legacyFiles = [];
  for (const [extension, contentType, phrase] of [
    ["doc", "application/msword", "Documento legado seguro"],
    ["xls", "application/vnd.ms-excel", "Planilha legada segura"],
    ["ppt", "application/vnd.ms-powerpoint", "Apresentação legada segura"],
  ]) {
    const filename = "legacy." + extension;
    const file = await request("POST", assetPath, {
      filename,
      contentType,
      data: readFileSync(
        process.env.KM_INGEST_NATIVE_FIXTURES + "/" + filename,
      ).toString("base64"),
    });
    assert.equal(file.scanState, "clean");
    legacyFiles.push({ id: file.id, phrase });
  }
  const ingestionStarted = performance.now();
  const published = await request("POST", route + "/publication", {
    revision: review.revision,
    expectedRevision: restored.revision,
  });
  async function untilIngest(condition, label) {
    const end = performance.now() + 45000;
    while (performance.now() < end) {
      const value = await condition();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    assert.fail(label);
  }
  await untilIngest(
    async () =>
      (await request("GET", ingestPath + "/jobs")).find(
        (job) => job.kind === "published" && job.attempts > 0 && job.last_error,
      ),
    "retry not recorded",
  );
  assert.deepEqual(await request("GET", ingestPath + "/chunks"), []);
  const workerCompose = (...args) =>
    execFileSync(
      "docker",
      ["compose", "--env-file", process.env.KM_ENV_FILE, ...args],
      { stdio: "inherit" },
    );
  workerCompose("stop", "worker");
  db(
    "drop trigger test_ingest_retry on km.ingest_generations; drop function km.test_ingest_retry()",
  );
  workerCompose("up", "-d", "--wait", "--no-build", "worker");
  const chunks = await untilIngest(async () => {
    const rows = await request("GET", ingestPath + "/chunks");
    return rows.length ? rows : false;
  }, "ingestion did not recover");
  assert.ok(
    chunks.every(
      (row) =>
        row.publication_id === published.id && row.revision === review.revision,
    ),
  );
  assert.ok(chunks.some((row) => row.kind === "table"));
  assert.ok(
    chunks.some(
      (row) =>
        row.content.includes("Secure action") ||
        row.content.includes("Texto em português"),
    ),
  );
  assert.ok(
    chunks.some(
      (row) =>
        row.block_id === captured.id && row.content === "FROZEN ATTACHMENT",
    ),
  );
  assert.ok(
    chunks.some(
      (row) => row.block_id === same.id && row.content === "FROZEN ATTACHMENT",
    ),
  );
  assert.equal(
    db(`select count(*) from km.ingest_vectors where tenant_id='${tenant}'
    and digest=(select digest from km.ingest_chunks where tenant_id='${tenant}' and attachment_id='${captured.id}' limit 1)
    and public.vector_dims(embedding)=64`),
    "1",
  );
  const recognized = chunks.find((row) => row.block_id === scanImage.id);
  assert.match(recognized?.content ?? "", /ACESSO SEGURO/);
  assert.match(recognized?.content ?? "", /SECURE ACCESS/);
  assert.match(
    chunks.find((row) => row.block_id === scannedPdf.id)?.content ?? "",
    /ACESSO SEGURO/,
  );
  const hybrid = chunks
    .filter((row) => row.block_id === mixedPdf.id)
    .map((row) => row.content)
    .join(" ");
  assert.match(hybrid, /Camada textual preservada[\s\S]*ACESSO SEGURO/);
  for (const file of legacyFiles) {
    assert.ok(
      chunks.some(
        (row) => row.block_id === file.id && row.content.includes(file.phrase),
      ),
      file.phrase,
    );
  }
  const later = await request("POST", assetPath, {
    filename: "later.txt",
    contentType: "text/plain",
    data: Buffer.from("LATE ATTACHMENT").toString("base64"),
  });
  assert.equal(later.scanState, "clean");
  const ingestionRecoveredMs = Math.round(performance.now() - ingestionStarted);
  const initialIds = chunks.map((row) => row.id);
  const jobs = await Promise.all(
    Array.from({ length: 4 }, () =>
      request("POST", ingestPath + "/reprocess", {}),
    ),
  );
  await untilIngest(
    async () =>
      (await request("GET", ingestPath + "/jobs"))
        .filter((job) => jobs.some((requested) => requested.id === job.id))
        .every((job) => job.status === "done"),
    "reprocess did not finish",
  );
  assert.deepEqual(
    (await request("GET", ingestPath + "/chunks")).map((row) => row.id),
    initialIds,
  );
  assert.ok(
    !(await request("GET", ingestPath + "/chunks")).some(
      (row) => row.block_id === later.id,
    ),
  );
  await request("DELETE", assetPath + "/" + captured.id);
  assert.ok(
    !(await request("GET", ingestPath + "/chunks")).some(
      (row) => row.block_id === captured.id,
    ),
  );
  const connectionPath = syncRoute + "/connection";
  const hookPath = base + "/v1/ingestion/hooks/" + tenant + "/" + connector.id;
  const webhookSecret = randomBytes(32).toString("hex");
  const content = JSON.stringify({ ref: "refs/heads/main" });
  async function hook(secret, deliveryId, payload = content, url = hookPath) {
    return (
      await fetch(url, {
        method: "POST",
        body: payload,
        signal: AbortSignal.timeout(6000),
        headers: {
          "Content-Type": "application/json",
          "X-GitHub-Delivery": deliveryId,
          "X-Hub-Signature-256":
            "sha256=" +
            createHmac("sha256", secret).update(payload).digest("hex"),
        },
      })
    ).status;
  }
  db(`update km.session_families set step_until=now()+interval '10 minutes'
    where tenant_id='${tenant}' and member_id='${adminMemberA}'`);
  const connection = await request("PUT", connectionPath, {
    provider: "github",
    webhookSecret,
  });
  assert.equal(connection.credentialVersion, 1);
  assert.deepEqual(await request("GET", connectionPath), {
    provider: "github",
    credentialVersion: 1,
    revoked: false,
  });
  assert.equal(await hook("wrong", randomUUID()), 401);
  assert.equal(
    await hook(
      webhookSecret,
      randomUUID(),
      content,
      hookPath.replace(tenant, randomUUID()),
    ),
    404,
  );
  const delivery = randomUUID();
  assert.deepEqual(
    await Promise.all([
      hook(webhookSecret, delivery),
      hook(webhookSecret, delivery),
    ]),
    [200, 200],
  );
  assert.equal(await hook(webhookSecret, randomUUID()), 200);
  assert.equal(await hook(webhookSecret, delivery, "{}"), 409);
  assert.equal((await request("GET", syncRoute + "/signals")).length, 1);
  const changed = {
    id: randomUUID(),
    cursor: "p2",
    nextCursor: "p3",
    credentialVersion: 1,
    nativeCheckpoint: { before: null, after: "native-1" },
    signals: [delivery],
    entries: [{ ...remote, remoteKey: "revocable" }],
  };
  await request("POST", syncRoute + "/sync", changed);
  assert.deepEqual(await request("GET", syncRoute + "/signals"), []);
  const inventory = await request("GET", syncRoute + "/objects");
  assert.equal(inventory.nativeCursor, "native-1");
  const revocable = inventory.objects.find(
    (item) => item.remote_key === "revocable",
  ).page_id;
  const sourcePage = await request("GET", "/wiki/pages/" + revocable);
  await request("POST", "/editor/pages/" + revocable + "/publication", {
    revision: sourcePage.revision,
    expectedRevision: sourcePage.revision,
  });
  await untilIngest(
    async () =>
      (await request("GET", "/ingestion/pages/" + revocable + "/chunks"))
        .length,
    "connector source was not indexed",
  );
  const secondSecret = randomBytes(32).toString("hex");
  assert.equal(
    (
      await request("PUT", connectionPath, {
        provider: "github",
        webhookSecret: secondSecret,
      })
    ).credentialVersion,
    2,
  );
  assert.equal(await hook(webhookSecret, randomUUID()), 401);
  assert.equal(await hook(secondSecret, randomUUID()), 200);
  await request(
    "POST",
    syncRoute + "/sync",
    { ...changed, id: randomUUID(), cursor: "p3", nextCursor: "p4" },
    adminA,
    409,
  );
  await request(
    "POST",
    syncRoute + "/sync",
    {
      ...changed,
      id: randomUUID(),
      cursor: "p3",
      nextCursor: "p4",
      credentialVersion: 2,
    },
    adminA,
    409,
  );
  await request("DELETE", connectionPath);
  assert.equal(await hook(secondSecret, randomUUID()), 404);
  await request("GET", "/wiki/pages/" + revocable, undefined, adminA, 404);
  await request(
    "GET",
    "/ingestion/pages/" + revocable + "/chunks",
    undefined,
    adminA,
    404,
  );
  await untilIngest(
    () =>
      db(
        `select count(*) from km.ingest_generations where tenant_id='${tenant}' and page_id='${revocable}'`,
      ) === "0",
    "revoked source derivatives survived",
  );
  for (const provider of ["gitlab", "bitbucket"]) {
    const source = await request("POST", "/ingestion/sources", {
      spaceId: ingestSpace.id,
      title: "Fixture " + provider,
    });
    const control = "/ingestion/sources/" + source.id;
    await request("PUT", control + "/connection", { provider, webhookSecret });
    const nativeId = randomUUID();
    const proof =
      provider === "gitlab"
        ? { "Idempotency-Key": nativeId, "X-Gitlab-Token": webhookSecret }
        : {
            "X-Request-UUID": "{" + nativeId + "}",
            "X-Hub-Signature":
              "sha256=" +
              createHmac("sha256", webhookSecret).update(content).digest("hex"),
          };
    const url = base + "/v1/ingestion/hooks/" + tenant + "/" + source.id;
    const deliver = (headers) =>
      fetch(url, {
        method: "POST",
        body: content,
        headers: { "Content-Type": "application/json", ...headers },
        signal: AbortSignal.timeout(6000),
      });
    assert.equal((await deliver({})).status, 401);
    assert.equal((await deliver(proof)).status, 200);
    assert.equal((await deliver(proof)).status, 200);
    assert.equal((await request("GET", control + "/signals")).length, 1);
  }
  const managed = await request("POST", "/ingestion/sources", {
    spaceId: ingestSpace.id,
    title: "Fixture credencial",
  });
  const managedPath = "/ingestion/sources/" + managed.id;
  const clientConfig = {
    name: "Fixture source runner",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const clients = [
    await request("POST", "/service-clients", clientConfig),
    await request("POST", "/service-clients", {
      ...clientConfig,
      name: "Fixture another runner",
    }),
  ];
  const runnerRole = randomUUID();
  db(`insert into km.identity_roles(tenant_id,id,name,actions) values
    ('${tenant}','${runnerRole}','Runner fixture',array['knowledge.govern','content.acl.manage','content.read','content.edit']);
    insert into km.identity_grants(tenant_id,id,role_id,client_id,resource_id,effect) values
    ('${tenant}',gen_random_uuid(),'${runnerRole}','${clients[0].id}','${ingestSpace.id}','allow'),
    ('${tenant}',gen_random_uuid(),'${runnerRole}','${clients[1].id}','${ingestSpace.id}','allow')`);
  const [workerToken, anotherToken] = await Promise.all(
    clients.map(
      async (client) =>
        (
          await request(
            "POST",
            "/oauth/token",
            {
              grant_type: "client_credentials",
              client_id: client.id,
              client_secret: client.key,
            },
            null,
          )
        ).access_token,
    ),
  );
  const providerToken = randomBytes(32).toString("hex");
  const setup = {
    provider: "drive",
    target: "synthetic-drive",
    runnerId: clients[0].id,
    principalMapping: [
      { remote: "upstream-principal-a", member: adminMemberA },
    ],
    credential: providerToken,
  };
  const configured = await request("PUT", managedPath + "/connection", setup);
  assert.equal(configured.credentialVersion, 1);
  assert.equal(configured.credential, undefined);
  await request("POST", managedPath + "/credential", {}, adminA, 404);
  await request("POST", managedPath + "/credential", {}, anotherToken, 404);
  const lease = await request(
    "POST",
    managedPath + "/credential",
    {},
    workerToken,
  );
  assert.ok(
    lease.credential === providerToken && lease.target === setup.target,
    "managed runner credential mismatch",
  );
  assert.ok(
    db(`select credential like '%._%' and length(credential)>64
    from km.ingest_sources where tenant_id='${tenant}' and id='${managed.id}'`) ===
      "t",
    "credential must be encrypted",
  );
  const rotation = randomBytes(32).toString("hex");
  await request("PUT", managedPath + "/connection", {
    ...setup,
    credential: rotation,
  });
  const rotated = await request(
    "POST",
    managedPath + "/credential",
    {},
    workerToken,
  );
  assert.ok(
    rotated.credential === rotation && rotated.credentialVersion === 2,
    "managed rotation mismatch",
  );
  await request(
    "POST",
    managedPath + "/sync",
    {
      id: randomUUID(),
      nextCursor: "rotated",
      credentialVersion: 1,
      entries: [],
    },
    workerToken,
    409,
  );
  db(`insert into km.identity_grants(tenant_id,id,role_id,member_id,resource_id,effect)
    values ('${tenant}',gen_random_uuid(),'${runnerRole}','${actor.id}','${ingestSpace.id}','allow')`);
  const managedBatch = {
    id: randomUUID(),
    nextCursor: "native-acl",
    credentialVersion: 2,
    entries: [
      {
        ...remote,
        remoteKey: "permitted",
        nativePrincipals: ["upstream-principal-a"],
      },
      {
        ...remote,
        remoteKey: "mismatched",
        nativePrincipals: ["unknown-principal"],
      },
    ],
  };
  await request("POST", managedPath + "/sync", managedBatch, workerToken);
  const aclInventory = (
    await request("GET", managedPath + "/objects", undefined, workerToken)
  ).objects;
  const aclPage = aclInventory.find(
    (row) => row.remote_key === "permitted",
  ).page_id;
  assert.equal(
    aclInventory.find((row) => row.remote_key === "mismatched").state,
    "quarantine",
  );
  await request(
    "GET",
    "/wiki/pages/" + aclPage,
    undefined,
    reader.accessToken,
    404,
  );
  const mappedPage = await request("GET", "/wiki/pages/" + aclPage);
  const mappedPublish = "/editor/pages/" + aclPage + "/publication";
  await request("POST", mappedPublish, {
    revision: mappedPage.revision,
    expectedRevision: mappedPage.revision,
  });
  await untilIngest(
    async () =>
      (await request("GET", "/ingestion/pages/" + aclPage + "/chunks")).length,
    "native ACL page is not indexed",
  );
  await request(
    "GET",
    "/ingestion/pages/" + aclPage + "/chunks",
    undefined,
    reader.accessToken,
    404,
  );
  await request(
    "GET",
    "/ingestion/pages/" + aclPage + "/chunks",
    undefined,
    adminB,
    404,
  );
  await request("DELETE", managedPath + "/connection");
  await request(
    "GET",
    "/ingestion/pages/" + aclPage + "/chunks",
    undefined,
    adminA,
    404,
  );
  await request("POST", managedPath + "/credential", {}, workerToken, 404);
  const profileRoute = "/ingestion/profiles";
  const model = process.env.KM_INGEST_EMBED_MODEL;
  const dimension = Number(process.env.KM_INGEST_EMBED_DIMENSION);
  await request("GET", profileRoute, undefined, reader.accessToken, 404);
  assert.deepEqual(await request("GET", profileRoute, undefined, adminB), []);
  db(`update km.session_families set step_until=now()+interval '10 minutes'
    where tenant_id='${tenant}' and member_id='${adminMemberA}'`);
  const firstProfile = await Promise.all([
    request("POST", profileRoute, { model, dimension }, adminA, [200, 409]),
    request("POST", profileRoute, { model, dimension }, adminA, [200, 409]),
  ]);
  assert.equal(
    firstProfile.filter((profile) => profile.state === "building").length,
    1,
  );
  assert.equal(
    db(
      `select count(*) from km.ingest_profiles where tenant_id='${tenant}' and state='building'`,
    ),
    "1",
  );
  await untilIngest(
    async () => (await request("GET", profileRoute))[0]?.state === "active",
    "semantic backfill did not activate",
  );
  const semanticRows = await request("GET", ingestPath + "/chunks");
  assert.equal(semanticRows.length, initialIds.length - 1);
  assert.ok(semanticRows.every((row) => row.profile === "tenant-v1"));
  assert.equal(
    db(
      `select min(public.vector_dims(embedding)) from km.ingest_vectors where tenant_id='${tenant}' and profile='tenant-v1'`,
    ),
    String(dimension),
  );
  const failedStart = await request("POST", profileRoute, {
    model,
    dimension: dimension - 1,
  });
  assert.equal(failedStart.version, 2);
  await untilIngest(async () => {
    const profiles = await request("GET", profileRoute);
    return profiles[0]?.attempts > 0 && profiles[1]?.state === "active";
  }, "incompatible profile did not record retry");
  assert.ok(
    (await request("GET", ingestPath + "/chunks")).every(
      (row) => row.profile === "tenant-v1",
    ),
  );
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
  assert.deepEqual(await request("GET", ingestPath + "/chunks"), []);
  await untilIngest(
    () =>
      db(
        `select count(*) from km.ingest_generations where tenant_id='${tenant}' and page_id='${root}'`,
      ) === "0",
    "withdrawn generation not removed",
  );
  const ingestionReport = {
    recoveredMs: ingestionRecoveredMs,
    chunks: chunks.length,
    concurrentRequests: jobs.length,
    checks: [
      "retry",
      "restart",
      "publication",
      "tenant-denial",
      "attachment-integrity",
      "ocr",
      "scanned-and-mixed-pdf",
      "legacy-office",
      "semantic-profile-backfill",
      "deduplication",
      "withdrawal",
      "source-cursor",
      "signed-webhook-replay-rotation-revocation",
      "gitlab-bitbucket-native-hook",
      "scoped-credential-rotation",
      "native-acl-intersection",
    ],
  };
  if (process.env.KM_INGEST_G3_REPORT)
    writeFileSync(
      process.env.KM_INGEST_G3_REPORT,
      JSON.stringify(ingestionReport, null, 2) + "\n",
    );
  console.log("Ingestão métricas " + JSON.stringify(ingestionReport));
  console.log(
    "Ingestão G3: publicação, rollback/retry, reprocessamento concorrente, ACL e retirada",
  );

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
  db(`update km.editor_versions set saved_at=now()-interval '31 days'
    where tenant_id='${tenant}' and page_id='${root}' and revision=${original.revision}`);
  execFileSync("bash", ["scripts/local.sh", "editor-maintenance"], {
    stdio: "inherit",
  });
  await request(
    "GET",
    route + "/versions/" + original.revision,
    undefined,
    adminA,
    404,
  );
  await request("GET", route + "/versions/" + review.revision);
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
