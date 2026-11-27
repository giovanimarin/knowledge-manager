import { sql, type TenantTransaction } from "@km/foundation";
import { configuredEmbedding } from "./embedding.js";
import { embed } from "./segments.js";

const semantic = configuredEmbedding();
type Profile = {
  version: number;
  model: string;
  dimension: number;
};

export async function currentEmbedding(tx: TenantTransaction) {
  const profile = (
    await sql<Profile>`select version,model,dimension from km.ingest_profiles where state='active'`.execute(
      tx,
    )
  ).rows[0];
  if (!profile)
    return {
      profile: "local-lexical-v1",
      vector: async (content: string) => embed(content),
    };
  return selectEmbedding(profile);
}

function selectEmbedding(profile: Profile) {
  if (
    semantic.model !== profile.model ||
    semantic.dimension !== profile.dimension
  )
    throw new Error("Configured semantic model does not match profile");
  return { profile: "tenant-v" + profile.version, vector: semantic.vector };
}

export async function backfill(
  tx: TenantTransaction,
  tenant: string,
  profile: Profile,
) {
  // Shares the lock used for publication, withdrawal, deletion, and profile mutations.
  await sql`select pg_advisory_xact_lock(71189004,hashtext(${tenant}))`.execute(
    tx,
  );
  const embedding = selectEmbedding(profile);
  const pending = (
    await sql<{ digest: string; content: string }>`
    select distinct on (c.digest) c.digest,c.content
    from km.ingest_chunks c join km.ingest_eligible g using (tenant_id,page_id)
    where (c.attachment_id is null or exists (
      select from km.ingest_clean_files f where (f.tenant_id,f.page_id,f.publication_id,f.id)
      =(c.tenant_id,c.page_id,g.publication_id,c.attachment_id)))
    and not exists(select from km.ingest_vectors v
      where (v.tenant_id,v.profile,v.digest)=(c.tenant_id,${embedding.profile},c.digest))
    order by c.digest limit 4
  `.execute(tx)
  ).rows;
  for (const entry of pending) {
    const vector =
      "[" + (await embedding.vector(entry.content)).join(",") + "]";
    await sql`insert into km.ingest_vectors values(${tenant},${embedding.profile},${entry.digest},${vector}::public.vector)
      on conflict do nothing`.execute(tx);
  }
  if (pending.length) return;
  await sql`update km.ingest_chunks set profile=${embedding.profile}`.execute(
    tx,
  );
  await sql`update km.ingest_generations set profile=${embedding.profile},indexed_at=now()`.execute(
    tx,
  );
  await sql`update km.ingest_profiles set state='retired' where state='active'`.execute(
    tx,
  );
  await sql`update km.ingest_profiles set state='active',activated_at=now() where version=${profile.version} and state='building'`.execute(
    tx,
  );
}

export async function advanceProfile(tx: TenantTransaction, tenant: string) {
  const building = (
    await sql<Profile>`
    select p.version,p.model,p.dimension from km.ingest_profiles p
    join km.organizations o on o.tenant_id=p.tenant_id and o.state='active'
    where p.state='building' and p.next_at<=now()
  `.execute(tx)
  ).rows[0];
  if (!building) return;
  await sql`savepoint profile_batch`.execute(tx);
  try {
    await backfill(tx, tenant, building);
    await sql`update km.ingest_profiles set attempts=0 where version=${building.version}`.execute(
      tx,
    );
  } catch {
    await sql`rollback to savepoint profile_batch`.execute(tx);
    await sql`update km.ingest_profiles set attempts=attempts+1,
      state=case when attempts>=4 then 'failed' else 'building' end,
      next_at=now()+make_interval(secs=>power(2,attempts)::int)
      where version=${building.version}`.execute(tx);
  }
  await sql`release savepoint profile_batch`.execute(tx);
}
