import { publicObject } from "./transport.mjs";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

export async function s3Source({
  bucket,
  region,
  endpoint,
  credentials,
  attestAcl = false,
  request = fetch,
  client: configured,
}) {
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket ?? "") ||
    !/^[a-z0-9-]+$/.test(region ?? "")
  )
    throw new Error("Invalid S3 configuration");
  if (endpoint) {
    const url = new URL(endpoint);
    if (
      url.username ||
      url.password ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      )
    )
      throw new Error("Untrusted S3 endpoint");
  }
  const client =
    configured ??
    new S3Client({
      region,
      maxAttempts: 3,
      ...(credentials ? { credentials } : {}),
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  const files = [];
  const past = new Set();
  let cursor;
  do {
    if (past.has(cursor) || past.size >= 25)
      throw new Error("Invalid S3 pagination");
    past.add(cursor);
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 100,
        ...(cursor ? { ContinuationToken: cursor } : {}),
      }),
    );
    for (const record of result.Contents ?? []) {
      if (!/\.(?:md|markdown|txt|csv)$/i.test(record.Key ?? "")) continue;
      if (
        !record.Key ||
        !record.ETag ||
        files.length >= 150 ||
        files.some((file) => file.remoteKey === record.Key)
      )
        throw new Error("Incomplete or invalid S3 object inventory");
      files.push({ remoteKey: record.Key, version: record.ETag });
    }
    cursor = result.IsTruncated ? result.NextContinuationToken : undefined;
    if (result.IsTruncated && !cursor)
      throw new Error("Truncated S3 inventory");
  } while (cursor);
  return {
    files,
    async allowsSpace(file) {
      if (!attestAcl) return false;
      return publicObject(
        request,
        endpoint ?? "https://s3." + region + ".amazonaws.com",
        bucket,
        file.remoteKey,
        "etag",
        file.version,
      );
    },
    async read(file) {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: file.remoteKey,
          IfMatch: file.version,
        }),
      );
      if (!result.Body || result.ETag !== file.version)
        throw new Error("S3 object version changed");
      const chunks = [];
      let size = 0;
      for await (const chunk of result.Body) {
        const value = Buffer.from(chunk);
        size += value.length;
        if (size > 1024 * 1024) throw new Error("S3 response exceeds bounds");
        chunks.push(value);
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks),
      );
    },
  };
}
