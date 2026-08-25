/**
 * Hermetic cross-repo contract proof for tjsasakifln/web-cfg#88.
 * No provider, e-mail, customer or public network calls.
 */
import { createRequire } from "module";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const contract = require(path.join(root, "scripts/offers/delivery-gate-contract.cjs"));
const events = require(path.join(root, "scripts/offers/events.cjs"));
const sandboxProvider = require(path.join(root, "scripts/offers/providers/asaas-sandbox.cjs"));

const results = [];
function assert(name, condition, detail = "") {
  if (!condition) {
    console.error("FAIL", name, detail);
    process.exitCode = 1;
    throw new Error(`FAIL: ${name}`);
  }
  results.push(name);
  console.log("PASS", name);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const deliverySchema = contract.readJson(contract.CONTRACT_PATHS.delivery);
const gateSchema = contract.readJson(contract.CONTRACT_PATHS.financialGate);
const gateFixture = contract.loadSyntheticFinancialGate();
const requestFixture = contract.readJson(contract.CONTRACT_PATHS.syntheticDeliveryRequest);

assert("delivery_schema_versioned", deliverySchema.title === contract.DELIVERY_SCHEMA_VERSION);
assert("financial_gate_schema_versioned", gateSchema.title === contract.FINANCIAL_GATE_SCHEMA_VERSION);
assert("delivery_schema_exact_fields", JSON.stringify(deliverySchema.required) === JSON.stringify(contract.DELIVERY_FIELDS));
assert("financial_gate_schema_exact_fields", JSON.stringify(gateSchema.required) === JSON.stringify(contract.FINANCIAL_GATE_FIELDS));
assert("delivery_schema_fail_closed_extras", deliverySchema.additionalProperties === false);
assert("financial_gate_schema_fail_closed_extras", gateSchema.additionalProperties === false);
assert("gate_schema_never_received_revenue", gateSchema.properties.received_revenue.const === false);
assert("reconciled_event_not_owned_here", !fs.existsSync(path.join(root, "docs/contracts/delivery/confenge.financial_gate_reconciled.v1.schema.json")));
assert("delivery_schema_cross_repo_fingerprint", sha256(fs.readFileSync(contract.CONTRACT_PATHS.delivery)) === "6464c124040bbadea9f719dcecacdcd3faa85febfa4610950f3791bb224fb0ba");
assert("financial_gate_cross_repo_fingerprint", sha256(fs.readFileSync(contract.CONTRACT_PATHS.financialGate)) === "5c0bdecf80fdfe1101ba1606f8a5462f035aae7c2a2b0d262af86de7b6d4a903");
assert("warmbly_golden_semantic_fingerprint", sha256(stableJson(requestFixture)) === "c3de0cfe6648ca576f86be930fc9a9313e4a32961eee9d33cafe6f9b9cddbe03");

const checkedGate = contract.validateFinancialGate(gateFixture);
assert("synthetic_gate_fixture_valid", checkedGate.ok, checkedGate.errors);
assert("synthetic_gate_not_received_revenue", gateFixture.synthetic === true && gateFixture.received_revenue === false);
assert("synthetic_gate_materializes", contract.materializeSyntheticFinancialGate(gateFixture).ok);
assert("fixture_gate_matches_nested_contract", JSON.stringify(gateFixture) === JSON.stringify(requestFixture.financial_gate));

const checkedRequest = contract.validateDeliveryOrderRequested(requestFixture);
assert("delivery_request_fixture_valid", checkedRequest.ok, checkedRequest.errors);
assert("delivery_request_contract_valid", checkedRequest.admission === "CONTRACT_VALID", checkedRequest);
assert("canary_offer_binding", requestFixture.offer_id === "CFG-DIAG-EXP-v1" && requestFixture.offer_version === "v1");
assert("canary_deliverable_binding", requestFixture.deliverable_id === "CFG-DIAG-EXP-v1" && requestFixture.deliverable_version === "v1");
assert("canary_scope_binding", requestFixture.scope_version === "CFG-SCOPE-DIAG-EXP-v1");
assert("canary_price_binding", requestFixture.price_version === "CFG-OFFER-CATALOG-v1");
assert("canary_terms_binding", requestFixture.terms_version === "CFG-TERMS-B2B-2026-08-17-v1");
assert("warmbly_golden_event_binding", requestFixture.event_id === "7bb44bf9-e37f-5833-8958-4e5c313eaceb");
assert("warmbly_golden_proposal_binding", requestFixture.proposal_id === "220f817a-5b2b-5799-b403-2ce8c731e4bf");
assert("warmbly_golden_snapshot_binding", requestFixture.accepted_snapshot_hash === "sha256:7cbe3a5d5663e4ae15001e56f97b852287c94eea2836e200c3a5a309bc73f2bd");
assert("warmbly_golden_financial_source_binding", requestFixture.financial_gate.source_event_id === "fixture-financial-gate-cfg-diag-exp-001");

for (let replay = 0; replay < 3; replay += 1) {
  const result = contract.validateDeliveryOrderRequested(clone(requestFixture));
  assert(`delivery_contract_replay_${replay + 1}`, JSON.stringify(result) === JSON.stringify(checkedRequest));
}

{
  const bad = clone(gateFixture);
  bad.received_revenue = true;
  const checked = contract.validateFinancialGate(bad);
  assert("synthetic_received_revenue_rejected", !checked.ok && checked.errors.includes("financial_gate_received_revenue_forbidden"), checked.errors);
}

{
  const bad = clone(gateFixture);
  bad.state = "PAYMENT_CONFIRMED";
  const checked = contract.validateFinancialGate(bad);
  assert("payment_confirmed_is_not_gate", !checked.ok && checked.errors.includes("financial_gate_state_unknown"), checked.errors);
}

{
  const bad = clone(gateFixture);
  bad.synthetic = false;
  const checked = contract.validateFinancialGate(bad);
  assert("synthetic_gate_must_be_marked", !checked.ok && checked.errors.includes("financial_gate_synthetic_valid_must_be_synthetic"), checked.errors);
}

{
  const bad = clone(requestFixture);
  bad.synthetic = false;
  const checked = contract.validateDeliveryOrderRequested(bad);
  assert("top_level_gate_synthetic_must_agree", !checked.ok && checked.errors.includes("delivery_order_synthetic_gate_mismatch"), checked.errors);
}

{
  const bad = clone(requestFixture);
  bad.onboarding_ref = null;
  const checked = contract.validateDeliveryOrderRequested(bad);
  assert("valid_gate_requires_onboarding", !checked.ok && checked.errors.includes("delivery_order_onboarding_ref_required"), checked.errors);
}

{
  const held = clone(requestFixture);
  held.synthetic = false;
  held.financial_gate = {
    schema_version: "confenge.financial_gate.v1",
    state: "UNKNOWN",
    synthetic: false,
    source_event_id: null,
    received_revenue: false,
    evidence_refs: [],
  };
  held.onboarding_ref = null;
  const checked = contract.validateDeliveryOrderRequested(held);
  assert("unknown_gate_schema_valid", checked.ok, checked.errors);
  assert("unknown_gate_held", checked.admission === "HELD" && checked.reason === "financial_gate_unknown", checked);
}

{
  const held = clone(requestFixture);
  held.financial_gate = {
    schema_version: "confenge.financial_gate.v1",
    state: "UNKNOWN",
    synthetic: false,
    source_event_id: null,
    received_revenue: false,
    evidence_refs: [],
  };
  held.onboarding_ref = "";
  const checked = contract.validateDeliveryOrderRequested(held);
  assert("synthetic_proposal_unknown_gate_compatible", checked.ok && checked.admission === "HELD", checked.errors);
}

{
  const authorized = clone(requestFixture);
  authorized.synthetic = false;
  authorized.financial_gate = {
    schema_version: "confenge.financial_gate.v1",
    state: "AUTHORIZED",
    synthetic: false,
    source_event_id: "evt-warmbly-financial-gate-reconciled-001",
    received_revenue: false,
    evidence_refs: ["warmbly://confenge.financial_gate_reconciled.v1/evt-warmbly-financial-gate-reconciled-001"],
  };
  const checked = contract.validateDeliveryOrderRequested(authorized);
  assert("authorized_contract_compatible", checked.ok && checked.admission === "CONTRACT_VALID", checked.errors);
  assert("authorized_gate_still_not_received_revenue", authorized.financial_gate.received_revenue === false);
}

{
  const bad = clone(requestFixture);
  delete bad.proposal_id;
  const checked = contract.validateDeliveryOrderRequested(bad);
  assert("missing_join_fails_closed", !checked.ok && checked.admission === "HELD", checked.errors);
}

{
  const bad = clone(requestFixture);
  bad.local_delivery_state = "CLOSED";
  const checked = contract.validateDeliveryOrderRequested(bad);
  assert("second_truth_field_rejected", !checked.ok && checked.errors.includes("delivery_order_local_delivery_state_unexpected"), checked.errors);
}

{
  const bad = clone(requestFixture);
  bad.accepted_snapshot_hash = "sha256:deadbeef";
  const checked = contract.validateDeliveryOrderRequested(bad);
  assert("invalid_snapshot_hash_rejected", !checked.ok && checked.errors.includes("delivery_order_accepted_snapshot_hash_invalid"), checked.errors);
}

{
  const bad = clone(requestFixture);
  bad.proposal_version = 0;
  const checked = contract.validateDeliveryOrderRequested(bad);
  assert("proposal_version_zero_rejected", !checked.ok && checked.errors.includes("delivery_order_proposal_version_invalid"), checked.errors);
}

const refused = contract.refuseAuthorizedGateFromWebCfg();
assert("web_cfg_cannot_authorize_gate", refused.ok === false && refused.error === "warmbly_reconciliation_required", refused);
assert("real_replacement_named", refused.required_event_schema === "confenge.financial_gate_reconciled.v1", refused);
assert("authorization_refusal_not_revenue", refused.received_revenue === false, refused);

const syntheticReceived = events.commercialEvent({
  event_id: "evt-synthetic-payment-received",
  type: events.TYPES.PAYMENT_RECEIVED,
  provider_raw_status: "PAYMENT_RECEIVED",
  synthetic: true,
});
assert("synthetic_commercial_event_labeled", syntheticReceived.synthetic === true, syntheticReceived);
assert("synthetic_commercial_event_not_received_revenue", syntheticReceived.received_revenue === false, syntheticReceived);

const providerReceivedFixture = JSON.parse(fs.readFileSync(path.join(root, "data/offers/fixtures/asaas-sandbox/webhook-payment-received.json"), "utf8"));
const normalizedSandbox = sandboxProvider.mapProviderEventToCanonicalEvent(providerReceivedFixture, {
  offer_id: "CFG-DIAG-EXP-v1",
  offer_version: "v1",
  terms_version: "CFG-TERMS-B2B-2026-08-17-v1",
});
assert("sandbox_provider_event_normalized", normalizedSandbox.ok && normalizedSandbox.event.canonical_status === "PAYMENT_RECEIVED", normalizedSandbox);
assert("sandbox_provider_event_synthetic", normalizedSandbox.event.synthetic === true, normalizedSandbox.event);
assert("sandbox_provider_event_not_received_revenue", normalizedSandbox.event.received_revenue === false, normalizedSandbox.event);

const flags = JSON.parse(fs.readFileSync(path.join(root, "data/offers/flags.json"), "utf8"));
assert("catalog_public_stays_false", flags.CONFENGE_OFFER_CATALOG_PUBLIC === false, flags);
assert("asaas_mode_stays_disabled", flags.ASAAS_MODE === "disabled", flags);
assert("production_checkout_stays_false", flags.production_checkout_enabled === false, flags);
assert("production_webhook_stays_false", flags.production_webhook_enabled === false, flags);
assert("real_money_stays_false", flags.real_money_mutation_enabled === false, flags);

const mappings = JSON.parse(fs.readFileSync(path.join(root, "data/offers/provider-mapping.json"), "utf8"));
for (const [offerId, mapping] of Object.entries(mappings.offers || {})) {
  assert(
    `provider_mapping_uninvented_${offerId}`,
    mapping.asaas_product_id === null
      && mapping.asaas_checkout_url === null
      && mapping.asaas_subscription_template_id === null,
    mapping,
  );
}

console.log(JSON.stringify({
  ok: true,
  classification: "CONTRACT_PROVEN",
  passed: results.length,
  real_money: false,
  real_email: false,
  real_customer: false,
}));
