/**
 * Server-only Warmbly inbound handoff.
 *
 * Consume-only contract: Warmbly PR #71 docs/confenge/inbound-ingest.md
 *   POST /api/v1/webhooks/confenge/inbound
 *   X-Warmbly-Signature: t=<unix>,v1=<hex(hmac_sha256(secret, "<unix>." + body))>
 *
 * Capture stays the authority. This module never runs before persist.
 * HMAC secret is env-only. No PII on the URL. No browser path.
 */
const crypto = require("crypto");
const { safeLog } = require("./lead-core.cjs");
const { isProductionProfile } = require("./lead-store.cjs");

const INBOUND_PATH = "/api/v1/webhooks/confenge/inbound";
const SOURCE_INTERNAL = "CONFENGE_WEB";
const SOURCE_WARMBLY = "CONFENGE_WEB";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_ATTEMPTS = 8;
const HMAC_SKEW_MS = 5 * 60 * 1000;

const STATUS = {
  PENDING: "PENDING",
  DELIVERED: "DELIVERED",
  RETRYABLE: "RETRYABLE",
  DEAD: "DEAD",
  BLOCKED: "BLOCKED",
  SKIPPED: "SKIPPED",
};

const PII_QUERY_KEYS = new Set([
  "email",
  "e-mail",
  "mail",
  "phone",
  "telefone",
  "tel",
  "whatsapp",
  "name",
  "nome",
  "cnpj",
  "cnpj14",
  "message",
  "mensagem",
  "consent",
  "consentimento",
  "lead_name",
  "lead_email",
  "lead_phone",
]);

let _fetchOverride = null;
function setFetchForTests(fn) {
  _fetchOverride = fn;
}
function getFetch() {
  return _fetchOverride || globalThis.fetch;
}

function isStagingOrProd(env = process.env) {
  if (isProductionProfile(env)) return true;
  const ctx = String(env.CONTEXT || env.NETLIFY_CONTEXT || "").toLowerCase();
  return ctx === "deploy-preview" || ctx === "branch-deploy" || ctx === "staging";
}

