import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const [identity, report, mode] = process.argv.slice(2);
const {
  tenant: a,
  workerTenantB: b,
  workerTenantC: c,
} = JSON.parse(readFileSync(identity, "utf8"));
const compose = (...args) =>
  execFileSync(
    "docker",
    ["compose", "--env-file", process.env.KM_ENV_FILE, ...args],
    {
      encoding: "utf8",
      timeout: 60000,
    },
  ).trim();
const db = (sql) =>
  compose(
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
    sql,
  );
const queue = (operation, data) =>
  JSON.parse(
    compose(
      "exec",
      "-T",
      "api",
      "node",
      "-e",
      `
    const { Queue, queueName, redisOptions, tenantProbeName, Dependencies, WorkerLeases } =
      require("/app/api/node_modules/@km/foundation");
    const queue = new Queue(queueName, { connection: redisOptions() });
    const data = JSON.parse(process.argv[2]);
    void (async () => {
      try {
        switch (process.argv[1]) {
          case "add":
            for (const { delivery, ...probe } of data)
              await queue.add(tenantProbeName, probe, { jobId: delivery, attempts: 3,
                backoff: { type: "fixed", delay: 200 } });
            return true;
          case "get": {
            const job = await queue.getJob(data);
            return { state: await job.getState(), retries: job.attemptsMade, worker: job.processedBy, failure: job.failedReason };
          }
          case "stale": {
            const deps = new Dependencies();
            try { return await new WorkerLeases(deps).finish(data.probe, data.fence); }
            finally { await deps.close(); }
          }
        }
      } finally { await queue.close(); }
    })().then(x => console.log(JSON.stringify(x))).catch(() => { process.exitCode = 1; });
  `,
      operation,
      JSON.stringify(data),
    ),
  );
const probe = (tenantId, durationMs) => ({
  tenantId,
  id: randomUUID(),
  durationMs,
});
const add = (...probes) => {
  const deliveries = probes.map((item) => ({
    ...item,
    delivery: randomUUID(),
  }));
  // The job ID belongs to the broker, and is not part of the domain envelope.
  queue("add", deliveries);
  return deliveries.map(({ delivery }) => delivery);
};
const readJob = (job) =>
  JSON.parse(
    db(`select coalesce((select json_build_object(
    'fence',fence,'expired',leased_until <= clock_timestamp(),'until',extract(epoch from leased_until)*1000,
    'done',completed_at is not null) from km.worker_jobs where tenant_id='${job.tenantId}' and id='${job.id}'),'null')`),
  );
async function until(condition, label, timeout = 22000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const value = condition();
    if (value) return value;
    await sleep(110);
  }
  assert.fail(label);
}

if (mode === "cross") {
  const local = probe(c, 0);
  const foreign = { ...local, tenantId: a };
  const [localDelivery, foreignDelivery] = add(local, foreign);
  await until(
    () => queue("get", localDelivery).state === "completed",
    "dedicated worker rejected its own tenant",
  );
  await until(
    () => queue("get", foreignDelivery).state === "failed",
    "dedicated worker accepted a shared tenant",
  );
  assert.equal(queue("get", foreignDelivery).failure, "Tenant unavailable");
  assert.equal(readJob(foreign), null);
  console.log("Worker G2: job shared rejeitado pelo worker dedicado");
  process.exit(0);
}

db(`insert into km.worker_policy values ('${a}',1,1,6500), ('${b}',2,5,10000)`);
const aFirst = probe(a, 4600);
const aSecond = probe(a, 0);
const bJobs = Array.from({ length: 4 }, () => probe(b, 1300));
add(aFirst, ...bJobs, aSecond);
const peak = { A: 0, B: 0, global: 0 };
let renewed = false;
let initialExpiry;
let bBeforeSecond = false;
await until(() => {
  const [activeA, activeB, finishedA, finishedB] = db(`select
    count(*) filter (where tenant_id='${a}' and completed_at is null and leased_until > clock_timestamp()),
    count(*) filter (where tenant_id='${b}' and completed_at is null and leased_until > clock_timestamp()),
    count(*) filter (where tenant_id='${a}' and completed_at is not null),
    count(*) filter (where tenant_id='${b}' and completed_at is not null)
    from km.worker_jobs`)
    .split("|")
    .map(Number);
  peak.A = Math.max(peak.A, activeA);
  peak.B = Math.max(peak.B, activeB);
  peak.global = Math.max(peak.global, activeA + activeB);
  const row = readJob(aFirst);
  if (row && !row.done) {
    initialExpiry ??= Number(row.until);
    renewed ||= Number(row.until) > initialExpiry;
  }
  if (finishedB === 4 && !readJob(aSecond)) bBeforeSecond = true;
  return finishedA === 2 && finishedB === 4;
}, "two tenants did not drain their queues");
assert.deepEqual(peak, { A: 1, B: 2, global: 3 });
assert.ok(renewed, "long-running lease must renew");
assert.ok(bBeforeSecond, "A must exhaust its own quota while B finishes");
const quotaGapMs = Number(
  db(`select extract(epoch from max(admitted_at)-min(admitted_at))*1000
  from km.worker_attempts where tenant_id='${a}'`),
);
assert.ok(quotaGapMs >= 6500);

