import { setTimeout as delay } from "node:timers/promises";
import {
  DelayedError,
  parseTenantProbe,
  UnrecoverableError,
  workerLeaseMs,
  type WorkerLeases,
  type Job,
} from "@km/foundation";

export async function processTenantProbe(
  leases: WorkerLeases,
  job: Job,
  token?: string,
) {
  let probe: ReturnType<typeof parseTenantProbe>;
  try {
    probe = parseTenantProbe(job.data);
  } catch {
    throw new UnrecoverableError("Invalid tenant probe payload");
  }
  const admission = await leases.admit(probe);
  switch (admission.status) {
    case "inactive":
      throw new UnrecoverableError("Tenant unavailable");
    case "completed":
      return "recorded";
    case "concurrency":
    case "quota":
      // Saturation postpones the job without spending its error retry budget.
      await job.moveToDelayed(Date.now() + 350 + Math.random() * 200, token);
      throw new DelayedError();
  }

  const { fence } = admission;
  try {
    const deadline = performance.now() + probe.durationMs;
    while (performance.now() < deadline) {
      await delay(Math.min(workerLeaseMs / 3, deadline - performance.now()));
      if (performance.now() < deadline && !(await leases.renew(probe, fence)))
        throw new Error("Worker lease lost");
    }
    // The durable receipt is the effect. A stale worker cannot commit it.
    if (!(await leases.finish(probe, fence)))
      throw new Error("Worker lease lost");
    return "recorded";
  } catch (error) {
    await leases.release(probe, fence);
    throw error;
  }
}
