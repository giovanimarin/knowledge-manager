import { spawn } from "node:child_process";
import { strToU8, unzipSync, zipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { SaxesParser } from "saxes";
import sanitizeHtml from "sanitize-html";
import { IdentityError, input, string } from "../identity/security.js";

export const maxFileBytes = 8 * 1024 * 1024;
const invalid = () => new IdentityError(400);
const utf8 = (bytes: Uint8Array) =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const textLimit = 50000;

type Item = { title: string; content: string; parentIndex?: number };
export type TransferFile = {
  filename: string;
  contentType: string;
  data: string;
};
export type TransferFormat =
  "markdown" | "html" | "word" | "pdf" | "zip" | "confluence" | "notion";
export const formats: TransferFormat[] = [
  "markdown",
  "html",
  "word",
  "pdf",
  "zip",
  "confluence",
  "notion",
];
export function archive(bytes: Uint8Array) {
  let count = 0;
  let total = 0;
  try {
    return unzipSync(bytes, {
      filter: (file) => {
        const parts = file.name.replace(/\/$/, "").split("/");
        if (
          ++count > 130 ||
          (total += file.originalSize) > 16 * 1024 * 1024 ||
          parts.some(
            (part) =>
              part === "." ||
              part === ".." ||
              !part ||
              part.includes("\\") ||
              part.includes(":"),
          )
        )
          throw invalid();
        return !file.name.endsWith("/");
      },
    });
  } catch {
    throw invalid();
  }
}

export function decodeFile(data: unknown) {
  const encoded = string(data, Math.ceil(maxFileBytes / 3) * 4);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length > maxFileBytes || bytes.toString("base64") !== encoded)
    throw invalid();
  return bytes;
}

function htmlText(html: string) {
  const source = sanitizeHtml(html, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "pre",
      "br",
      "li",
      "a",
    ],
    allowedAttributes: { a: ["href"] },
  });
  return source
    .replace(
      /<a href="([^"]+)">([\s\S]*?)<\/a>/g,
      (_match, href: string, label: string) => label + " (" + href + ")",
    )
    .replace(/<(h[1-6]|li)>/g, (_match, tag: string) =>
      tag === "li" ? "- " : "#".repeat(Number(tag[1])) + " ",
    )
    .replace(/<(?:\/h[1-6]|\/p|\/pre|\/li|br\s*\/?)>/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function wordText(bytes: Uint8Array) {
  const xml = archive(bytes)["word/document.xml"];
  if (!xml) throw invalid();
  const parser = new SaxesParser({ xmlns: true });
  const result: string[] = [];
  let inText = false;
  parser.on("doctype", () => {
    throw invalid();
  });
  parser.on("opentag", (tag) => {
    if (tag.local === "t") inText = true;
  });
  parser.on("text", (text) => {
    if (inText) result.push(text);
  });
  parser.on("closetag", (tag) => {
    if (tag.local === "t") inText = false;
    if (tag.local === "p") result.push("\n");
  });
  try {
    parser.write(utf8(xml)).close();
  } catch {
    throw invalid();
  }
  return result.join("").trimEnd();
}

function pdfText(bytes: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(
      "pdftotext",
      ["-enc", "UTF-8", "-nopgbrk", "-", "-"],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
    const output: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => process.kill("SIGKILL"), 2500);
    process.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > textLimit * 4) process.kill("SIGKILL");
      else output.push(chunk);
    });
    process.stdin.on("error", () => {});
    process.on("error", () => {
      clearTimeout(timer);
      reject(new Error("PDF converter unavailable"));
    });
    process.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(output).toString("utf8").trim());
      else reject(invalid());
    });
    process.stdin.end(bytes);
  });
}

export async function importItem(
  format: TransferFormat,
  value: unknown,
): Promise<Item> {
  const item = input(value);
  const title = string(item.title);
  let content: string;
  if (format === "markdown")
    content = item.content === "" ? "" : string(item.content, textLimit);
  else if (format === "html")
    content = htmlText(string(item.content, textLimit));
  else if (format === "word") content = wordText(decodeFile(item.data));
  else if (format === "pdf") content = await pdfText(decodeFile(item.data));
  else throw invalid();
  if (content.length > textLimit || (format === "pdf" && !content))
    throw invalid();
  return { title, content };
}

