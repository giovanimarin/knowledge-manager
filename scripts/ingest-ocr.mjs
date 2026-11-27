import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const socket = process.argv[2];
if (!socket?.startsWith("/")) throw new Error("Informe um socket absoluto");
const maxBytes = 8 * 1024 * 1024;
const office = new Map([
  ["/doc", "docx"],
  ["/xls", "xlsx"],
  ["/ppt", "pptx"],
]);
let active = 0;
const server = createServer(async (req, res) => {
  if (
    req.method !== "POST" ||
    (!["/ocr", "/pdf"].includes(req.url) && !office.has(req.url))
  ) {
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
    const bytes = Buffer.concat(chunks);
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(22000)]);
    if (office.has(req.url)) {
      const converted = await convert(
        bytes,
        req.url.slice(1),
        office.get(req.url),
        signal,
      );
      res
        .writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(converted);
      return;
    }
    const text =
      req.url === "/pdf"
        ? await scannedPdf(bytes, signal)
        : await recognize(bytes, signal);
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
async function inScratch(action) {
  const folder = await mkdtemp(join(tmpdir(), "km-extract-"));
  try {
    return await action(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function scannedPdf(bytes, signal) {
  return inScratch(async (folder) => {
    const file = join(folder, "source.pdf");
    await writeFile(file, bytes);
    const info = await run("pdfinfo", [file], null, signal, 32000);
    const count = Number(/^Pages:\s+(\d+)$/m.exec(info.toString())?.[1]);
    if (!Number.isInteger(count) || count < 1 || count > 12)
      throw new Error("Scanned PDF page limit");
    const pages = [];
    for (let page = 1; page <= count; page++) {
      const image = await run(
        "pdftoppm",
        [
          "-png",
          "-scale-to",
          "1800",
          "-f",
          String(page),
          "-l",
          String(page),
          "-singlefile",
          file,
        ],
        null,
        signal,
        maxBytes,
      );
      pages.push(await recognize(image, signal));
    }
    return pages.join("\n").trim();
  });
}

async function convert(bytes, from, to, signal) {
  if (!bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex")))
    throw new Error("Invalid Office container");
  return inScratch(async (folder) => {
    const source = join(folder, "source." + from);
    const profile = join(folder, "profile");
    await writeFile(source, bytes);
    await mkdir(join(profile, "user"), { recursive: true });
    await writeFile(
      join(profile, "user", "registrymodifications.xcu"),
      '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>',
    );
    await run(
      "libreoffice",
      [
        "-env:UserInstallation=" + pathToFileURL(profile).href,
        "--headless",
        "--nologo",
        "--norestore",
        "--nodefault",
        "--convert-to",
        to,
        "--outdir",
        folder,
        source,
      ],
      null,
      signal,
      16000,
      folder,
    );
    const output = await readFile(join(folder, "source." + to));
    if (!output.length || output.length > maxBytes)
      throw new Error("Office output exceeds bound");
    return output;
  });
}

async function recognize(bytes, signal) {
  return (
    await run(
      "tesseract",
      ["stdin", "stdout", "-l", "por+eng", "--psm", "6"],
      bytes,
      AbortSignal.any([signal, AbortSignal.timeout(4500)]),
      600000,
    )
  )
    .toString("utf8")
    .trim();
}

function run(binary, args, input, signal, maxOutput, folder) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["pipe", "pipe", "ignore"],
      detached: true,
      cwd: folder,
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        OMP_THREAD_LIMIT: "1",
        LANG: "C.UTF-8",
        HOME: folder ?? tmpdir(),
      },
    });
    function kill() {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* child already exited */
      }
    }
    if (signal.aborted) kill();
    else signal.addEventListener("abort", kill, { once: true });
    let size = 0;
    const pieces = [];
    child.stdin.on("error", () => {});
    child.stdout.on("data", (value) => {
      size += value.length;
      if (size > maxOutput) kill();
      else pieces.push(value);
    });
    child.on("error", () => reject(new Error("Extraction unavailable")));
    child.on("close", (code) => {
      signal.removeEventListener("abort", kill);
      if (code === 0 && !signal.aborted && size <= maxOutput)
        resolve(Buffer.concat(pieces));
      else reject(new Error("Extraction failed"));
    });
    child.stdin.end(input ?? undefined);
  });
}
server.requestTimeout = 5000;
server.listen(socket, () => {
  void chmod(socket, process.argv[3] === "--fixture" ? 0o666 : 0o660).catch(
    () => process.exit(1),
  );
});
function stop() {
  server.close(() => {
    void rm(socket, { force: true }).finally(() => process.exit());
  });
}
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
