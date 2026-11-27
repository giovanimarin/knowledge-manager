import { pushSnapshot } from "./ingestion/push.mjs";
import { gitSource } from "./ingestion/git.mjs";

const [provider, repository, ref, source] = process.argv.slice(2);
const { KM_BASE_URL, KM_SOURCE_SESSION, KM_GIT_SOURCE_TOKEN } = process.env;
if (
  !KM_BASE_URL ||
  !KM_SOURCE_SESSION ||
  !source ||
  !/^[a-f0-9-]{36}$/i.test(source)
)
  throw new Error("Informe URL local, credencial escopada e ID da fonte");
const delivery = await fetch(
  new URL("/v1/ingestion/sources/" + source + "/signals", KM_BASE_URL),
  {
    headers: { Authorization: "Bearer " + KM_SOURCE_SESSION },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  },
);
if (!delivery.ok) throw new Error("Source signal inventory unavailable");
const signals = (await delivery.json()).map((signal) => signal.delivery);
const snapshot = await gitSource({
  provider,
  repository,
  ref,
  credential: KM_GIT_SOURCE_TOKEN,
});
const records = await pushSnapshot({
  snapshot,
  signals,
  source,
  base: KM_BASE_URL,
  session: KM_SOURCE_SESSION,
  mapped: process.env.KM_GIT_SOURCE_ACL === "mapped-space",
});
console.log(JSON.stringify({ provider, records }));
