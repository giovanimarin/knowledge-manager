import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { sql, type TenantTransaction } from "@km/foundation";
import { storageDelivery } from "./storage-hooks.js";
import { IdentityError, unseal } from "../identity/security.js";

export const hookPurpose = (tenant: string, source: string) =>
  `ingestion-webhook-v1:${tenant}:${source}`;

export const nativeHookProviders = new Set([
  "github",
  "gitlab",
  "bitbucket",
  "notion",
  "drive",
  "sharepoint",
  "onedrive",
  "s3",
  "gcs",
]);

const graphProviders = new Set(["sharepoint", "onedrive"]);
const proofHash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest();

export function graphHookSecret(value: string) {
  try {
    const { clientState, subscription } = JSON.parse(value);
    if (
      typeof clientState !== "string" ||
      clientState.length < 32 ||
      clientState.length > 128 ||
      (subscription !== undefined &&
        (typeof subscription !== "string" ||
          !/^[a-f0-9-]{36}$/i.test(subscription)))
    )
      throw new Error();
    return { clientState, subscription };
  } catch {
    throw new IdentityError(400);
  }
}

function digestDelivery(digest: string) {
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function graphDelivery(body: Buffer, secret: string) {
  const { clientState, subscription } = graphHookSecret(secret);
  let values: unknown;
  try {
    values = (JSON.parse(body.toString("utf8")) as { value?: unknown })?.value;
  } catch {
    throw new IdentityError(400);
  }
  if (
    !subscription ||
    !Array.isArray(values) ||
    !values.length ||
    values.length > 100 ||
    !values.every(
      (item) =>
        item?.subscriptionId === subscription &&
        typeof item.clientState === "string" &&
        timingSafeEqual(proofHash(item.clientState), proofHash(clientState)),
    )
  )
    throw new IdentityError(401);
  const digest = proofHash(body).toString("hex");
  return { delivery: digestDelivery(digest), digest };
}

export function driveHookSecret(value: string) {
  try {
    const { token, channel, resource } = JSON.parse(value);
    if (
      typeof token !== "string" ||
      token.length < 32 ||
      token.length > 256 ||
      typeof channel !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(channel) ||
      typeof resource !== "string" ||
      !/^[a-zA-Z0-9_-]{1,180}$/.test(resource)
    )
      throw new Error();
    return { token, channel, resource };
  } catch {
    throw new IdentityError(400);
  }
}

function driveDelivery(headers: IncomingHttpHeaders, secret: string) {
  const { token, channel, resource } = driveHookSecret(secret);
  const supplied = headers["x-goog-channel-token"];
  const number = headers["x-goog-message-number"];
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (
    typeof supplied !== "string" ||
    !timingSafeEqual(hash(token), hash(supplied)) ||
    headers["x-goog-channel-id"] !== channel ||
    headers["x-goog-resource-id"] !== resource ||
    typeof number !== "string" ||
    !/^[1-9][0-9]{0,19}$/.test(number) ||
    !["change", "sync"].includes(String(headers["x-goog-resource-state"]))
  )
    throw new IdentityError(401);
  const digest = hash(JSON.stringify([channel, resource, number])).toString(
    "hex",
  );
  const delivery = digestDelivery(digest);
  return { delivery, digest };
}

function nativeDelivery(
  provider: string,
  headers: IncomingHttpHeaders,
  body: Buffer,
  secret: string,
) {
  const gitlab = provider === "gitlab";
  const github = provider === "github";
  const notion = provider === "notion";
  let delivered: unknown;
  if (notion) {
    try {
      delivered = (JSON.parse(body.toString("utf8")) as { id?: unknown })?.id;
    } catch {
      throw new IdentityError(400);
    }
  } else {
    delivered =
      headers[
        github
          ? "x-github-delivery"
          : gitlab
            ? "idempotency-key"
            : "x-request-uuid"
      ];
  }
  const delivery =
    typeof delivered === "string"
      ? delivered.replace(/^\{([a-f0-9-]+)\}$/i, "$1").toLowerCase()
      : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      delivery,
    )
  )
    throw new IdentityError(401);
  const signature =
    headers[
      github
        ? "x-hub-signature-256"
        : gitlab
          ? "x-gitlab-token"
          : notion
            ? "x-notion-signature"
            : "x-hub-signature"
    ];
  if (typeof signature !== "string") throw new IdentityError(401);
  if (gitlab) {
    const hash = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(hash(secret), hash(signature)))
      throw new IdentityError(401);
  } else {
    if (!/^sha256=[0-9a-f]{64}$/.test(signature)) throw new IdentityError(401);
    const expected = createHmac("sha256", secret).update(body).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex")))
      throw new IdentityError(401);
  }
  return delivery;
}

export async function acceptHook(
  tx: TenantTransaction,
  tenant: string,
  source: string,
  headers: IncomingHttpHeaders,
  raw: Buffer | undefined,
  validationToken: string | null,
) {
  if (raw && raw.length > 256000) throw new IdentityError(400);
  const connection = (
    await sql<{
      provider: string;
      credential_version: number;
      webhook_secret: string | null;
    }>`select s.provider,s.credential_version,s.webhook_secret from km.ingest_sources s
    join km.organizations o on o.tenant_id=s.tenant_id and o.state='active'
    join km.wiki_spaces w on (w.tenant_id,w.id)=(s.tenant_id,s.space_id) and w.deleted_batch is null
    where s.id=${source} and s.revoked_at is null for share of s`.execute(tx)
  ).rows[0];
  if (
    !connection?.webhook_secret ||
    !nativeHookProviders.has(connection.provider)
  )
    throw new IdentityError(404);
  const secret = await unseal(
    connection.webhook_secret,
    hookPurpose(tenant, source),
  );
  const graph = graphProviders.has(connection.provider);
  if (validationToken !== null) {
    if (!graph || !/^[\x20-\x7e]{1,1024}$/.test(validationToken))
      throw new IdentityError(400);
    return { graphChallenge: validationToken };
  }
  if (connection.provider !== "drive" && !raw) throw new IdentityError(400);
  const bytes = raw ?? Buffer.alloc(0);
  let receipt: { delivery: string; digest: string };
  if (connection.provider === "s3" || connection.provider === "gcs") {
    const id = await storageDelivery(
      connection.provider,
      headers,
      bytes,
      secret,
    );
    const digest = proofHash(bytes).toString("hex");
    receipt = {
      delivery: digestDelivery(proofHash(id).toString("hex")),
      digest,
    };
  } else {
    receipt =
      connection.provider === "drive"
        ? driveDelivery(headers, secret)
        : graph
          ? graphDelivery(bytes, secret)
          : {
              delivery: nativeDelivery(
                connection.provider,
                headers,
                bytes,
                secret,
              ),
              digest: createHash("sha256").update(bytes).digest("hex"),
            };
  }
  const { delivery, digest } = receipt;
  const remembered =
    await sql`insert into km.ingest_signals(tenant_id,source_id,credential_version,delivery,digest)
    values(${tenant},${source},${connection.credential_version},${delivery},${digest})
    on conflict do nothing returning delivery`.execute(tx);
  if (!remembered.rows.length) {
    const earlier = (
      await sql<{ digest: string }>`select digest from km.ingest_signals
      where source_id=${source} and credential_version=${connection.credential_version} and delivery=${delivery}`.execute(
        tx,
      )
    ).rows[0];
    if (earlier && earlier.digest !== digest) throw new IdentityError(409);
  }
  return { accepted: true };
}
