import { createServer } from "node:http";
import {
  Dependencies,
  parseProbe,
  queueName,
  redisOptions,
  sendHealth,
  startTelemetry,
  traced,
  UnrecoverableError,
  Worker,
} from "@km/foundation";

const telemetry = startTelemetry();
const dependencies = new Dependencies();
const worker = new Worker(
  queueName,
  async (job) => {
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
  { connection: { ...redisOptions(), maxRetriesPerRequest: null } },
);

worker.on("error", () =>
  console.error(JSON.stringify({ service: "worker", event: "queue_error" })),
);
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
  await worker.close();
  await dependencies.close();
  await telemetry?.shutdown();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
