import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmod, rm } from "node:fs/promises";

const socket = process.argv[2];
if (!socket?.startsWith("/")) throw new Error("Informe um socket absoluto");
const maxBytes = 8 * 1024 * 1024;
let active = 0;
const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/ocr") {
    res.writeHead(404).end();
    return;
  }
  if (active >= 2) {
    res.writeHead(429).end();
    return;
  }
  active++;
  const abort = new AbortController();
  const cleanup = () => abort.abort();
  res.on("close", cleanup);
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const text = await recognize(Buffer.concat(chunks), abort.signal);
    res
      .writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      .end(JSON.stringify({ text }));
  } catch {
    if (!res.headersSent) res.writeHead(503).end();
  } finally {
    res.off("close", cleanup);
    active--;
  }
});
function recognize(bytes, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "tesseract",
      ["stdin", "stdout", "-l", "por+eng", "--psm", "6"],
      {
        stdio: ["pipe", "pipe", "ignore"],
        signal,
        env: {
          PATH: "/usr/local/bin:/usr/bin:/bin",
          OMP_THREAD_LIMIT: "1",
          LANG: "C.UTF-8",
        },
      },
    );
    let size = 0;
    const pieces = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), 2500);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (value) => {
      size += value.length;
      if (size > 600000) child.kill("SIGKILL");
      else pieces.push(value);
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("OCR unavailable"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(pieces).toString("utf8").trim());
      else reject(new Error("OCR failed"));
    });
    child.stdin.end(bytes);
  });
}
server.requestTimeout = 5000;
server.listen(socket, () => {
  void chmod(socket, 0o660).catch(() => process.exit(1));
});
function stop() {
  server.close(() => {
    void rm(socket, { force: true }).finally(() => process.exit());
  });
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
