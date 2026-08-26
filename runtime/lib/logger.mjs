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
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
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
