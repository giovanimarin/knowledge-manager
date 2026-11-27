import { sql } from "@km/foundation";
import { Lifecycle } from "../editor/lifecycle.js";
import { EditorStore } from "../editor/store.js";
import { IdentityError, seal, string } from "../identity/security.js";
import { audit } from "../identity/sessions.js";
import { hookPurpose } from "./hooks.js";

export type Connection = {
  space_id: string;
  cursor: string | null;
  native_cursor: string | null;
  provider: string | null;
  credential_version: number;
  revoked_at: Date | null;
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
    await sql`update km.ingest_sources set provider=${provider},webhook_secret=${encrypted},
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
      credential_version=credential_version+1 where id=${source}`.execute(
      store.tx,
    );
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
    await sql`update km.ingest_objects set state='deleted' where source_id=${source}`.execute(
      store.tx,
    );
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
