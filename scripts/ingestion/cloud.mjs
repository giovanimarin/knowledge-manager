import { createRequire } from "node:module";
const sanitize = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
)("sanitize-html");
const defaults = {
  drive: "https://www.googleapis.com",
  sharepoint: "https://graph.microsoft.com",
  onedrive: "https://graph.microsoft.com",
  gcs: "https://storage.googleapis.com",
  notion: "https://api.notion.com",
};
const plainFile = /\.(?:txt|md|markdown|csv)$/i;
const validString = (value) => {
  if (typeof value !== "string" || !value)
    throw new Error("Invalid cloud inventory field");
  return value;
};
const htmlText = (html) =>
  sanitize(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();

async function boundedBody(response) {
  if (!response.body) throw new Error("Missing cloud source body");
  let size = 0;
  const parts = [];
  for await (const part of response.body) {
    size += part.length;
    if (size > 4 * 1024 * 1024)
      throw new Error("Cloud response exceeds bounds");
    parts.push(Buffer.from(part));
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts));
}

export async function cloudSource({
  provider,
  container,
  origin = defaults[provider],
  credential,
  nativeCursor,
  principalIds = [],
  request = fetch,
}) {
  if (
    ![
      "drive",
      "sharepoint",
      "onedrive",
      "gcs",
      "notion",
      "confluence",
    ].includes(provider) ||
    !origin ||
    !container
  )
    throw new Error("Invalid cloud source");
  const upstream = new URL(origin);
  if (
    !["http:", "https:"].includes(upstream.protocol) ||
    upstream.username ||
    upstream.password ||
    upstream.pathname !== "/" ||
    upstream.search ||
    upstream.hash
  )
    throw new Error("Invalid upstream origin");
  const delta = !!nativeCursor && ["sharepoint", "onedrive"].includes(provider);
  const removed = new Set();
  const files = [],
    body = new Map();
  const visited = new Set();
  const scope = encodeURIComponent(container);
  let checkpoint;
  const remember = (key, version, title, locator) => {
    if (files.length >= 150 || body.has(key))
      throw new Error("Cloud inventory bound or duplicate");
    files.push({ remoteKey: key, version, title });
    body.set(key, locator);
  };
  async function get(
    path,
    { json = true, method = "GET", params, signed = false } = {},
  ) {
    const url = new URL(path, upstream);
    if (signed) {
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !/(?:\.sharepoint\.com|\.1drv\.com|\.sharepoint\.us)$/i.test(
          url.hostname,
        )
      )
        throw new Error("Untrusted signed download origin");
    } else if (url.origin !== upstream.origin)
      throw new Error("Cross-origin cloud continuation");
    const result = await request(url, {
      method,
      headers: {
        Accept: json ? "application/json" : "text/plain",
        ...(!signed && ["sharepoint", "onedrive"].includes(provider)
          ? {
              Prefer:
                "deltashowsharingchanges, deltashowremovedasdeleted, deltatraversepermissiongaps",
            }
          : {}),
        ...(!signed && credential ? { Authorization: credential } : {}),
        ...(provider === "notion" ? { "Notion-Version": "2022-06-28" } : {}),
        ...(params ? { "Content-Type": "application/json" } : {}),
      },
      ...(params ? { body: JSON.stringify(params) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!result.ok)
      throw new Error("Cloud source unavailable: " + result.status);
    const source = await boundedBody(result);
    return json ? JSON.parse(source) : source;
  }
  function cursor(value) {
    if (visited.has(value) || visited.size >= 25)
      throw new Error("Unbounded cloud pagination");
    visited.add(value);
  }

  if (provider === "drive" || provider === "gcs") {
    let token = "";
    do {
      cursor(token);
      if (provider === "drive") {
        const query = new URLSearchParams({
          q: "trashed = false",
          pageSize: "100",
          fields: "nextPageToken,files(id,name,version,modifiedTime,mimeType)",
        });
        if (container !== "all") {
          query.set("corpora", "drive");
          query.set("driveId", container);
          query.set("includeItemsFromAllDrives", "true");
          query.set("supportsAllDrives", "true");
        }
        if (token) query.set("pageToken", token);
        const result = await get("/drive/v3/files?" + query);
        if (!Array.isArray(result.files) || result.incompleteSearch)
          throw new Error("Incomplete Drive inventory");
        for (const file of result.files) {
          const key = validString(file.id),
            name = validString(file.name);
          const docs = file.mimeType === "application/vnd.google-apps.document";
          if (docs || plainFile.test(name))
            remember(
              key,
              validString(file.version ?? file.modifiedTime),
              name,
              docs
                ? "/drive/v3/files/" +
                    encodeURIComponent(key) +
                    "/export?mimeType=text%2Fplain"
                : "/drive/v3/files/" + encodeURIComponent(key) + "?alt=media",
            );
        }
        token = result.nextPageToken ?? "";
      } else {
        const query = new URLSearchParams({ maxResults: "100" });
        if (token) query.set("pageToken", token);
        const result = await get("/storage/v1/b/" + scope + "/o?" + query);
        if (result.items !== undefined && !Array.isArray(result.items))
          throw new Error("Incomplete GCS inventory");
        for (const file of result.items ?? []) {
          const key = validString(file.name),
            version = validString(file.generation);
          if (plainFile.test(key))
            remember(
              key,
              version,
              key,
              "/download/storage/v1/b/" +
                scope +
                "/o/" +
                encodeURIComponent(key) +
                "?alt=media&generation=" +
                encodeURIComponent(version),
            );
        }
        token = result.nextPageToken ?? "";
      }
    } while (token);
  } else if (provider === "sharepoint" || provider === "onedrive") {
    // A complete snapshot avoids interpreting a partial delta page as a deletion.
    const initial = "/v1.0/drives/" + scope + "/root/delta";
    let next = nativeCursor ?? initial;
    function checkedLink(value) {
      const parsed = new URL(validString(value), upstream);
      if (
        parsed.origin !== upstream.origin ||
        parsed.pathname !== initial ||
        parsed.username ||
        parsed.password ||
        parsed.hash
      )
        throw new Error("Graph continuation outside source");
      return parsed.href;
    }
    while (next) {
      cursor(next);
      const result = await get(
        delta || next !== initial ? checkedLink(next) : next,
      );
      if (!Array.isArray(result.value))
        throw new Error("Incomplete Graph inventory");
      for (const file of result.value) {
        if (!file.file && !file.deleted) continue;
        if (file.deleted || !plainFile.test(file.name ?? "")) {
          if (delta) removed.add(validString(file.id));
          continue;
        }
        remember(
          validString(file.id),
          validString(file.eTag ?? file.cTag),
          validString(file.name),
          { signed: validString(file["@microsoft.graph.downloadUrl"]) },
        );
      }
      checkpoint = result["@odata.deltaLink"] ?? checkpoint;
      next = result["@odata.nextLink"] ?? "";
    }
    if (!checkpoint) throw new Error("Graph inventory has no final token");
  } else if (provider === "confluence") {
    const cql = "type=page AND space='" + container.replaceAll("'", "") + "'";
    let next =
      "/wiki/rest/api/content/search?" +
      new URLSearchParams({ cql, expand: "version,body.storage", limit: "50" });
    while (next) {
      cursor(next);
      const result = await get(next);
      if (!Array.isArray(result.results))
        throw new Error("Incomplete Confluence inventory");
      for (const file of result.results)
        remember(
          validString(file.id),
          String(file.version?.number ?? ""),
          validString(file.title),
          { inline: htmlText(validString(file.body?.storage?.value)) },
        );
      next = result._links?.next ?? "";
      if (next.startsWith("/rest/")) next = "/wiki" + next;
    }
  } else {
    let token;
    do {
      cursor(token ?? "");
      const result = await get("/v1/search", {
        method: "POST",
        params: {
          filter: { property: "object", value: "page" },
          page_size: 100,
          ...(token ? { start_cursor: token } : {}),
        },
      });
      if (!Array.isArray(result.results))
        throw new Error("Incomplete Notion inventory");
      for (const page of result.results) {
        if (page.archived || page.in_trash) continue;
        const key = validString(page.id);
        const title =
          Object.values(page.properties ?? {}).find(
            (property) => property.type === "title",
          )?.title ??
          page.title ??
          [];
        remember(
          key,
          validString(page.last_edited_time),
          title.map((part) => part.plain_text ?? "").join("") || key,
          { notion: key },
        );
      }
      token = result.has_more ? validString(result.next_cursor) : undefined;
    } while (token);
  }
  return {
    files,
    checkpoint,
    delta,
    removed: [...removed],
    async allowsSpace(file) {
      if (!principalIds.length) return false;
      const expected = new Set(principalIds);
      let grants;
      try {
        if (provider === "drive") {
          const result = await get(
            "/drive/v3/files/" +
              encodeURIComponent(file.remoteKey) +
              "/permissions?fields=nextPageToken,permissions(id,type,role,deleted,permissionDetails)&supportsAllDrives=true",
          );
          if (result.nextPageToken || !Array.isArray(result.permissions))
            return false;
          grants = result.permissions.map((permission) =>
            permission.type === "user" &&
            !permission.deleted &&
            !permission.permissionDetails?.some((detail) => detail.inherited)
              ? permission.id
              : null,
          );
        } else if (provider === "sharepoint" || provider === "onedrive") {
          const result = await get(
            "/v1.0/drives/" +
              scope +
              "/items/" +
              encodeURIComponent(file.remoteKey) +
              "/permissions",
          );
          if (result["@odata.nextLink"] || !Array.isArray(result.value))
            return false;
          grants = result.value.map((permission) =>
            !permission.inheritedFrom &&
            !permission.link &&
            !permission.invitation &&
            !permission.expirationDateTime &&
            !permission.grantedToIdentitiesV2?.length
              ? permission.grantedToV2?.user?.id
              : null,
          );
        } else return false;
      } catch {
        return false;
      }
      const actual = new Set(grants);
      return (
        actual.size === expected.size &&
        [...actual].every((principal) => expected.has(principal))
      );
    },
    async read(file) {
      const item = body.get(file.remoteKey);
      if (typeof item === "string") return get(item, { json: false });
      if (item?.inline !== undefined) return item.inline;
      if (item?.signed) return get(item.signed, { json: false, signed: true });
      if (item?.notion) {
        const queue = [item.notion],
          seen = new Set(),
          paragraphs = [];
        while (queue.length) {
          const block = queue.shift();
          if (seen.has(block) || seen.size >= 75)
            throw new Error("Notion block tree exceeds bounds");
          seen.add(block);
          let token;
          do {
            const result = await get(
              "/v1/blocks/" +
                encodeURIComponent(block) +
                "/children?" +
                new URLSearchParams({
                  page_size: "100",
                  ...(token ? { start_cursor: token } : {}),
                }),
            );
            if (!Array.isArray(result.results))
              throw new Error("Incomplete Notion block tree");
            for (const child of result.results) {
              if (child.has_children && child.type !== "child_page")
                queue.push(validString(child.id));
              const value = child[child.type]?.rich_text;
              if (Array.isArray(value))
                paragraphs.push(
                  value.map((part) => part.plain_text ?? "").join(""),
                );
            }
            if (paragraphs.length > 500)
              throw new Error("Notion document exceeds bounds");
            const next = result.has_more
              ? validString(result.next_cursor)
              : undefined;
            if (next && next === token)
              throw new Error("Repeated Notion page token");
            token = next;
          } while (token);
        }
        return paragraphs.join("\n");
      }
      throw new Error("Missing cloud source object");
    },
  };
}
