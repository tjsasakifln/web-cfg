/**
 * confenge.commercial_event.v1 cross-system producer.
 *
 * Persist-first durable outbox. HMAC POST uses the CONFENGE inbound
 * channel (or CONFENGE_COMMERCIAL_EVENT_* destination). Capability must
 * declare confenge.commercial_event.v1 before POST — generic 2xx is not
 * DELIVERED. Checkout/callback cannot fabricate payment_received.
 * Warmbly is not edited here. Real-money stays off.
 */
const crypto = require("crypto");
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
const { commercialEvent, TYPES, SCHEMA } = require("../../../scripts/offers/events.cjs");
const { loadFlags } = require("../../../scripts/offers/flags.cjs");

const VERSION = "confenge.commercial_event.v1";
const CE_STATUS = {
  ...STATUS,
  HELD: "HELD",
};
const CROSS_TYPES = new Set([
  TYPES.OFFER_SELECTED,
  TYPES.ELIGIBILITY_SUBMITTED,
  TYPES.CAPACITY_DECISION,
  TYPES.TERMS_ACCEPTED,
  TYPES.CHECKOUT_CREATED,
  TYPES.PAYMENT_STATE_OBSERVED,
  TYPES.ONBOARDING_ELIGIBLE,
  TYPES.COMMERCIAL_EXCEPTION,
  "offer_not_contractable",
  "terms_drift",
]);
const FABRICATING_ORIGINS = /checkout|callback|offer-checkout|journey/i;
const BLOBS_PREFIX = "commercial-event/";

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

