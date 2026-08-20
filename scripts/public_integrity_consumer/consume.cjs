"use strict";

const {
  SCHEMA_VERSION,
  PRODUCER_VERSION,
  FRESHNESS_POLICY,
  INTEGRITY_STATES,
  CONTRACTED_SOURCES,
  FRESHNESS_STATUSES,
  REDACTED_CNPJ,
  FORBIDDEN_PAYLOAD_FIELDS,
  PAYLOAD_FIELDS,
  SOURCE_FIELDS,
  RECORD_FIELDS,
} = require("./constants.cjs");
const { hashMatches } = require("./hashing.cjs");

function collectForbiddenFields(node, path, hits) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectForbiddenFields(item, `${path}[${i}]`, hits));
    return hits;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const next = path ? `${path}.${key}` : key;
      if (FORBIDDEN_PAYLOAD_FIELDS.includes(key)) hits.push(next);
      collectForbiddenFields(value, next, hits);
    }
  }
  return hits;
}

function isRedactedCnpj(value) {
  return value === REDACTED_CNPJ || value === "[REDACTED]";
}

function isFourteenDigits(value) {
  return typeof value === "string" && /^\d{14}$/.test(value);
}

function missingAsUnknown(value) {
  return value === undefined || value === null || value === "";
}

function sourceCoverageComplete(source) {
  if (!source || typeof source !== "object") return false;
  if (source.coverage_complete !== true) return false;
  if (source.error_class) return false;
  if (source.pages_fetched === undefined || source.pages_fetched === null) return false;
  return true;
}

function recomputeAggregate(envelope) {
  const sources = (envelope && envelope.sources) || {};
  const records = Array.isArray(envelope && envelope.records) ? envelope.records : [];
  const ordered = CONTRACTED_SOURCES.map((id) => sources[id]).filter(Boolean);
  const allPresent = ordered.length === CONTRACTED_SOURCES.length;
  const allComplete = allPresent && ordered.every(sourceCoverageComplete);
  const anyComplete = ordered.some(sourceCoverageComplete);
  const anyRecords = records.length > 0;
  const sourceReasons = [];
  for (const run of ordered) {
    for (const code of run.reason_codes || []) {
      if (!sourceReasons.includes(code)) sourceReasons.push(code);
    }
  }

  if (allComplete && anyRecords) {
    return { state: "MATCHES_FOUND", reason_codes: sourceReasons, allComplete, anyRecords };
  }
  if (allComplete && !anyRecords) {
    return {
      state: "NO_MATCH_CONFIRMED",
      reason_codes: sourceReasons.concat(["missing_value_not_negative"]),
      allComplete,
      anyRecords,
    };
  }
  if (anyComplete || anyRecords) {
    const reasons = sourceReasons.concat(["coverage_incomplete"]);
    if (!allComplete) reasons.push("pagination_incomplete");
    return { state: "PARTIAL", reason_codes: reasons, allComplete, anyRecords };
  }
  return {
    state: "UNKNOWN",
    reason_codes: sourceReasons.concat(["coverage_incomplete"]),
    allComplete,
    anyRecords,
  };
}

function fail(error, reason_codes, extra = {}) {
  return {
    ok: false,
    error,
    reason_codes: reason_codes || [error],
    aggregate_state: "UNKNOWN",
    envelope: extra.envelope || null,
    recomputed: extra.recomputed || null,
    forbidden_fields: extra.forbidden_fields || [],
  };
}

