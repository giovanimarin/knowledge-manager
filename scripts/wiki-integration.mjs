import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const [, , identityFile, browserFile, mode] = process.argv;
const { tenant, adminA, adminB, adminMemberA, secret, accessC } = JSON.parse(
  readFileSync(identityFile, "utf8"),
);
const fixtures = JSON.parse(
  readFileSync(new URL("../contracts/fixtures/wiki.json", import.meta.url)),
);
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
async function request(method, path, body, token = adminA, expected = 200) {
  const response = await fetch(
    new URL(
      path.startsWith("/v1/") ? path : "/v1/wiki" + path,
      process.env.KM_BASE_URL,
    ),
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    },
  );
  assert.equal(response.status, expected, method + " " + path);
  const result = await response.json();
  if (expected >= 400) {
    assert.deepEqual(Object.keys(result).sort(), [
      "correlationId",
      "status",
      "title",
      "type",
    ]);
    assert.equal(result.status, expected);
  }
  return result;
}

if (mode === "dedicated") {
  const { root } = JSON.parse(readFileSync(browserFile, "utf8"));
  await request("GET", "/pages/" + root, undefined, accessC, 404);
  await request("GET", "/pages/" + root, undefined, adminA, 401);
  await request(
    "POST",
    "/pages/" + root + "/comments",
    { text: "Bloquear" },
    accessC,
    404,
  );
  console.log(
    "Wiki G2: C dedicado não lê nem escreve documentos da topologia shared",
  );
  process.exit(0);
}

await request("GET", "/spaces", undefined, null, 401);
await request("POST", "/spaces", fixtures.space, adminA, 404);
const role = randomUUID();
const grant = randomUUID();
db(`insert into km.identity_roles(tenant_id,id,name,actions) values ('${tenant}','${role}','Wiki fixture',array['content.read','content.edit','content.comment','content.acl.manage']);
insert into km.identity_grants(tenant_id,id,role_id,member_id,effect) values ('${tenant}','${grant}','${role}','${adminMemberA}','allow')`);

const space = await request("POST", "/spaces", fixtures.space);
await request("PATCH", "/metadata-schemas/" + space.id, {
  fields: { unit: "string" },
});
assert.equal(
  (await request("GET", "/metadata-schemas/" + space.id)).fields.unit,
  "string",
);
await request("PATCH", "/settings", { retentionDays: 45 });
const other = await request("POST", "/spaces", { title: "Pesquisa" });
const root = await request("POST", "/pages", {
  ...fixtures.page,
  spaceId: space.id,
});
const child = await request("POST", "/pages", {
  ...fixtures.child,
  spaceId: space.id,
  parentId: root.id,
});
await request("GET", "/pages/" + root.id, undefined, adminB, 404);
assert.deepEqual(
  await request("GET", "/pages?q=Checklist", undefined, adminB),
  [],
);
assert.equal(
  (await request("GET", "/pages?q=Checklist&tag=seguran%C3%A7a"))[0].id,
  root.id,
);
await request(
  "PATCH",
  "/pages/" + root.id,
  { revision: 2, title: "Desatualizado" },
  adminA,
  409,
);
await request("PATCH", "/pages/" + root.id, {
  revision: 1,
  metadata: { unit: "suporte" },
});
assert.equal(
  (await request("GET", "/pages/" + root.id)).metadata.unit,
  "suporte",
);
await request(
  "POST",
  "/pages/" + root.id + "/move",
  { spaceId: space.id, parentId: child.id },
  adminA,
  409,
);
const copied = await request("POST", "/pages/" + root.id + "/duplicate", {
  spaceId: other.id,
});
assert.equal(
  (await request("GET", "/pages?spaceId=" + other.id)).filter(
    (row) => row.parent_id === copied.id,
  ).length,
  1,
);
await request("POST", "/pages/" + child.id + "/move", { spaceId: other.id });
assert.equal((await request("GET", "/pages/" + child.id)).space_id, other.id);
await request("POST", "/pages/" + root.id + "/relations", {
  targetId: child.id,
  ...fixtures.relation,
});
assert.equal(
  (await request("GET", "/pages/" + child.id + "/relations"))[0].source_id,
  root.id,
);
const comment = await request(
  "POST",
  "/pages/" + root.id + "/comments",
  fixtures.comment,
);
await request("POST", "/pages/" + root.id + "/comments", {
  ...fixtures.comment,
  rootId: comment.id,
});
await request("PATCH", "/pages/" + root.id + "/comments/" + comment.id, {
  resolved: true,
});
assert.equal(
  (await request("GET", "/pages/" + root.id + "/comments")).find(
    (row) => row.id === comment.id,
  ).history.length,
  1,
);
await request("GET", "/pages/" + root.id + "/comments", undefined, adminB, 404);
const attachment = await request("POST", "/pages/" + root.id + "/attachments", {
  filename: "sample.txt",
  contentType: "text/plain",
  data: "dGVzdGUK",
});
assert.equal(attachment.scanState, "pending");
await request(
  "GET",
  "/pages/" + root.id + "/attachments/" + attachment.id,
  undefined,
  adminA,
  404,
);
const template = await request("POST", "/templates", {
  spaceId: space.id,
  title: "Checklist",
  content: "Versão inicial",
});
const created = await request("POST", "/pages", {
  spaceId: space.id,
  title: "Do template",
  templateId: template.id,
});
await request("POST", "/templates/" + template.id, {
  title: "Checklist",
  content: "Versão seguinte",
});
assert.equal(
  (await request("GET", "/pages/" + created.id)).content,
  "Versão inicial",
);
await request("DELETE", "/pages/" + child.id);
assert.equal(
  (await request("GET", "/pages/" + root.id + "/relations"))[0].broken,
  true,
);
// Explicitly expire the enrollment-derived step-up for the negative case.
db(
  `update km.session_families set step_until=null where tenant_id='${tenant}' and member_id='${adminMemberA}'`,
);
assert.ok((await request("GET", "/trash")).some((row) => row.id === child.id));
await request(
  "POST",
  "/trash/" + child.id + "/purge",
  { kind: "page", confirm: child.id },
  adminA,
  403,
);
await request("POST", "/pages/" + child.id + "/restore", {});
await request("DELETE", "/spaces/" + space.id);
await request("GET", "/pages/" + root.id, undefined, adminA, 404);
await request("POST", "/spaces/" + space.id + "/restore", {});
assert.equal(
  (await request("GET", "/pages/" + root.id + "/attachments")).length,
  1,
);
const imported = await request("POST", "/import-jobs", {
  format: "markdown",
  spaceId: space.id,
  items: [
    { title: "Importação", content: "## Manual" },
    {
      title: "Filho importado",
      content: "<script>synthetic</script>",
      parentIndex: 0,
    },
  ],
});
const batch = await request("GET", "/import-jobs/" + imported.id);
assert.equal(batch.items.length, 2);
const exported = await request("POST", "/export-jobs", {
  format: "html",
  pageIds: [batch.items[1].id, root.id],
});
const output = await request("GET", "/export-jobs/" + exported.id);
assert.match(output.documents[0].data, /&lt;script&gt;/);
assert.ok(output.manifest.losses.includes("attachments"));
await request("GET", "/export-jobs/" + exported.id, undefined, adminB, 404);
const deny = randomUUID();
db(`insert into km.identity_grants(tenant_id,id,role_id,member_id,resource_id,effect) values
 ('${tenant}','${deny}','${role}','${adminMemberA}','${root.id}','deny')`);
