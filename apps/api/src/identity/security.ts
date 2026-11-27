import { createHash, hkdfSync, randomBytes } from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";
import { CompactEncrypt, compactDecrypt } from "jose";
import { Secret, TOTP } from "otpauth";
import { required, uuid } from "@km/foundation";

export const problem = {
  400: "Invalid input",
  401: "Invalid or revoked credentials",
  403: "Operation forbidden",
  404: "Resource not visible",
  409: "Conflicting state",
  429: "Too many requests",
} as const;

export class IdentityError extends Error {
  constructor(readonly status: keyof typeof problem) {
    super(problem[status]);
  }
}

export function input(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new IdentityError(400);
  return value as Record<string, unknown>;
}

export function string(value: unknown, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new IdentityError(400);
  return value;
}

export function id(value: unknown): string {
  const candidate = string(value, 36).toLowerCase();
  if (!uuid.test(candidate)) throw new IdentityError(400);
  return candidate;
}

export function email(value: unknown): string {
  const normalized = string(value, 254).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new IdentityError(400);
  return normalized;
}

export function password(value: unknown) {
  const text = string(value, 128);
  if (text.length < 12) throw new IdentityError(400);
  return text;
}

const argon = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
export const hashPassword = (value: string) => hash(value, argon);
export const verifyPassword = (value: string, encoded: string) =>
  verify(encoded, value);

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function token(tenant: string, kind: string) {
  return `${tenant}.${kind}.${randomBytes(32).toString("base64url")}`;
}

export function parseToken(value: unknown, kinds: string[]) {
  if (typeof value !== "string") throw new IdentityError(401);
  const [tenant, kind, nonce, extra] = value.split(".");
  if (
    !tenant ||
    !uuid.test(tenant) ||
    !kind ||
    !kinds.includes(kind) ||
    !nonce ||
    !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
    extra !== undefined
  )
    throw new IdentityError(401);
  return { tenant: tenant.toLowerCase(), digest: digest(value), kind };
}

const key = () =>
  new Uint8Array(
    hkdfSync(
      "sha256",
      process.env.KM_IDENTITY_KEY || required("PGPASSWORD"),
      "knowledge-manager",
      "identity-totp-v1",
      32,
    ),
  );
export const totp = (encoded: string, email: string) =>
  new TOTP({
    issuer: "KnowledgeManager",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(encoded),
  });
export const newSecret = () => new Secret({ size: 20 }).base32;
export async function seal(secret: string) {
  return new CompactEncrypt(Buffer.from(secret))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(key());
}
export async function unseal(encoded: string) {
  const result = await compactDecrypt(encoded, key(), {
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  return Buffer.from(result.plaintext).toString();
}
