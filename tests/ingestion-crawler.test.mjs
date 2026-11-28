import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { crawlSource } from "../scripts/ingestion/crawler.mjs";

test("crawler uses same-origin HTML, honors robots and strips active text", async () => {
  const visited = [];
  const server = createServer((req, res) => {
    visited.push(req.url);
    res.setHeader("Content-Type", "text/html");
    if (req.url === "/robots.txt")
      return res.end("User-agent: *\nDisallow: /private\n");
    if (req.url === "/")
      return res.end(
        "<h1>Wiki</h1><script>script fixture</script><a href='/read'>Leia</a><a href='/private'>Privado</a><a href='https://elsewhere.invalid/'>Fora</a>",
      );
    if (req.url === "/read") return res.end("<p>Ação segura</p>");
    assert.fail("Unexpected crawl request");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const seed = "http://127.0.0.1:" + server.address().port;
    const snapshot = await crawlSource(seed, { delay: 0 });
    assert.deepEqual(visited, ["/robots.txt", "/", "/read"]);
    assert.match(await snapshot.read(snapshot.files[1]), /Ação segura/);
    assert.doesNotMatch(
      await snapshot.read(snapshot.files[0]),
      /script fixture/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
