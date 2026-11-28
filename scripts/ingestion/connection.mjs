export async function sourceConnection({
  base,
  source,
  session,
  provider,
  target,
}) {
  const destination = new URL(base);
  if (
    destination.username ||
    destination.password ||
    !(
      destination.protocol === "https:" ||
      (destination.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(destination.hostname))
    )
  )
    throw new Error("Source control endpoint requires HTTPS or loopback");
  const prefix = "/v1/ingestion/sources/" + source;
  async function request(path, method = "GET", body = {}) {
    const result = await fetch(new URL(prefix + path, destination), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: "Bearer " + session,
        "Content-Type": "application/json",
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    });
    if (!result.ok)
      throw new Error("Source control rejected request: " + result.status);
    return result.json();
  }
  const metadata = await request("/connection");
  if (metadata.revoked || (metadata.provider && metadata.provider !== provider))
    throw new Error("Source connection does not match the requested provider");
  const lease = metadata.managed ? await request("/credential", "POST") : null;
  if (
    lease &&
    (lease.provider !== provider ||
      lease.target !== target ||
      lease.credentialVersion !== metadata.credentialVersion)
  )
    throw new Error("Source credential does not match target or version");
  return {
    request,
    credential: lease?.credential,
    nativePrincipals: lease?.nativePrincipals,
    credentialVersion: metadata.credentialVersion,
  };
}

export async function guardProviderAccess(connection, cursor, operation) {
  try {
    return await operation();
  } catch (error) {
    const status = error.status ?? error.$metadata?.httpStatusCode;
    if (connection.credential && (status === 401 || status === 403))
      await connection.request("/quarantine", "POST", {
        cursor,
        credentialVersion: connection.credentialVersion,
      });
    throw error;
  }
}