db(`update km.worker_policy set quota=20 where tenant_id in ('${a}', '${b}')`);
const crashed = probe(a, 4200);
const [crashDelivery] = add(crashed);
const original = await until(() => readJob(crashed), "initial lease missing");
const owner = queue("get", crashDelivery).worker;
const worker = compose("ps", "-q", "worker")
  .split("\n")
  .find(
    (container) =>
      execFileSync(
        "docker",
        ["inspect", "-f", "{{.Config.Hostname}}", container],
        { encoding: "utf8" },
      ).trim() === owner,
  );
assert.ok(worker, "active job must be owned by one of the two replicas");
execFileSync("docker", ["kill", worker]);
const recoveryStart = performance.now();
const survivor = probe(b, 0);
add(survivor);
await until(
  () => readJob(survivor)?.done,
  "healthy tenant did not progress after worker crash",
);
compose("start", "worker");
const reacquired = await until(() => {
  const row = readJob(crashed);
  return row.fence !== original.fence ? row : false;
}, "stalled job was not reclaimed");
assert.ok(Number(reacquired.until) - Number(original.until) >= 2900);
assert.equal(queue("stale", { probe: crashed, fence: original.fence }), false);
await until(() => readJob(crashed)?.done, "crashed job did not complete");
const recoveryMs = Math.round(performance.now() - recoveryStart);

const retry = probe(b, 0);
db(`create sequence km.test_worker_retry;
  grant usage on sequence km.test_worker_retry to km_app;
  create function km.test_worker_retry() returns trigger language plpgsql as $$
  begin
    if new.id='${retry.id}' and new.completed_at is not null then
      if nextval('km.test_worker_retry')=1 then
        raise exception 'synthetic first attempt failure';
      end if;
    end if;
    return new;
  end $$;
  create trigger test_worker_retry before update on km.worker_jobs
    for each row execute function km.test_worker_retry()`);
const [retryDelivery] = add(retry);
await until(
  () => queue("get", retryDelivery).state === "completed",
  "explicit failure did not retry",
);
assert.equal(queue("get", retryDelivery).retries, 2);
assert.equal(Number(db("select last_value from km.test_worker_retry")), 2);
const [duplicate] = add(retry);
await until(
  () => queue("get", duplicate).state === "completed",
  "duplicate did not acknowledge",
);
assert.equal(readJob(retry).done, true);
assert.equal(Number(db("select last_value from km.test_worker_retry")), 2);
db(
  "drop trigger test_worker_retry on km.worker_jobs; drop function km.test_worker_retry(); drop sequence km.test_worker_retry",
);

assert.equal(
  db(
    `select count(*) from km.worker_jobs where id='${retry.id}' and completed_at is not null`,
  ),
  "1",
);

assert.equal(db("set role km_app; select count(*) from km.worker_jobs"), "0");
assert.equal(
  db(
    `set role km_app; set km.tenant_id='${a}'; select count(*) from km.worker_jobs where tenant_id='${b}'`,
  ),
  "0",
);
const metrics = {
  peak,
  quotaGapMs,
  renewed,
  bBeforeSecond,
  recoveryMs,
  failedAttemptsBeforeSuccess: 1,
  duplicateEffects: 0,
};
writeFileSync(report, JSON.stringify(metrics, null, 2) + "\n");
console.log("Worker G2 " + JSON.stringify(metrics));
