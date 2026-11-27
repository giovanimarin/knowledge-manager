import { performance } from "node:perf_hooks";

const base = process.env.KM_BASE_URL ?? "http://127.0.0.1:3000";
const requests = 100;
const concurrency = 5;
const samples = [];
const started = performance.now();

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (let request = 0; request < requests / concurrency; request++) {
      const before = performance.now();
      const response = await fetch(new URL("/readyz", base), {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok || (await response.json()).status !== "ready") {
        throw new Error(
          "Readiness benchmark encountered an unsuccessful response",
        );
      }
      samples.push(performance.now() - before);
    }
  }),
);
samples.sort((a, b) => a - b);
const percentile = (value) =>
  Number(samples[Math.ceil(samples.length * value) - 1].toFixed(2));
console.log(
  JSON.stringify({
    operation: "getReadiness",
    requests,
    concurrency,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    elapsedMs: Number((performance.now() - started).toFixed(2)),
  }),
);
