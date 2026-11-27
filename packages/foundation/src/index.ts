import {
  access,
  mkdir,
  readFile,
  writeFile,
  constants,
} from "node:fs/promises";
import { join } from "node:path";
import type { ServerResponse } from "node:http";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  NodeTracerProvider,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { PostgresDialect, Kysely, sql } from "kysely";
import { Pool } from "pg";
import { Redis } from "ioredis";

export const probeName = "foundation-probe.v1";
export const queueName = "foundation";
export const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const healthy = { status: "ok" } as const;
export const ready = { status: "ready" } as const;
export const unavailable = {
  type: "about:blank",
  title: "Service Unavailable",
  status: 503,
} as const;

interface Database {
  "km.probe_receipts": { id: string };
}

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}

export function redisOptions() {
  return { host: required("REDIS_HOST"), port: 6379, connectTimeout: 1500 };
}

export function parseProbe(name: string, data: unknown): { id: string } {
  if (
    name === probeName &&
    typeof data === "object" &&
    data !== null &&
    Object.keys(data).length === 1 &&
    "id" in data &&
    typeof data.id === "string" &&
    uuid.test(data.id)
  )
    return { id: data.id };
  throw new Error("Invalid probe payload");
}

export interface ObjectStorage {
  ping(): Promise<void>;
  put(id: string, bytes: Uint8Array): Promise<void>;
  get(id: string): Promise<Buffer>;
}

export class FileStorage implements ObjectStorage {
  constructor(private readonly root: string) {}

  private path(id: string) {
    if (!uuid.test(id)) throw new Error("Invalid object ID");
    return join(this.root, "objects", id);
  }

  async ping() {
    await access(join(this.root, "objects"), constants.R_OK | constants.W_OK);
  }

  async put(id: string, bytes: Uint8Array) {
    const path = this.path(id);
    await mkdir(join(this.root, "objects"), { recursive: true });
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  }

  get(id: string) {
    return readFile(this.path(id));
  }
}

export function storagePath() {
  return required("STORAGE_PATH");
}

export function startTelemetry() {
  if (!process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return undefined;
  const provider = new NodeTracerProvider({
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  });
  provider.register();
  return provider;
}

export async function traced<T>(name: string, action: () => Promise<T>) {
  const span = trace.getTracer("km.foundation").startSpan(name);
  try {
    return await action();
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}

export class Dependencies {
  readonly storage = new FileStorage(storagePath());
  private readonly pool = new Pool({
    host: required("PGHOST"),
    database: required("PGDATABASE"),
    user: required("PGUSER"),
    password: required("PGPASSWORD"),
    connectionTimeoutMillis: 1500,
    query_timeout: 1500,
    max: 4,
  });
  readonly database = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: this.pool }),
  });
  private readonly redis = new Redis({
    ...redisOptions(),
    commandTimeout: 1500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  constructor() {
    // Idle connections can fail without an active query during a database restart.
    this.pool.on("error", () =>
      console.error(
        JSON.stringify({
          service: "database",
          event: "idle_connection_closed",
        }),
      ),
    );
    this.redis.on("error", () => {});
  }

  async isReady() {
    try {
      await traced("foundation.readiness", async () => {
        const [check] = await Promise.all([
          sql<{ valid: boolean }>`select exists (
            select from km.migrations where version = 1
          ) and ('[1,2,3]'::public.vector <-> '[1,2,3]'::public.vector) = 0 as valid`.execute(
            this.database,
          ),
          this.redis.ping(),
          this.storage.ping(),
          access(join(storagePath(), ".ready"), constants.R_OK),
        ]);
        if (!check.rows[0]?.valid) throw new Error("Migration unavailable");
      });
      return true;
    } catch {
      return false;
    }
  }

  async inTenant<T>(
    tenant: string,
    action: (tx: import("kysely").Transaction<Database>) => Promise<T>,
  ): Promise<T> {
    if (!uuid.test(tenant)) throw new Error("Invalid tenant ID");
    return this.database.transaction().execute(async (tx) => {
      await sql`select set_config('km.tenant_id', ${tenant}, true)`.execute(tx);
      return action(tx);
    });
  }

  async recordProbe(id: string) {
    await this.database
      .insertInto("km.probe_receipts")
      .values({ id })
      .onConflict((conflict) => conflict.column("id").doNothing())
      .execute();
  }

  async close() {
    this.redis.disconnect();
    await this.database.destroy();
  }
}

export function sendHealth(
  response: ServerResponse,
  status: "healthy" | "ready" | "unavailable",
) {
  const failure = status === "unavailable";
  response.writeHead(failure ? 503 : 200, {
    "Content-Type": failure ? "application/problem+json" : "application/json",
    "Cache-Control": "no-store",
  });
  response.end(
    JSON.stringify(
      status === "healthy" ? healthy : failure ? unavailable : ready,
    ),
  );
}

export { Queue, QueueEvents, Worker, UnrecoverableError } from "bullmq";

export { sql };
export type TenantTransaction = import("kysely").Transaction<Database>;