function eventIdFor(input = {}) {
  const given = clampText(input.event_id, 80);
  if (given) return given;
  const provider = clampText(input.provider_event_id, 120);
  if (provider) {
    return `ce_${crypto.createHash("sha256").update(provider).digest("hex").slice(0, 32)}`;
  }
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function isProducerEnabled(env = process.env) {
  const raw = String(env.CONFENGE_COMMERCIAL_EVENT_ENABLED || "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function resolveProducerConfig(env = process.env) {
  const mapped = {
    ...env,
    CONFENGE_INBOUND_WEBHOOK_URL:
      env.CONFENGE_COMMERCIAL_EVENT_WEBHOOK_URL || env.CONFENGE_INBOUND_WEBHOOK_URL,
    CONFENGE_INBOUND_WEBHOOK_SECRET:
      env.CONFENGE_COMMERCIAL_EVENT_WEBHOOK_SECRET || env.CONFENGE_INBOUND_WEBHOOK_SECRET,
    CONFENGE_INBOUND_HEALTH_URL:
      env.CONFENGE_COMMERCIAL_EVENT_HEALTH_URL || env.CONFENGE_INBOUND_HEALTH_URL,
    CONFENGE_INBOUND_ALLOWED_HOSTS:
      env.CONFENGE_COMMERCIAL_EVENT_ALLOWED_HOSTS || env.CONFENGE_INBOUND_ALLOWED_HOSTS,
    CONFENGE_INBOUND_TIMEOUT_MS:
      env.CONFENGE_COMMERCIAL_EVENT_TIMEOUT_MS || env.CONFENGE_INBOUND_TIMEOUT_MS,
  };
  return resolveInboundConfig(mapped);
}

function healthUrlFrom(cfg, env = process.env) {
  const explicit = String(
    env.CONFENGE_COMMERCIAL_EVENT_HEALTH_URL || env.CONFENGE_INBOUND_HEALTH_URL || "",
  ).trim();
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

function paymentReceivedRefused(input = {}, env = process.env) {
  const type = String(input.type || "").toLowerCase();
  if (type !== "payment_received") return null;
  const origin = String(input.origin || input.source_surface || "");
  if (FABRICATING_ORIGINS.test(origin)) {
    return "checkout_callback_cannot_fabricate_payment_received";
  }
  const flags = loadFlags(env);
  if (!flags.production_webhook_enabled || flags.ASAAS_MODE === "disabled") {
    return "payment_received_requires_production_webhook";
  }
  return null;
}

function buildPayload(input = {}) {
  const type = clampText(input.type, 80);
  if (!type) return { ok: false, error: "type_required" };
  const refused = paymentReceivedRefused(input);
  if (refused) return { ok: false, error: refused };
  const built = commercialEvent({
    event_id: eventIdFor(input),
    type,
    occurred_at: input.occurred_at,
    offer_id: input.offer_id || null,
    offer_version: input.offer_version || null,
    terms_version: input.terms_version || null,
    external_reference: input.external_reference || null,
    provider_event_id: input.provider_event_id || null,
    provider_raw_status: input.provider_raw_status,
    canonical_status: input.canonical_status,
    amount_cents: input.amount_cents,
    currency: input.currency,
    exception_code: input.exception_code || null,
  });
  built.schema = SCHEMA;
  built.version = VERSION;
  if (built.type === TYPES.PAYMENT_RECEIVED) {
    const again = paymentReceivedRefused({ ...input, type: built.type });
    if (again) return { ok: false, error: again };
  }
  return { ok: true, payload: built };
}

function stableBody(payload) {
  return JSON.stringify(payload);
}

let _ceMemory = null;
function commercialMemory() {
  if (!_ceMemory) _ceMemory = new MemoryStore();
  return _ceMemory;
}

function asStored(record) {
  const id = record && (record.event_id || record.lead_id);
  if (!record || !id) return record;
  return { ...record, lead_id: id };
}

async function createCommercialStore(env = process.env) {
  const inner = await createStore({ env, namespace: "commercial-events" });
  if (!inner) return null;
  if (inner instanceof NetlifyBlobsStore) {
    return new NetlifyBlobsStore(inner.store, { prefix: BLOBS_PREFIX });
  }
  if (inner instanceof FileStore) {
    return inner;
  }
  if (inner.ephemeral) return commercialMemory();
  return null;
}

async function persistRecord(record, env = process.env, store = null) {
  const ceStore = store || (await createCommercialStore(env));
  if (!ceStore) return { ok: false, error: "store_unavailable" };
  const stored = asStored(record);
  const existing = await ceStore.get(stored.lead_id);
  if (existing) return { ok: true, record: existing, replay: true };
  if (stored.payload && stored.payload.provider_event_id && typeof ceStore.list === "function") {
    const all = await ceStore.list();
    const hit = (all || []).find(
      (rec) =>
        rec &&
        rec.kind === "commercial_event" &&
        rec.payload &&
        rec.payload.provider_event_id === stored.payload.provider_event_id,
    );
    if (hit) return { ok: true, record: hit, replay: true };
  }
  try {
    await ceStore.put(stored, { onlyIfNew: true });
  } catch (err) {
    if (err && err.code === "ALREADY_EXISTS") {
      return { ok: true, record: err.existing || existing || stored, replay: true };
    }
    return { ok: false, error: "store_write_failed" };
  }
  return { ok: true, record: stored, replay: false };
}

async function updateRecord(eventId, patch, env = process.env, store = null) {
  const ceStore = store || (await createCommercialStore(env));
  if (!ceStore) return null;
  return ceStore.update(eventId, patch);
}

async function readCapability(env = process.env) {
  const cfg = resolveProducerConfig(env);
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
      headers: { Accept: "application/json", "User-Agent": "confenge-commercial-event/1.0" },
      signal: controller ? controller.signal : undefined,
    });
    const data = await res.json().catch(() => ({}));
    const versions = []
      .concat(data.capabilities || [])
      .concat(data.accepted_versions || [])
      .concat(data.accepted_event_versions || [])
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

function classifyCommercialHttp(status, echoed) {
  if (status === 401 || status === 403) return CE_STATUS.BLOCKED;
  if (status === 408 || status === 429 || status >= 500) return CE_STATUS.RETRYABLE;
  if (status === 422) return CE_STATUS.RETRYABLE;
  if (status === 200 || status === 201) {
    return echoed ? CE_STATUS.DELIVERED : CE_STATUS.RETRYABLE;
  }
  if (status >= 400) return CE_STATUS.DEAD;
  return CE_STATUS.RETRYABLE;
}

function receiverEchoes(data, payload) {
  if (!data || typeof data !== "object") return false;
  const inner = data.data && typeof data.data === "object" ? data.data : data;
  const version = String(inner.version || inner.accepted_version || inner.schema || "");
  const eventId = String(inner.event_id || inner.eventId || "");
  return (version === payload.version || version === payload.schema) && eventId === payload.event_id;
}

async function postCommercial(record, { now = new Date(), env = process.env } = {}) {
  const cfg = resolveProducerConfig(env);
  if (cfg.skip) return { status: CE_STATUS.SKIPPED, reason: cfg.reason, attemptsDelta: 0 };
  if (cfg.blocked) return { status: CE_STATUS.BLOCKED, reason: cfg.reason, attemptsDelta: 0 };
  const cap = await readCapability(env);
  if (!cap.ok) {
    return {
      status: CE_STATUS.HELD,
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
        "User-Agent": "confenge-commercial-event/1.0",
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
        status: CE_STATUS.HELD,
        reason: "unsupported_version",
        http: res.status,
        latency_ms,
        last_error: "unsupported_version",
        attemptsDelta: 1,
      };
    }
    const status = classifyCommercialHttp(res.status, echoed);
    return {
      status,
      http: res.status,
      latency_ms,
      last_error: status === CE_STATUS.DELIVERED ? null : `webhook_http_${res.status}`,
      echoed,
      attemptsDelta: 1,
    };
  } catch (err) {
    const aborted = err && (err.name === "AbortError" || /aborted|timeout/i.test(String(err.message || "")));
    return {
      status: CE_STATUS.RETRYABLE,
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
  const record = {
    kind: "commercial_event",
    version: VERSION,
    event_id: built.payload.event_id,
    payload: built.payload,
    origin: clampText(input.origin || input.source_surface || "", 80),
    created_at: now.toISOString(),
    outbox: {
      status: CE_STATUS.PENDING,
      attempts: 0,
      last_error: null,
    },
  };
  const persisted = await persistRecord(record, env, store);
  if (!persisted.ok) return persisted;
  if (persisted.replay) {
    return { ok: true, record: persisted.record, replay: true };
  }
  if (!isProducerEnabled(env)) {
    const held = await updateRecord(
      record.event_id,
      {
        outbox: {
          status: CE_STATUS.SKIPPED,
          reason: "producer_disabled",
          attempts: 0,
          last_error: null,
        },
      },
      env,
      store,
    );
    return { ok: true, record: held || persisted.record, enabled: false };
  }
  const result = await postCommercial(persisted.record, { now, env });
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
  const ceStore = store || (await createCommercialStore(env));
  if (!ceStore || typeof ceStore.list !== "function") {
    return { ok: false, error: "store_unavailable", ...summary };
  }
  const records = await ceStore.list();
  summary.scanned = Array.isArray(records) ? records.length : 0;
  const due = (records || [])
    .filter((rec) => {
      if (!rec || rec.kind !== "commercial_event") return false;
      const status = rec.outbox && rec.outbox.status;
      return status === CE_STATUS.PENDING || status === CE_STATUS.HELD || status === CE_STATUS.RETRYABLE;
    })
    .slice(0, Math.min(50, Math.max(1, Number(limit) || 20)));
  for (const rec of due) {
    summary.attempted += 1;
    if (!isProducerEnabled(env)) {
      await updateRecord(
        rec.event_id,
        {
          outbox: {
            status: CE_STATUS.SKIPPED,
            reason: "producer_disabled",
            attempts: (rec.outbox && rec.outbox.attempts) || 0,
            last_error: null,
          },
        },
        env,
        ceStore,
      );
      summary.skipped += 1;
      continue;
    }
    const result = await postCommercial(rec, { now, env });
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
    await updateRecord(rec.event_id, { outbox: nextOutbox }, env, ceStore);
    if (result.status === CE_STATUS.DELIVERED) summary.delivered += 1;
    else if (result.status === CE_STATUS.HELD) summary.held += 1;
    else if (result.status === CE_STATUS.RETRYABLE) summary.retryable += 1;
    else if (result.status === CE_STATUS.BLOCKED) summary.blocked += 1;
    else if (result.status === CE_STATUS.DEAD) summary.dead += 1;
    else if (result.status === CE_STATUS.SKIPPED) summary.skipped += 1;
  }
  return { ok: true, ...summary };
}

module.exports = {
  VERSION,
  SCHEMA,
  TYPES,
  CROSS_TYPES,
  CE_STATUS,
  BLOBS_PREFIX,
  setFetchForTests,
  buildPayload,
  eventIdFor,
  isProducerEnabled,
  resolveProducerConfig,
  persistRecord,
  createCommercialStore,
  readCapability,
  produce,
  drainHeld,
  classifyCommercialHttp,
  receiverEchoes,
  paymentReceivedRefused,
};
