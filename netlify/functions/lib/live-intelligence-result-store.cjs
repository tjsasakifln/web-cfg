/**
 * Durable store for shareable live-intelligence result records.
 *
 * Why this exists: a result that lives only in a JS closure dies on refresh, on
 * back/forward, and cannot be shared. This store gives each result a real,
 * resolvable URL under `/analise-cnpj/r/<token>/`.
 *
 * Three properties are load-bearing and are enforced here rather than trusted:
 *
 * 1) The token is cryptographically random (16 bytes) and is NOT derived from
 *    the CNPJ in any way. CNPJ-space is enumerable — 14 digits with two check
 *    digits — so any token that was a function of the CNPJ (a hash included)
 *    would let an outsider confirm "does company X have a result page" by
 *    computing the token themselves. A random token cannot be computed; it can
 *    only be received from the person who ran the analysis.
 *
 * 2) The record is built by an explicit allowlist projection, never by copying
 *    an object. A field that is not in RESULT_FIELDS cannot reach disk even if
 *    a future caller passes it, so no lead-flow value (contact, consent,
 *    monitor state, form data, session context) can leak into a shareable page
 *    by accident.
 *
 * 3) There is no token -> CNPJ mapping anywhere. The store never receives the
 *    CNPJ, so no page leak, no endpoint and no dump of this namespace can
 *    reverse a token to the company that was looked up. The lookup direction is
 *    one-way by construction, not by policy.
 *
 * Storage is the same host-owned filesystem primitive the lead store uses
 * (`confenge-host-file-record/v1`, rooted at `/var/lib/confenge-web` in
 * production). This is deliberately not a new database and not Netlify Blobs.
 * The namespace is registered in `scripts/storage/retention.mjs` so these
 * records are swept by the existing retention job rather than accumulating in
 * an ungoverned store.
 */
const crypto = require("crypto");
const { safeLog } = require("./lead-core.cjs");
const {
  isProductionProfile,
  resolveStorageConfig,
  createHostBackend,
} = require("./storage-config.cjs");

/** Must match the key registered in scripts/storage/retention.mjs POLICIES. */
const STORE_NAMESPACE = "live-intelligence-results";
const RECORD_SCHEMA = "confenge-live-intelligence-result/v1";
const RESULT_ROUTE_PREFIX = "/analise-cnpj/r/";

/**
 * A shareable public result is a cached projection of already-public data, not
 * a lead. It gets a short life of its own rather than inheriting the 730-day
 * LEAD_RETAIN_DAYS default, which would be wrong for this record kind.
 */
function retainDays(env = process.env) {
  const raw = Number(env.LIVE_INTELLIGENCE_RESULT_RETAIN_DAYS || 30);
  return Number.isInteger(raw) && raw >= 1 ? raw : 30;
}

/**
 * `li_` + four hyphen-separated 8-hex groups = 128 bits of randomness.
 *
 * The hyphens are load-bearing, and so is the rejection below. A flat hex run
 * can contain a long run of digits, which the PII scanners across this codebase
 * read as a document number and silently drop. Rejecting any all-digit group
 * caps every digit run in the token at seven, so `\d{8,}` — the widest digit
 * rule any scanner here applies — can never match a token we mint.
 */
const TOKEN_RE = /^li_[0-9a-f]{8}(?:-[0-9a-f]{8}){3}$/;

function newResultToken() {
  for (;;) {
    const raw = crypto.randomBytes(16).toString("hex");
    const groups = [
      raw.slice(0, 8),
      raw.slice(8, 16),
      raw.slice(16, 24),
      raw.slice(24, 32),
    ];
    if (groups.some((group) => /^\d{8}$/.test(group))) continue;
    return `li_${groups.join("-")}`;
  }
}

function isResultToken(value) {
  return typeof value === "string" && TOKEN_RE.test(value);
}

/**
 * The public, shareable address of one stored result.
 *
 * The token rides in `?t=` rather than as a path segment because the host
 * contract cannot express "many token paths, one page": a wildcard source
 * demands a one-to-one `:splat` in the target, `:placeholder` sources are
 * rejected, destination query strings are rejected, and the runtime location
 * allowlist is anchored at the function name. `/analise-cnpj/r/` is therefore a
 * real static page that resolves through the ordinary pretty-URL chain.
 *
 * This costs nothing in privacy: the token is opaque and random, the CNPJ is
 * absent from it, and analytics records `location.pathname`, which excludes the
 * query entirely.
 */
