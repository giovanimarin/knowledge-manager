import { cloudSource } from "./ingestion/cloud.mjs";
import { pushSnapshot } from "./ingestion/push.mjs";

const [provider, container, source] = process.argv.slice(2);
const {
  KM_BASE_URL,
  KM_SOURCE_SESSION,
  KM_CLOUD_SOURCE_AUTH,
  KM_CLOUD_SOURCE_ORIGIN,
  KM_CLOUD_NATIVE_PRINCIPALS,
} = process.env;
if (
  !KM_BASE_URL ||
  !KM_SOURCE_SESSION ||
  !KM_CLOUD_SOURCE_AUTH ||
  !source ||
  !/^[a-f0-9-]{36}$/i.test(source)
)
  throw new Error(
    "Informe a conexão, o tenant local e as credenciais autorizadas",
  );
const inventory = await fetch(
  new URL("/v1/ingestion/sources/" + source + "/objects", KM_BASE_URL),
  {
    headers: { Authorization: "Bearer " + KM_SOURCE_SESSION },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  },
);
if (!inventory.ok) throw new Error("Source inventory unavailable");
const { nativeCursor = null } = await inventory.json();
const principalIds = JSON.parse(KM_CLOUD_NATIVE_PRINCIPALS ?? "[]");
if (
  !Array.isArray(principalIds) ||
  principalIds.length > 100 ||
  !principalIds.every(
    (value) => typeof value === "string" && value.length && value.length <= 256,
  )
)
  throw new Error("Invalid native ACL mapping");
const snapshot = await cloudSource({
  provider,
  container,
  origin: KM_CLOUD_SOURCE_ORIGIN,
  credential: KM_CLOUD_SOURCE_AUTH,
  nativeCursor,
  principalIds,
});
const records = await pushSnapshot({
  snapshot: { ...snapshot, before: nativeCursor },
  source,
  base: KM_BASE_URL,
  session: KM_SOURCE_SESSION,
  mapped: false,
});
console.log(JSON.stringify({ provider, records }));
