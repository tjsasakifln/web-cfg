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
const {
  FileStore,
  MemoryStore,
  NetlifyBlobsStore,
  createStore,
} = require("./lead-store.cjs");

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

const BLOBS_PREFIX = "search-obs/";
let _obsMemory = null;

function observationMemory() {
  if (!_obsMemory) _obsMemory = new MemoryStore();
  return _obsMemory;
}

function asStored(record) {
  const id = record && (record.event_id || record.lead_id);
  if (!record || !id) return record;
  return { ...record, lead_id: id };
}

async function createObservationStore(env = process.env) {
  if (env.LEAD_STORE_DIR) {
    return new FileStore(path.join(env.LEAD_STORE_DIR, "search-observation"));
  }
  if (String(env.LEAD_STORE || "").toLowerCase() === "memory") {
    return observationMemory();
  }
  const inner = await createStore();
  if (!inner) return null;
  if (inner instanceof NetlifyBlobsStore) {
    return new NetlifyBlobsStore(inner.store, { prefix: BLOBS_PREFIX });
  }
  if (inner instanceof FileStore) {
    return new FileStore(path.join(inner.dir, "search-observation"));
  }
  if (inner.ephemeral) return observationMemory();
  return null;
}

async function persistRecord(record, env = process.env, store = null) {
  const obsStore = store || (await createObservationStore(env));
  if (!obsStore) return { ok: false, error: "store_unavailable" };
  const stored = asStored(record);
  const existing = await obsStore.get(stored.lead_id);
  if (existing) return { ok: true, record: existing, replay: true };
  try {
    await obsStore.put(stored, { onlyIfNew: true });
  } catch (err) {
    if (err && err.code === "ALREADY_EXISTS") {
      return { ok: true, record: err.existing || existing || stored, replay: true };
    }
    return { ok: false, error: "store_write_failed" };
  }
  return { ok: true, record: stored, replay: false };
}

