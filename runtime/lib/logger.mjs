const ALLOWED_FIELDS = new Set([
  "active_handlers",
  "active_requests",
  "contract_version",
  "duration_ms",
  "environment",
  "error_code",
  "function",
  "handler_ok",
  "host",
  "method",
  "port",
  "profile",
  "release_sha",
  "request_id",
  "route",
  "scheduled_job",
  "signal",
  "status",
  "storage_backend",
]);

function safeScalar(value) {
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (value == null) return null;
  let text = String(value);
  try {
    text = decodeURIComponent(text);
  } catch {
    // Malformed encoding is still passed through the redaction guards below.
  }
  return text
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted]")
    .replace(/(?<![A-Za-z0-9])\+?\s*\(?(?:\d[\s().-]*){10,15}(?![A-Za-z0-9])/g, "[redacted]")
    .replace(/\b(?:Bearer\s+|Basic\s+)[A-Za-z0-9._~+/=-]+/gi, "[redacted]")
    .replace(/((?:secret|token|password|authorization)[=:]\s*)[^\s,;&]+/gi, "$1[redacted]")
    .slice(0, 160);
}

export function createStructuredLogger({ sink = console.log, clock = () => new Date() } = {}) {
  return function log(level, event, fields = {}) {
    const record = {
      ts: clock().toISOString(),
      level: ["debug", "info", "warn", "error"].includes(level) ? level : "info",
      event: String(event || "runtime_event").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80),
    };
    for (const [key, value] of Object.entries(fields || {})) {
      if (!ALLOWED_FIELDS.has(key)) continue;
      record[key] = safeScalar(value);
    }
    sink(JSON.stringify(record));
  };
}
