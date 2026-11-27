import { sourceConnection } from "./ingestion/connection.mjs";
import { cloudSource, CloudSourceStatus } from "./ingestion/cloud.mjs";
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
  !source ||
  !/^[a-f0-9-]{36}$/i.test(source)
)
  throw new Error(
    "Informe a conexão, o tenant local e as credenciais autorizadas",
  );
const connection = await sourceConnection({
  base: KM_BASE_URL,
  source,
  session: KM_SOURCE_SESSION,
  provider,
  target: container,
});
const { nativeCursor = null } = await connection.request("/objects");
const principalIds = JSON.parse(KM_CLOUD_NATIVE_PRINCIPALS ?? "[]");
if (
  !Array.isArray(principalIds) ||
  principalIds.length > 100 ||
  !principalIds.every(
    (value) => typeof value === "string" && value.length && value.length <= 256,
  )
)
  throw new Error("Invalid native ACL mapping");
const options = {
  provider,
  container,
  origin: KM_CLOUD_SOURCE_ORIGIN,
  credential: connection.credential ?? KM_CLOUD_SOURCE_AUTH,
  nativeCursor,
  principalIds,
  trackNativeCursor: true,
};
if (!options.credential) throw new Error("Source has no authorized credential");
let snapshot;
try {
  snapshot = await cloudSource(options);
} catch (error) {
  if (
    !nativeCursor ||
    !(error instanceof CloudSourceStatus) ||
    error.status !== 410
  )
    throw error;
  snapshot = await cloudSource({ ...options, nativeCursor: null });
}
const records = await pushSnapshot({
  snapshot: { ...snapshot, before: nativeCursor },
  source,
  base: KM_BASE_URL,
  session: KM_SOURCE_SESSION,
  mapped: false,
  expectedCredentialVersion: connection.credentialVersion,
});
console.log(JSON.stringify({ provider, records }));
