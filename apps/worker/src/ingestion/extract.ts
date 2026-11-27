import { request } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { unzipSync } from "fflate";
import { SaxesParser } from "saxes";
import { storagePath, uuid } from "@km/foundation";
import type { Block } from "./segments.js";

export type Attachment = {
  id: string;
  filename: string;
  content_type: string;
  bytes: Buffer | null;
  digest: string;
};

function officeFiles(bytes: Buffer) {
  let size = 0,
    count = 0;
  return unzipSync(bytes, {
    filter(file) {
      if (++count > 512 || (size += file.originalSize) > 32 * 1024 * 1024)
        throw new Error("Archive exceeds bounds");
      return /^(word\/document\.xml|ppt\/slides\/slide\d+\.xml|xl\/(?:sharedStrings\.xml|worksheets\/sheet\d+\.xml))$/.test(
        file.name,
      );
    },
  });
}
const decoder = () => new TextDecoder("utf-8", { fatal: true });
function xmlLines(data: Uint8Array, boundary: string, valueTag: string) {
  const parser = new SaxesParser({ xmlns: true });
  const rows: string[] = [];
  let line = "",
    inside = false;
  parser.on("doctype", () => {
    throw new Error("Document type unsupported");
  });
  parser.on("opentag", (tag) => {
    if (tag.local === valueTag) inside = true;
  });
  parser.on("text", (text) => {
    if (inside) line += text;
  });
  parser.on("closetag", (tag) => {
    if (tag.local === valueTag) inside = false;
    if (tag.local === boundary) {
      rows.push(line);
      line = "";
    }
  });
  parser.write(decoder().decode(data)).close();
  return rows;
}
function spreadsheet(data: Uint8Array, dictionary: string[]) {
  const parser = new SaxesParser({ xmlns: true });
  const rows: string[] = [];
  let row: string[] = [],
    cell = "",
    kind = "",
    inside = false;
  parser.on("doctype", () => {
    throw new Error("Document type unsupported");
  });
  parser.on("opentag", (tag) => {
    if (tag.local === "c") {
      kind =
        Object.values(tag.attributes).find((value) => value.local === "t")
          ?.value ?? "";
      cell = "";
    }
    if (tag.local === "v" || tag.local === "t") inside = true;
  });
  parser.on("text", (text) => {
    if (inside) cell += text;
  });
  parser.on("closetag", (tag) => {
    if (tag.local === "v" || tag.local === "t") inside = false;
    if (tag.local === "c")
      row.push(kind === "s" ? (dictionary[Number(cell)] ?? "") : cell);
    if (tag.local === "row") {
      rows.push(row.join(" | "));
      row = [];
    }
  });
  parser.write(decoder().decode(data)).close();
  return rows;
}

function pdf(bytes: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pdf.js", import.meta.url), {
      workerData: new Uint8Array(bytes),
      resourceLimits: { maxOldGenerationSizeMb: 64 },
      stdout: true,
      stderr: true,
    });
    const finish = (text?: string) => {
      clearTimeout(timer);
      void worker.terminate();
      if (text === undefined) reject(new Error("PDF extraction failed"));
      else resolve(text);
    };
    const timer = setTimeout(() => finish(), 1500);
    worker.once("message", (response: { text?: string }) =>
      finish(response.text),
    );
    worker.once("error", () => finish());
    worker.once("exit", () => finish());
  });
}

const imageTypes = new Set(["png", "jpeg", "jpg", "webp", "gif"]);
function ocr(bytes: Buffer): Promise<string> {
  const socketPath = process.env.KM_INGEST_OCR_SOCKET;
  if (!socketPath) throw new Error("OCR endpoint unavailable");
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path: "/ocr",
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": bytes.length,
        },
        signal: AbortSignal.timeout(4000),
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error("OCR failed"));
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1024 * 1024)
            response.destroy(new Error("OCR response exceeds bounds"));
          else parts.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            const data: unknown = JSON.parse(
              Buffer.concat(parts).toString("utf8"),
            );
            if (
              !data ||
              typeof data !== "object" ||
              !("text" in data) ||
              typeof data.text !== "string"
            )
              throw new Error("Invalid OCR response");
            resolve(data.text);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.end(bytes);
  });
}

export async function extract(
  file: Attachment,
  tenant: string,
): Promise<Block | null> {
  const ext = file.filename.split(".").at(-1)?.toLowerCase();
  if (
    !ext ||
    (!imageTypes.has(ext) &&
      !["txt", "md", "csv", "pdf", "docx", "xlsx", "pptx"].includes(ext))
  )
    return null;
  if (!uuid.test(tenant) || !uuid.test(file.id))
    throw new Error("Invalid attachment reference");
  const bytes =
    file.bytes ??
    (await readFile(join(storagePath(), "objects", tenant, file.id)));
  if (
    bytes.length > 8 * 1024 * 1024 ||
    createHash("sha256").update(bytes).digest("hex") !== file.digest
  )
    throw new Error("Attachment integrity mismatch");
  let text: string;
  if (ext === "pdf") text = await pdf(bytes);
  else if (imageTypes.has(ext)) text = await ocr(bytes);
  else if (["docx", "xlsx", "pptx"].includes(ext)) {
    const entries = officeFiles(bytes);
    if (ext === "docx") {
      if (!entries["word/document.xml"])
        throw new Error("Missing document body");
      text = xmlLines(entries["word/document.xml"], "p", "t").join("\n");
    } else if (ext === "xlsx") {
      const dictionary = entries["xl/sharedStrings.xml"]
        ? xmlLines(entries["xl/sharedStrings.xml"], "si", "t")
        : [];
      const sheets = Object.keys(entries)
        .filter((key) => key.startsWith("xl/worksheets/"))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
      text = sheets
        .flatMap((key) => spreadsheet(entries[key]!, dictionary))
        .join("\n");
    } else {
      const slides = Object.keys(entries)
        .filter((key) => key.startsWith("ppt/slides/"))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
      text = slides
        .flatMap((key) => xmlLines(entries[key]!, "p", "t"))
        .join("\n");
    }
  } else text = decoder().decode(bytes);
  if (text.length > 150000 || text.includes("\0"))
    throw new Error("Extracted text exceeds bounds");
  return {
    id: file.id,
    text,
    kind: ext === "csv" || ext === "xlsx" ? "table" : "attachment",
  };
}
