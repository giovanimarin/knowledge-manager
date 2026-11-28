import { sourceConnection } from "./ingestion/connection.mjs";
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
const connection = await sourceConnection({
  base: KM_BASE_URL,
  source,
  session: KM_SOURCE_SESSION,
  provider,
  target: repository + "@" + ref,
});
const signals = (await connection.request("/signals")).map(
  (signal) => signal.delivery,
);
const { cursor, nativeCursor } = await connection.request("/objects");
const snapshot = await gitSource({
  provider,
  repository,
  ref,
  attestAcl: Boolean(connection.nativePrincipals?.length),
  principalIds: connection.nativePrincipals,
  credential: connection.credential ?? KM_GIT_SOURCE_TOKEN,
});
const records = await pushSnapshot({
  snapshot: connection.nativePrincipals
    ? { ...snapshot, before: nativeCursor }
    : { ...snapshot, checkpoint: undefined, allowsSpace: undefined },
  nativePrincipals: connection.nativePrincipals,
  signals,
  expectedSyncCursor: cursor,
  expectedCredentialVersion: connection.credentialVersion,
  source,
  base: KM_BASE_URL,
  session: KM_SOURCE_SESSION,
  mapped: process.env.KM_GIT_SOURCE_ACL === "mapped-space",
});
console.log(JSON.stringify({ provider, records }));