async function updateRecord(eventId, patch, env = process.env, store = null) {
  const obsStore = store || (await createObservationStore(env));
  if (!obsStore) return null;
  return obsStore.update(eventId, patch);
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

async function produce(input = {}, { env = process.env, now = new Date(), store = null } = {}) {
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
  const persisted = await persistRecord(record, env, store);
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
      store,
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
  const updated = await updateRecord(record.event_id, { outbox: nextOutbox }, env, store);
  return { ok: true, record: updated || { ...persisted.record, outbox: nextOutbox } };
}

function windowStartFromEnd(endIso) {
  const end = clampText(endIso, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 27);
  return d.toISOString().slice(0, 10);
}

function overlayToInput(overlay = {}) {
  const asOf = clampText(overlay.as_of || overlay.max_date, 32);
  const end = clampText(overlay.max_date || overlay.as_of, 32) || asOf || null;
  const start = clampText(overlay.window && overlay.window.start, 32) || windowStartFromEnd(end);
  const limitation = clampText(
    overlay.search_analytics_limitation ||
      (overlay.coverage && overlay.coverage.limitation) ||
      "Search Analytics may return top rows only. Path rows are not unique-query totals. Absence is not zero.",
    240,
  );
  const input = {
    event_id: clampText(`so-${asOf || "unknown"}-28d-unknown`, 80),
    window: { label: "28d", start, end },
    query_class: "unknown",
    counts: {
      impressions: null,
      clicks: null,
      sessions: null,
      engaged: null,
      leads: null,
      pipeline: null,
    },
    coverage: {
      complete: false,
      limitation,
    },
    freshness: {
      as_of: asOf || null,
      class: overlay.core_ready_for_product_decisions ? "LIVE" : "LIVE_TOP_ROWS_ONLY",
    },
    synthetic: Boolean(overlay.synthetic),
  };
  const forbidden = hasForbiddenField(input);
  if (forbidden) return { ok: false, error: "payload_contains_forbidden_field", field: forbidden };
  return { ok: true, input };
}

function loadShippedOverlay() {
  const candidates = [
    path.join(__dirname, "..", "..", "..", "data", "bofu-dominance", "core", "gsc-live-overlay.v1.json"),
    path.join(process.cwd(), "data", "bofu-dominance", "core", "gsc-live-overlay.v1.json"),
    path.join(__dirname, "..", "data", "gsc-live-overlay.v1.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* next */
    }
  }
  return null;
}

async function produceFromShippedOverlay({ env = process.env, now = new Date(), store = null } = {}) {
  const overlay = loadShippedOverlay();
  if (!overlay) return { ok: false, error: "overlay_missing" };
  const mapped = overlayToInput(overlay);
  if (!mapped.ok) return mapped;
  return produce(mapped.input, { env, now, store });
}

function summarizeObservations(records) {
  const counts = {
    records: 0,
    pending: 0,
    held: 0,
    delivered: 0,
    retryable: 0,
    blocked: 0,
    dead: 0,
    skipped: 0,
  };
  for (const rec of records || []) {
    if (!rec || rec.kind !== "search_observation") continue;
    counts.records += 1;
    const status = rec.outbox && rec.outbox.status;
    if (status === OBS_STATUS.PENDING) counts.pending += 1;
    else if (status === OBS_STATUS.HELD) counts.held += 1;
    else if (status === OBS_STATUS.DELIVERED) counts.delivered += 1;
    else if (status === OBS_STATUS.RETRYABLE) counts.retryable += 1;
    else if (status === OBS_STATUS.BLOCKED) counts.blocked += 1;
    else if (status === OBS_STATUS.DEAD) counts.dead += 1;
    else if (status === OBS_STATUS.SKIPPED) counts.skipped += 1;
  }
  return counts;
}

async function drainHeld({ env = process.env, now = new Date(), limit = 20, store = null } = {}) {
  const summary = {
    scanned: 0,
    attempted: 0,
    delivered: 0,
    held: 0,
    retryable: 0,
    blocked: 0,
    dead: 0,
    skipped: 0,
  };
  const obsStore = store || (await createObservationStore(env));
  if (!obsStore || typeof obsStore.list !== "function") {
    return { ok: false, error: "store_unavailable", ...summary };
  }
  const records = await obsStore.list();
  summary.scanned = Array.isArray(records) ? records.length : 0;
  const due = (records || [])
    .filter((rec) => {
      if (!rec || rec.kind !== "search_observation") return false;
      const status = rec.outbox && rec.outbox.status;
      return status === OBS_STATUS.PENDING || status === OBS_STATUS.HELD || status === OBS_STATUS.RETRYABLE;
    })
    .slice(0, Math.min(50, Math.max(1, Number(limit) || 20)));
  for (const rec of due) {
    summary.attempted += 1;
    if (rec.synthetic) {
      await updateRecord(
        rec.event_id,
        {
          outbox: {
            status: OBS_STATUS.SKIPPED,
            reason: "synthetic_excluded",
            attempts: (rec.outbox && rec.outbox.attempts) || 0,
            last_error: null,
          },
        },
        env,
        obsStore,
      );
      summary.skipped += 1;
      continue;
    }
    const result = await postObservation(rec, { now, env });
    const attempts = ((rec.outbox && rec.outbox.attempts) || 0) + (result.attemptsDelta || 0);
    const nextOutbox = {
      status: result.status,
      reason: result.reason,
      attempts,
      last_error: result.last_error || null,
      http_status: result.http,
      latency_ms: result.latency_ms,
      echoed: result.echoed,
    };
    await updateRecord(rec.event_id, { outbox: nextOutbox }, env, obsStore);
    if (result.status === OBS_STATUS.DELIVERED) summary.delivered += 1;
    else if (result.status === OBS_STATUS.HELD) summary.held += 1;
    else if (result.status === OBS_STATUS.RETRYABLE) summary.retryable += 1;
    else if (result.status === OBS_STATUS.BLOCKED) summary.blocked += 1;
    else if (result.status === OBS_STATUS.DEAD) summary.dead += 1;
    else if (result.status === OBS_STATUS.SKIPPED) summary.skipped += 1;
  }
  return { ok: true, ...summary };
}

module.exports = {
  VERSION,
  QUERY_CLASSES,
  OBS_STATUS,
  FORBIDDEN_KEYS,
  BLOBS_PREFIX,
  setFetchForTests,
  buildPayload,
  hasForbiddenField,
  persistRecord,
  createObservationStore,
  readCapability,
  produce,
  overlayToInput,
  loadShippedOverlay,
  produceFromShippedOverlay,
  drainHeld,
  summarizeObservations,
  classifyObservationHttp,
  receiverEchoes,
};
