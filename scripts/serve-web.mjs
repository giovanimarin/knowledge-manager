import { createServer, request as forward } from "node:http";
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
  if (request.url?.startsWith("/v1/")) {
    const abort = AbortSignal.timeout(15000);
    const limit =
      /^\/v1\/wiki\/(import-jobs|pages\/[^/]+\/(?:attachments|uploads\/[^/]+))(?:\?|$)/.test(
        request.url,
      )
        ? 12 * 1024 * 1024
        : /^\/v1\/ingestion\/sources\/[^/]+\/sync$/.test(request.url)
          ? 2 * 1024 * 1024
          : 100 * 1024;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) {
          response.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const headers = {};
      const headerNames = /^\/v1\/ingestion\/hooks\//.test(request.url)
        ? [
            "content-type",
            "x-hub-signature-256",
            "x-github-delivery",
            "x-gitlab-token",
            "idempotency-key",
            "x-hub-signature",
            "x-request-uuid",
          ]
        : ["authorization", "content-type"];
      for (const name of headerNames) {
        const value = request.headers[name];
        if (typeof value === "string") headers[name] = value;
      }
      const upstream = await fetch(`http://api:3000${request.url}`, {
        method: request.method,
        headers,
        ...(request.method === "GET" || request.method === "HEAD"
          ? {}
          : { body: Buffer.concat(chunks) }),
        signal: abort,
        redirect: "error",
      });
      const forwarded = { "Cache-Control": "no-store" };
      for (const name of ["content-type", "retry-after", "x-correlation-id"]) {
        const value = upstream.headers.get(name);
        if (value) forwarded[name] = value;
      }
      response.writeHead(upstream.status, forwarded).end(await upstream.text());
    } catch {
      if (!response.headersSent)
        response
          .writeHead(503, { "Content-Type": "application/problem+json" })
          .end(
            JSON.stringify({
              type: "about:blank",
              title: "Service Unavailable",
              status: 503,
            }),
          );
      else response.end();
    }
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" }).end();
    return;
  }
  const path = request.url?.split("?", 1)[0];
  if (
    path === "/licenses/khroma-MIT.txt" ||
    path === "/licenses/DOMPurify-Apache-2.0.txt"
  ) {
    response
      .writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
      .end(await readFile(join(distribution, path)));
    return;
  }
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
  const asset = /^\/assets\/([A-Za-z0-9][A-Za-z0-9_.-]*\.(js|css))$/.exec(
    path ?? "",
  );
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

server.on("upgrade", (request, client, head) => {
  if (!/^\/v1\/collaboration\/[a-f0-9-]{36}$/i.test(request.url ?? "")) {
    client.destroy();
    return;
  }
  if (request.headers.origin) {
    try {
      if (new URL(request.headers.origin).host !== request.headers.host) {
        client.destroy();
        return;
      }
    } catch {
      client.destroy();
      return;
    }
  }
  const upstream = forward({
    host: "api",
    port: 3000,
    path: request.url,
    headers: {
      host: "api:3000",
      connection: "Upgrade",
      upgrade: "websocket",
      "sec-websocket-key": request.headers["sec-websocket-key"] ?? "",
      "sec-websocket-version": "13",
    },
  });
  upstream.setTimeout(4000, () => upstream.destroy());
  upstream.on("error", () => client.destroy());
  upstream.on("response", (response) => {
    response.resume();
    client.destroy();
  });
  client.on("error", () => upstream.destroy());
  upstream.on("upgrade", (response, socket, rest) => {
    socket.setTimeout(0);
    socket.on("error", () => client.destroy());
    client.on("close", () => socket.destroy());
    socket.on("close", () => client.destroy());
    client.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        response.rawHeaders.reduce(
          (headers, value, index) =>
            headers + (index % 2 ? value + "\r\n" : value + ": "),
          "",
        ) +
        "\r\n",
    );
    if (head.length) socket.write(head);
    if (rest.length) client.write(rest);
    client.pipe(socket).pipe(client);
  });
  upstream.end();
});
server.listen(8080, "0.0.0.0");
process.once("SIGTERM", () => server.close());
