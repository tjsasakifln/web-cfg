/**
 * Cross-repo delivery-gate compatibility for tjsasakifln/web-cfg#88.
 *
 * web-cfg validates the envelope and may materialize the checked-in synthetic
 * fixture. Warmbly owns proposal state and real financial reconciliation;
 * Governance owns delivery admission and Work Orders. This module cannot mint
 * an AUTHORIZED gate.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const DELIVERY_SCHEMA_VERSION = "confenge.delivery_order_requested.v1";
const FINANCIAL_GATE_SCHEMA_VERSION = "confenge.financial_gate.v1";
const RECONCILED_EVENT_VERSION = "confenge.financial_gate_reconciled.v1";
const FINANCIAL_STATES = Object.freeze(["UNKNOWN", "SYNTHETIC_VALID", "AUTHORIZED"]);

const CONTRACT_PATHS = Object.freeze({
  delivery: path.join(ROOT, "docs/contracts/delivery/confenge.delivery_order_requested.v1.schema.json"),
  financialGate: path.join(ROOT, "docs/contracts/delivery/confenge.financial_gate.v1.schema.json"),
  syntheticGate: path.join(ROOT, "data/offers/fixtures/delivery-gate/synthetic-financial-gate.v1.json"),
  syntheticDeliveryRequest: path.join(ROOT, "data/offers/fixtures/delivery-gate/delivery-order-requested.synthetic.v1.json"),
});

const FINANCIAL_GATE_FIELDS = Object.freeze([
  "schema_version",
  "state",
  "synthetic",
  "source_event_id",
  "received_revenue",
  "evidence_refs",
]);

const DELIVERY_FIELDS = Object.freeze([
  "schema_version",
  "event_id",
  "synthetic",
  "correlation_id",
  "causation_id",
  "idempotency_key",
  "organization_id",
  "account_id",
  "client_ref",
  "opportunity_id",
  "qco_id",
  "proposal_id",
  "proposal_version",
  "accepted_snapshot_hash",
  "offer_id",
  "offer_version",
  "deliverable_id",
  "deliverable_version",
  "scope_version",
  "price_version",
  "terms_version",
  "financial_gate",
  "onboarding_ref",
  "occurred_at",
  "evidence_refs",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function exactFields(value, required, prefix, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${prefix}_not_object`);
    return false;
  }
  const allowed = new Set(required);
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) errors.push(`${prefix}_${field}_missing`);
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) errors.push(`${prefix}_${field}_unexpected`);
  }
  return true;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateEvidenceRefs(value, prefix, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${prefix}_not_array`);
    return;
  }
  if (value.some((ref) => !isNonEmptyString(ref))) errors.push(`${prefix}_invalid_ref`);
  if (new Set(value).size !== value.length) errors.push(`${prefix}_duplicate_ref`);
}

function validateFinancialGate(gate) {
  const errors = [];
  if (!exactFields(gate, FINANCIAL_GATE_FIELDS, "financial_gate", errors)) {
    return { ok: false, errors };
  }
  if (gate.schema_version !== FINANCIAL_GATE_SCHEMA_VERSION) {
    errors.push("financial_gate_schema_version_unknown");
  }
  if (!FINANCIAL_STATES.includes(gate.state)) errors.push("financial_gate_state_unknown");
  if (typeof gate.synthetic !== "boolean") errors.push("financial_gate_synthetic_not_boolean");
  if (gate.received_revenue !== false) errors.push("financial_gate_received_revenue_forbidden");
  validateEvidenceRefs(gate.evidence_refs, "financial_gate_evidence_refs", errors);

  if (gate.state === "UNKNOWN") {
    if (gate.source_event_id !== null) errors.push("financial_gate_unknown_source_must_be_null");
  } else if (!isNonEmptyString(gate.source_event_id)) {
    errors.push("financial_gate_source_event_id_required");
  }
  if (gate.state === "SYNTHETIC_VALID") {
    if (gate.synthetic !== true) errors.push("financial_gate_synthetic_valid_must_be_synthetic");
    if (!Array.isArray(gate.evidence_refs) || !gate.evidence_refs.length) {
      errors.push("financial_gate_synthetic_evidence_required");
    }
  }
  if (gate.state === "AUTHORIZED") {
    if (gate.synthetic !== false) errors.push("financial_gate_authorized_cannot_be_synthetic");
    if (!Array.isArray(gate.evidence_refs) || !gate.evidence_refs.length) {
      errors.push("financial_gate_authorized_evidence_required");
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateDeliveryOrderRequested(event) {
  const errors = [];
  if (!exactFields(event, DELIVERY_FIELDS, "delivery_order", errors)) {
    return { ok: false, admission: "HELD", errors };
  }
  if (event.schema_version !== DELIVERY_SCHEMA_VERSION) errors.push("delivery_order_schema_version_unknown");
  for (const field of DELIVERY_FIELDS) {
    if (["schema_version", "synthetic", "proposal_version", "financial_gate", "onboarding_ref", "evidence_refs"].includes(field)) continue;
    if (!isNonEmptyString(event[field])) errors.push(`delivery_order_${field}_invalid`);
  }
  if (typeof event.synthetic !== "boolean") errors.push("delivery_order_synthetic_not_boolean");
  if (!Number.isInteger(event.proposal_version) || event.proposal_version < 1) {
    errors.push("delivery_order_proposal_version_invalid");
  }
  if (!/^(sha256:)?[a-f0-9]{64}$/.test(String(event.accepted_snapshot_hash || ""))) {
    errors.push("delivery_order_accepted_snapshot_hash_invalid");
  }
  if (!Number.isFinite(Date.parse(String(event.occurred_at || "")))) {
    errors.push("delivery_order_occurred_at_invalid");
  }
  validateEvidenceRefs(event.evidence_refs, "delivery_order_evidence_refs", errors);

  const gate = validateFinancialGate(event.financial_gate);
  errors.push(...gate.errors);
  if (gate.ok && event.financial_gate.state !== "UNKNOWN" && event.synthetic !== event.financial_gate.synthetic) {
    errors.push("delivery_order_synthetic_gate_mismatch");
  }
  if (gate.ok && event.financial_gate.state !== "UNKNOWN" && !isNonEmptyString(event.onboarding_ref)) {
    errors.push("delivery_order_onboarding_ref_required");
  }
  if (event.onboarding_ref !== null && typeof event.onboarding_ref !== "string") {
    errors.push("delivery_order_onboarding_ref_invalid");
  }

  if (errors.length) return { ok: false, admission: "HELD", errors };
  if (event.financial_gate.state === "UNKNOWN") {
    return { ok: true, admission: "HELD", reason: "financial_gate_unknown", errors: [] };
  }
  return { ok: true, admission: "CONTRACT_VALID", reason: null, errors: [] };
}

function loadSyntheticFinancialGate() {
  return readJson(CONTRACT_PATHS.syntheticGate);
}

function materializeSyntheticFinancialGate(fixture = loadSyntheticFinancialGate()) {
  const checked = validateFinancialGate(fixture);
  if (!checked.ok) return { ok: false, error: "synthetic_fixture_invalid", errors: checked.errors };
  if (fixture.state !== "SYNTHETIC_VALID" || fixture.synthetic !== true || fixture.received_revenue !== false) {
    return { ok: false, error: "synthetic_fixture_not_fail_closed" };
  }
  return { ok: true, financial_gate: JSON.parse(JSON.stringify(fixture)) };
}

function refuseAuthorizedGateFromWebCfg() {
  return {
    ok: false,
    error: "warmbly_reconciliation_required",
    required_event_schema: RECONCILED_EVENT_VERSION,
    received_revenue: false,
  };
}

module.exports = {
  CONTRACT_PATHS,
  DELIVERY_FIELDS,
  DELIVERY_SCHEMA_VERSION,
  FINANCIAL_GATE_FIELDS,
  FINANCIAL_GATE_SCHEMA_VERSION,
  FINANCIAL_STATES,
  RECONCILED_EVENT_VERSION,
  loadSyntheticFinancialGate,
  materializeSyntheticFinancialGate,
  readJson,
  refuseAuthorizedGateFromWebCfg,
  validateDeliveryOrderRequested,
  validateFinancialGate,
};
