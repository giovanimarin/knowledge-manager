import { sourceConnection } from "./ingestion/connection.mjs";
import { s3Source } from "./ingestion/s3.mjs";
import { pushSnapshot } from "./ingestion/push.mjs";

const [bucket, source] = process.argv.slice(2);
const {
  AWS_REGION,
  KM_BASE_URL,
  KM_SOURCE_SESSION,
  KM_S3_ENDPOINT,
  KM_S3_SOURCE_ACL,
} = process.env;
if (
  !bucket ||
  !source ||
  !/^[a-f0-9-]{36}$/i.test(source) ||
  !KM_BASE_URL ||
  !KM_SOURCE_SESSION
)
  throw new Error(
    "Informe bucket, ID da fonte, destino local e credenciais escopadas",
  );
const connection = await sourceConnection({
  base: KM_BASE_URL,
  source,
  session: KM_SOURCE_SESSION,
  provider: "s3",
  target: bucket,
});
const credentials = connection.credential
  ? JSON.parse(connection.credential)
  : undefined;
if (
  credentials &&
  (typeof credentials.accessKeyId !== "string" ||
    typeof credentials.secretAccessKey !== "string")
)
  throw new Error("Invalid source AWS credentials");
const snapshot = await s3Source({
  bucket,
  region: AWS_REGION,
  endpoint: credentials ? undefined : KM_S3_ENDPOINT,
  credentials,
});
const records = await pushSnapshot({
  snapshot,
  source,
  base: KM_BASE_URL,
  session: KM_SOURCE_SESSION,
  expectedCredentialVersion: connection.credentialVersion,
  mapped: KM_S3_SOURCE_ACL === "mapped-space",
});
console.log(JSON.stringify({ provider: "s3", records }));
