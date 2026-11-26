import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const distribution = "/app/site";
const index = await readFile(join(distribution, "index.html"));
const assetTypes = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
};

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" }).end();
    return;
  }
  const path = request.url?.split("?", 1)[0];
  if (path === "/") {
    response
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end(index);
    return;
  }
  if (path === "/healthz" || path === "/readyz") {
    try {
      const upstream = await fetch(`http://api:3000${path}`, {
        signal: AbortSignal.timeout(4000),
      });
      const body = await upstream.text();
      response
        .writeHead(upstream.status, {
          "Content-Type":
            upstream.headers.get("Content-Type") ?? "application/json",
          "Cache-Control": "no-store",
        })
        .end(body);
    } catch {
      response
        .writeHead(503, {
          "Content-Type": "application/problem+json",
          "Cache-Control": "no-store",
        })
        .end(
          JSON.stringify({
            type: "about:blank",
            title: "Service Unavailable",
            status: 503,
          }),
        );
    }
    return;
  }
  const asset = /^\/assets\/([A-Za-z0-9_-]+\.(js|css))$/.exec(path ?? "");
  if (asset) {
    try {
      const value = await readFile(join(distribution, "assets", asset[1]));
      response
        .writeHead(200, {
          "Content-Type": assetTypes[asset[2]],
          "Cache-Control": "public, max-age=31536000, immutable",
        })
        .end(value);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") {
        response.writeHead(500).end();
        return;
      }
    }
  }
  response.writeHead(404).end();
});

server.listen(8080, "0.0.0.0");
process.once("SIGTERM", () => server.close());
