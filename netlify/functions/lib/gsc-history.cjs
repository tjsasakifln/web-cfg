"use strict";

const crypto = require("crypto");

const GSC_HISTORY_SCHEMA = "confenge_private_gsc_history_v1";
const GSC_READINESS_CONTRACT = "gsc-readiness/v2";
const SHA256_RE = /^[a-f0-9]{64}$/;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function historyHash(state) {
  const unsigned = { ...state };
  delete unsigned.state_sha256;
  return crypto.createHash("sha256").update(canonicalJson(unsigned)).digest("hex");
}

function observationHash(observation) {
  const identity = {};
  for (const key of [
    "source",
    "synthetic",
    "complete",
    "as_of",
    "start",
    "end",
    "observed_dates",
    "snapshot_sha256",
  ]) {
    identity[key] = observation[key];
  }
  return crypto.createHash("sha256").update(canonicalJson(identity)).digest("hex");
}

function dateSpan(start, end) {
  const values = [];
  for (let current = Date.parse(`${start}T00:00:00Z`); current <= Date.parse(`${end}T00:00:00Z`); current += 864e5) {
    values.push(new Date(current).toISOString().slice(0, 10));
  }
  return values;
}

function validateIsoDate(value) {
  const text = String(value || "");
  const parsed = Date.parse(`${text}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(text) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === text
  );
}

function validateHistoryState(state, { now = Date.now() } = {}) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { ok: false, error: "gsc_history_invalid" };
  }
  if (state.schema !== GSC_HISTORY_SCHEMA) {
    return { ok: false, error: "gsc_history_schema_unsupported" };
  }
  if (state.contract_version !== GSC_READINESS_CONTRACT) {
    return { ok: false, error: "gsc_history_contract_unsupported" };
  }
  if (!SHA256_RE.test(String(state.state_sha256 || ""))) {
    return { ok: false, error: "gsc_history_hash_missing" };
  }
  if (historyHash(state) !== state.state_sha256) {
    return { ok: false, error: "gsc_history_hash_mismatch" };
  }
  if (
    state.window_days !== 28 ||
    state.minimum_distinct_as_of !== 3 ||
    state.max_as_of_lag_days !== 14 ||
    !Array.isArray(state.observations) ||
    state.observations.length > 120
  ) {
    return { ok: false, error: "gsc_history_contract_invalid" };
  }
  if (
    state.parent_state_sha256 !== null &&
    !SHA256_RE.test(String(state.parent_state_sha256 || ""))
  ) {
    return { ok: false, error: "gsc_history_parent_hash_invalid" };
  }

  const observationIds = new Set();
  for (const observation of state.observations) {
    if (
      !observation ||
      observation.source !== "search_analytics_api" ||
      observation.synthetic !== false ||
      observation.complete !== true ||
      !validateIsoDate(observation.as_of) ||
      !validateIsoDate(observation.start) ||
      !validateIsoDate(observation.end) ||
      observation.start > observation.end ||
      !SHA256_RE.test(String(observation.snapshot_sha256 || "")) ||
      !SHA256_RE.test(String(observation.observation_id || "")) ||
      observation.observation_id !== observationHash(observation) ||
      !Array.isArray(observation.observed_dates) ||
      observation.observed_dates.some((day) => !validateIsoDate(day)) ||
      observation.observed_dates.some((day) => day < observation.start || day > observation.end) ||
      !Array.isArray(observation.reprocessed_dates) ||
      observation.reprocessed_dates.some((day) => !observation.observed_dates.includes(day))
    ) {
      return { ok: false, error: "gsc_history_observation_invalid" };
    }
    if (observationIds.has(observation.observation_id)) {
      return { ok: false, error: "gsc_history_duplicate_observation" };
    }
    observationIds.add(observation.observation_id);
  }

  const readiness = state.readiness;
  if (
    !readiness ||
    typeof readiness.ready_for_product_decisions !== "boolean" ||
    !["READY", "UNKNOWN", "STALE"].includes(readiness.status) ||
    !["READ_WRITE", "READ_ONLY", "NONE"].includes(readiness.access_mode) ||
    !Array.isArray(readiness.reason_codes) ||
    !Array.isArray(readiness.observed_dates) ||
    !Array.isArray(readiness.missing_dates) ||
    readiness.observed_dates.some((day) => !validateIsoDate(day)) ||
    readiness.missing_dates.some((day) => !validateIsoDate(day)) ||
    readiness.observed_dates.some((day) => readiness.missing_dates.includes(day)) ||
    (readiness.ready_for_product_decisions &&
      (readiness.status !== "READY" || readiness.access_mode !== "READ_WRITE" || readiness.missing_dates.length))
  ) {
    return { ok: false, error: "gsc_history_readiness_invalid" };
  }

  if (!state.observations.length) {
    if (
      readiness.window_start !== null ||
      readiness.window_end !== null ||
      readiness.freshness_as_of !== null ||
      readiness.observed_dates.length ||
      readiness.missing_dates.length ||
      readiness.distinct_as_of !== 0 ||
      readiness.ready_for_product_decisions
    ) {
      return { ok: false, error: "gsc_history_empty_readiness_invalid" };
    }
  } else {
    const latest = [...state.observations].sort((a, b) =>
      `${a.as_of}:${a.observed_at}`.localeCompare(`${b.as_of}:${b.observed_at}`)
    ).at(-1);
    const windowEnd = latest.as_of;
    const windowStart = new Date(Date.parse(`${windowEnd}T00:00:00Z`) - 27 * 864e5)
      .toISOString()
      .slice(0, 10);
    const expected = dateSpan(windowStart, windowEnd);
    const observed = [...new Set(state.observations.flatMap((item) => item.observed_dates))]
      .filter((day) => day >= windowStart && day <= windowEnd)
      .sort();
    const missing = expected.filter((day) => !observed.includes(day));
    const distinctAsOf = new Set(
      state.observations.filter((item) => item.end >= windowStart).map((item) => item.as_of)
    ).size;
    if (
      readiness.window_start !== windowStart ||
      readiness.window_end !== windowEnd ||
      readiness.freshness_as_of !== windowEnd ||
      readiness.distinct_as_of !== distinctAsOf ||
      JSON.stringify(readiness.observed_dates) !== JSON.stringify(observed) ||
      JSON.stringify(readiness.missing_dates) !== JSON.stringify(missing)
    ) {
      return { ok: false, error: "gsc_history_readiness_derivation_invalid" };
    }
    const asOfEnd = Date.parse(`${windowEnd}T23:59:59Z`);
    const claimedAt = Date.parse(state.updated_at || "");
    const staleWhenClaimed = !Number.isFinite(claimedAt) || claimedAt - asOfEnd > 14 * 864e5;
    if (readiness.ready_for_product_decisions && (missing.length || distinctAsOf < 3 || staleWhenClaimed)) {
      return { ok: false, error: "gsc_history_ready_claim_invalid" };
    }
  }

  if (state.last_known_good) {
    const lkgObservation = state.observations.find(
      (observation) => observation.observation_id === state.last_known_good.observation_id,
    );
    if (
      !SHA256_RE.test(String(state.last_known_good.snapshot_sha256 || "")) ||
      !validateIsoDate(state.last_known_good.as_of) ||
      !lkgObservation ||
      state.last_known_good.snapshot_sha256 !== lkgObservation.snapshot_sha256 ||
      state.last_known_good.as_of !== lkgObservation.as_of ||
      state.last_known_good.observed_at !== lkgObservation.observed_at
    ) {
      return { ok: false, error: "gsc_history_last_known_good_invalid" };
    }
  }
  const freshnessAsOf = state.readiness?.freshness_as_of;
  const stale = freshnessAsOf
    ? now - Date.parse(`${freshnessAsOf}T23:59:59Z`) > 14 * 864e5
    : true;
  return { ok: true, state_sha256: state.state_sha256, stale };
}

module.exports = {
  GSC_HISTORY_SCHEMA,
  GSC_READINESS_CONTRACT,
  canonicalJson,
  historyHash,
  observationHash,
  validateHistoryState,
};
