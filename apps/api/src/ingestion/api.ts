import { sources } from "./sources.js";
import { randomUUID } from "node:crypto";
import { sql } from "@km/foundation";
import { EditorStore } from "../editor/store.js";
import { IdentityError, id, string } from "../identity/security.js";
import { audit } from "../identity/sessions.js";

export async function ingest(
  store: EditorStore,
  method: string,
  path: string,
  body: Record<string, unknown>,
  query: URLSearchParams,
) {
  if (path === "/v1/ingestion/profiles") {
    if (store.actor.kind !== "member" || !store.actor.member.admin)
      throw new IdentityError(404);
    if (method === "GET")
      return (
        await sql`select version,model,dimension,state,attempts,created_at,activated_at
        from km.ingest_profiles order by version desc limit 100`.execute(
          store.tx,
        )
      ).rows;
    if (method === "POST") {
      if (!store.actor.member.stepped_up) throw new IdentityError(403);
      const model = string(body.model, 150);
      const dimension = body.dimension;
      if (
        typeof dimension !== "number" ||
        !Number.isInteger(dimension) ||
        dimension < 1 ||
        dimension > 4096
      )
        throw new IdentityError(400);
      await store.lock();
      const building =
        await sql`select 1 from km.ingest_profiles where state='building'`.execute(
          store.tx,
        );
      if (building.rows.length) throw new IdentityError(409);
      const created =
        await sql`insert into km.ingest_profiles(tenant_id,version,model,dimension)
        select ${store.tenant},coalesce(max(version),0)+1,${model},${dimension} from km.ingest_profiles
        returning version,model,dimension,state`.execute(store.tx);
      await audit(
        store.tx,
        store.tenant,
        store.member,
        "ingestion.profile.create",
        "success",
        null,
      );
      return created.rows[0];
    }
    throw new IdentityError(404);
  }
  if (path.startsWith("/v1/ingestion/sources"))
    return sources(store, method, path, body, query);
  const match =
    /^\/v1\/ingestion\/pages\/([^/]+)\/(chunks|jobs|reprocess)$/.exec(path);
  if (!match) throw new IdentityError(404);
  const page = id(match[1]);
  await store.page(page);
  if (method === "GET" && match[2] === "chunks") {
    return (
      await sql`select c.id,c.block_id,c.ordinal,c.start_offset,c.end_offset,c.heading,c.kind,c.content,
      g.revision,g.publication_id,g.profile from km.ingest_chunks c join km.ingest_eligible g using(tenant_id,page_id)
      where c.page_id=${page} and (c.attachment_id is null or exists (
       select 1 from km.ingest_clean_files f where (f.tenant_id,f.page_id,f.publication_id,f.id)
        =(c.tenant_id,c.page_id,g.publication_id,c.attachment_id))) order by c.ordinal limit 200`.execute(
        store.tx,
      )
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
