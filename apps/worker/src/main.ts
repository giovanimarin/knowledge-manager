import { runIngestion } from "./ingestion/worker.js";
import { createServer } from "node:http";
import { hostname } from "node:os";
import {
  Dependencies,
  parseProbe,
  Queue,
  tenantProbeName,
  WorkerLeases,
  workerGlobalConcurrency,
  queueName,
  redisOptions,
  sendHealth,
  startTelemetry,
  traced,
  UnrecoverableError,
  Worker,
} from "@km/foundation";

import { processTenantProbe } from "./tenant-probe.js";

const telemetry = startTelemetry();
const dependencies = new Dependencies();
const stopIngestion = runIngestion(dependencies);
const queue = new Queue(queueName, { connection: redisOptions() });
const leases = new WorkerLeases(dependencies);
const worker = new Worker(
  queueName,
  async (job, token) => {
    if (job.name === tenantProbeName)
      return processTenantProbe(leases, job, token);
    let id: string;
    try {
      ({ id } = parseProbe(job.name, job.data));
    } catch {
      throw new UnrecoverableError("Invalid probe payload");
    }
    if (!(await dependencies.isReady()))
      throw new Error("Dependencies unavailable");
    await traced("foundation.process_probe", () =>
      dependencies.recordProbe(id),
    );
    return "recorded";
  },
  {
    name: hostname(),
    autorun: false,
    concurrency: 2,
    lockDuration: 3000,
    stalledInterval: 1000,
    connection: { ...redisOptions(), maxRetriesPerRequest: null },
  },
);

worker.on("error", () =>
  console.error(JSON.stringify({ service: "worker", event: "queue_error" })),
);
async function run() {
  await queue.setGlobalConcurrency(workerGlobalConcurrency);
  await worker.run();
}
void run().catch(() => {
  console.error(
    JSON.stringify({ service: "worker", event: "queue_start_failed" }),
  );
  process.exit(1);
});

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    sendHealth(response, "healthy");
  } else if (request.method === "GET" && request.url === "/readyz") {
    sendHealth(
      response,
      worker.isRunning() && (await dependencies.isReady())
        ? "ready"
        : "unavailable",
    );
  } else {
    response.writeHead(404).end();
  }
});
server.listen(3001, "0.0.0.0", () =>
  console.log(JSON.stringify({ service: "worker", event: "listening" })),
);

async function shutdown() {
  server.close();
  await stopIngestion();
  await worker.close();
  await queue.close();
  await dependencies.close();
  await telemetry?.shutdown();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
