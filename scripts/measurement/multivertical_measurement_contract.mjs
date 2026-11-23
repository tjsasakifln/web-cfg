#!/usr/bin/env node

/**
 * Semantic admission for the campaign-13 multi-vertical measurement contract.
 *
 * This module is the shipped authority for contract loading, PII denial,
 * observed-only QCO/proposal/revenue, coordination-hash fail-closed, and
 * unique-protocol sample checks. It does not emit runtime events.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT_ROOT = path.resolve(__dirname, "../..");

export const PATHS = {
  eventContract: "data/measurement/multivertical-event-metric-contract.v1.json",
  privacyMatrix: "data/measurement/privacy-matrix.v1.json",
  attribution: "data/measurement/attribution-conservation.v1.json",
  coordination: "data/measurement/test-only-coordination-contracts.v1.json",
  protocol: "data/commercial/market-fit-protocol.v1.json",
};

const REQUIRED_DIMENSIONS = [
  "source_landing_family",
  "source_asset",
  "nucleus_id",
  "offer_candidate",
  "city_service_area_class",
  "urgency",
  "decision_role",
  "why_now_class",
  "triage_start",
  "triage_complete",
  "handoff",
  "conflict_state_class",
  "qualification_state",
  "qco",
  "proposal",
  "commercial_outcome",
  "revenue_margin",
];

const OBSERVED_ONLY_EVENTS = new Set([
  "qco",
  "proposal",
  "won",
  "lost",
  "outcome_unknown",
  "revenue_margin_aggregate_ref",
]);

const CLIENT_PRODUCERS = new Set(["confengeTrack", "collect", "browser", "form", "js"]);

export function readJson(rel) {
  const full = path.join(CONTRACT_ROOT, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`MISSING_CONTRACT_ARTIFACT:${rel}`);
  }
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

export function canonicalJson(value) {
  return `${JSON.stringify(value)}\n`;
}

export function sha256Canonical(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function loadEventContract() {
  const contract = readJson(PATHS.eventContract);
  if (contract.schema !== "confenge.multivertical-event-metric-contract/1.0") {
    throw new Error("EVENT_CONTRACT_SCHEMA");
  }
  if (contract.authority !== "semantics_only_not_runtime") {
    throw new Error("EVENT_CONTRACT_NOT_SEMANTICS_ONLY");
  }
  if (contract.implementation_forbidden_in_this_contract !== true) {
    throw new Error("EVENT_CONTRACT_MUST_FORBID_RUNTIME_IMPLEMENTATION");
  }
  for (const dimension of REQUIRED_DIMENSIONS) {
    if (!contract.dimensions || typeof contract.dimensions[dimension] !== "object") {
      throw new Error(`MISSING_REQUIRED_DIMENSION:${dimension}`);
    }
  }
  for (const key of ["qco", "proposal", "revenue_margin"]) {
    const dim = contract.dimensions[key];
    if (!String(dim.admission || "").startsWith("observed_only")) {
      throw new Error(`CLIENT_SIDE_TRUTH_FORBIDDEN:${key}`);
    }
    if (dim.client_emit_forbidden !== true) {
      throw new Error(`CLIENT_EMIT_NOT_FORBIDDEN:${key}`);
    }
  }
  if (!Array.isArray(contract.client_side_is_not_source_of_truth_for) ||
      !["qco", "proposal", "revenue"].every((item) => contract.client_side_is_not_source_of_truth_for.includes(item))) {
    throw new Error("CLIENT_SIDE_NOT_SOURCE_OF_TRUTH_INCOMPLETE");
  }
  return contract;
}

export function loadPrivacyMatrix() {
  const matrix = readJson(PATHS.privacyMatrix);
  if (!Array.isArray(matrix.aggregate_pii_allowlist) || matrix.aggregate_pii_allowlist.length !== 0) {
    throw new Error("PRIVACY_ALLOWLIST_MUST_BE_EMPTY");
  }
  const required = [
    "nome",
    "email",
    "telefone",
    "cpf_cnpj_visitante",
    "endereco",
    "texto_livre",
    "processo",
    "empregado",
    "documento",
    "valor_informado",
    "motivo_detalhado_de_conflito",
  ];
  const ids = (matrix.forbidden_fields || []).map((field) => field.id);
  for (const id of required) {
    if (!ids.includes(id)) throw new Error(`PRIVACY_FORBIDDEN_MISSING:${id}`);
  }
  return matrix;
}

export function loadAttributionRules() {
  const rules = readJson(PATHS.attribution);
  const required = [
    "source_is_confenge_web",
    "absence_is_unknown",
    "layers_do_not_promote",
    "qco_is_downstream_readback",
    "alias_is_not_a_second_count",
    "event_id_idempotent",
    "b2g_not_removed",
    "ctr_is_not_value",
    "wtp_does_not_replace_341",
    "no_outbound_auto_send",
  ];
  const ids = (rules.rules || []).map((rule) => rule.id);
  for (const id of required) {
    if (!ids.includes(id)) throw new Error(`ATTRIBUTION_RULE_MISSING:${id}`);
  }
  return rules;
}

export function coordinationIdentity(fixtures, contract) {
  return {
    id: contract.id,
    kind: contract.kind,
    nuclei: fixtures.nuclei,
    invariants: fixtures.invariants,
    authority: fixtures.authority,
  };
}

export function loadCoordinationContracts() {
  const fixtures = readJson(PATHS.coordination);
  if (fixtures.authority !== "test_only_not_production_fallback") {
    throw new Error("COORDINATION_NOT_TEST_ONLY");
  }
  if (fixtures.not_a_runtime_fallback !== true || fixtures.fail_closed_on_missing_or_divergent_hash !== true) {
    throw new Error("COORDINATION_MUST_FAIL_CLOSED");
  }
  if (!fixtures.invariants || fixtures.invariants.source !== "CONFENGE_WEB" ||
      fixtures.invariants.outbound_eligible !== false || fixtures.invariants.auto_send !== false) {
    throw new Error("COORDINATION_INVARIANTS");
  }
  const requiredIds = [
    "CONFENGE_CORPORATE_TAXONOMY/1.0.0-draft.20260904",
    "CONFENGE_OFFER_CATALOG/2.0.0-draft.20260904",
    "CONFENGE_WEB_INTAKE/2.0.0-draft.20260904",
    "NET_NEW_INBOUND_HANDRAISER/1.0.0-draft.20260904",
    "CONFENGE_HANDRAISER_STATE/1.0.0-draft.20260904",
    "MEETCFG_HANDRAISER_CONTEXT/1.0.0-draft.20260904",
    "private_project_technical_readiness_v1",
    "private_project_technical_readiness_assessment",
  ];
  const requiredNuclei = [
    "expert_evidence_assistance",
    "property_valuation",
    "building_engineering_documentation",
    "occupational_safety",
    "public_works_b2g",
  ];
  if (!same(fixtures.nuclei, requiredNuclei)) throw new Error("COORDINATION_NUCLEI");
  const byId = new Map((fixtures.contracts || []).map((item) => [item.id, item]));
  for (const id of requiredIds) {
    const item = byId.get(id);
    if (!item) throw new Error(`COORDINATION_MISSING:${id}`);
    if (!item.sha256) throw new Error(`COORDINATION_HASH_MISSING:${id}`);
    const expected = sha256Canonical(coordinationIdentity(fixtures, item));
    if (item.sha256 !== expected) throw new Error(`COORDINATION_HASH_DIVERGENT:${id}`);
  }
  return fixtures;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function collectForbiddenHits(payload, matrix) {
  const hits = [];
  const tokens = new Set();
  for (const field of matrix.forbidden_fields || []) {
    tokens.add(normalizeKey(field.id));
    for (const alias of field.aliases || []) tokens.add(normalizeKey(alias));
  }
  function walk(value, prefix) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${prefix}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const location = prefix ? `${prefix}.${key}` : key;
        if (tokens.has(normalizeKey(key))) hits.push(`forbidden_key:${location}`);
        walk(child, location);
      }
    }
  }
  walk(payload, "");
  return hits;
}

export function admitMeasurementEvent(event, options = {}) {
  const contract = options.contract || loadEventContract();
  const privacy = options.privacy || loadPrivacyMatrix();
  const seen = options.seen || new Set();

  if (!event || typeof event !== "object") {
    return { admitted: false, reason: "event_required" };
  }
  const piiHits = collectForbiddenHits(event, privacy);
  if (piiHits.length) {
    return { admitted: false, reason: "pii_forbidden", detail: piiHits };
  }
  const name = event.event || event.name;
  if (!name || typeof name !== "string") {
    return { admitted: false, reason: "event_name_required" };
  }
  const spec = contract.events[name];
  if (!spec) {
    return { admitted: false, reason: "unknown_event" };
  }
  if (event.source && event.source !== "CONFENGE_WEB") {
    return { admitted: false, reason: "source_not_confenge_web" };
  }
  if (event.event_id && seen.has(event.event_id)) {
    return { admitted: true, replay: true, reason: "idempotent_replay" };
  }

  const producer = event.producer || event.emitter;
  const observedOnly = spec.admission === "observed_only" ||
    spec.admission === "observed_only_aggregate_reference" ||
    OBSERVED_ONLY_EVENTS.has(name);
  if (observedOnly) {
    if (producer && CLIENT_PRODUCERS.has(producer)) {
      return { admitted: false, reason: "client_side_observed_only_forbidden" };
    }
    if (event.observed_owner !== "warmbly") {
      return { admitted: false, reason: "observed_owner_required" };
    }
  }

  if (event.nucleus_id) {
    const allowed = contract.dimensions.nucleus_id.closed_enum;
    if (!allowed.includes(event.nucleus_id)) {
      return { admitted: false, reason: "nucleus_not_in_enum" };
    }
  }
  if (event.qualification_state === "QCO" && CLIENT_PRODUCERS.has(producer || "")) {
    return { admitted: false, reason: "client_side_qco_state_forbidden" };
  }
  if (event.event_id) seen.add(event.event_id);
  return { admitted: true, replay: false, reason: "ok" };
}

export function loadUniqueProtocol() {
  return readJson(PATHS.protocol);
}

export function assertUniqueProtocolSample(protocol = loadUniqueProtocol()) {
  const problems = [];
  if (protocol.issue !== "#336") problems.push("unique_issue_must_be_336");
  if (protocol.second_study_forbidden !== true) problems.push("second_study_forbidden");
  const sample = protocol.sample_design || {};
  if (sample.n !== 20) problems.push("sample_n");
  if (sample.kind !== "qualitative_predeclared_sample") problems.push("sample_kind");
  if (sample.not_market_share !== true) problems.push("not_market_share");
  if (sample.not_statistical_significance !== true) problems.push("not_statistical_significance");
  if (sample.single_revision_allowed_before_first_session !== true) problems.push("single_revision_rule");
  if (sample.revision_must_keep_n !== 20) problems.push("revision_keeps_n");
  if (sample.protocol_immutable_after_first_session !== true) problems.push("immutable_after_first_session");
  const composition = sample.composition || [];
  const byNucleus = Object.fromEntries(composition.map((row) => [row.nucleus_id, row.quota]));
  const expected = {
    building_engineering_documentation: 8,
    expert_evidence_assistance: 3,
    property_valuation: 3,
    occupational_safety: 3,
    public_works_b2g: 3,
  };
  const sum = composition.reduce((acc, row) => acc + Number(row.quota || 0), 0);
  if (sum !== 20) problems.push("composition_sum");
  for (const [nucleus, quota] of Object.entries(expected)) {
    if (byNucleus[nucleus] !== quota) problems.push(`quota:${nucleus}`);
  }
  if (!composition.some((row) => row.nucleus_id === "building_engineering_documentation" && row.canary_priority === true)) {
    problems.push("canary_priority");
  }
  if (!composition.some((row) => row.nucleus_id === "public_works_b2g")) {
    problems.push("b2g_removed");
  }
  return problems;
}

export function loadAllMeasurementArtifacts() {
  const eventContract = loadEventContract();
  const privacy = loadPrivacyMatrix();
  const attribution = loadAttributionRules();
  const coordination = loadCoordinationContracts();
  const protocol = loadUniqueProtocol();
  return { eventContract, privacy, attribution, coordination, protocol };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    loadAllMeasurementArtifacts();
    const sampleProblems = assertUniqueProtocolSample();
    if (sampleProblems.length) {
      console.error(`MEASUREMENT_CONTRACT_FAIL ${sampleProblems.join(",")}`);
      process.exit(1);
    }
    console.log("MEASUREMENT_CONTRACT_OK semantics_only observed_only_qco sample=20");
  } catch (error) {
    console.error(`MEASUREMENT_CONTRACT_FAIL ${error.message}`);
    process.exit(1);
  }
}
