import { sql } from "@km/foundation";
import { Lifecycle } from "../editor/lifecycle.js";
import { EditorStore } from "../editor/store.js";
import {
  IdentityError,
  id,
  input,
  seal,
  string,
  unseal,
} from "../identity/security.js";
import { audit } from "../identity/sessions.js";
import { hookPurpose } from "./hooks.js";

type Principal = { remote: string; member: string };

export type Connection = {
  space_id: string;
  cursor: string | null;
  native_cursor: string | null;
  provider: string | null;
  credential_version: number;
  revoked_at: Date | null;
  runner_id: string | null;
  principal_mapping: Principal[];
  target: string | null;
};

const providers = new Set([
  "github",
  "gitlab",
  "bitbucket",
  "drive",
  "sharepoint",
  "onedrive",
  "confluence",
  "notion",
  "s3",
  "gcs",
]);

const credentialPurpose = (tenant: string, source: string) =>
  `ingestion-remote-credential-v1:${tenant}:${source}`;

export async function runnerCredential(
  store: EditorStore,
  source: string,
  connection: Connection,
) {
  if (
    store.actor.kind !== "service" ||
    store.actor.service.id !== connection.runner_id
  )
    throw new IdentityError(404);
  await store.require("content.acl.manage", connection.space_id);
  const data = (
    await sql<{
      credential: string;
      target: string;
    }>`select credential,target from km.ingest_sources
    where id=${source} and revoked_at is null`.execute(store.tx)
  ).rows[0];
  if (!data?.credential) throw new IdentityError(404);
  await audit(
    store.tx,
    store.tenant,
    store.actor.service.id,
    "ingestion.source.dispatch",
    "success",
    connection.space_id,
  );
  return {
    provider: connection.provider,
    target: data.target,
    credentialVersion: connection.credential_version,
    nativePrincipals: connection.principal_mapping.map(
      (principal) => principal.remote,
    ),
    credential: await unseal(
      data.credential,
      credentialPurpose(store.tenant, source),
    ),
  };
}

export async function manageConnection(
  store: EditorStore,
  source: string,
  connection: Connection,
  method: string,
  body: Record<string, unknown>,
) {
  await store.require("content.acl.manage", connection.space_id);
  if (method === "GET")
    return {
      provider: connection.provider,
      credentialVersion: connection.credential_version,
      revoked: !!connection.revoked_at,
      ...(connection.runner_id ? { managed: true } : {}),
    };
  if (store.actor.kind !== "member" || !store.actor.member.stepped_up)
    throw new IdentityError(403);
  if (connection.revoked_at) throw new IdentityError(409);
  if (method === "PUT") {
    const provider = string(body.provider, 30);
    if (
      !providers.has(provider) ||
      (connection.provider && connection.provider !== provider)
    )
      throw new IdentityError(400);
    const secret =
      body.webhookSecret == null ? null : string(body.webhookSecret, 1024);
    if (provider === "github" ? !secret || secret.length < 32 : secret !== null)
      throw new IdentityError(400);
    const encrypted =
      secret && (await seal(secret, hookPurpose(store.tenant, source)));
    const runner = body.runnerId == null ? null : id(body.runnerId);
    const remoteCredential =
      body.credential == null ? null : string(body.credential, 8192);
    const target = body.target == null ? null : string(body.target, 400);
    if (
      (connection.runner_id && !runner) ||
      (connection.target && target !== connection.target)
    )
      throw new IdentityError(409);
    if (
      (runner || target || remoteCredential) &&
      !(runner && target && remoteCredential)
    )
      throw new IdentityError(400);
    if (runner) {
      const found = await sql`select 1 from km.service_clients
        where id=${runner} and revoked_at is null and expires_at>now()`.execute(
        store.tx,
      );
      if (!found.rows.length) throw new IdentityError(404);
    }
    const suppliedMapping =
      body.principalMapping ?? connection.principal_mapping;
    if (!Array.isArray(suppliedMapping) || suppliedMapping.length > 100)
      throw new IdentityError(400);
    const mapping = suppliedMapping
      .map((entry) => {
        const value = input(entry);
        return { remote: string(value.remote, 256), member: id(value.member) };
      })
      .sort((a, b) => a.remote.localeCompare(b.remote));
    if (
      new Set(mapping.map(({ remote }) => remote)).size !== mapping.length ||
      (!runner && mapping.length)
    )
      throw new IdentityError(400);
    const trustedMembers = [...new Set(mapping.map(({ member }) => member))];
    if (
      trustedMembers.length &&
      (
        await sql`select id from km.memberships where tenant_id=${store.tenant} and id=any(${trustedMembers}::uuid[]) and state='active'`.execute(
          store.tx,
        )
      ).rows.length !== trustedMembers.length
    )
      throw new IdentityError(404);
    const mappingChanged =
      mapping.length !== connection.principal_mapping.length ||
      mapping.some((entry, index) => {
        const previous = connection.principal_mapping[index];
        return (
          entry.remote !== previous?.remote || entry.member !== previous.member
        );
      });
    if (mappingChanged) await denyImported(store, source, "quarantine");
    const cipher =
      remoteCredential &&
      (await seal(remoteCredential, credentialPurpose(store.tenant, source)));
    await sql`update km.ingest_sources set provider=${provider},webhook_secret=${encrypted},
      runner_id=${runner},credential=${cipher},target=${target},
      principal_mapping=${JSON.stringify(mapping)}::jsonb,
      native_cursor=case when ${mappingChanged} then null else native_cursor end,
      credential_version=credential_version+1 where id=${source}`.execute(
      store.tx,
    );
    await audit(
      store.tx,
      store.tenant,
      store.member,
      "ingestion.source.rotate",
      "success",
      connection.space_id,
    );
    return { provider, credentialVersion: connection.credential_version + 1 };
  }
  if (method === "DELETE") {
    await sql`update km.ingest_sources set revoked_at=now(),webhook_secret=null,native_cursor=null,
      runner_id=null,credential=null,target=null,
      credential_version=credential_version+1 where id=${source}`.execute(
      store.tx,
    );
    await denyImported(store, source, "deleted");
    await audit(
      store.tx,
      store.tenant,
      store.member,
      "ingestion.source.revoke",
      "success",
      connection.space_id,
    );
    return { revoked: true };
  }
  throw new IdentityError(404);
}

async function denyImported(
  store: EditorStore,
  source: string,
  state: "quarantine" | "deleted",
) {
  const published = (
    await sql<{
      page_id: string;
    }>`select p.page_id from km.editor_publications p
      join km.ingest_objects o using(tenant_id,page_id)
      where o.source_id=${source} and p.withdrawn_at is null`.execute(store.tx)
  ).rows;
  const lifecycle = new Lifecycle(store);
  for (const { page_id } of published) await lifecycle.withdraw(page_id);
  await sql`insert into km.ingest_origin_denials(tenant_id,page_id)
      select tenant_id,page_id from km.ingest_objects where source_id=${source} and page_id is not null
      on conflict do nothing`.execute(store.tx);
  await sql`update km.ingest_objects set state=${state},page_id=null where source_id=${source}`.execute(
    store.tx,
  );
}
