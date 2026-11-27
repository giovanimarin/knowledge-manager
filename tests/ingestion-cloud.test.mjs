import assert from "node:assert/strict";
import { test } from "node:test";
import { cloudSource } from "../scripts/ingestion/cloud.mjs";

test("cloud connectors preserve bounded inventories and recover source text", async () => {
  const response = async (url, options) => {
    const path = url.pathname;
    if (path.endsWith("/files"))
      return Response.json({
        files: [{ id: "x", name: "guide.txt", version: "2" }],
      });
    if (path.endsWith("/files/x")) return new Response("Guia");
    if (path.endsWith("/root/delta"))
      return Response.json({
        value: [
          {
            id: "x",
            name: "guide.txt",
            file: {},
            eTag: "2",
            "@microsoft.graph.downloadUrl":
              "https://company.sharepoint.com/signed",
          },
        ],
        "@odata.deltaLink": "https://graph.microsoft.com/final",
      });
    if (path === "/signed") {
      assert.equal(options.headers.Authorization, undefined);
      return new Response("Guia");
    }
    if (path.startsWith("/download/")) return new Response("Guia");
    if (path.endsWith("/b/repo/o"))
      return Response.json({ items: [{ name: "guide.txt", generation: "2" }] });
    if (path.endsWith("/content/search"))
      return Response.json({
        results: [
          {
            id: "x",
            title: "guide.txt",
            version: { number: 2 },
            body: { storage: { value: "<p>Guia</p><script>ativo</script>" } },
          },
        ],
      });
    if (path.endsWith("/v1/search"))
      return Response.json({
        results: [
          {
            id: "x",
            last_edited_time: "2",
            title: [{ plain_text: "guide.txt" }],
          },
        ],
      });
    if (path.endsWith("/children"))
      return Response.json({
        results: [
          {
            id: "b",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "Guia" }] },
          },
        ],
      });
    throw new Error("Unexpected cloud endpoint");
  };
  for (const provider of [
    "drive",
    "sharepoint",
    "onedrive",
    "gcs",
    "confluence",
    "notion",
  ]) {
    const source = await cloudSource({
      provider,
      container: "repo",
      origin: "https://fixture.example",
      credential: "Bearer synthetic",
      request: response,
    });
    assert.equal(source.files.length, 1);
    assert.equal(await source.read(source.files[0]), "Guia");
  }
});

test("Graph continuation or download cannot move credentials to an unrelated host", async () => {
  await assert.rejects(
    cloudSource({
      provider: "sharepoint",
      container: "fixture",
      request: async () =>
        Response.json({
          value: [],
          "@odata.nextLink": "https://elsewhere.invalid/",
        }),
    }),
    /Cross-origin/,
  );
  const source = await cloudSource({
    provider: "onedrive",
    container: "fixture",
    request: async () =>
      Response.json({
        value: [
          {
            id: "x",
            file: {},
            eTag: "1",
            name: "guide.txt",
            "@microsoft.graph.downloadUrl": "https://elsewhere.invalid/",
          },
        ],
        "@odata.deltaLink": "token",
      }),
  });
  await assert.rejects(source.read(source.files[0]), /Untrusted/);
});

test("S3 fixture keeps strong validators from listing to reads", async () => {
  const { s3Source } = await import("../scripts/ingestion/s3.mjs");
  const { Readable } = await import("node:stream");
  const commands = [];
  const source = await s3Source({
    bucket: "fixtures",
    region: "us-east-1",
    client: {
      async send(command) {
        commands.push(command);
        if (commands.length === 1)
          return { Contents: [{ Key: "guide.txt", ETag: '"v1"' }] };
        return { Body: Readable.from([Buffer.from("Guia")]), ETag: '"v1"' };
      },
    },
  });
  assert.equal(await source.read(source.files[0]), "Guia");
  assert.equal(commands[1].input.IfMatch, '"v1"');
  await assert.rejects(
    s3Source({
      bucket: "fixtures",
      region: "us-east-1",
      client: { send: async () => ({ IsTruncated: true }) },
    }),
    /Truncated/,
  );
});
