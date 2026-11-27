import { cloudSource } from "./ingestion/cloud.mjs";
import { pushSnapshot } from "./ingestion/push.mjs";

const [provider, container, source] = process.argv.slice(2);
const {
  KM_BASE_URL,
  KM_SOURCE_SESSION,
  KM_CLOUD_SOURCE_AUTH,
  KM_CLOUD_SOURCE_ORIGIN,
  KM_CLOUD_SOURCE_ACL,
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
const snapshot = await cloudSource({
  provider,
  container,
  origin: KM_CLOUD_SOURCE_ORIGIN,
  credential: KM_CLOUD_SOURCE_AUTH,
});
const records = await pushSnapshot({
  snapshot,
  source,
  base: KM_BASE_URL,
  session: KM_SOURCE_SESSION,
  mapped: KM_CLOUD_SOURCE_ACL === "mapped-space",
});
console.log(JSON.stringify({ provider, records }));