function clampText(value, max) {
  const s = String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function sanitizeUrl(raw, { allowPath = false } = {}) {
  const s = clampText(raw, 500);
  if (!s) return "";
  const low = s.toLowerCase();
  if (low.startsWith("javascript:") || low.startsWith("data:") || low.startsWith("vbscript:")) {
    return "";
  }
  if (s.startsWith("/") && allowPath) {
    return `https://confenge.com.br${s.split("?")[0].split("#")[0]}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

function urlHasPiiQuery(url) {
  try {
    const u = new URL(url);
    for (const key of u.searchParams.keys()) {
      if (PII_QUERY_KEYS.has(String(key).toLowerCase())) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Persist-record → confenge.inbound.v1.
 * Present fields in; missing fields omitted. No invention.
 * public_contract_id / public_entity_id map to contract names.
 * CNPJ is never derived from public_id prefixes.
 */
function mapLeadToInboundV1(record) {
  const body = {};
  if (!record || typeof record !== "object") return body;

  const leadId = clampText(record.lead_id, 160);
  const receiptId = clampText(record.receipt_id || record.lead_id, 160);
  if (leadId) body.lead_id = leadId;
  if (receiptId) body.receipt_id = receiptId;

  const created = clampText(record.received_at || record.created_at, 40);
  if (created) body.created_at = created;

  // Analytics/store stay CONFENGE_WEB; Warmbly receives the same canonical source.
  body.source = SOURCE_WARMBLY;

  const routeFamily = clampText(record.route_family, 80);
  if (routeFamily) body.route_family = routeFamily;
  const assetId = clampText(record.asset_id, 120);
  if (assetId) body.asset_id = assetId;
  const ctaId = clampText(record.cta_id, 120);
  if (ctaId) body.cta_id = ctaId;

  const landing = sanitizeUrl(record.landing_url || record.landing_page, { allowPath: true });
  if (landing) body.landing_url = landing;

  const contractId = clampText(record.public_contract_id || record.contract_public_id, 120);
  if (contractId) body.contract_public_id = contractId;
  const entityId = clampText(record.public_entity_id || record.entity_public_id, 120);
  if (entityId) body.entity_public_id = entityId;

  const cnpj = clampText(record.cnpj || record.cnpj14, 20);
  if (cnpj) body.cnpj = cnpj;

  const company = clampText(record.empresa || record.company, 200);
  if (company) body.company = company;
  const name = clampText(record.nome || record.name, 160);
  if (name) body.name = name;
  const email = clampText(record.email, 180).toLowerCase();
  if (email) body.email = email;
  const phone = clampText(record.telefone || record.phone, 40);
  if (phone) body.phone = phone;

  if (record.consentimento === true || (record.consent && record.consent.granted === true)) {
    body.consent = { granted: true };
  }

  const utm = {};
  const utmSource = clampText(record.utm_source || (record.utm && record.utm.source), 80);
  const utmMedium = clampText(record.utm_medium || (record.utm && record.utm.medium), 80);
  const utmCampaign = clampText(record.utm_campaign || (record.utm && record.utm.campaign), 80);
  const utmTerm = clampText(record.utm_term || (record.utm && record.utm.term), 80);
  const utmContent = clampText(record.utm_content || (record.utm && record.utm.content), 80);
  if (utmSource) utm.source = utmSource;
  if (utmMedium) utm.medium = utmMedium;
  if (utmCampaign) utm.campaign = utmCampaign;
  if (utmTerm) utm.term = utmTerm;
  if (utmContent) utm.content = utmContent;
  if (Object.keys(utm).length) body.utm = utm;

  const referrer = sanitizeUrl(record.referrer);
  if (referrer) body.referrer = referrer;
  const message = clampText(record.mensagem || record.message, 2000);
  if (message) body.message = message;
  const correlation = clampText(record.correlation_id, 160);
  if (correlation) body.correlation_id = correlation;

  return body;
}

function stableBody(payload) {
  return JSON.stringify(payload);
}

function signWarmblyInbound(secret, rawBody, unixSeconds) {
  const t = String(unixSeconds);
  const mac = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${mac}`;
}

function verifyWarmblyInbound(secret, header, rawBody, nowMs = Date.now(), skewMs = HMAC_SKEW_MS) {
  if (!secret || !header) return false;
  let tUnix = 0;
  let sig = "";
  for (const part of String(header).split(",")) {
    const p = part.trim();
    if (p.startsWith("t=")) tUnix = Number(p.slice(2));
    if (p.startsWith("v1=")) sig = p.slice(3);
  }
  if (!tUnix || !sig) return false;
  const tsMs = tUnix * 1000;
  if (Math.abs(nowMs - tsMs) > skewMs) return false;
  const expected = signWarmblyInbound(secret, rawBody, tUnix);
  const want = expected.split(",v1=")[1] || "";
  const a = Buffer.from(want);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function resolveInboundConfig(env = process.env) {
  const url = String(env.CONFENGE_INBOUND_WEBHOOK_URL || "").trim();
  const secret = String(env.CONFENGE_INBOUND_WEBHOOK_SECRET || "").trim();
  const timeoutMs = Number(env.CONFENGE_INBOUND_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const maxAttempts = Number(env.CONFENGE_INBOUND_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  const allowHosts = String(env.CONFENGE_INBOUND_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (!url) {
    return { ok: false, skip: true, reason: "not_configured", timeoutMs, maxAttempts };
  }
  if (urlHasPiiQuery(url)) {
    return { ok: false, blocked: true, reason: "pii_on_url", timeoutMs, maxAttempts };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, blocked: true, reason: "invalid_url", timeoutMs, maxAttempts };
  }

  const prodLike = isStagingOrProd(env);
  const localHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (prodLike) {
    if (parsed.protocol !== "https:") {
      return { ok: false, blocked: true, reason: "https_required", timeoutMs, maxAttempts };
    }
  } else if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHost)) {
    return { ok: false, blocked: true, reason: "https_required", timeoutMs, maxAttempts };
  }

  if (parsed.pathname !== INBOUND_PATH && !parsed.pathname.endsWith(INBOUND_PATH)) {
    return { ok: false, blocked: true, reason: "invalid_path", timeoutMs, maxAttempts };
  }
  if (allowHosts.length && !allowHosts.includes(parsed.hostname.toLowerCase())) {
    return { ok: false, blocked: true, reason: "host_not_allowed", timeoutMs, maxAttempts };
  }
  if (!secret) {
    return { ok: false, blocked: true, reason: "secret_missing", timeoutMs, maxAttempts };
  }

  return {
    ok: true,
    url: parsed.toString(),
    secret,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : DEFAULT_MAX_ATTEMPTS,
  };
}

function sanitizeError(err) {
  const raw = err && err.message ? String(err.message) : String(err || "error");
  return raw
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted]")
    .replace(/\b\d{10,15}\b/g, "[redacted]")
    .replace(/t=\d+,v1=[a-f0-9]+/gi, "t=…,v1=[redacted]")
    .replace(/CONFENGE_INBOUND_WEBHOOK_SECRET=\S+/g, "CONFENGE_INBOUND_WEBHOOK_SECRET=[redacted]")
    .slice(0, 120);
}

function backoffMs(attempt) {
  if (attempt <= 1) return 30_000;
  if (attempt === 2) return 60_000;
  if (attempt === 3) return 2 * 60_000;
  if (attempt === 4) return 5 * 60_000;
  if (attempt === 5) return 15 * 60_000;
  if (attempt === 6) return 60 * 60_000;
  return 4 * 60 * 60_000;
}

function classifyHttp(status) {
  if (status === 200 || status === 201) return STATUS.DELIVERED;
  if (status === 401 || status === 403) return STATUS.BLOCKED;
  if (status === 408 || status === 429) return STATUS.RETRYABLE;
  if (status >= 500) return STATUS.RETRYABLE;
  if (status >= 400) return STATUS.DEAD;
  return STATUS.RETRYABLE;
}

function isCommercialRecord(record) {
  const kind = record && record.record_kind;
  if (!kind || kind === "real") return true;
  return false;
}

function initialHandoff(env = process.env, record = null) {
  if (record && !isCommercialRecord(record)) {
    return {
      target: "warmbly_inbound",
      status: STATUS.SKIPPED,
      reason: "non_real",
      attempts: 0,
      last_error: null,
      next_attempt_at: null,
    };
  }
  const cfg = resolveInboundConfig(env);
  if (cfg.skip) {
    return {
      target: "warmbly_inbound",
      status: STATUS.SKIPPED,
      reason: cfg.reason,
      attempts: 0,
      last_error: null,
      next_attempt_at: null,
    };
  }
  if (cfg.blocked) {
    return {
      target: "warmbly_inbound",
      status: STATUS.BLOCKED,
      reason: cfg.reason,
      attempts: 0,
      last_error: cfg.reason,
      next_attempt_at: null,
    };
  }
  return {
    target: "warmbly_inbound",
    status: STATUS.PENDING,
    attempts: 0,
    last_error: null,
    next_attempt_at: new Date().toISOString(),
  };
}

function isDue(handoff, now = new Date()) {
  if (!handoff) return false;
  if (handoff.status === STATUS.DELIVERED || handoff.status === STATUS.SKIPPED) return false;
  if (handoff.status === STATUS.DEAD || handoff.status === STATUS.BLOCKED) return false;
  if (handoff.status !== STATUS.PENDING && handoff.status !== STATUS.RETRYABLE) return false;
  if (!handoff.next_attempt_at) return true;
  return Date.parse(handoff.next_attempt_at) <= now.getTime();
}

async function postInbound(record, { now = new Date(), env = process.env } = {}) {
  const cfg = resolveInboundConfig(env);
  if (cfg.skip) return { status: STATUS.SKIPPED, reason: cfg.reason, attemptsDelta: 0 };
  if (cfg.blocked) return { status: STATUS.BLOCKED, reason: cfg.reason, last_error: cfg.reason, attemptsDelta: 0 };

  const payload = mapLeadToInboundV1(record);
  if (!payload.lead_id && !payload.receipt_id) {
    return { status: STATUS.DEAD, reason: "missing_lead_id", last_error: "missing_lead_id", attemptsDelta: 0 };
  }
  const rawBody = stableBody(payload);
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
        "User-Agent": "confenge-inbound/1.0",
        "X-Warmbly-Signature": signature,
        "Idempotency-Key": payload.lead_id || payload.receipt_id,
      },
      body: rawBody,
      signal: controller ? controller.signal : undefined,
    });
    const latency_ms = Date.now() - started;
    const classified = classifyHttp(res.status);
    let downstream = null;
    if (classified === STATUS.DELIVERED) {
      const data = await res.json().catch(() => ({}));
      const inner = data && data.data ? data.data : data;
      const actionId = inner && inner.action && (inner.action.id || inner.action.ID);
      const receipt = inner && (inner.receipt_id || (inner.lead && (inner.lead.id || inner.lead.lead_id)));
      downstream = {
        http: res.status,
        duplicate: Boolean(inner && inner.duplicate),
        action_id: actionId ? String(actionId).slice(0, 80) : undefined,
        downstream_receipt: receipt ? String(receipt).slice(0, 80) : undefined,
      };
    }
    return {
      status: classified,
      http: res.status,
      latency_ms,
      last_error: classified === STATUS.DELIVERED ? null : `webhook_http_${res.status}`,
      downstream,
      attemptsDelta: 1,
    };
  } catch (err) {
    const latency_ms = Date.now() - started;
    const aborted = err && (err.name === "AbortError" || /aborted|timeout/i.test(String(err.message || "")));
    return {
      status: STATUS.RETRYABLE,
      latency_ms,
      last_error: aborted ? "timeout" : sanitizeError(err),
      attemptsDelta: 1,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function applyAttempt(current, result, { now = new Date(), env = process.env } = {}) {
  const cfg = resolveInboundConfig(env);
  const attempts = (current && current.attempts ? current.attempts : 0) + (result.attemptsDelta || 0);
  const next = {
    target: "warmbly_inbound",
    status: result.status,
    reason: result.reason || (current && current.reason) || undefined,
    attempts,
    last_error: result.last_error || null,
    last_attempt_at: now.toISOString(),
    latency_ms: result.latency_ms,
    http_status: result.http,
    downstream: result.downstream || (current && current.downstream) || undefined,
  };
  if (result.status === STATUS.DELIVERED) {
    next.delivered_at = now.toISOString();
    next.next_attempt_at = null;
    next.last_error = null;
  } else if (result.status === STATUS.RETRYABLE) {
    if (attempts >= (cfg.maxAttempts || DEFAULT_MAX_ATTEMPTS)) {
      next.status = STATUS.DEAD;
      next.last_error = next.last_error || "max_attempts";
      next.next_attempt_at = null;
    } else {
      next.next_attempt_at = new Date(now.getTime() + backoffMs(attempts)).toISOString();
    }
  } else {
    next.next_attempt_at = null;
  }
  return next;
}

/**
 * First attempt after persist. Never throws. Warmbly down ≠ capture fail.
 */
async function attemptInboundHandoff(store, record, opts = {}) {
  const now = opts.now || new Date();
  const env = opts.env || process.env;
  const current = (record && record.handoff) || initialHandoff(env, record);
  if (current.status === STATUS.SKIPPED || current.status === STATUS.BLOCKED || current.status === STATUS.DELIVERED) {
    return current;
  }
  if (!isDue({ ...current, status: current.status === STATUS.PENDING ? STATUS.PENDING : current.status }, now)
    && current.status !== STATUS.PENDING) {
    return current;
  }
  const result = await postInbound(record, { now, env });
  const next = applyAttempt(current, result, { now, env });
  safeLog("info", "inbound_handoff_attempt", {
    lead_id: record.lead_id,
    status: next.status,
    http: next.http_status || null,
    attempts: next.attempts,
    latency_ms: next.latency_ms || null,
    error: next.last_error || null,
  });
  if (store && typeof store.update === "function") {
    try {
      await store.update(record.lead_id, { handoff: next });
    } catch (err) {
      safeLog("error", "inbound_handoff_status_update_failed", {
        lead_id: record.lead_id,
        code: sanitizeError(err),
      });
    }
  }
  return next;
}

async function drainPendingHandoffs(store, { now = new Date(), env = process.env, limit = 20 } = {}) {
  const summary = { scanned: 0, attempted: 0, delivered: 0, retryable: 0, dead: 0, blocked: 0, skipped: 0 };
  if (!store || typeof store.list !== "function") {
    return { ok: false, error: "store_list_unavailable", ...summary };
  }
  const leads = await store.list();
  summary.scanned = Array.isArray(leads) ? leads.length : 0;
  const due = (leads || []).filter((l) => isDue(l.handoff, now)).slice(0, limit);
  for (const lead of due) {
    const next = await attemptInboundHandoff(store, lead, { now, env });
    summary.attempted += 1;
    if (next.status === STATUS.DELIVERED) summary.delivered += 1;
    else if (next.status === STATUS.RETRYABLE) summary.retryable += 1;
    else if (next.status === STATUS.DEAD) summary.dead += 1;
    else if (next.status === STATUS.BLOCKED) summary.blocked += 1;
    else if (next.status === STATUS.SKIPPED) summary.skipped += 1;
  }
  return { ok: true, ...summary };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeHandoffs(leads) {
  const counts = {
    persisted_leads: 0,
    pending: 0,
    delivered: 0,
    retryable: 0,
    retries: 0,
    permanent_failures: 0,
    skipped: 0,
    blocked: 0,
    dead: 0,
  };
  const latencies = [];
  for (const lead of leads || []) {
    counts.persisted_leads += 1;
    const h = lead.handoff;
    if (!h) {
      counts.skipped += 1;
      continue;
    }
    if (h.status === STATUS.PENDING) counts.pending += 1;
    else if (h.status === STATUS.DELIVERED) counts.delivered += 1;
    else if (h.status === STATUS.RETRYABLE) counts.retryable += 1;
    else if (h.status === STATUS.SKIPPED) counts.skipped += 1;
    else if (h.status === STATUS.BLOCKED) {
      counts.blocked += 1;
      counts.permanent_failures += 1;
    } else if (h.status === STATUS.DEAD) {
      counts.dead += 1;
      counts.permanent_failures += 1;
    }
    if (typeof h.attempts === "number" && h.attempts > 1) {
      counts.retries += h.attempts - 1;
    }
    if (typeof h.latency_ms === "number") latencies.push(h.latency_ms);
  }
  latencies.sort((a, b) => a - b);
  return {
    ...counts,
    latency: {
      count: latencies.length,
      last_ms: latencies.length ? latencies[latencies.length - 1] : null,
      p50_ms: percentile(latencies, 50),
      p95_ms: percentile(latencies, 95),
    },
  };
}

module.exports = {
  INBOUND_PATH,
  SOURCE_INTERNAL,
  SOURCE_WARMBLY,
  STATUS,
  PII_QUERY_KEYS,
  mapLeadToInboundV1,
  signWarmblyInbound,
  verifyWarmblyInbound,
  resolveInboundConfig,
  sanitizeUrl,
  urlHasPiiQuery,
  initialHandoff,
  isDue,
  postInbound,
  applyAttempt,
  attemptInboundHandoff,
  drainPendingHandoffs,
  summarizeHandoffs,
  setFetchForTests,
  sanitizeError,
};