function resultRoute(token) {
  return `${RESULT_ROUTE_PREFIX}?t=${encodeURIComponent(token)}`;
}

/**
 * The complete, closed set of fields a stored and served result may carry.
 *
 * Everything here is either server-authored constant text, a fixed enum, or a
 * projection of already-public contract data. Nothing here is visitor-supplied
 * and nothing here identifies a person or a company.
 */
const RESULT_FIELDS = Object.freeze([
  // The opaque identifier and the route it resolves at.
  "analysis_id",
  "result_path",
  // Fail-closed verdict. Fixed enum values, never free text.
  "state",
  "reason",
  // Server-authored constant copy for the verdict.
  "titulo",
  "explicacao",
  // Perfil contratual público and its dimensions.
  "perfil",
  "categorias",
  "faixas",
  "geografias",
  "compradores",
  "oportunidades_aderentes",
  "dimensoes_da_aderencia",
  // Declared gaps and UNKNOWNs. Absence of evidence, stated as such.
  "gaps",
  "unknowns",
  "limitations",
  // Freshness / provenance.
  "as_of",
  "fonte_kind",
  // The fixed epistemic boundary.
  "disclaimer",
]);

/**
 * Fields that must never appear, asserted rather than assumed. This is the
 * lead-capture and identity surface: if any of these ever reaches the store,
 * the allowlist projection has been bypassed and the write must fail closed.
 */
const FORBIDDEN_FIELDS = Object.freeze([
  "cnpj", "cnpj_masked", "cnpj_hash", "digest", "company_digest",
  "nome", "name", "email", "telefone", "phone", "tel", "whatsapp",
  "empresa", "company", "mensagem", "message", "cpf", "documento", "document",
  "consentimento", "consent", "canal_seguro",
  "intent_kind", "cta_id", "monitor", "subscription", "monitor_state",
  "lead_id", "idempotency_key", "session_id", "sid", "correlation_id",
  "ip_hash", "fingerprint", "turnstile_token", "cf-turnstile-response",
  "origem", "landing_page", "referrer", "jornada", "estagio",
]);

/** The envelope this module adds around the public result. */
const ENVELOPE_FIELDS = Object.freeze([
  "schema",
  "result_token",
  "created_at",
  "delete_after",
  "result",
]);

/**
 * Project an analysis outcome onto the allowlist.
 *
 * Copying is deliberately not an option: an unknown key is dropped, so a future
 * caller cannot widen what gets persisted by widening what it passes in.
 */
