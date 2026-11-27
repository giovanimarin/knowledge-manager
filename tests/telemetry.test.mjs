import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";

test("configured OpenTelemetry exporter emits a readiness span without sensitive attributes", async () => {
  const received = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({
      path: request.url,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = `http://127.0.0.1:${server.address().port}/v1/traces`;
    const { startTelemetry, traced } =
      await import("../packages/foundation/dist/index.js");
    const telemetry = startTelemetry();
    await traced("foundation.readiness", async () => undefined);
    await telemetry.shutdown();
    assert.equal(received.length, 1);
    assert.equal(received[0].path, "/v1/traces");
    const [span] = received[0].body.resourceSpans[0].scopeSpans[0].spans;
    assert.equal(span.name, "foundation.readiness");
    assert.deepEqual(span.attributes, []);
  } finally {
    server.close();
  }
});
