"use strict";

const { ASSET } = require("./constants.cjs");
const { analyticsSafe } = require("./privacy.cjs");

const ALLOWED_KEYS = Object.freeze([
  "source",
  "asset_family",
  "asset_id",
  "asset_version",
  "destination_service_id",
  "cta_id",
  "cta_version",
  "correlation_id",
  "session_id",
  "aggregate_state",
  "coverage_class",
  "event_id",
  "flag",
  "consumed_schema",
]);

function attributionEvent({
  eventName,
  aggregate_state,
  coverage_class,
  correlation_id,
  session_id,
  event_id,
  flag,
} = {}) {
  const payload = {
    source: ASSET.source,
    asset_family: ASSET.asset_family,
    asset_id: ASSET.asset_id,
    asset_version: ASSET.asset_version,
    destination_service_id: ASSET.destination_service_id,
    cta_id: ASSET.cta_id,
    cta_version: ASSET.cta_version,
    consumed_schema: "public-read-integrity/1.0",
    aggregate_state: aggregate_state || "UNKNOWN",
    coverage_class: coverage_class || "unknown",
    correlation_id: correlation_id || "",
    session_id: session_id || "",
    event_id: event_id || "",
    flag: flag || "off",
  };
  const slim = {};
  for (const key of ALLOWED_KEYS) {
    if (payload[key]) slim[key] = payload[key];
  }
  if (payload.aggregate_state) slim.aggregate_state = payload.aggregate_state;
  if (payload.coverage_class) slim.coverage_class = payload.coverage_class;
  return analyticsSafe(eventName || "public_integrity_consult", slim);
}

module.exports = {
  ALLOWED_KEYS,
  attributionEvent,
};
