import { createHash, randomUUID } from "node:crypto";
import { sql } from "@km/foundation";
import { EditorStore } from "../editor/store.js";
import { IdentityError, id, input, string } from "../identity/security.js";
import { audit } from "../identity/sessions.js";
import { Wiki } from "../wiki/wiki.js";

const missing = () => new IdentityError(404);
const invalid = () => new IdentityError(400);

export async function sources(
  store: EditorStore,
  method: string,
  path: string,
  body: Record<string, unknown>,
  query: URLSearchParams,
) {
  const prefix = "/v1/ingestion/sources";
  if (path === prefix && method === "POST") {
    const space = id(body.spaceId),
      source = randomUUID();
    await store.require("knowledge.govern", space);
    await store.require("content.acl.manage", space);
    await sql`insert into km.ingest_sources(tenant_id,id,space_id,title)
      values(${store.tenant},${source},${space},${string(body.title)})`.execute(
      store.tx,
    );
    await audit(
      store.tx,
      store.tenant,
      store.member,
      "ingestion.source.create",
      "success",
      space,
    );
    return { id: source };
  }
  const request =
    /^\/v1\/ingestion\/sources\/([^/]+)(?:\/(sync|objects))?$/.exec(path);
  if (!request) throw missing();
  const source = id(request[1]);
  if (method !== "GET") await store.lock();
  const connection = (
    await sql<{
      space_id: string;
      cursor: string | null;
    }>`select s.space_id,s.cursor from km.ingest_sources s
    join km.wiki_spaces w on (w.tenant_id,w.id)=(s.tenant_id,s.space_id)
    where s.id=${source} and w.deleted_batch is null`.execute(store.tx)
  ).rows[0];
  if (!connection) throw missing();
  await store.require("knowledge.govern", connection.space_id);
  if (method === "GET" && request[2] === "objects") {
    const next = query.get("after");
    if (next !== null) string(next, 400);
    const found = (
      await sql<{
        page_id: string | null;
        remote_key: string;
        version: string;
        state: string;
      }>`
      select remote_key,version,state,page_id from km.ingest_objects where source_id=${source} and (${next}::text is null or remote_key>${next}::text)
      order by remote_key limit 101`.execute(store.tx)
    ).rows;
    const safe = [];
    for (const row of found.slice(0, 100)) {
      if (row.page_id && !(await store.can("content.read", row.page_id)))
        throw missing();
      safe.push(row);
    }
    return {
      cursor: connection.cursor,
      objects: safe,
      after: found.length > 100 ? found[99]?.remote_key : null,
    };
  }
  if (method !== "POST" || request[2] !== "sync") throw missing();
  await store.require("content.acl.manage", connection.space_id);
  const batch = id(body.id),
    cursor = string(body.nextCursor, 512);
  const expected = body.cursor == null ? null : string(body.cursor, 512);
  if (expected === cursor) throw invalid();
  const entries = body.entries;
  if (!Array.isArray(entries) || entries.length > 50) throw invalid();
  const digest = createHash("sha256")
    .update(JSON.stringify({ expected, cursor, entries }))
    .digest("hex");
  const earlier = (
    await sql<{
      digest: string;
      count: number;
    }>`select digest,count from km.ingest_sync_receipts where source_id=${source} and id=${batch}`.execute(
      store.tx,
    )
  ).rows[0];
  if (earlier) {
    if (earlier.digest !== digest) throw new IdentityError(409);
    return { id: batch, count: earlier.count, replayed: true };
  }
  if (connection.cursor !== expected) throw new IdentityError(409);
  const wiki = new Wiki(store.tx, store.tenant, store.actor);
  const seen = new Set<string>();
  for (const raw of entries) {
    const entry = input(raw);
    const remote = string(entry.remoteKey, 400);
    const version = string(entry.version, 200);
    if (seen.has(remote)) throw invalid();
    seen.add(remote);
    if (entry.operation !== "upsert" && entry.operation !== "delete")
      throw invalid();
    const prior = (
      await sql<{
        page_id: string | null;
        version: string;
        state: string;
      }>`select page_id,version,state from km.ingest_objects
       where source_id=${source} and remote_key=${remote}`.execute(store.tx)
    ).rows[0];
    const state =
      entry.operation === "delete"
        ? "deleted"
        : entry.acl === "mapped-space"
          ? "draft"
          : "quarantine";
    let page = prior?.page_id ?? null;
    if (state !== "draft" && page) {
      await sql`insert into km.ingest_origin_denials(tenant_id,page_id) values(${store.tenant},${page}) on conflict do nothing`.execute(
        store.tx,
      );

      const live = (
        await sql`select 1 from km.wiki_pages where id=${page} and deleted_batch is null`.execute(
          store.tx,
        )
      ).rows.length;
      if (live)
        await wiki.dispatch(
          "DELETE",
          "/v1/wiki/pages/" + page,
          {},
          new URLSearchParams(),
        );
      page = null;
    }
    if (state === "draft" && (!page || prior?.version !== version)) {
      const title = string(entry.title),
        content = entry.content === "" ? "" : string(entry.content, 50000);
      const live = page
        ? (
            await sql<{
              revision: number;
            }>`select revision from km.wiki_pages where id=${page} and deleted_batch is null`.execute(
              store.tx,
            )
          ).rows[0]
        : undefined;
      if (live && page) {
        await wiki.dispatch(
          "PATCH",
          "/v1/wiki/pages/" + page,
          { title, content, revision: live.revision },
          new URLSearchParams(),
        );
      } else {
        const created = (await wiki.dispatch(
          "POST",
          "/v1/wiki/pages",
          { spaceId: connection.space_id, title, content },
          new URLSearchParams(),
        )) as { id: string };
        page = created.id;
      }
    }
    await sql`insert into km.ingest_objects values(${store.tenant},${source},${remote},${version},${page},${state})
      on conflict(tenant_id,source_id,remote_key) do update set version=excluded.version,page_id=excluded.page_id,state=excluded.state`.execute(
      store.tx,
    );
  }
  await sql`update km.ingest_sources set cursor=${cursor} where id=${source}`.execute(
    store.tx,
  );
  await sql`insert into km.ingest_sync_receipts(tenant_id,source_id,id,digest,count)
    values(${store.tenant},${source},${batch},${digest},${entries.length})`.execute(
    store.tx,
  );
  await audit(
    store.tx,
    store.tenant,
    store.member,
    "ingestion.source.sync",
    "success",
    connection.space_id,
  );
  return { id: batch, count: entries.length, replayed: false };
}
