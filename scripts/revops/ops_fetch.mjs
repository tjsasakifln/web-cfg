const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function sanitizeTransportError(error) {
  return String(error?.message || error || "transport_error")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 240);
}

export function createOpsJsonClient({
  base,
  token = "",
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxAttempts = boundedInteger(process.env.OPS_FETCH_MAX_ATTEMPTS, 3, 1, 5),
  backoffMs = boundedInteger(process.env.OPS_FETCH_BACKOFF_MS, 250, 0, 5000),
  onResult = () => {},
} = {}) {
  if (!base) throw new Error("ops_base_required");
  if (typeof fetchImpl !== "function") throw new Error("fetch_implementation_required");
  const boundedAttempts = boundedInteger(maxAttempts, 3, 1, 5);
  const boundedBackoff = boundedInteger(backoffMs, 250, 0, 5000);

  return async function request(path, opts = {}) {
    const {
      headers: extraHeaders = {},
      retrySafe = false,
      ...fetchOptions
    } = opts;
    const method = String(fetchOptions.method || "GET").toUpperCase();
    // GET/HEAD are read-only. A caller must explicitly opt any other method in.
    const attemptLimit = method === "GET" || method === "HEAD" || retrySafe ? boundedAttempts : 1;
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    };

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      try {
        const response = await fetchImpl(`${base}${path}`, {
          ...fetchOptions,
          method,
          headers,
        });
        const body = await response.json().catch(() => ({}));
        if (RETRYABLE_HTTP.has(response.status) && attempt < attemptLimit) {
          await sleep(boundedBackoff * 2 ** (attempt - 1));
          continue;
        }
        const result = { status: response.status, body, attempts: attempt, error: null };
        onResult({ path, method, status: response.status, attempts: attempt, error: null });
        return result;
      } catch (error) {
        const message = sanitizeTransportError(error);
        if (attempt < attemptLimit) {
          await sleep(boundedBackoff * 2 ** (attempt - 1));
          continue;
        }
        const result = { status: 0, body: {}, attempts: attempt, error: message };
        onResult({ path, method, status: 0, attempts: attempt, error: message });
        return result;
      }
    }

    throw new Error("ops_fetch_unreachable");
  };
}
