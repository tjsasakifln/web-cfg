/**
 * B2G X-Ray fixture load + public projection. extra-cli Goal 03 is absent;
 * labeled fixtures are the factual bar. Pure besides require() of fixtures.
 */
const FORBIDDEN_SCORE_KEYS = [
  "risco",
  "risk_score",
  "risk",
  "dor",
  "pain_score",
  "irregularidade",
  "irregularity",
  "credit_score",
  "score_risco",
  "score_dor",
];

const STATES = ["READY", "NEEDS_DATA", "NOT_FOUND", "STALE", "BLOCKED", "ERROR"];

const FIXTURE_BY_STATE = {
  READY: require("../../data/conversion/fixtures/xray-ready.v1.json"),
  NEEDS_DATA: require("../../data/conversion/fixtures/xray-needs-data.v1.json"),
  NOT_FOUND: require("../../data/conversion/fixtures/xray-not-found.v1.json"),
  STALE: require("../../data/conversion/fixtures/xray-stale.v1.json"),
  BLOCKED: require("../../data/conversion/fixtures/xray-blocked.v1.json"),
  ERROR: require("../../data/conversion/fixtures/xray-error.v1.json"),
};

/** Server-side only. Never log these digits. */
const CNPJ_TO_STATE = {
  "11222333000181": "READY",
  "22333444000181": "NEEDS_DATA",
  "33444555000181": "NOT_FOUND",
  "44555666000181": "STALE",
  "55666777000181": "BLOCKED",
  "66777888000181": "ERROR",
};

function isLabeledNonLive(payload) {
  if (!payload || typeof payload !== "object") return false;
  const mode = payload.catalog_mode || payload.source_kind;
  if (payload.claimed_live === true) return false;
  return mode === "fixture" || mode === "labeled_fixture";
}

function collectKeys(obj, into = new Set()) {
  if (!obj || typeof obj !== "object") return into;
  if (Array.isArray(obj)) {
    for (const item of obj) collectKeys(item, into);
    return into;
  }
  for (const [k, v] of Object.entries(obj)) {
    into.add(k);
    collectKeys(v, into);
  }
  return into;
}

function forbiddenScoreKeys(payload) {
  const keys = collectKeys(payload);
  return FORBIDDEN_SCORE_KEYS.filter((k) => keys.has(k));
}

function loadFixture(state) {
  const key = String(state || "").toUpperCase();
  if (!FIXTURE_BY_STATE[key]) return null;
  return JSON.parse(JSON.stringify(FIXTURE_BY_STATE[key]));
}

function resolveXrayState({ cnpj, fixture_state, forceError } = {}) {
  if (forceError) return "ERROR";
  if (fixture_state && STATES.includes(String(fixture_state).toUpperCase())) {
    return String(fixture_state).toUpperCase();
  }
  if (cnpj && CNPJ_TO_STATE[cnpj]) return CNPJ_TO_STATE[cnpj];
  return "READY";
}

function requestFactualPayload(opts = {}) {
  const state = resolveXrayState(opts);
  const raw = loadFixture(state);
  if (!raw) {
    return { ok: false, state: "ERROR", payload: loadFixture("ERROR") };
  }
  return { ok: state !== "ERROR", state, payload: raw };
}

function toPublicXray(payload, state) {
  const src = payload && typeof payload === "object" ? payload : {};
  const publicView = {
    state: state || src.xray_state || "ERROR",
    sla: "UNKNOWN",
    catalog_mode: src.catalog_mode || "fixture",
    source_kind: src.source_kind || "labeled_fixture",
    claimed_live: false,
    as_of: src.as_of || null,
    company_name: src.company && src.company.public_name ? src.company.public_name : null,
    observed_portfolio: src.observed_portfolio || null,
    evidence_contracts: src.evidence_contracts || [],
    second_reading_candidates: src.second_reading_candidates || [],
    limitations: src.limitations || [],
    reason_codes: src.reason_codes || [],
    method_version: src.method_version || null,
    schema_version: src.schema_version || null,
    extra_cli_goal: src.extra_cli_goal || "03",
  };
  return publicView;
}

module.exports = {
  FORBIDDEN_SCORE_KEYS,
  STATES,
  CNPJ_TO_STATE,
  isLabeledNonLive,
  forbiddenScoreKeys,
  loadFixture,
  resolveXrayState,
  requestFactualPayload,
  toPublicXray,
};
