import { crawlSource } from "./ingestion/crawler.mjs";
import { pushSnapshot } from "./ingestion/push.mjs";

const [start, source] = process.argv.slice(2);
const { KM_BASE_URL, KM_SOURCE_SESSION, KM_CRAWL_SOURCE_ACL } = process.env;
if (
  !start ||
  !source ||
  !/^[a-f0-9-]{36}$/i.test(source) ||
  !KM_BASE_URL ||
  !KM_SOURCE_SESSION
)
  throw new Error(
    "Informe URL inicial, ID da fonte, destino local e credencial escopada",
  );
const objectState = await fetch(
  new URL("/v1/ingestion/sources/" + source + "/objects", KM_BASE_URL),
  {
    headers: { Authorization: "Bearer " + KM_SOURCE_SESSION },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  },
);
if (!objectState.ok) throw new Error("Source inventory unavailable");
const { cursor } = await objectState.json();
const snapshot = await crawlSource(start);
const records = await pushSnapshot({
  snapshot,
  source,
  base: KM_BASE_URL,
  session: KM_SOURCE_SESSION,
  expectedSyncCursor: cursor,
  mapped: KM_CRAWL_SOURCE_ACL === "mapped-space",
});
console.log(JSON.stringify({ provider: "crawler", records }));
