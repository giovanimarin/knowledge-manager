import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const sanitize = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
)("sanitize-html");

async function read(response) {
  if (!response.body) throw new Error("Missing crawl response");
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 1024 * 1024) throw new Error("Crawl response exceeds bounds");
    chunks.push(Buffer.from(chunk));
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
}

function robotRules(source) {
  const rules = [];
  let universal = false,
    options = false;
  for (const line of source.split(/\r?\n/)) {
    const [part, ...rest] = line.split("#", 1)[0].split(":");
    const value = rest.join(":").trim();
    switch (part.trim().toLowerCase()) {
      case "user-agent":
        if (options) {
          universal = false;
          options = false;
        }
        universal ||= value === "*";
        break;
      case "disallow":
      case "allow":
        options = true;
        if (!universal || !value) break;
        if (!value.startsWith("/") || /[\*\$]/.test(value))
          throw new Error("Unsupported robots policy");
        rules.push({
          prefix: value,
          allow: part.trim().toLowerCase() === "allow",
        });
        break;
      case "crawl-delay":
        options = true;
        if (universal && Number(value) > 1)
          throw new Error(
            "Crawl delay requires an operator-configured adapter",
          );
        break;
    }
  }
  return (path) => {
    const matching = rules
      .filter((rule) => path.startsWith(rule.prefix))
      .sort(
        (a, b) =>
          b.prefix.length - a.prefix.length ||
          Number(b.allow) - Number(a.allow),
      );
    return matching[0]?.allow ?? true;
  };
}

export async function crawlSource(
  start,
  { request = fetch, delay = 1000 } = {},
) {
  const initial = new URL(start);
  if (
    !["https:", "http:"].includes(initial.protocol) ||
    initial.username ||
    initial.password
  )
    throw new Error("Invalid crawl origin");
  initial.hash = "";
  async function get(url) {
    if (url.origin !== initial.origin) throw new Error("Cross-origin crawl");
    return request(url, {
      headers: { "User-Agent": "KnowledgeManager-Crawler/1.0" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  }
  const robots = await get(new URL("/robots.txt", initial));
  if (!robots.ok && robots.status !== 404)
    throw new Error("Robots policy unavailable");
  const permitted = robotRules(robots.ok ? await read(robots) : "");
  if (!permitted(initial.pathname))
    throw new Error("Start URL denied by robots");
  const pending = [initial];
  const visited = new Set();
  const files = [];
  const content = new Map();
  while (pending.length) {
    const url = pending.shift();
    if (visited.has(url.href)) continue;
    visited.add(url.href);
    if (visited.size > 75) throw new Error("Crawl snapshot exceeds bounds");
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const response = await get(url);
    if (response.status === 404 || response.status === 410) continue;
    if (!response.ok) throw new Error("Crawl failed: " + response.status);
    if (
      !/^text\/(?:html|plain)\b/i.test(
        response.headers.get("content-type") ?? "",
      )
    )
      throw new Error("Unsupported crawl content type");
    const html = await read(response);
    const links = [];
    const plain = sanitize(html, {
      allowedTags: [],
      allowedAttributes: {},
      parser: { lowerCaseTags: true },
      transformTags: {
        a: (tag, attribs) => {
          if (attribs.href) links.push(attribs.href);
          return { tagName: tag, attribs };
        },
      },
    })
      .replace(/\s+/g, " ")
      .trim();
    if (plain.length > 50000) throw new Error("Crawl text exceeds bounds");
    const version = createHash("sha256").update(plain).digest("hex");
    const remoteKey = url.pathname + url.search;
    files.push({ remoteKey, version });
    content.set(remoteKey, plain);
    for (const link of links) {
      try {
        const next = new URL(link, url);
        next.hash = "";
        if (
          next.origin === initial.origin &&
          !next.username &&
          !next.password &&
          permitted(next.pathname) &&
          !visited.has(next.href)
        ) {
          if (pending.length >= 150)
            throw new Error("Crawl frontier exceeds bounds");
          pending.push(next);
        }
      } catch (error) {
        if (error instanceof TypeError) continue;
        throw error;
      }
    }
  }
  return { files, read: async (file) => content.get(file.remoteKey) };
}
