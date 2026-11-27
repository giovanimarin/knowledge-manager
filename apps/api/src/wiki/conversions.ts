import { posix } from "node:path";
import { mimeForFilename } from "./attachment-types.js";
import { Worker } from "node:worker_threads";
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

type Item = {
  title: string;
  content: string;
  parentIndex?: number;
  files?: TransferFile[];
  key?: string;
  links?: { target: string; type: string }[];
};
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
              part.includes(":") ||
              part === "__proto__" ||
              part === "constructor" ||
              part === "prototype",
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
      "img",
    ],
    allowedAttributes: { a: ["href"], img: ["src", "alt"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
  });
  return source
    .replace(/<img\b([^>]*)>/g, (_match, attributes: string) => {
      const src = /\bsrc="([^"]+)"/.exec(attributes)?.[1];
      const alt = /\balt="([^"]*)"/.exec(attributes)?.[1] ?? "Imagem";
      return src ? "![" + alt + "](" + src + ")" : alt;
    })
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
    const worker = new Worker(new URL("./pdf-extract.js", import.meta.url), {
      workerData: new Uint8Array(bytes),
      resourceLimits: { maxOldGenerationSizeMb: 64 },
      stdout: true,
      stderr: true,
    });
    const finish = (text?: string) => {
      clearTimeout(timer);
      void worker.terminate();
      if (text === undefined) reject(invalid());
      else resolve(text);
    };
    const timer = setTimeout(() => finish(), 2500);
    worker.once("message", (result: { text?: string }) => finish(result.text));
    worker.once("error", () => finish());
    worker.once("exit", () => finish());
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(utf8(manifest));
    } catch {
      throw invalid();
    }
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 20)
      throw invalid();
    return parsed.map((raw: unknown, i) => {
      const entry = input(raw);
      const path = string(entry.path, 240);
      const bytes = Object.hasOwn(entries, path) ? entries[path] : undefined;
      if (!bytes) throw invalid();
      const content = utf8(bytes);
      if (content.length > textLimit) throw invalid();
      const result: Item = { title: string(entry.title), content };
      if (entry.key !== undefined) result.key = string(entry.key, 160);
      if (entry.links !== undefined) {
        if (!Array.isArray(entry.links) || entry.links.length > 100)
          throw invalid();
        result.links = entry.links.map((raw: unknown) => {
          const link = input(raw);
          return {
            target: string(link.target, 160),
            type: string(link.type, 40),
          };
        });
      }
      if (entry.files !== undefined) {
        if (!Array.isArray(entry.files) || entry.files.length > 50)
          throw invalid();
        result.files = entry.files.map((raw: unknown) => {
          const asset = input(raw);
          const assetPath = string(asset.path, 240);
          const object = Object.hasOwn(entries, assetPath)
            ? entries[assetPath]
            : undefined;
          if (!object) throw invalid();
          return {
            filename: string(asset.filename, 180),
            contentType: string(asset.contentType, 100),
            data: Buffer.from(object).toString("base64"),
          };
        });
      }
      const parentIndex = entry.parentIndex;
      if (parentIndex !== null && parentIndex !== undefined) {
        if (
          typeof parentIndex !== "number" ||
          !Number.isInteger(parentIndex) ||
          parentIndex < 0 ||
          parentIndex >= i
        )
          throw invalid();
        result.parentIndex = parentIndex;
      }
      return result;
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
    const links = [];
    const files = [];
    const targets = new Set<string>();
    const references = /\]\(([^)\n]+)\)|(?:href|src)=["']([^"']+)["']/gi;
    for (const reference of content.matchAll(references)) {
      const raw = (reference[1] ?? reference[2] ?? "").split(/[?#]/, 1)[0]!;
      if (!raw || /^(?:[a-z]+:|\/)/i.test(raw)) continue;
      let target: string;
      try {
        target = posix.normalize(
          posix.join(parentPath, decodeURIComponent(raw)),
        );
      } catch {
        continue;
      }
      if (
        !Object.hasOwn(entries, target) ||
        targets.has(target) ||
        target === path
      )
        continue;
      targets.add(target);
      if (paths.includes(target)) {
        links.push({ target, type: "reference" });
      } else {
        const filename = posix.basename(target);
        const contentType = mimeForFilename(filename);
        if (contentType)
          files.push({
            filename,
            contentType,
            data: Buffer.from(entries[target]!).toString("base64"),
          });
      }
    }
    const packaged = {
      ...item,
      key: path,
      ...(links.length ? { links } : {}),
      ...(files.length ? { files } : {}),
    };
    items.push(
      parentIndex >= 0 && parentIndex < items.length
        ? { ...packaged, parentIndex }
        : packaged,
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
  assets?: {
    id: string;
    filename: string;
    contentType: string;
    bytes: Buffer;
  }[];
  links?: { target: string; type: string }[];
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
          ...(page.assets?.length
            ? {
                files: page.assets.map((asset) => {
                  const key = "objects/" + asset.id;
                  entries[key] = asset.bytes;
                  return {
                    path: key,
                    filename: asset.filename,
                    contentType: asset.contentType,
                  };
                }),
              }
            : {}),
          ...(pages.some((candidate) => candidate.links?.length)
            ? {
                key: page.id,
                ...(page.links?.length ? { links: page.links } : {}),
              }
            : {}),
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
    const compressed = zipSync(entries);
    if (
      compressed.length > maxFileBytes ||
      Object.keys(entries).length > 130 ||
      Object.values(entries).reduce((sum, bytes) => sum + bytes.length, 0) >
        16 * 1024 * 1024
    )
      throw invalid();
    output.push({
      filename: "wiki.zip",
      contentType: "application/zip",
      data: Buffer.from(compressed).toString("base64"),
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
