import { checksum, embed } from "./segments.js";

export function configuredEmbedding(env = process.env, request = fetch) {
  const endpoint = env.KM_INGEST_EMBED_URL;
  if (!endpoint)
    return {
      profile: "local-lexical-v1",
      vector: async (content: string) => embed(content),
    };
  const destination = new URL(endpoint);
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
    checksum(JSON.stringify([destination.origin, model, dimension])).slice(
      0,
      32,
    );
  return {
    profile,
    async vector(content: string) {
      const response = await request(new URL("/api/embed", destination), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(4000),
        body: JSON.stringify({ model, input: content, truncate: false }),
      });
      if (!response.ok) throw new Error("Embedding provider unavailable");
      const data: unknown = await response.json();
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
