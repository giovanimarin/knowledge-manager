import { readWithRetry } from "./transport.mjs";
// Returns a complete bounded snapshot. Partial listings never imply deletion.
const origins = {
  github: "https://api.github.com",
  gitlab: "https://gitlab.com",
  bitbucket: "https://api.bitbucket.org",
};
const supported = /\.(?:md|markdown|txt|csv)$/i;
const pathFor = (path) => path.split("/").map(encodeURIComponent).join("/");
const firstHeader = (headers, name) => headers.get(name) || "";
const text = (value) => {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Invalid connector response");
  return value;
};

export async function gitSource({
  provider,
  repository,
  ref,
  origin = origins[provider],
  credential,
  attestAcl = false,
  request = fetch,
}) {
  if (!Object.hasOwn(origins, provider) || !origin || !repository || !ref)
    throw new Error("Invalid Git source");
  const upstream = new URL(origin);
  if (
    !["https:", "http:"].includes(upstream.protocol) ||
    upstream.username ||
    upstream.password ||
    upstream.pathname !== "/" ||
    upstream.search ||
    upstream.hash
  )
    throw new Error("Invalid upstream origin");
  const repo = pathFor(repository);
  const branch = encodeURIComponent(ref);
  async function get(path, mode = "json") {
    const url = new URL(path, upstream);
    if (url.origin !== upstream.origin)
      throw new Error("Cross-origin continuation");
    const response = await readWithRetry(request, url, {
      headers: {
        Accept: mode === "json" ? "application/json" : "text/plain",
        ...(credential ? { Authorization: "Bearer " + credential } : {}),
      },
    });
    if (!response.ok)
      throw new Error("Git source unavailable: " + response.status);
    if (!response.body) throw new Error("Missing response body");
    let size = 0;
    const result = [];
    for await (const bytes of response.body) {
      size += bytes.byteLength;
      if (size > 2 * 1024 * 1024) {
        await response.body.cancel().catch(() => {});
        throw new Error("Git source response exceeds bounds");
      }
      result.push(Buffer.from(bytes));
    }
    const payload = Buffer.concat(result);
    const value = new TextDecoder("utf-8", { fatal: true }).decode(payload);
    return {
      value: mode === "text" ? value : JSON.parse(value),
      headers: response.headers,
    };
  }
  const projectPath =
    provider === "github"
      ? "/repos/" + repo
      : provider === "gitlab"
        ? "/api/v4/projects/" + encodeURIComponent(repository)
        : "/2.0/repositories/" + repo;
  let acl;
  async function allowsSpace() {
    if (!attestAcl) return false;
    const result = await (acl ??= get(projectPath).catch(() => null));
    if (!result) return false;
    const { value } = result;
    // Public repository metadata is positive evidence. Private repository membership
    // may include inherited grants and requires a complete effective ACL.
    if (provider === "github")
      return value.visibility === "public" && value.private === false;
    if (provider === "gitlab") return value.visibility === "public";
    return value.is_private === false;
  }
  function keep(records, entry) {
    if (!supported.test(entry.remoteKey)) return;
    if (records.length >= 150)
      throw new Error("Git source snapshot exceeds the supported bound");
    if (records.some((record) => record.remoteKey === entry.remoteKey))
      throw new Error("Duplicate Git source path");
    records.push(entry);
  }
  const files = [];
  if (provider === "github") {
    const prefix = "/repos/" + repo + "/git/";
    const { value } = await get(prefix + "trees/" + branch + "?recursive=1");
    if (value.truncated !== false || !Array.isArray(value.tree))
      throw new Error("Incomplete GitHub tree");
    for (const item of value.tree)
      if (item.type === "blob")
        keep(files, { remoteKey: text(item.path), version: text(item.sha) });
    return {
      files,
      allowsSpace,
      checkpoint: text(value.sha),
      async read(file) {
        const { value } = await get(
          prefix + "blobs/" + encodeURIComponent(file.version),
        );
        if (value.encoding !== "base64")
          throw new Error("Unknown GitHub encoding");
        const bytes = Buffer.from(text(value.content), "base64");
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      },
    };
  }
  if (provider === "gitlab") {
    const prefix =
      "/api/v4/projects/" + encodeURIComponent(repository) + "/repository/";
    const commit = text((await get(prefix + "commits/" + branch)).value.id);
    let page = "1";
    const visited = new Set();
    while (page) {
      if (!/^\d+$/.test(page) || visited.has(page) || visited.size >= 20)
        throw new Error("Invalid GitLab continuation");
      visited.add(page);
      const { value, headers } = await get(
        prefix +
          "tree?recursive=true&per_page=100&ref=" +
          encodeURIComponent(commit) +
          "&page=" +
          page,
      );
      if (!Array.isArray(value)) throw new Error("Incomplete GitLab tree");
      for (const item of value)
        if (item.type === "blob")
          keep(files, { remoteKey: text(item.path), version: text(item.id) });
      page = firstHeader(headers, "x-next-page");
    }
    return {
      files,
      allowsSpace,
      checkpoint: commit,
      async read(file) {
        return (
          await get(
            prefix + "blobs/" + encodeURIComponent(file.version) + "/raw",
            "text",
          )
        ).value;
      },
    };
  }
  const prefix = "/2.0/repositories/" + repo + "/src/";
  // Pin directory reads to the commit returned by the repository, not a moving branch.
  const commit = text(
    (await get("/2.0/repositories/" + repo + "/commit/" + branch)).value.hash,
  );
  const pinned = encodeURIComponent(commit);
  const pending = [prefix + pinned + "/?pagelen=100"];
  const visited = new Set();
  while (pending.length) {
    const continuation = pending.shift();
    const target = new URL(continuation, upstream);
    if (
      target.origin !== upstream.origin ||
      !target.pathname.startsWith(prefix + pinned + "/") ||
      visited.has(target.href) ||
      visited.size >= 100
    )
      throw new Error("Invalid Bitbucket continuation");
    visited.add(target.href);
    const { value } = await get(target);
    if (!Array.isArray(value.values))
      throw new Error("Incomplete Bitbucket tree");
    for (const item of value.values) {
      if (item.type === "commit_file")
        keep(files, { remoteKey: text(item.path), version: commit });
      if (item.type === "commit_directory")
        pending.push(
          prefix + pinned + "/" + pathFor(text(item.path)) + "/?pagelen=100",
        );
    }
    if (value.next) pending.push(text(value.next));
  }
  return {
    files,
    allowsSpace,
    checkpoint: commit,
    async read(file) {
      return (
        await get(prefix + pinned + "/" + pathFor(file.remoteKey), "text")
      ).value;
    },
  };
}
