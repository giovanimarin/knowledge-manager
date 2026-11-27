import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { sql, type TenantTransaction } from "@km/foundation";
import { IdentityError, unseal } from "../identity/security.js";

export const hookPurpose = (tenant: string, source: string) =>
  `ingestion-webhook-v1:${tenant}:${source}`;

export async function acceptHook(
  tx: TenantTransaction,
  tenant: string,
  source: string,
  headers: IncomingHttpHeaders,
  raw: Buffer | undefined,
) {
  if (!raw || raw.length > 256000) throw new IdentityError(400);
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
  if (connection?.provider !== "github" || !connection.webhook_secret)
    throw new IdentityError(404);
  const signature = headers["x-hub-signature-256"];
  const delivery = headers["x-github-delivery"];
  if (
    typeof signature !== "string" ||
    !/^sha256=[0-9a-f]{64}$/.test(signature) ||
    typeof delivery !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(delivery)
  )
    throw new IdentityError(401);
  const secret = await unseal(
    connection.webhook_secret,
    hookPurpose(tenant, source),
  );
  const digest = createHash("sha256").update(raw).digest("hex");
  const expected = createHmac("sha256", secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex")))
    throw new IdentityError(401);
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