export async function importArchive(
  format: TransferFormat,
  data: unknown,
): Promise<Item[]> {
  const entries = archive(decodeFile(data));
  const manifest = entries["knowledge-manager.json"];
  if (manifest && format === "zip") {
    const parsed: unknown = JSON.parse(utf8(manifest));
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 20)
      throw invalid();
    return parsed.map((raw: unknown, i) => {
      const entry = input(raw);
      const bytes = entries[string(entry.path, 240)];
      if (!bytes) throw invalid();
      const content = utf8(bytes);
      if (content.length > textLimit) throw invalid();
      const parentIndex = entry.parentIndex;
      if (parentIndex === null || parentIndex === undefined)
        return { title: string(entry.title), content };
      if (
        typeof parentIndex !== "number" ||
        !Number.isInteger(parentIndex) ||
        parentIndex < 0 ||
        parentIndex >= i
      )
        throw invalid();
      return { title: string(entry.title), content, parentIndex };
    });
  }
  const paths = Object.keys(entries)
    .filter((path) => /\.(md|html?)$/i.test(path))
    .sort(
      (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
    );
  if (!paths.length || paths.length > 20) throw invalid();
  const items: Item[] = [];
  for (const path of paths) {
    const parentPath = path.slice(0, path.lastIndexOf("/"));
    // Notion uses nested directories named for their parent Markdown page.
    const parentIndex = parentPath
      ? paths.findIndex(
          (candidate) => candidate.replace(/\.(md|html?)$/i, "") === parentPath,
        )
      : -1;
    const content = utf8(entries[path]!);
    const fileTitle = path
      .split("/")
      .at(-1)!
      .replace(/\.[^.]+$/, "")
      .replace(/\s[a-f0-9]{32}$/i, "");
    const item = await importItem(/\.md$/i.test(path) ? "markdown" : "html", {
      title: fileTitle,
      content,
    });
    items.push(
      parentIndex >= 0 && parentIndex < items.length
        ? { ...item, parentIndex }
        : item,
    );
  }
  return items;
}

function docx(content: string) {
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        content
          .split("\n")
          .map(
            (line) =>
              '<w:p><w:r><w:t xml:space="preserve">' +
              escape(line) +
              "</w:t></w:r></w:p>",
          )
          .join("") +
        "</w:body></w:document>",
    ),
  });
}

async function pdf(content: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const supported = new Set(font.getCharacterSet());
  let substitution = false;
  const safe = Array.from(content, (char) => {
    if (char === "\n" || supported.has(char.codePointAt(0)!)) return char;
    substitution = true;
    return "?";
  }).join("");
  let page = doc.addPage([595, 842]);
  let y = 790;
  for (const line of safe.split("\n")) {
    for (const part of line.match(/.{1,75}(?:\b|$)|.{1,75}/g) ?? [""]) {
      if (y < 50) {
        page = doc.addPage([595, 842]);
        y = 790;
      }
      page.drawText(part, { x: 48, y, size: 10, font });
      y -= 14;
    }
  }
  return { bytes: await doc.save(), substitution };
}

type ExportPage = {
  id: string;
  parent_id: string | null;
  title: string;
  content: string;
};
export async function exportFiles(format: TransferFormat, pages: ExportPage[]) {
  const output: TransferFile[] = [];
  const extraLosses: string[] = [];
  if (format === "zip") {
    const entries: Record<string, Uint8Array> = {};
    const order: ExportPage[] = [];
    const remaining = new Map(pages.map((page) => [page.id, page]));
    while (remaining.size) {
      let advanced = false;
      for (const page of remaining.values())
        if (!page.parent_id || !remaining.has(page.parent_id)) {
          order.push(page);
          remaining.delete(page.id);
          advanced = true;
        }
      if (!advanced) throw invalid();
    }
    const manifest = order
      .map((page) => {
        const path = page.id + ".md";
        entries[path] = strToU8(page.content);
        return {
          title: page.title,
          path,
          parentIndex: order.findIndex(
            (parent) => parent.id === page.parent_id,
          ),
        };
      })
      .map((item) => ({
        ...item,
        parentIndex: item.parentIndex < 0 ? null : item.parentIndex,
      }));
    entries["knowledge-manager.json"] = strToU8(JSON.stringify(manifest));
    output.push({
      filename: "wiki.zip",
      contentType: "application/zip",
      data: Buffer.from(zipSync(entries)).toString("base64"),
    });
    return { output, extraLosses };
  }
  for (const page of pages) {
    const stem = page.id;
    if (format === "word")
      output.push({
        filename: stem + ".docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        data: Buffer.from(docx(page.content)).toString("base64"),
      });
    if (format === "pdf") {
      const { bytes, substitution } = await pdf(page.content);
      if (substitution && !extraLosses.includes("unsupported-font-characters"))
        extraLosses.push("unsupported-font-characters");
      output.push({
        filename: stem + ".pdf",
        contentType: "application/pdf",
        data: Buffer.from(bytes).toString("base64"),
      });
    }
  }
  if (format === "pdf" || format === "word")
    extraLosses.push("rich-layout", "embedded-images");
  return { output, extraLosses };
}
