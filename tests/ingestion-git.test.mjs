import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { gitSource } from "../scripts/ingestion/git.mjs";

test("GitHub, GitLab and Bitbucket fixtures exercise actual HTTP reads and pinned identities", async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    const url = new URL(req.url, "http://localhost");
    const reply = (value) => res.end(JSON.stringify(value));
    if (url.pathname.includes("/trees/"))
      return reply({
        sha: "tree-v1",
        truncated: false,
        tree: [{ path: "guide.md", type: "blob", sha: "object-v1" }],
      });
    if (url.pathname.startsWith("/repos/"))
      return reply({
        encoding: "base64",
        content: Buffer.from("Ação").toString("base64"),
      });
    if (url.pathname.endsWith("/commits/main"))
      return reply({ id: "commit-v1" });
    if (url.pathname.endsWith("/repository/tree")) {
      assert.equal(url.searchParams.get("ref"), "commit-v1");
      if (url.searchParams.get("page") === "1") {
        res.setHeader("x-next-page", "2");
        return reply([{ path: "guide.md", type: "blob", id: "object-v1" }]);
      }
      return reply([]);
    }
    if (url.pathname.endsWith("/raw")) return res.end("Ação");
    if (url.pathname.includes("/commit/")) return reply({ hash: "commit-v1" });
    if (url.pathname.endsWith("/"))
      return reply({ values: [{ type: "commit_file", path: "guide.md" }] });
    if (url.pathname.endsWith("guide.md")) return res.end("Ação");
    return res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = "http://127.0.0.1:" + server.address().port;
    for (const provider of ["github", "gitlab", "bitbucket"]) {
      const connector = await gitSource({
        provider,
        repository: "org/repo",
        ref: "main",
        origin,
      });
      assert.equal(connector.files[0].remoteKey, "guide.md");
      assert.equal(await connector.read(connector.files[0]), "Ação");
    }
    assert.ok(requests.some((path) => path.includes("page=2")));
    assert.ok(
      requests.some((path) => path.includes("/src/commit-v1/guide.md")),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("incomplete or cross-origin Git inventory fails closed", async () => {
  await assert.rejects(
    gitSource({
      provider: "github",
      repository: "org/repo",
      ref: "main",
      request: async () => Response.json({ truncated: true, tree: [] }),
    }),
    /Incomplete/,
  );
  await assert.rejects(
    gitSource({
      provider: "bitbucket",
      repository: "org/repo",
      ref: "main",
      request: async (url) =>
        Response.json(
          url.pathname.includes("/commit/")
            ? { hash: "abc" }
            : { values: [], next: "https://invalid.example/secret" },
        ),
    }),
    /continuation/,
  );
});

test("Git repos quarantine unknown and private visibility even if the connector can read", async () => {
  for (const [provider, metadata] of [
    ["github", { visibility: "public", private: false }],
    ["gitlab", { visibility: "public" }],
    ["bitbucket", { is_private: false }],
  ]) {
    for (const visibility of [metadata, {}, null]) {
      const snapshot = await gitSource({
        provider,
        repository: "org/repo",
        ref: "main",
        attestAcl: true,
        request: async (url) => {
          if (url.pathname.includes("/trees/"))
            return Response.json({ sha: "tree-1", truncated: false, tree: [] });
          if (url.pathname.includes("/commits/"))
            return Response.json({ id: "gitlab-1" });
          if (url.pathname.endsWith("/repository/tree"))
            return Response.json([]);
          if (url.pathname.includes("/commit/"))
            return Response.json({ hash: "bitbucket-1" });
          if (url.pathname.includes("/src/"))
            return Response.json({ values: [] });
          return visibility
            ? Response.json(visibility)
            : new Response(null, { status: 403 });
        },
      });
      assert.ok(snapshot.checkpoint);
      assert.equal(await snapshot.allowsSpace(), visibility === metadata);
    }
  }
});
