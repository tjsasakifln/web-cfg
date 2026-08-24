export const READY_INBOUND_CONFIGURATION = Object.freeze({
  webhook_url: "SET",
  webhook_secret: "SET",
  contract: "READY",
  reason: null,
  destination_fingerprint: "WARMBLY_PRODUCTION_V1",
});

const CONFIGURATION_KEYS = Object.freeze([
  "contract",
  "destination_fingerprint",
  "reason",
  "webhook_secret",
  "webhook_url",
]);
const COUNT_KEYS = Object.freeze([
  "blocked",
  "dead",
  "delivered",
  "pending",
  "permanent_failures",
  "persisted_leads",
  "retries",
  "retryable",
  "skipped",
]);
const LATENCY_KEYS = Object.freeze(["count", "last_ms", "p50_ms", "p95_ms"]);
const AUDIT_KEYS = Object.freeze([
  "already_delivered",
  "by_commercial_eligibility",
  "by_consent_state",
  "by_created_at_window",
  "by_reason",
  "by_record_kind",
  "by_status",
  "eligible_real_not_configured",
  "manual_review",
  "never_requeue",
  "other",
  "reason_counts",
  "suppressed",
  "total",
]);
const AUDIT_COUNT_KEYS = Object.freeze([
  "already_delivered",
  "eligible_real_not_configured",
  "manual_review",
  "never_requeue",
  "other",
  "suppressed",
  "total",
]);
const FUNNEL_KEYS = Object.freeze([
  "contacted",
  "cta_triggered",
  "form_started",
  "lead_persisted",
  "lost",
  "meeting",
  "proposal",
  "qualified",
  "visitor",
  "won",
]);
const STATUS_BUCKETS = new Set([
  "BLOCKED", "DEAD", "DELIVERED", "MISSING", "OTHER", "PENDING", "RETRYABLE", "SKIPPED",
]);
const HANDOFF_REASON_BUCKETS = new Set([
  "MISSING", "OTHER", "host_not_allowed", "https_required", "invalid_path", "invalid_url",
  "non_real", "noncanonical_destination", "not_configured", "pii_on_url", "secret_missing",
]);
const RECORD_KIND_BUCKETS = new Set(["MISSING", "OTHER", "internal", "qa", "real", "spam", "synthetic"]);
const CONSENT_BUCKETS = new Set(["EXPLICIT_TRUE", "MISSING_OR_FALSE"]);
const ELIGIBILITY_BUCKETS = new Set([
  "ALREADY_DELIVERED",
  "DNC_OR_SUPPRESSED",
  "ELIGIBLE_REAL_NOT_CONFIGURED",
  "MANUAL_REVIEW_LEGACY",
  "NEVER_REQUEUE_NON_REAL",
  "OTHER_BLOCKER",
]);
const CLASSIFIER_REASON_BUCKETS = new Set([
  "already_delivered",
  "dnc_or_suppressed",
  "eligible_real_not_configured",
  "invalid_join_id",
  "legacy_kind_unknown",
  "missing_explicit_consent",
  "missing_skip_reason",
  "non_real",
  "non_real_or_test_identity",
  "not_skipped",
  "unexpected_handoff_reason",
]);
const CONFIG_REASONS = new Set([
  null,
  "UNKNOWN",
  "host_not_allowed",
  "https_required",
  "invalid_path",
  "invalid_url",
  "noncanonical_destination",
  "not_configured",
  "pii_on_url",
  "secret_missing",
]);

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value, expected) {
  return isObject(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function safeCountMap(value, allowedKey) {
  if (!isObject(value)) return null;
  const out = {};
  for (const [key, count] of Object.entries(value)) {
    if (!allowedKey(key) || !nonnegativeInteger(count)) return null;
    out[key] = count;
  }
  return out;
}

function totalCounts(value) {
  return Object.values(value).reduce((total, count) => total + count, 0);
}

function exactCountObject(value, keys) {
  if (!hasExactKeys(value, keys)) return null;
  return countProjection(value, keys);
}

function countProjection(value, keys) {
  if (!isObject(value)) return null;
  return keys.every((key) => nonnegativeInteger(value[key]))
    ? Object.fromEntries(keys.map((key) => [key, value[key]]))
    : null;
}

export function inboundTransportConfigured(configuration) {
  return Boolean(
    configuration &&
      configuration.webhook_url === READY_INBOUND_CONFIGURATION.webhook_url &&
      configuration.webhook_secret === READY_INBOUND_CONFIGURATION.webhook_secret &&
      configuration.contract === READY_INBOUND_CONFIGURATION.contract &&
      configuration.reason === READY_INBOUND_CONFIGURATION.reason
  );
}

export function inboundTransportReady(configuration) {
  return Boolean(
    hasExactKeys(configuration, CONFIGURATION_KEYS) &&
      inboundTransportConfigured(configuration) &&
      configuration.destination_fingerprint === READY_INBOUND_CONFIGURATION.destination_fingerprint
  );
}

export function inboundTransportProofReady(response) {
  return Boolean(
    response &&
      response.status === 200 &&
      response.body?.ok === true &&
      inboundTransportReady(response.body?.configuration)
  );
}

export function inboundConfigurationSummary(configuration) {
  const enumValue = (value, allowed, missing = "MISSING") => {
    if (value === undefined || value === null || value === "") return missing;
    return allowed.has(value) ? value : "UNEXPECTED";
  };
  return {
    webhook_url: enumValue(configuration?.webhook_url, new Set(["SET", "UNSET"])),
    webhook_secret: enumValue(configuration?.webhook_secret, new Set(["SET", "UNSET"])),
    contract: enumValue(configuration?.contract, new Set(["BLOCKED", "READY", "UNSET"])),
    reason: configuration?.reason === null
      ? null
      : enumValue(configuration?.reason, CONFIG_REASONS),
    destination_fingerprint: enumValue(
      configuration?.destination_fingerprint,
      new Set(["MISSING", "UNEXPECTED", "WARMBLY_PRODUCTION_V1"])
    ),
  };
}

export function inboundCountersSummary(counters) {
  if (!hasExactKeys(counters, [...COUNT_KEYS, "latency"])) return null;
  const counts = countProjection(counters, COUNT_KEYS);
  const latency = counters.latency;
  if (!counts || !hasExactKeys(latency, LATENCY_KEYS) || !nonnegativeInteger(latency.count)) return null;
  for (const key of ["last_ms", "p50_ms", "p95_ms"]) {
    if (latency[key] !== null && !(Number.isFinite(latency[key]) && latency[key] >= 0)) return null;
  }
  if (
    counts.persisted_leads !==
      counts.pending + counts.delivered + counts.retryable + counts.skipped + counts.blocked + counts.dead
    || counts.permanent_failures !== counts.blocked + counts.dead
    || latency.count > counts.persisted_leads
  ) return null;
  return { ...counts, latency: Object.fromEntries(LATENCY_KEYS.map((key) => [key, latency[key]])) };
}

export function inboundAuditSummary(audit) {
  if (!hasExactKeys(audit, AUDIT_KEYS)) return null;
  const counts = countProjection(audit, AUDIT_COUNT_KEYS);
  const maps = {
    by_status: safeCountMap(audit.by_status, (key) => STATUS_BUCKETS.has(key)),
    by_reason: safeCountMap(audit.by_reason, (key) => HANDOFF_REASON_BUCKETS.has(key)),
    by_record_kind: safeCountMap(audit.by_record_kind, (key) => RECORD_KIND_BUCKETS.has(key)),
    by_consent_state: safeCountMap(audit.by_consent_state, (key) => CONSENT_BUCKETS.has(key)),
    by_commercial_eligibility: safeCountMap(
      audit.by_commercial_eligibility,
      (key) => ELIGIBILITY_BUCKETS.has(key)
    ),
    by_created_at_window: safeCountMap(
      audit.by_created_at_window,
      (key) => key === "UNKNOWN" || /^\d{4}-(?:0[1-9]|1[0-2])$/.test(key)
    ),
    reason_counts: safeCountMap(audit.reason_counts, (key) => CLASSIFIER_REASON_BUCKETS.has(key)),
  };
  if (!counts || Object.values(maps).some((value) => value === null)) return null;
  const total = counts.total;
  if (
    [maps.by_status, maps.by_reason, maps.by_record_kind, maps.by_consent_state,
      maps.by_commercial_eligibility, maps.by_created_at_window, maps.reason_counts]
      .some((value) => totalCounts(value) !== total)
  ) return null;
  if (
    counts.eligible_real_not_configured !== (maps.by_commercial_eligibility.ELIGIBLE_REAL_NOT_CONFIGURED || 0)
    || counts.never_requeue !== (maps.by_commercial_eligibility.NEVER_REQUEUE_NON_REAL || 0)
    || counts.manual_review !== (maps.by_commercial_eligibility.MANUAL_REVIEW_LEGACY || 0)
    || counts.suppressed !== (maps.by_commercial_eligibility.DNC_OR_SUPPRESSED || 0)
    || counts.already_delivered !== (maps.by_commercial_eligibility.ALREADY_DELIVERED || 0)
    || counts.other !== (maps.by_commercial_eligibility.OTHER_BLOCKER || 0)
  ) return null;
  return { ...counts, ...maps };
}

export function inboundDryRunSummary(value) {
  if (!hasExactKeys(value, ["eligible_count", "manual_review_count", "never_requeue_count", "reason_counts"])) {
    return null;
  }
  const counts = countProjection(value, ["eligible_count", "manual_review_count", "never_requeue_count"]);
  const reasonCounts = safeCountMap(value.reason_counts, (key) => CLASSIFIER_REASON_BUCKETS.has(key));
  return counts && reasonCounts ? { ...counts, reason_counts: reasonCounts } : null;
}

export function commercialFunnelSummary(counts) {
  return exactCountObject(counts, FUNNEL_KEYS);
}
