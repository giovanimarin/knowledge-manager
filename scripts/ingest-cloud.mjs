import {
  sourceConnection,
  guardProviderAccess,
} from "./ingestion/connection.mjs";
import { cloudSource, CloudSourceStatus } from "./ingestion/cloud.mjs";
import { pushSnapshot } from "./ingestion/push.mjs";

const [provider, container, source] = process.argv.slice(2);
const {
  KM_BASE_URL,
  KM_SOURCE_SESSION,
  KM_CLOUD_SOURCE_AUTH,
  KM_CLOUD_SOURCE_ORIGIN,
  KM_CLOUD_FULL_RECONCILE,
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
const signals = (await connection.request("/signals")).map(
  (signal) => signal.delivery,
);
const { nativeCursor = null, cursor } = await connection.request("/objects");
const principalIds = connection.nativePrincipals ?? [];
const options = {
  provider,
  container,
  origin: provider === "confluence" ? KM_CLOUD_SOURCE_ORIGIN : undefined,
  credential: connection.credential ?? KM_CLOUD_SOURCE_AUTH,
  nativeCursor: KM_CLOUD_FULL_RECONCILE === "1" ? null : nativeCursor,
  principalIds,
  trackNativeCursor: true,
};
if (!options.credential) throw new Error("Source has no authorized credential");
const records = await guardProviderAccess(connection, cursor, async () => {
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
  return pushSnapshot({
    snapshot: { ...snapshot, before: nativeCursor },
    source,
    signals,
    base: KM_BASE_URL,
    session: KM_SOURCE_SESSION,
    mapped: false,
    nativePrincipals: principalIds,
    expectedSyncCursor: cursor,
    expectedCredentialVersion: connection.credentialVersion,
  });
});
console.log(JSON.stringify({ provider, records }));