await request("GET", "/pages/" + root.id, undefined, adminA, 404);
await request("GET", "/export-jobs/" + exported.id, undefined, adminA, 404);
assert.deepEqual(
  await request("GET", "/pages?q=Access%20checklist&spaceId=" + space.id),
  [],
);
assert.deepEqual(await request("GET", "/pages/" + child.id + "/relations"), []);
assert.equal(db("set role km_app; select count(*) from km.wiki_pages"), "0");
db(
  `delete from km.identity_grants where tenant_id='${tenant}' and id='${deny}'`,
);
const disposable = await request("POST", "/pages", {
  spaceId: space.id,
  title: "Documento descartável",
});
await request("DELETE", "/pages/" + disposable.id);
db(
  `update km.session_families set step_until=now()+interval '2 minutes' where tenant_id='${tenant}' and member_id='${adminMemberA}' and revoked_at is null`,
);
await request("POST", "/trash/" + disposable.id + "/purge", {
  kind: "page",
  confirm: disposable.id,
});
await request(
  "POST",
  "/trash/" + disposable.id + "/restore",
  { kind: "page" },
  adminA,
  404,
);
assert.equal(
  db(
    `select count(*) from km.wiki_tombstones where tenant_id='${tenant}' and id='${disposable.id}'`,
  ),
  "1",
);
db(
  `update km.session_families set step_until=null where tenant_id='${tenant}' and member_id='${adminMemberA}'`,
);
const email = "wiki-reader@example.invalid";
const invitation = await request("POST", "/v1/members", {
  email,
  name: "Leitura da wiki",
});
const browserMember = await request(
  "POST",
  "/v1/invitations/accept",
  { proof: invitation.proof, password: secret },
  null,
);
db(`insert into km.identity_grants(tenant_id,id,role_id,member_id,resource_id,effect)
 values ('${tenant}',gen_random_uuid(),'${role}','${browserMember.id}','${space.id}','allow')`);
await request("POST", "/pages/" + root.id + "/comments", {
  text: "Menção de teste",
  mentions: [browserMember.id, randomUUID()],
});
const reader = await request(
  "POST",
  "/v1/sessions",
  { orgHint: tenant, email, password: secret },
  null,
);
assert.equal(
  (await request("GET", "/mentions", undefined, reader.accessToken))[0].page_id,
  root.id,
);
assert.deepEqual(await request("GET", "/mentions", undefined, adminB), []);
writeFileSync(
  browserFile,
  JSON.stringify({ tenant, email, password: secret, root: root.id }),
  { mode: 0o600 },
);
for (const [mode, url] of [
  ["filtered", "/pages?q=Access%20checklist&spaceId=" + space.id],
  ["unfiltered", "/pages"],
]) {
  const elapsed = [];
  for (let i = 0; i < 15; i++) {
    const start = performance.now();
    await request("GET", url);
    elapsed.push(performance.now() - start);
  }
  elapsed.sort((a, b) => a - b);
  console.log(
    "Wiki benchmark " +
      JSON.stringify({
        mode,
        requests: elapsed.length,
        p50Ms: elapsed[7],
        p95Ms: elapsed[14],
      }),
  );
}
console.log(
  "Wiki G1/G2: árvore, ACL ativa, busca, comentários, anexos em quarentena, templates e restauração",
);