function publicResult(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const field of RESULT_FIELDS) {
    if (source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

/**
 * Last line of defence before a write. Scans the serialized record for a
 * forbidden key or a CNPJ-shaped run so a projection bug fails the write rather
 * than publishing a page that leaks.
 */
function assertRecordIsClean(record) {
  const keys = Object.keys(record.result || {});
  for (const key of keys) {
    if (!RESULT_FIELDS.includes(key)) {
      return { ok: false, error: "result_field_not_allowed", field: key };
    }
  }
  const blob = JSON.stringify(record);
  for (const forbidden of FORBIDDEN_FIELDS) {
    if (new RegExp(`"${forbidden}"\\s*:`, "i").test(blob)) {
      return { ok: false, error: "result_forbidden_field", field: forbidden };
    }
  }
  // A bare or masked CNPJ anywhere in the record, whatever key carried it.
  if (/(?<!\d)\d{14}(?!\d)/.test(blob) || /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(blob)) {
    return { ok: false, error: "result_cnpj_shaped_value" };
  }
  return { ok: true };
}

function buildRecord(result, now = new Date()) {
  const token = result && result.analysis_id;
  if (!isResultToken(token)) return { ok: false, error: "result_token_invalid" };
  const createdAt = now.toISOString();
  const record = {
    schema: RECORD_SCHEMA,
    result_token: token,
    created_at: createdAt,
    // Read by scripts/storage/retention.mjs. A record without it would never
    // be swept, so it is written unconditionally.
    delete_after: new Date(now.getTime() + retainDays() * 864e5).toISOString(),
    result: publicResult(result),
  };
  const clean = assertRecordIsClean(record);
  if (!clean.ok) return clean;
  return { ok: true, record };
}

/**
 * Non-durable adapter for tests and local dev only. `resolveStorageConfig`
 * refuses memory in a production profile, so this can never back production.
 */
const memory = new Map();

function _resetForTests() {
  if (String(process.env.NODE_ENV || "").toLowerCase() !== "test") return;
  memory.clear();
}

function openNamespace(env, event, { readOnly = false } = {}) {
  const cfg = resolveStorageConfig(env, event, { allowTestMemory: true });
  if (!cfg.ok) return { ok: false, code: cfg.code, namespace: null, memory: false };
  if (cfg.backend === "memory") {
    if (isProductionProfile(env)) return { ok: false, code: "memory_store_forbidden_in_production", namespace: null, memory: false };
    return { ok: true, namespace: null, memory: true };
  }
  if (cfg.backend !== "filesystem") {
    // The shareable result surface is filesystem-backed only. A legacy or
    // unproven backend fails closed rather than serving a half-durable page.
    return { ok: false, code: "storage_backend_not_supported", namespace: null, memory: false };
  }
  const opened = createHostBackend(env, { event, readOnly });
  if (!opened.backend) return { ok: false, code: opened.config.code, namespace: null, memory: false };
  return { ok: true, namespace: opened.backend.namespace(STORE_NAMESPACE), memory: false };
}

/**
 * Persist a result so its URL resolves later, for anyone holding the link.
 * Returns `{ ok }` — a storage failure must degrade the share link, never the
 * answer the visitor already earned.
 */
function saveResult(result, { env = process.env, event = null, now = new Date() } = {}) {
  const built = buildRecord(result, now);
  if (!built.ok) {
    safeLog("error", "live_intelligence_result_rejected", { error: built.error, field: built.field || "" });
    return { ok: false, error: built.error };
  }
  const opened = openNamespace(env, event);
  if (!opened.ok) {
    safeLog("warn", "live_intelligence_result_store_unavailable", { code: opened.code });
    return { ok: false, error: opened.code };
  }
  try {
    if (opened.memory) {
      memory.set(built.record.result_token, built.record);
      return { ok: true };
    }
    opened.namespace.put(built.record.result_token, built.record, { onlyIfNew: true });
    return { ok: true };
  } catch (err) {
    safeLog("warn", "live_intelligence_result_write_failed", { code: (err && err.code) || "unknown" });
    return { ok: false, error: "write_failed" };
  }
}

/** Resolve a token to its stored result, or null. Never throws to the caller. */
function loadResult(token, { env = process.env, event = null, now = new Date() } = {}) {
  if (!isResultToken(token)) return null;
  const opened = openNamespace(env, event, { readOnly: true });
  if (!opened.ok) return null;
  try {
    const record = opened.memory ? memory.get(token) || null : opened.namespace.get(token);
    if (!record || record.schema !== RECORD_SCHEMA || record.result_token !== token) return null;
    // The retention sweep (scripts/storage/retention.mjs) is a scheduled/manual
    // job, not a request-time guarantee. A record already past delete_after must
    // never be served just because the sweep hasn't run yet — the read path is
    // its own enforcement point, not a second one that could drift from it.
    const deleteAfter = Date.parse(record.delete_after);
    if (!Number.isFinite(deleteAfter) || deleteAfter <= now.getTime()) return null;
    // Project again on read. A record written by an older, wider version of this
    // module cannot serve a field this version does not allow.
    return { ...record, result: publicResult(record.result) };
  } catch (err) {
    safeLog("warn", "live_intelligence_result_read_failed", { code: (err && err.code) || "unknown" });
    return null;
  }
}

module.exports = {
  STORE_NAMESPACE,
  RECORD_SCHEMA,
  RESULT_ROUTE_PREFIX,
  RESULT_FIELDS,
  FORBIDDEN_FIELDS,
  ENVELOPE_FIELDS,
  TOKEN_RE,
  newResultToken,
  isResultToken,
  resultRoute,
  publicResult,
  assertRecordIsClean,
  buildRecord,
  saveResult,
  loadResult,
  retainDays,
  _resetForTests,
};
