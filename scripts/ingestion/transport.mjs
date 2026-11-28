import { setTimeout } from "node:timers/promises";

const transient = new Set([408, 429, 500, 502, 503, 504]);

export async function readWithRetry(request, url, options) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await request(url, {
        ...options,
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
      if (!transient.has(response.status) || attempt === 2) return response;
      await response.body?.cancel();
    } catch (error) {
      if (
        attempt === 2 ||
        (!(error instanceof TypeError) && error.name !== "TimeoutError")
      )
        throw error;
    }
    await setTimeout(100 * 2 ** attempt);
  }
}

export async function publicObject(
  request,
  origin,
  bucket,
  key,
  header,
  expected,
  query = "",
) {
  const path = key.split("/");
  if (path.some((segment) => !segment || segment === "." || segment === ".."))
    return false;
  const url = new URL(
    "/" +
      encodeURIComponent(bucket) +
      "/" +
      path.map(encodeURIComponent).join("/") +
      query,
    origin,
  );
  try {
    const result = await readWithRetry(request, url, {
      method: "HEAD",
      credentials: "omit",
    });
    return result.status === 200 && result.headers.get(header) === expected;
  } catch {
    return false;
  }
}
