import assert from "node:assert/strict";
import { request } from "node:http";
import { writeFileSync } from "node:fs";

const [socketPath, model, expectedDimension, report] = process.argv.slice(2);
const dimension = Number(expectedDimension);
const phrases = [
  "O trabalhador esqueceu a senha e precisa redefinir o acesso à conta.",
  "The employee forgot their password and needs to reset account access.",
  "The biology class studied coral reefs and the migration of marine turtles.",
];
function embedding(input) {
  const body = JSON.stringify({ model, input });
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        method: "POST",
        path: "/api/embed",
        signal: AbortSignal.timeout(16000),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      async (response) => {
        try {
          assert.equal(response.statusCode, 200);
          const pieces = [];
          for await (const part of response) pieces.push(part);
          const [vector] = JSON.parse(
            Buffer.concat(pieces).toString(),
          ).embeddings;
          assert.equal(vector.length, dimension);
          assert.ok(vector.every(Number.isFinite));
          resolve(vector);
        } catch (error) {
          reject(error);
        }
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
const vectors = [];
const started = performance.now();
for (const phrase of phrases) vectors.push(await embedding(phrase));
const sum = (vector) => Math.hypot(...vector);
const cosine = (a, b) =>
  a.reduce((total, value, index) => total + value * b[index], 0) /
  (sum(a) * sum(b));
const relevant = cosine(vectors[0], vectors[1]);
const unrelated = cosine(vectors[0], vectors[2]);
assert.ok(
  relevant > unrelated + 0.05,
  "Modelo local não aproximou a paráfrase bilíngue",
);
const result = {
  model,
  dimension,
  relevant,
  unrelated,
  elapsedMs: Math.round(performance.now() - started),
};
writeFileSync(report, JSON.stringify(result, null, 2) + "\n");
console.log("Fixture semântica pt/en " + JSON.stringify(result));
