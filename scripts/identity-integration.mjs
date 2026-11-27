import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";

const { URI } = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
)("otpauth");
const [mode, file] = process.argv.slice(2);
const base = process.env.KM_BASE_URL;
const password = randomBytes(24).toString("base64url");
const login = (tenant, email, secret) => ({ tenant, email, secret });

async function request(method, path, { body, token, status = 200 } = {}) {
  const response = await fetch(new URL(`/v1${path}`, base), {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${result.title ?? "unexpected status"}`,
  );
  if (status >= 400) {
    assert.equal(result.status, status);
    assert.ok(result.correlationId);
  }
  return result;
}

function bootstrap(name, email, display) {
  const proc = spawnSync(
    "bash",
    ["scripts/local.sh", "bootstrap", name, email, display],
    { input: password + "\n", encoding: "utf8", env: process.env },
  );
  assert.equal(proc.status, 0, proc.stderr);
  return JSON.parse(proc.stdout.trim());
}

function db(source) {
  const p = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      process.env.KM_ENV_FILE,
      "exec",
      "-T",
      "db",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "km_bootstrap",
      "-d",
      "km",
      "-Atq",
    ],
    { input: source, encoding: "utf8", env: process.env },
  );
  assert.equal(p.status, 0, p.stderr);
  return p.stdout.trim();
}

async function start(account) {
  return request("POST", "/sessions", {
    body: {
      orgHint: account.tenant,
      email: account.email,
      password: account.secret,
    },
  });
}

async function admin(account) {
  const { accessToken: token } = await start(account);
  assert.ok(token);
  await request("GET", "/members", { token, status: 403 });
  const { uri } = await request("POST", "/mfa/enroll", { body: {}, token });
  const code = URI.parse(uri).generate();
  const codes = (
    await request("POST", "/mfa/confirm", { body: { code }, token })
  ).recoveryCodes;
  assert.equal(codes.length, 8);
  await request("POST", "/mfa/step-up", { token, body: { code }, status: 401 });
  return { token, codes };
}

async function primary() {
  await request("GET", "/me", { status: 401 });
  const a = bootstrap("Empresa A", "admin-a@example.invalid", "Admin A");
  const b = bootstrap("Empresa B", "admin-b@example.invalid", "Admin B");
  const aAccount = login(a.tenant, "admin-a@example.invalid", password);
  const { token: adminA, codes } = await admin(aAccount);
  const { token: adminB } = await admin(
    login(b.tenant, "admin-b@example.invalid", password),
  );
  const { challenge } = await start(aAccount);
  const access = (
    await request("POST", "/mfa/challenge", {
      body: { challenge, code: codes[0] },
    })
  ).accessToken;
  assert.ok(access);
  await request("POST", "/mfa/challenge", {
    body: { challenge, code: codes[0] },
    status: 401,
  });
  const next = (await start(aAccount)).challenge;
  await request("POST", "/mfa/challenge", {
    body: { challenge: next, code: codes[0] },
    status: 401,
  });
  assert.equal((await request("GET", "/members", { token: adminA })).length, 1);
  await request("PATCH", `/members/${b.member}`, {
    token: adminA,
    body: { state: "suspended" },
    status: 404,
  });
  assert.equal(
    (await request("GET", "/me", { token: adminB })).tenant,
    b.tenant,
  );
  assert.equal(
    db("SET ROLE km_app; SELECT count(*) FROM km.memberships;"),
    "0",
  );
  db(`begin; set local role km_app; select set_config('km.tenant_id','${a.tenant}',true);
    do $$ begin
      if (select count(*) from km.memberships) <> 1 then raise exception 'RLS read isolation failed'; end if;
      begin
        insert into km.memberships(tenant_id,id,email,name,password_hash) values ('${b.tenant}',gen_random_uuid(),'cross@example.invalid','X','synthetic');
        raise exception 'cross-tenant write succeeded';
      exception when insufficient_privilege then null; end;
      begin delete from km.identity_audit; raise exception 'audit delete succeeded';
      exception when insufficient_privilege then null; end;
    end $$; commit;`);
  const importResult = await request("POST", "/members/invitations", {
    token: adminA,
    body: { csv: 'email,name\nextra@example.invalid,"Pessoa, Extra"' },
  });
  assert.equal(importResult.length, 1);
  await request("POST", "/members/invitations", {
    token: adminA,
    body: { csv: "email,name\ninvalid" },
    status: 400,
  });
  await request("POST", "/privacy-requests", {
    token: adminA,
    body: { kind: "export" },
  });
  assert.equal(
    (await request("GET", "/privacy-requests", { token: adminA })).length,
    1,
  );
  assert.equal(
    (await request("GET", "/privacy-requests", { token: adminB })).length,
    0,
  );
  const invited = await request("POST", "/members", {
    token: adminA,
    body: { email: "member@example.invalid", name: "Membro A" },
  });
  const person = await request("POST", "/invitations/accept", {
    body: { proof: invited.proof, password },
  });
  await request("POST", "/invitations/accept", {
    body: { proof: invited.proof, password },
    status: 401,
  });
  const account = login(a.tenant, "member@example.invalid", password);
  const groupMfa = await request("POST", "/groups", {
    token: adminA,
    body: { name: "MFA obrigatório", requireMfa: true, members: [person.id] },
  });
  const limited = await start(account);
  assert.equal(
    (await request("GET", "/me", { token: limited.accessToken })).mfaRequired,
    true,
  );
  await request("GET", "/sessions", {
    token: limited.accessToken,
    status: 403,
  });
  await request("PATCH", `/groups/${groupMfa.id}/members`, {
    token: adminA,
    body: { members: [] },
  });
  assert.equal(
    (await request("GET", "/me", { token: limited.accessToken })).mfaRequired,
    false,
  );
  const old = await start(account);
  const rotated = await request("POST", "/sessions/refresh", {
    body: { refreshToken: old.refreshToken },
  });
  await request("GET", "/me", { token: old.accessToken, status: 401 });
  assert.equal(
    (await request("GET", "/me", { token: rotated.accessToken })).id,
    person.id,
  );
  await request("POST", "/sessions/refresh", {
    body: { refreshToken: old.refreshToken },
    status: 401,
  });
  await request("GET", "/me", { token: rotated.accessToken, status: 401 });
  assert.equal(
    (
      await request("POST", "/access/check", {
        token: adminA,
        body: { action: "content.read" },
      })
    ).allowed,
    false,
  );
  const role = await request("POST", "/roles", {
    token: adminA,
    body: { name: "Leitura", actions: ["content.read"] },
  });
  await request("POST", "/grants", {
    token: adminA,
    body: { roleId: role.id, memberId: person.id, effect: "allow" },
    status: 403,
  });
  const parent = await request("POST", "/groups", {
    token: adminA,
    body: { name: "Pai" },
  });
  const group = await request("POST", "/groups", {
    token: adminA,
    body: { name: "Filho", parentId: parent.id, members: [person.id] },
  });
  assert.ok(group.id);
  const resource = randomUUID();
  db(`insert into km.identity_resources values ('${a.tenant}','${resource}',null,'restricted');
    insert into km.identity_grants(tenant_id,id,role_id,group_id,resource_id,effect)
    values ('${a.tenant}',gen_random_uuid(),'${role.id}','${parent.id}','${resource}','allow');`);
  const live = await start(account);
  assert.equal(
    (
      await request("POST", "/access/check", {
        token: live.accessToken,
        body: { action: "content.read", resourceId: resource },
      })
    ).allowed,
    true,
  );
  assert.equal(
    (
      await request("POST", "/access/check", {
        token: live.accessToken,
        body: { action: "content.read", resourceId: resource, external: true },
      })
    ).allowed,
    false,
  );
  const deny = await request("POST", "/grants", {
    token: adminA,
    body: {
      roleId: role.id,
      memberId: person.id,
      resourceId: resource,
      effect: "deny",
    },
  });
  assert.equal(
    (
      await request("POST", "/access/check", {
        token: live.accessToken,
        body: { action: "content.read", resourceId: resource },
      })
    ).allowed,
    false,
  );
  await request("DELETE", `/grants/${deny.id}`, { token: adminA });
  const service = await request("POST", "/service-clients", {
    token: adminA,
    body: {
      name: "Integração local",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
  });
  const exchange = (secret, status = 200) =>
    request("POST", "/oauth/token", {
      body: {
        grant_type: "client_credentials",
        client_id: service.id,
        client_secret: secret,
      },
      status,
    });
  const issued = await exchange(service.key);
  assert.equal(
    (await request("GET", "/me", { token: issued.access_token })).kind,
    "service",
  );
  assert.equal(
    (
      await request("POST", "/access/check", {
        token: issued.access_token,
        body: {
          action: "content.read",
          resourceId: resource,
          delegatedAccessToken: live.accessToken,
        },
      })
    ).allowed,
    false,
  );
  await request("POST", "/access/check", {
    token: service.key,
    body: { action: "content.read", delegatedAccessToken: adminB },
    status: 401,
  });
  const replaced = await request(
    "POST",
    `/service-clients/${service.id}/rotate`,
    { token: adminA, body: {} },
  );
  await exchange(service.key, 401);
  await request("GET", "/me", { token: issued.access_token, status: 401 });
  assert.ok((await exchange(replaced.key)).access_token);
  await request("DELETE", `/service-clients/${service.id}`, { token: adminA });
  await request("GET", "/me", { token: replaced.key, status: 401 });
  const recovery = await request("POST", "/recovery", {
    token: adminA,
    body: { memberId: person.id },
  });
  const newPassword = randomBytes(24).toString("base64url");
  await request("POST", "/recovery/complete", {
    body: { proof: recovery.proof, password: newPassword },
  });
  await request("POST", "/recovery/complete", {
    body: { proof: recovery.proof, password: newPassword },
    status: 401,
  });
  await request("GET", "/me", { token: live.accessToken, status: 401 });
  const afterRecovery = await start({ ...account, secret: newPassword });
  await request("PATCH", `/members/${person.id}`, {
    token: adminA,
    body: { state: "suspended" },
  });
  await request("GET", "/me", {
    token: afterRecovery.accessToken,
    status: 401,
  });
  assert.equal(
    (await request("GET", "/me", { token: adminB })).tenant,
    b.tenant,
  );
  writeFileSync(
    file,
    JSON.stringify({
      adminA,
      adminB,
      adminMemberA: a.member,
      workerTenantB: b.tenant,
      tenant: a.tenant,
      email: aAccount.email,
      secret: password,
    }),
    { mode: 0o600 },
  );
  console.log(
    "Identity OK: A/B, RLS sem contexto, MFA/replay, convites, RBAC/ABAC, serviços, recuperação e revogação",
  );
}

async function dedicated() {
  const a = JSON.parse(readFileSync(file, "utf8"));
  const c = bootstrap("Empresa C", "admin-c@example.invalid", "Admin C");
  const second = spawnSync(
    "bash",
    [
      "scripts/local.sh",
      "bootstrap",
      "Outro tenant",
      "other@example.invalid",
      "Outro",
    ],
    { input: password + "\n", encoding: "utf8", env: process.env },
  );
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /dedicated tenant already provisioned/);
  const { accessToken } = await start(
    login(c.tenant, "admin-c@example.invalid", password),
  );
  assert.equal(
    (await request("GET", "/me", { token: accessToken })).tenant,
    c.tenant,
  );
  await request("GET", "/me", { token: a.adminA, status: 401 });
  writeFileSync(
    file,
    JSON.stringify({ ...a, accessC: accessToken, workerTenantC: c.tenant }),
    {
      mode: 0o600,
    },
  );
  console.log(
    "Dedicated OK: C inicializado com namespace e credenciais independentes; token de A recusado",
  );
}

if (mode === "quota") {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const results = await Promise.all(
    Array.from({ length: 12 }, async () => {
      const response = await fetch(new URL("/v1/sessions", base), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgHint: data.tenant,
          email: "limited@example.invalid",
          password: "bad-login-fixture",
        }),
        signal: AbortSignal.timeout(15000),
      });
      return response.status;
    }),
  );
  assert.equal(results.filter((status) => status === 401).length, 10);
  assert.equal(results.filter((status) => status === 429).length, 2);
  console.log("Quota compartilhada verificada com 12 tentativas concorrentes");
} else if (mode === "primary") await primary();
else if (mode === "dedicated") await dedicated();
else if (mode === "restored") {
  const data = JSON.parse(readFileSync(file, "utf8"));
  await request("GET", "/me", { token: data.adminA, status: 401 });
  await request("POST", "/sessions", {
    status: 401,
    body: { orgHint: data.tenant, email: data.email, password: data.secret },
  });
  console.log("Restore fechado para identidades e sessões do snapshot");
} else if (mode === "cross") {
  const data = JSON.parse(readFileSync(file, "utf8"));
  await request("GET", "/me", { token: data.accessC, status: 401 });
} else {
  throw new Error("Invalid identity test mode");
}
