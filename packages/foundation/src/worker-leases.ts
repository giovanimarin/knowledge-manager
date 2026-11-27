import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { Dependencies, TenantTransaction } from "./index.js";

export const workerLeaseMs = 3000;
export const workerGlobalConcurrency = 3;

interface WorkerJob {
  tenantId: string;
  id: string;
}

type Admission =
  | { status: "inactive" | "completed" | "concurrency" | "quota" }
  | { status: "admitted"; fence: string };

export class WorkerLeases {
  constructor(private readonly dependencies: Dependencies) {}

  private transaction<T>(
    tenant: string,
    action: (tx: TenantTransaction) => Promise<T>,
  ) {
    return this.dependencies.inTenant(tenant, async (tx) => {
      await sql`select pg_advisory_xact_lock(71189003, hashtext(${tenant}::uuid::text))`.execute(
        tx,
      );
      return action(tx);
    });
  }

  admit({ tenantId, id }: WorkerJob): Promise<Admission> {
    return this.transaction(tenantId, async (tx) => {
      const result = await sql<{
        concurrency: number;
        quota: number;
        window_ms: number;
      }>`
        select coalesce(p.concurrency, 1) as concurrency, coalesce(p.quota, 30) as quota,
          coalesce(p.window_ms, 60000) as window_ms
        from km.organizations o left join km.worker_policy p on p.tenant_id = o.tenant_id
        where o.tenant_id = ${tenantId} and o.state = 'active'
      `.execute(tx);
      const policy = result.rows[0];
      if (!policy) return { status: "inactive" };
      const current = await sql<{ completed: boolean; live: boolean }>`
        select completed_at is not null as completed, leased_until > clock_timestamp() as live
        from km.worker_jobs where tenant_id = ${tenantId} and id = ${id}
      `.execute(tx);
      if (current.rows[0]?.completed) return { status: "completed" };
      const limits = await sql<{ live: number; attempts: number }>`
        select (select count(*)::int from km.worker_jobs
          where tenant_id = ${tenantId} and completed_at is null and leased_until > clock_timestamp()) as live,
          (select count(*)::int from km.worker_attempts
          where tenant_id = ${tenantId} and admitted_at > clock_timestamp() - (${policy.window_ms} * interval '1 millisecond')) as attempts
      `.execute(tx);
      if (current.rows[0]?.live || limits.rows[0]!.live >= policy.concurrency)
        return { status: "concurrency" };
      if (limits.rows[0]!.attempts >= policy.quota) return { status: "quota" };

      const fence = randomUUID();
      const slot = await sql<{ reserved: boolean }>`
        select km.worker_reserve(${fence}, transaction_timestamp() + (${workerLeaseMs} * interval '1 millisecond')) as reserved
      `.execute(tx);
      if (!slot.rows[0]?.reserved) return { status: "concurrency" };
      await sql`insert into km.worker_jobs (tenant_id,id,fence,leased_until)
        values (${tenantId},${id},${fence},transaction_timestamp() + (${workerLeaseMs} * interval '1 millisecond'))
        on conflict (tenant_id,id) do update set fence=excluded.fence, leased_until=excluded.leased_until`.execute(
        tx,
      );
      // Retain the full configurable horizon so increasing the window cannot reset quota.
      await sql`delete from km.worker_attempts
        where tenant_id=${tenantId} and admitted_at <= clock_timestamp() - interval '1 hour'`.execute(
        tx,
      );
      await sql`insert into km.worker_attempts values (${tenantId},${fence},clock_timestamp())`.execute(
        tx,
      );
      return { status: "admitted", fence };
    });
  }

  renew(job: WorkerJob, fence: string) {
    return this.change(job, fence, false);
  }

  finish(job: WorkerJob, fence: string) {
    return this.change(job, fence, true);
  }

  private change(
    { tenantId, id }: WorkerJob,
    fence: string,
    complete: boolean,
  ) {
    return this.transaction(tenantId, async (tx) => {
      // Lock the organization against a concurrent suspension through the commit.
      const active = await sql`select tenant_id from km.organizations
        where tenant_id=${tenantId} and state='active' for share`.execute(tx);
      if (!active.rows.length) return false;
      const changes = await sql`update km.worker_jobs
        set leased_until = clock_timestamp() + (${workerLeaseMs} * interval '1 millisecond'),
            completed_at = case when ${complete} then clock_timestamp() else null end
        where tenant_id=${tenantId} and id=${id} and fence=${fence}
          and completed_at is null and leased_until > clock_timestamp()
        returning id`.execute(tx);
      if (!changes.rows.length) return false;
      const slot = await sql<{ changed: boolean }>`
        select km.worker_change(${fence}, leased_until, ${complete}) as changed
        from km.worker_jobs where tenant_id=${tenantId} and id=${id}
      `.execute(tx);
      if (!slot.rows[0]?.changed) throw new Error("Global worker lease lost");
      return true;
    });
  }

  async release({ tenantId, id }: WorkerJob, fence: string) {
    await this.transaction(tenantId, async (tx) => {
      const change =
        await sql`update km.worker_jobs set leased_until = clock_timestamp()
        where tenant_id=${tenantId} and id=${id} and fence=${fence}
          and completed_at is null returning id`.execute(tx);
      if (change.rows.length)
        await sql`select km.worker_change(${fence}, clock_timestamp(), true)`.execute(
          tx,
        );
    });
  }
}
