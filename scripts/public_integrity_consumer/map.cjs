"use strict";

const {
  VIEW_SCHEMA,
  CONSUMER_VERSION,
  SCHEMA_VERSION,
  CONTRACTED_SOURCES,
  ASSET,
  SOURCE_SPECS,
} = require("./constants.cjs");
const { consumeEnvelope, recomputeAggregate, sourceCoverageComplete, missingAsUnknown } = require("./consume.cjs");
const copy = require("./copy.cjs");

function coverageClass(sources) {
  const completeCount = CONTRACTED_SOURCES.filter((id) => sourceCoverageComplete(sources[id])).length;
  if (completeCount === CONTRACTED_SOURCES.length) return "complete";
  if (completeCount > 0) return "partial";
  return "unknown";
}

function unknownIfMissing(value) {
  if (missingAsUnknown(value) && value !== 0) return "UNKNOWN";
  if (value === undefined) return "UNKNOWN";
  return value;
}

function publicRecord(record) {
  if (!record || typeof record !== "object") return null;
  return {
    source_id: record.source_id,
    official_id: record.official_id,
    record_type: record.record_type || "UNKNOWN",
    authority: record.authority || "UNKNOWN",
    start_date: record.start_date == null || record.start_date === "" ? "UNKNOWN" : record.start_date,
    end_date: record.end_date == null || record.end_date === "" ? "UNKNOWN" : record.end_date,
    observed_status: record.observed_status || "UNKNOWN",
    source_url: record.source_url || (SOURCE_SPECS[record.source_id] && SOURCE_SPECS[record.source_id].official_url) || "",
    captured_at: record.captured_at || "UNKNOWN",
  };
}

function publicSource(sourceId, source, records) {
  const spec = SOURCE_SPECS[sourceId];
  const src = source && typeof source === "object" ? source : {};
  const pagesExpectedMissing = !("pages_expected" in src) || src.pages_expected === undefined;
  const pagesFetchedMissing = !("pages_fetched" in src) || src.pages_fetched === undefined || src.pages_fetched === null;
  const asOfMissing = missingAsUnknown(src.as_of);
  const coverageMissing = !("coverage_complete" in src);
  const status = CONTRACTED_SOURCES.includes(src.status) || ["MATCHES_FOUND", "NO_MATCH_CONFIRMED", "PARTIAL", "UNKNOWN"].includes(src.status)
    ? src.status
    : "UNKNOWN";
  const sourceRecords = records.filter((r) => r && r.source_id === sourceId).map(publicRecord).filter(Boolean);
  return {
    source_id: sourceId,
    authority: src.authority || spec.authority,
    official_url: src.official_url || spec.official_url,
    api_url: src.api_url || spec.api_url,
    status: coverageMissing || pagesFetchedMissing ? "UNKNOWN" : status,
    pages_expected: pagesExpectedMissing ? "UNKNOWN" : src.pages_expected,
    pages_fetched: pagesFetchedMissing ? "UNKNOWN" : src.pages_fetched,
    coverage_complete: coverageMissing ? "UNKNOWN" : Boolean(src.coverage_complete),
    as_of: asOfMissing ? "UNKNOWN" : src.as_of,
    reason_codes: Array.isArray(src.reason_codes) ? src.reason_codes : [],
    error_class: src.error_class || null,
    records: sourceRecords,
  };
}

function stripPrivate(envelope) {
  if (!envelope || typeof envelope !== "object") return null;
  const out = { ...envelope };
  delete out.queried_cnpj;
  if (Array.isArray(out.records)) {
    out.records = out.records.map((record) => {
      const next = { ...record };
      delete next.original;
      return next;
    });
  }
  return out;
}

function mapPublicView(consumed, extras = {}) {
  const c = copy.journeyCopy();
  if (!consumed || consumed.ok !== true) {
    const reason = (consumed && consumed.reason_codes) || ["unknown"];
    const envelope = consumed && consumed.envelope;
    const sources = (envelope && envelope.sources) || {};
    const records = Array.isArray(envelope && envelope.records) ? envelope.records : [];
    const cards = CONTRACTED_SOURCES.map((id) => publicSource(id, sources[id], records));
    const matchesStillVisible = cards.some((card) => card.records && card.records.length);
    return {
      schema: VIEW_SCHEMA,
      consumer_version: CONSUMER_VERSION,
      consumed_schema: SCHEMA_VERSION,
      ok: false,
      aggregate_state: "UNKNOWN",
      coverage_class: coverageClass(sources),
      checked_at: unknownIfMissing(envelope && envelope.checked_at),
      as_of: unknownIfMissing(envelope && envelope.as_of),
      expires_at: unknownIfMissing(envelope && envelope.expires_at),
      freshness: {
        policy: (envelope && envelope.freshness && envelope.freshness.policy) || "UNKNOWN",
        status: (envelope && envelope.freshness && envelope.freshness.status) || "UNKNOWN",
        is_current: Boolean(envelope && envelope.freshness && envelope.freshness.is_current),
      },
      sources: cards,
      matches_visible: matchesStillVisible,
      limitations: c.limitations,
      method: c.method,
      correction_route: ASSET.correction_path,
      author: ASSET.author,
      reviewer: ASSET.reviewer,
      next_action: c.next_action_unknown,
      cta: c.cta,
      not_legal_conclusion: true,
      reason_codes: reason,
      error: (consumed && consumed.error) || "unknown",
      empty_success: false,
      ...extras,
    };
  }

  const envelope = consumed.envelope;
  const recomputed = consumed.recomputed || recomputeAggregate(envelope);
  const sources = envelope.sources || {};
  const records = Array.isArray(envelope.records) ? envelope.records : [];
  const cards = CONTRACTED_SOURCES.map((id) => publicSource(id, sources[id], records));
  const matchesStillVisible = cards.some((card) => card.records && card.records.length);
  const state = consumed.aggregate_state || recomputed.state;
  const nextAction = copy.nextActionFor(state);

  const view = {
    schema: VIEW_SCHEMA,
    consumer_version: CONSUMER_VERSION,
    consumed_schema: SCHEMA_VERSION,
    ok: true,
    aggregate_state: state,
    coverage_class: coverageClass(sources),
    checked_at: unknownIfMissing(envelope.checked_at),
    as_of: unknownIfMissing(envelope.as_of),
    expires_at: unknownIfMissing(envelope.expires_at),
    freshness: {
      policy: envelope.freshness.policy,
      status: envelope.freshness.status,
      is_current: envelope.freshness.is_current,
      ttl_seconds: envelope.freshness.ttl_seconds,
    },
    sources: cards,
    matches_visible: matchesStillVisible,
    limitations: Array.isArray(envelope.limitations) && envelope.limitations.length
      ? envelope.limitations
      : c.limitations,
    method: c.method,
    correction_route: ASSET.correction_path,
    author: ASSET.author,
    reviewer: ASSET.reviewer,
    next_action: nextAction,
    cta: c.cta,
    not_legal_conclusion: true,
    reason_codes: consumed.reason_codes || [],
    empty_success: false,
    ...extras,
  };
  return view;
}

function consumeAndMap(raw, extras) {
  const consumed = consumeEnvelope(raw);
  return { consumed, view: mapPublicView(consumed, extras) };
}

module.exports = {
  mapPublicView,
  consumeAndMap,
  publicRecord,
  publicSource,
  coverageClass,
  stripPrivate,
};
