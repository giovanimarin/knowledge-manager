import { sql, type Dependencies, type TenantTransaction } from "@km/foundation";
import { configuredEmbedding } from "./embedding.js";
import { segments, type Block } from "./segments.js";

const embedding = configuredEmbedding();
const profile = embedding.profile;
type Job = {
  id: string;
  page_id: string;
  publication_id: string | null;
  kind: string;
};
type Publication = {
  id: string;
  revision: number;
  title: string;
  content: string;
  blocks: Block[];
};

async function synchronize(tx: TenantTransaction, tenant: string, job: Job) {
  // Publication, archive and wiki mutations use this same tenant lock.
  await sql`select pg_advisory_xact_lock(71189004,hashtext(${tenant}))`.execute(
    tx,
  );
  const current = (
    await sql<Publication>`
    select p.id,p.revision,v.title,v.content,v.blocks
    from km.editor_publications p join km.editor_versions v using (tenant_id,page_id,revision)
    join km.wiki_pages w on (w.tenant_id,w.id)=(p.tenant_id,p.page_id)
    join km.organizations o on o.tenant_id=p.tenant_id
    where p.tenant_id=${tenant} and p.page_id=${job.page_id}
      and p.withdrawn_at is null and (p.expires_at is null or p.expires_at>clock_timestamp())
      and w.deleted_batch is null and o.state='active'
  `.execute(tx)
  ).rows[0];
  if (!current) {
    await sql`delete from km.ingest_generations where tenant_id=${tenant} and page_id=${job.page_id}`.execute(
      tx,
    );
    return;
  }
  if (
    job.kind !== "reprocess" &&
    (job.kind === "withdrawn" || job.publication_id !== current.id)
  )
    return;
  const present = (
    await sql<{
      publication_id: string;
    }>`select publication_id from km.ingest_generations
    where profile=${profile} and page_id=${job.page_id}`.execute(tx)
  ).rows[0];
  if (job.kind !== "reprocess" && present?.publication_id === current.id)
    return;
  const blocks = current.blocks.length
    ? current.blocks
    : [{ id: job.page_id, text: current.content }];
  const chunks = segments(current.title, blocks);
  await sql`delete from km.ingest_generations where tenant_id=${tenant} and page_id=${job.page_id}`.execute(
    tx,
  );
  await sql`insert into km.ingest_generations(tenant_id,page_id,publication_id,revision,profile)
    values(${tenant},${job.page_id},${current.id},${current.revision},${profile})`.execute(
    tx,
  );
  for (const chunk of chunks) {
    const cached = (
      await sql`select 1 from km.ingest_vectors where profile=${profile} and digest=${chunk.digest}`.execute(
        tx,
      )
    ).rows.length;
    if (!cached) {
      const vector =
        "[" + (await embedding.vector(chunk.content)).join(",") + "]";
      await sql`insert into km.ingest_vectors values(${tenant},${profile},${chunk.digest},${vector}::public.vector)
        on conflict do nothing`.execute(tx);
    }
    await sql`insert into km.ingest_chunks values(${tenant},${job.page_id},${chunk.id},${chunk.blockId},${chunk.ordinal},
      ${chunk.start},${chunk.end},${chunk.heading}::text[],${chunk.kind},${chunk.content},${chunk.digest},${profile})`.execute(
      tx,
    );
  }
}

async function runTenant(dependencies: Dependencies, tenant: string) {
  let attempted: Job | undefined;
  try {
    await dependencies.inTenant(tenant, async (tx) => {
      const lock = (
        await sql<{
          locked: boolean;
        }>`select pg_try_advisory_xact_lock(71189005,hashtext(${tenant})) locked`.execute(
          tx,
        )
      ).rows[0];
      if (!lock?.locked) return;
      const job = (
        await sql<Job>`select id,page_id,publication_id,kind from km.ingest_jobs
        where status='queued' and next_at<=now() order by (kind='withdrawn') desc,next_at,id limit 1`.execute(
          tx,
        )
      ).rows[0];
      if (job) {
        attempted = job;
        await synchronize(tx, tenant, job);
        await sql`update km.ingest_jobs set status='done',finished_at=now(),attempts=attempts+1,last_error=null where id=${job.id}`.execute(
          tx,
        );
      }
      await sql`delete from km.ingest_generations g where not exists
        (select 1 from km.ingest_eligible e where (e.tenant_id,e.page_id)=(g.tenant_id,g.page_id))`.execute(
        tx,
      );
      await sql`delete from km.ingest_vectors v where not exists
        (select 1 from km.ingest_chunks c where (c.tenant_id,c.profile,c.digest)=(v.tenant_id,v.profile,v.digest))`.execute(
        tx,
      );
    });
  } catch (error) {
    if (!attempted) throw error;
    const job = attempted;
    await dependencies.inTenant(tenant, async (tx) => {
      await sql`select pg_advisory_xact_lock(71189005,hashtext(${tenant}))`.execute(
        tx,
      );
      await sql`update km.ingest_jobs set attempts=attempts+1,
        status=case when attempts>=4 then 'failed' else 'queued' end,
        next_at=now()+make_interval(secs=>power(2,attempts)::int),
        finished_at=case when attempts>=4 then now() end,last_error='processing_failed'
        where id=${job.id} and status='queued'`.execute(tx);
    });
  }
}

export function runIngestion(dependencies: Dependencies) {
  let active: Promise<void> | undefined;
  let cursor = "";
  const timer = setInterval(() => {
    if (active) return;
    active = (async () => {
      const tenants = (
        await sql<{ tenant_id: string }>`
        select tenant_id from km.ingest_tenants
        order by (tenant_id::text<=${cursor}),tenant_id limit 16
      `.execute(dependencies.database)
      ).rows;
      for (const { tenant_id } of tenants) {
        cursor = tenant_id;
        await runTenant(dependencies, tenant_id);
      }
    })()
      .catch(() =>
        console.error(
          JSON.stringify({ service: "worker", event: "ingestion_poll_failed" }),
        ),
      )
      .finally(() => {
        active = undefined;
      });
  }, 650);
  return async () => {
    clearInterval(timer);
    await active;
  };
}
