import { request as httpRequest } from "node:http";
import { checksum, embed } from "./segments.js";

export function configuredEmbedding(env = process.env, request = fetch) {
  const endpoint = env.KM_INGEST_EMBED_URL;
  const socketPath = env.KM_INGEST_EMBED_SOCKET;
  if (!endpoint && !socketPath)
    return {
      profile: "local-lexical-v1",
      model: null,
      dimension: 64,
      vector: async (content: string) => embed(content),
    };
  const destination = new URL(endpoint ?? "http://localhost");
  if (
    !["http:", "https:"].includes(destination.protocol) ||
    destination.username ||
    destination.password ||
    destination.pathname !== "/" ||
    destination.search ||
    destination.hash
  )
    throw new Error("Invalid embedding endpoint");
  const model = env.KM_INGEST_EMBED_MODEL;
  const dimension = Number(env.KM_INGEST_EMBED_DIMENSION);
  if (
    !model ||
    !Number.isInteger(dimension) ||
    dimension < 1 ||
    dimension > 4096
  )
    throw new Error("Invalid embedding profile");
  const profile =
    "ollama:" +
    checksum(
      JSON.stringify([socketPath ?? destination.origin, model, dimension]),
    ).slice(0, 32);
  return {
    profile,
    model,
    dimension,
    async vector(content: string) {
      const body = JSON.stringify({ model, input: content, truncate: false });
      const data: unknown = await (socketPath
        ? viaSocket(socketPath, body)
        : request(new URL("/api/embed", destination), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            redirect: "error",
            signal: AbortSignal.timeout(14000),
            body,
          }).then((response) => {
            if (!response.ok) throw new Error("Embedding provider unavailable");
            return response.json();
          }));
      const vectors =
        data && typeof data === "object" && "embeddings" in data
          ? data.embeddings
          : null;
      const result =
        Array.isArray(vectors) && vectors.length === 1 ? vectors[0] : null;
      if (
        !Array.isArray(result) ||
        result.length !== dimension ||
        !result.every(
          (value) => typeof value === "number" && Number.isFinite(value),
        )
      )
        throw new Error("Embedding dimension or values invalid");
      return result as number[];
    },
  };
}

function viaSocket(socketPath: string, body: string) {
  return new Promise<unknown>((resolve, reject) => {
    const req = httpRequest(
      {
        socketPath,
        path: "/api/embed",
        method: "POST",
        signal: AbortSignal.timeout(14000),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error("Embedding provider unavailable"));
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 250000)
            res.destroy(new Error("Embedding response exceeds bounds"));
          else parts.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(parts).toString()));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
