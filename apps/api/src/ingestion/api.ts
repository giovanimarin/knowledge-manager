import { sources } from "./sources.js";
import { randomUUID } from "node:crypto";
import { sql } from "@km/foundation";
import { EditorStore } from "../editor/store.js";
import { IdentityError, id } from "../identity/security.js";
import { audit } from "../identity/sessions.js";

export async function ingest(
  store: EditorStore,
  method: string,
  path: string,
  body: Record<string, unknown>,
) {
  if (path.startsWith("/v1/ingestion/sources"))
    return sources(store, method, path, body);
  const match =
    /^\/v1\/ingestion\/pages\/([^/]+)\/(chunks|jobs|reprocess)$/.exec(path);
  if (!match) throw new IdentityError(404);
  const page = id(match[1]);
  await store.page(page);
  if (method === "GET" && match[2] === "chunks") {
    return (
      await sql`select c.id,c.block_id,c.ordinal,c.start_offset,c.end_offset,c.heading,c.kind,c.content,
      g.revision,g.publication_id,g.profile from km.ingest_chunks c join km.ingest_eligible g using(tenant_id,page_id)
      where c.page_id=${page} order by c.ordinal limit 200`.execute(store.tx)
    ).rows;
  }
  await store.require("content.edit", page);
  if (method === "GET" && match[2] === "jobs")
    return (
      await sql`select id,kind,status,attempts,next_at,finished_at,last_error
    from km.ingest_jobs where page_id=${page} order by next_at desc limit 100`.execute(
        store.tx,
      )
    ).rows;
  if (method === "POST" && match[2] === "reprocess") {
    await store.lock();
    const existing = (
      await sql<{
        id: string;
      }>`select id from km.ingest_jobs where page_id=${page} and kind='reprocess' and status='queued'`.execute(
        store.tx,
      )
    ).rows[0];
    if (existing) return { id: existing.id, status: "queued" };
    const key = randomUUID();
    const job =
      await sql`insert into km.ingest_jobs(tenant_id,id,page_id,publication_id,kind)
      select tenant_id,${key},page_id,id,'reprocess' from km.editor_publications where page_id=${page}
      and withdrawn_at is null and (expires_at is null or expires_at>now()) returning id`.execute(
        store.tx,
      );
    if (!job.rows.length) throw new IdentityError(404);
    await audit(
      store.tx,
      store.tenant,
      store.member,
      "ingestion.reprocess",
      "success",
      page,
    );
    return { id: key, status: "queued" };
  }
  throw new IdentityError(404);
}
