import { createPublicKey, verify } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { createLocalJWKSet, jwtVerify } from "jose";
import { IdentityError } from "../identity/security.js";

function json<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new IdentityError(400);
  }
}

export function snsConfig(secret: string) {
  const value = json<{
    topic?: string;
    certificateUrl?: string;
    publicKey?: string;
  }>(secret);
  if (
    !value ||
    typeof value.topic !== "string" ||
    !/^arn:aws:sns:[a-z0-9-]+:[0-9]{12}:[a-zA-Z0-9_.-]+$/.test(value.topic) ||
    typeof value.certificateUrl !== "string" ||
    !/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\/SimpleNotificationService-[a-zA-Z0-9-]+\.pem$/.test(
      value.certificateUrl,
    ) ||
    typeof value.publicKey !== "string"
  )
    throw new IdentityError(400);
  try {
    const publicKey = createPublicKey(value.publicKey);
    if (
      publicKey.asymmetricKeyType !== "rsa" ||
      (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    )
      throw new Error("SNS key must be RSA");
    return {
      topic: value.topic,
      certificateUrl: value.certificateUrl,
      publicKey,
    };
  } catch {
    throw new IdentityError(400);
  }
}

export function pubsubConfig(secret: string) {
  const value = json<{
    audience?: string;
    email?: string;
    subscription?: string;
    keys?: unknown[];
  }>(secret);
  if (
    !value ||
    typeof value.audience !== "string" ||
    !value.audience ||
    typeof value.email !== "string" ||
    !value.email.endsWith(".gserviceaccount.com") ||
    typeof value.subscription !== "string" ||
    !/^projects\/[a-zA-Z0-9_-]+\/subscriptions\/[a-zA-Z0-9_.~-]+$/.test(
      value.subscription,
    ) ||
    !Array.isArray(value.keys) ||
    value.keys.length < 1 ||
    value.keys.length > 4
  )
    throw new IdentityError(400);
  const keys = value.keys.map((entry) => {
    const key = entry as { kty?: string; kid?: string; n?: string; e?: string };
    if (
      !key ||
      key.kty !== "RSA" ||
      typeof key.kid !== "string" ||
      !key.kid ||
      typeof key.n !== "string" ||
      key.n.length < 342 ||
      !/^[a-zA-Z0-9_-]+$/.test(key.n) ||
      typeof key.e !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(key.e)
    )
      throw new IdentityError(400);
    return { kty: "RSA", kid: key.kid, n: key.n, e: key.e };
  });
  return {
    audience: value.audience,
    email: value.email,
    subscription: value.subscription,
    keys,
  };
}

export async function storageDelivery(
  provider: string,
  headers: IncomingHttpHeaders,
  body: Buffer,
  secret: string,
) {
  if (provider === "s3") {
    const config = snsConfig(secret);
    const event = json<Record<string, unknown>>(body.toString("utf8"));
    if (
      event?.Type !== "Notification" ||
      event.SignatureVersion !== "2" ||
      event.TopicArn !== config.topic ||
      event.SigningCertURL !== config.certificateUrl ||
      typeof event.Signature !== "string" ||
      !/^[a-zA-Z0-9+/]+=*$/.test(event.Signature)
    )
      throw new IdentityError(401);
    const fields = [
      "Message",
      "MessageId",
      ...(event.Subject == null ? [] : ["Subject"]),
      "Timestamp",
      "TopicArn",
      "Type",
    ];
    if (
      fields.some((field) => typeof event[field] !== "string") ||
      !Number.isFinite(Date.parse(String(event.Timestamp))) ||
      Math.abs(Date.now() - Date.parse(String(event.Timestamp))) >
        24 * 60 * 60 * 1000
    )
      throw new IdentityError(401);
    const canonical = fields
      .map((field) => field + "\n" + event[field] + "\n")
      .join("");
    if (
      !verify(
        "RSA-SHA256",
        Buffer.from(canonical),
        config.publicKey,
        Buffer.from(event.Signature, "base64"),
      )
    )
      throw new IdentityError(401);
    return String(event.MessageId);
  }
  const config = pubsubConfig(secret);
  const authorization = headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer "))
    throw new IdentityError(401);
  try {
    const { payload } = await jwtVerify(
      authorization.slice(7),
      createLocalJWKSet({ keys: config.keys }),
      {
        issuer: ["accounts.google.com", "https://accounts.google.com"],
        audience: config.audience,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "iat", "sub", "email", "email_verified"],
      },
    );
    if (payload.email !== config.email || payload.email_verified !== true)
      throw new Error("Wrong Pub/Sub account");
  } catch {
    throw new IdentityError(401);
  }
  const event = json<{
    subscription?: string;
    message?: { messageId?: string };
  }>(body.toString("utf8"));
  if (
    event?.subscription !== config.subscription ||
    typeof event.message?.messageId !== "string" ||
    !/^[0-9]{1,32}$/.test(event.message.messageId)
  )
    throw new IdentityError(401);
  return event.message.messageId;
}