function consumeEnvelope(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("incomplete_payload", ["payload_not_object"]);
  }

  const forbidden = collectForbiddenFields(raw, "", []);
  if (forbidden.length) {
    return fail("forbidden_field", ["forbidden_field"], { forbidden_fields: forbidden, envelope: raw });
  }

  if (raw.schema !== SCHEMA_VERSION || raw.schema_version !== SCHEMA_VERSION) {
    return fail("schema_drift", ["schema_drift"], { envelope: raw });
  }
  if (raw.producer_version !== PRODUCER_VERSION) {
    return fail("schema_drift", ["schema_drift", "producer_version"], { envelope: raw });
  }

  const missing = PAYLOAD_FIELDS.filter((field) => !(field in raw));
  if (missing.length) {
    return fail("incomplete_payload", ["incomplete_payload", ...missing.map((f) => `missing:${f}`)], {
      envelope: raw,
    });
  }

  if (raw.not_legal_conclusion !== true) {
    return fail("incompatible_source_status", ["not_legal_conclusion"], { envelope: raw });
  }

  const contracted = raw.contracted_sources;
  if (
    !Array.isArray(contracted) ||
    contracted.length !== 2 ||
    contracted[0] !== "CEIS" ||
    contracted[1] !== "CNEP"
  ) {
    return fail("incompatible_source_status", ["contracted_sources"], { envelope: raw });
  }

  if (!isRedactedCnpj(raw.queried_cnpj) && !isFourteenDigits(raw.queried_cnpj)) {
    return fail("incomplete_payload", ["queried_cnpj"], { envelope: raw });
  }

  if (!hashMatches(raw)) {
    return fail("content_hash_mismatch", ["content_hash_mismatch"], { envelope: raw });
  }

  const freshness = raw.freshness;
  if (!freshness || typeof freshness !== "object") {
    return fail("stale_without_policy", ["freshness_missing"], { envelope: raw });
  }
  if (freshness.policy !== FRESHNESS_POLICY) {
    return fail("stale_without_policy", ["freshness.policy"], { envelope: raw });
  }
  if (!FRESHNESS_STATUSES.includes(freshness.status)) {
    return fail("stale_without_policy", ["freshness.status"], { envelope: raw });
  }
  if (typeof freshness.is_current !== "boolean") {
    return fail("stale_without_policy", ["freshness.is_current"], { envelope: raw });
  }
  if ((freshness.status === "stale" || freshness.status === "expired") && freshness.policy !== FRESHNESS_POLICY) {
    return fail("stale_without_policy", ["stale_without_policy"], { envelope: raw });
  }

  const sources = raw.sources;
  if (!sources || typeof sources !== "object") {
    return fail("incomplete_payload", ["sources_missing"], { envelope: raw });
  }

  const sourceErrors = [];
  for (const sourceId of CONTRACTED_SOURCES) {
    const source = sources[sourceId];
    if (!source || typeof source !== "object") {
      sourceErrors.push(`sources.${sourceId}.missing`);
      continue;
    }
    for (const field of SOURCE_FIELDS) {
      if (!(field in source)) sourceErrors.push(`sources.${sourceId}.${field}`);
    }
    if (!INTEGRITY_STATES.includes(source.status)) {
      sourceErrors.push(`sources.${sourceId}.status`);
    }
    if (source.source_id !== sourceId) {
      sourceErrors.push(`sources.${sourceId}.source_id`);
    }
  }
  if (sourceErrors.length) {
    return fail("incompatible_source_status", sourceErrors, { envelope: raw });
  }

  const records = Array.isArray(raw.records) ? raw.records : null;
  if (!records) {
    return fail("incomplete_payload", ["records_missing"], { envelope: raw });
  }
  const recordErrors = [];
  records.forEach((record, i) => {
    if (!record || typeof record !== "object") {
      recordErrors.push(`records[${i}]`);
      return;
    }
    for (const field of RECORD_FIELDS) {
      if (!(field in record)) recordErrors.push(`records[${i}].${field}`);
    }
    if (record.source_id && !CONTRACTED_SOURCES.includes(record.source_id)) {
      recordErrors.push(`records[${i}].source_id`);
    }
  });
  if (recordErrors.length) {
    return fail("incomplete_payload", recordErrors, { envelope: raw });
  }

  if (!INTEGRITY_STATES.includes(raw.aggregate_state)) {
    return fail("incompatible_source_status", ["aggregate_state"], { envelope: raw });
  }

  const recomputed = recomputeAggregate(raw);
  if (raw.aggregate_state === "NO_MATCH_CONFIRMED" && recomputed.state !== "NO_MATCH_CONFIRMED") {
    return fail("contradiction_no_match", ["no_match_without_coverage", recomputed.state], {
      envelope: raw,
      recomputed,
    });
  }
  if (recomputed.state === "NO_MATCH_CONFIRMED" && raw.records && raw.records.length) {
    return fail("contradiction_no_match", ["no_match_with_records"], { envelope: raw, recomputed });
  }

  const stale = freshness.status === "stale" || freshness.status === "expired" || freshness.is_current === false;
  if (stale && raw.aggregate_state === "NO_MATCH_CONFIRMED") {
    return fail("stale_not_current", ["cache_expired", "not_current", "stale_without_current_no_match"], {
      envelope: raw,
      recomputed,
    });
  }

  return {
    ok: true,
    error: null,
    envelope: raw,
    recomputed,
    reason_codes: Array.isArray(raw.reason_codes) ? raw.reason_codes : recomputed.reason_codes,
    aggregate_state: stale && recomputed.state === "NO_MATCH_CONFIRMED" ? "UNKNOWN" : recomputed.state,
    stale,
  };
}

module.exports = {
  consumeEnvelope,
  recomputeAggregate,
  sourceCoverageComplete,
  collectForbiddenFields,
  missingAsUnknown,
  isRedactedCnpj,
};
