import { chmod, rm } from "node:fs/promises";
import { createServer } from "node:http";

const [socket, port, configuredModels, fixture] = process.argv.slice(2);
if (!socket?.startsWith("/") || !/^\d{1,5}$/.test(port) || !configuredModels)
  throw new Error("Informe socket absoluto, porta loopback e modelo");
const models = new Set(configuredModels.split(","));
const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/embed") {
    res.writeHead(404).end();
    return;
  }
  try {
    req.setEncoding("utf8");
    let body = "";
    for await (const part of req) {
      body += part;
      if (body.length > 32000) {
        res.writeHead(413).end();
        return;
      }
    }
    const input = JSON.parse(body);
    if (!models.has(input.model) || typeof input.input !== "string") {
      res.writeHead(400).end();
      return;
    }
    const result = await fetch("http://127.0.0.1:" + port + "/api/embed", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        input: input.input,
        truncate: false,
      }),
    });
    if (!result.ok) throw new Error("Model unavailable");
    const output = await result.text();
    if (output.length > 250000) throw new Error("Embedding exceeds bounds");
    res.writeHead(200, { "Content-Type": "application/json" }).end(output);
  } catch {
    if (!res.headersSent) res.writeHead(503).end();
  }
});
server.requestTimeout = 5000;
server.listen(socket, () => {
  void chmod(socket, fixture === "--fixture" ? 0o666 : 0o660).catch(() =>
    process.exit(1),
  );
});
function stop() {
  server.close(() => {
    void rm(socket, { force: true }).finally(() => process.exit());
  });
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
