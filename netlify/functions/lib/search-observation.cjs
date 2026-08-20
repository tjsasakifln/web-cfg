/**
 * confenge.search_observation.v1 producer.
 *
 * Window/cohort aggregates only. Persist-first in the existing durable
 * lead store directory / Netlify Blobs. HMAC POST uses the CONFENGE
 * inbound channel. Generic 2xx is not DELIVERED. Capability must declare
 * confenge.search_observation.v1 before POST. Synthetic never joins real
 * metrics. Lead capture does not depend on this module.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  signWarmblyInbound,
  resolveInboundConfig,
  STATUS,
} = require("./inbound-handoff.cjs");
const { safeLog } = require("./lead-core.cjs");

const VERSION = "confenge.search_observation.v1";
const QUERY_CLASSES = Object.freeze([
  "brand",
  "legacy_brand",
  "non_brand",
  "unknown",
]);
const FORBIDDEN_KEYS = Object.freeze([
  "query",
  "query_text",
  "query_hash",
  "q",
  "email",
  "telefone",
  "phone",
  "cnpj",
  "cnpj14",
  "nome",
  "name",
  "lead_id",
  "document",
  "cpf",
]);

const OBS_STATUS = {
  ...STATUS,
  HELD: "HELD",
};

let _fetchOverride = null;
function setFetchForTests(fn) {
  _fetchOverride = fn;
}
function getFetch() {
  return _fetchOverride || globalThis.fetch;
}

function clampText(value, max) {
  const s = String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function nullableCount(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function hasForbiddenField(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = hasForbiddenField(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, value] of Object.entries(obj)) {
    const low = String(key).toLowerCase();
    if (FORBIDDEN_KEYS.includes(low)) return key;
    if (low.includes("query_hash") || low === "queryhash") return key;
    const nested = hasForbiddenField(value, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function eventIdFor(input = {}) {
  const given = clampText(input.event_id, 80);
  if (given) return given;
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function buildPayload(input = {}) {
  const forbidden = hasForbiddenField(input);
  if (forbidden) {
    return { ok: false, error: "payload_contains_forbidden_field", field: forbidden };
  }
  const queryClass = clampText(input.query_class || (input.cohort && input.cohort.query_class), 40);
  if (queryClass && !QUERY_CLASSES.includes(queryClass)) {
    return { ok: false, error: "query_class_unknown", field: "query_class" };
  }
  const countsIn = input.counts && typeof input.counts === "object" ? input.counts : {};
  const payload = {
    version: VERSION,
    event_id: eventIdFor(input),
    source: "CONFENGE_WEB",
    window: {
      label: clampText((input.window && input.window.label) || input.window_label || "28d", 32) || "28d",
      start: clampText(input.window && input.window.start, 32) || null,
      end: clampText(input.window && input.window.end, 32) || null,
    },
    cohort: {
      query_class: queryClass || "unknown",
    },
    counts: {
      impressions: nullableCount(countsIn.impressions),
      clicks: nullableCount(countsIn.clicks),
      sessions: nullableCount(countsIn.sessions),
      engaged: nullableCount(countsIn.engaged),
      leads: nullableCount(countsIn.leads),
      pipeline: nullableCount(countsIn.pipeline),
    },
    coverage: {
      complete: Boolean(input.coverage && input.coverage.complete),
      limitation: clampText(
        (input.coverage && input.coverage.limitation) ||
          "Search Analytics may return top rows only. Absence is not zero.",
        240,
      ),
    },
    freshness: {
      as_of: clampText((input.freshness && input.freshness.as_of) || input.as_of, 40) || null,
      class: clampText((input.freshness && input.freshness.class) || "UNKNOWN", 40) || "UNKNOWN",
    },
    synthetic: Boolean(input.synthetic),
  };
  const again = hasForbiddenField(payload);
  if (again) {
    return { ok: false, error: "payload_contains_forbidden_field", field: again };
  }
  return { ok: true, payload };
}

function stableBody(payload) {
  return JSON.stringify(payload);
}

function storeDir(env = process.env) {
  return env.LEAD_STORE_DIR ? path.join(env.LEAD_STORE_DIR, "search-observation") : null;
}

function recordPath(dir, eventId) {
  return path.join(dir, `${eventId}.json`);
}

async function persistRecord(record, env = process.env) {
  const dir = storeDir(env);
  if (!dir) {
    return { ok: false, error: "store_unavailable" };
  }
  fs.mkdirSync(dir, { recursive: true });
  const dest = recordPath(dir, record.event_id);
  if (fs.existsSync(dest)) {
    const existing = JSON.parse(fs.readFileSync(dest, "utf8"));
    return { ok: true, record: existing, replay: true };
  }
  fs.writeFileSync(dest, JSON.stringify(record, null, 2) + "\n", "utf8");
  return { ok: true, record, replay: false };
}

async function updateRecord(eventId, patch, env = process.env) {
  const dir = storeDir(env);
  if (!dir) return null;
  const dest = recordPath(dir, eventId);
  if (!fs.existsSync(dest)) return null;
  const cur = JSON.parse(fs.readFileSync(dest, "utf8"));
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  fs.writeFileSync(dest, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

function healthUrlFrom(cfg, env = process.env) {
  const explicit = String(env.CONFENGE_INBOUND_HEALTH_URL || "").trim();
  if (explicit) return explicit;
  if (!cfg || !cfg.url) return "";
  try {
    const u = new URL(cfg.url);
    u.pathname = u.pathname.replace(/\/$/, "") + "/health";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

async function readCapability(env = process.env) {
  const cfg = resolveInboundConfig(env);
  const url = healthUrlFrom(cfg.ok ? cfg : null, env);
  if (!url) {
    return { ok: false, reason: "capability_unconfigured", versions: [] };
  }
  const fetchFn = getFetch();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), cfg.timeoutMs || 8000) : null;
  try {
    const res = await fetchFn(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "confenge-search-observation/1.0" },
      signal: controller ? controller.signal : undefined,
    });
    const data = await res.json().catch(() => ({}));
    const versions = []
      .concat(data.capabilities || [])
      .concat(data.accepted_versions || [])
      .concat(data.versions || [])
      .map((v) => String(v));
    const present = versions.includes(VERSION);
    return {
      ok: present,
      reason: present ? "capability_present" : "capability_absent",
      versions,
      http: res.status,
    };
  } catch (err) {
    const aborted = err && (err.name === "AbortError" || /aborted|timeout/i.test(String(err.message || "")));
    return {
      ok: false,
      reason: aborted ? "timeout" : "capability_unreadable",
      versions: [],
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyObservationHttp(status, echoed) {
  if (status === 401 || status === 403) return OBS_STATUS.BLOCKED;
  if (status === 408 || status === 429 || status >= 500) return OBS_STATUS.RETRYABLE;
  if (status === 422) return OBS_STATUS.RETRYABLE;
  if (status === 200 || status === 201) {
    return echoed ? OBS_STATUS.DELIVERED : OBS_STATUS.RETRYABLE;
  }
  if (status >= 400) return OBS_STATUS.DEAD;
  return OBS_STATUS.RETRYABLE;
}

function receiverEchoes(data, payload) {
  if (!data || typeof data !== "object") return false;
  const inner = data.data && typeof data.data === "object" ? data.data : data;
  const version = String(inner.version || inner.accepted_version || "");
  const eventId = String(inner.event_id || inner.eventId || "");
  return version === payload.version && eventId === payload.event_id;
}

async function postObservation(record, { now = new Date(), env = process.env } = {}) {
  const cfg = resolveInboundConfig(env);
  if (cfg.skip) return { status: OBS_STATUS.SKIPPED, reason: cfg.reason, attemptsDelta: 0 };
  if (cfg.blocked) return { status: OBS_STATUS.BLOCKED, reason: cfg.reason, attemptsDelta: 0 };
  const cap = await readCapability(env);
  if (!cap.ok) {
    return {
      status: OBS_STATUS.HELD,
      reason: cap.reason || "capability_absent",
      attemptsDelta: 0,
      last_error: cap.reason,
    };
  }
  const rawBody = stableBody(record.payload);
  const unix = Math.floor(now.getTime() / 1000);
  const signature = signWarmblyInbound(cfg.secret, rawBody, unix);
  const started = Date.now();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), cfg.timeoutMs) : null;
  const fetchFn = getFetch();
  try {
    const res = await fetchFn(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "confenge-search-observation/1.0",
        "X-Warmbly-Signature": signature,
        "Idempotency-Key": record.event_id,
      },
      body: rawBody,
      signal: controller ? controller.signal : undefined,
    });
    const latency_ms = Date.now() - started;
    const data = await res.json().catch(() => ({}));
    const echoed = receiverEchoes(data, record.payload);
    const unsupported =
      String(data.error || data.code || "").toLowerCase().includes("unsupported") ||
      (Array.isArray(data.accepted_versions) && !data.accepted_versions.includes(VERSION));
    if (unsupported) {
      return {
        status: OBS_STATUS.HELD,
        reason: "unsupported_version",
        http: res.status,
        latency_ms,
        last_error: "unsupported_version",
        attemptsDelta: 1,
      };
    }
    const status = classifyObservationHttp(res.status, echoed);
    return {
      status,
      http: res.status,
      latency_ms,
      last_error: status === OBS_STATUS.DELIVERED ? null : `webhook_http_${res.status}`,
      echoed,
      attemptsDelta: 1,
    };
  } catch (err) {
    const aborted = err && (err.name === "AbortError" || /aborted|timeout/i.test(String(err.message || "")));
    return {
      status: OBS_STATUS.RETRYABLE,
      latency_ms: Date.now() - started,
      last_error: aborted ? "timeout" : String(err && err.message ? err.message : "error").slice(0, 120),
      attemptsDelta: 1,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function produce(input = {}, { env = process.env, now = new Date() } = {}) {
  const built = buildPayload(input);
  if (!built.ok) return built;
  const destination = clampText(input.destination || input.asset_id, 120);
  if (destination && /unknown|missing/.test(destination) && input.require_known_destination) {
    return { ok: false, error: "destination_unknown" };
  }
  const record = {
    kind: "search_observation",
    version: VERSION,
    event_id: built.payload.event_id,
    payload: built.payload,
    synthetic: Boolean(built.payload.synthetic),
    created_at: now.toISOString(),
    outbox: {
      status: OBS_STATUS.PENDING,
      attempts: 0,
      last_error: null,
    },
  };
  const persisted = await persistRecord(record, env);
  if (!persisted.ok) return persisted;
  if (persisted.replay) {
    return { ok: true, record: persisted.record, replay: true };
  }
  if (record.synthetic) {
    const held = await updateRecord(
      record.event_id,
      {
        outbox: {
          status: OBS_STATUS.SKIPPED,
          reason: "synthetic_excluded",
          attempts: 0,
          last_error: null,
        },
      },
      env,
    );
    return { ok: true, record: held || persisted.record, synthetic: true };
  }
  const result = await postObservation(persisted.record, { now, env });
  const nextOutbox = {
    status: result.status,
    reason: result.reason,
    attempts: result.attemptsDelta || 0,
    last_error: result.last_error || null,
    http_status: result.http,
    latency_ms: result.latency_ms,
    echoed: result.echoed,
  };
  const updated = await updateRecord(record.event_id, { outbox: nextOutbox }, env);
  return { ok: true, record: updated || { ...persisted.record, outbox: nextOutbox } };
}

module.exports = {
  VERSION,
  QUERY_CLASSES,
  OBS_STATUS,
  FORBIDDEN_KEYS,
  setFetchForTests,
  buildPayload,
  hasForbiddenField,
  persistRecord,
  readCapability,
  produce,
  classifyObservationHttp,
  receiverEchoes,
};
