import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const decisionGate = require(path.join(root, "scripts/offers/piloto-decision.cjs"));
const flags = require(path.join(root, "scripts/offers/flags.cjs"));
const productionConfig = require(path.join(root, "scripts/offers/providers/config-production.cjs"));
const EXECUTE_EVIDENCE_REF = "tests/offers/fixtures/piloto-decision/execute-authority.json";
const ROLLBACK_EVIDENCE_REF = "tests/offers/fixtures/piloto-decision/rollback-authority.json";
const EXECUTE_EVIDENCE_SHA = "4c4b3eb0f9cab70fa9265a57b2070e49f3e71ad88112ae902adb02371f6f50c7";
const ROLLBACK_EVIDENCE_SHA = "e1b7719f6330815da8b6e744aca0f8b4e4b38b15e780712967dc561b50cf11fc";
const EVIDENCE_OPTIONS = {
  root,
  allowedEvidencePrefixes: ["tests/offers/fixtures/piloto-decision/"],
  allowSyntheticEvidence: true,
  requireTracked: true,
};

const decision = decisionGate.loadDecision();
const validation = decisionGate.validateDecision(decision);
assert.equal(validation.ok, true, validation.errors.join(", "));
assert.equal(decision.decision_state, "DEFER");
assert.equal(decision.activation_authorized, false);
assert.equal(decision.review_on, "2026-09-21");
assert.equal(decision.scope.url_decisions.length, 24);
assert.equal(decisionGate.productionAuthorized(decision), false);

const repoState = decisionGate.validateRepository(root, decision, { today: "2026-08-24" });
assert.equal(repoState.ok, true, repoState.errors.join(", "));
const overdue = decisionGate.validateRepository(root, decision, { today: "2026-09-22" });
assert.equal(overdue.ok, false, "an expired DEFER must force a new review");
assert.ok(overdue.errors.includes("defer_review_overdue"));

const productionEnv = {
  ASAAS_MODE: "production",
  CONFENGE_OFFER_CATALOG_PUBLIC: "true",
  CONFENGE_PRODUCTION_CHECKOUT: "true",
  CONFENGE_PRODUCTION_WEBHOOK: "true",
  CONFENGE_REAL_MONEY: "true",
  CONFENGE_DIAG_CHECKOUT_ENABLED: "true",
  CONFENGE_WEBHOOK_APPLY: "true",
  CONFENGE_ONBOARDING_ENABLED: "true",
};
const guarded = flags.loadFlags(productionEnv);
assert.equal(guarded.ASAAS_MODE, "disabled", "DEFER must override production mode from the environment");
for (const name of [
  "CONFENGE_OFFER_CATALOG_PUBLIC",
  "production_checkout_enabled",
  "production_webhook_enabled",
  "real_money_mutation_enabled",
  "diag_checkout_enabled",
  "webhook_apply_enabled",
  "onboarding_enabled",
]) {
  assert.equal(guarded[name], false, `${name} must remain fail-closed under DEFER`);
}
const config = productionConfig.resolveProductionConfig(productionEnv);
assert.equal(config.ok, false);
assert.equal(config.error, "feature_disabled");
const missingDecision = flags.loadFlags(productionEnv, { decision: null });
assert.equal(missingDecision.ASAAS_MODE, "disabled", "a missing decision must fail closed");
assert.equal(missingDecision.real_money_mutation_enabled, false);

const sandbox = flags.loadFlags({
  ASAAS_MODE: "sandbox",
  CONFENGE_OFFER_SANDBOX_ENABLED: "true",
  CONFENGE_PRODUCTION_CHECKOUT: "true",
});
assert.equal(sandbox.ASAAS_MODE, "sandbox", "DEFER may preserve isolated sandbox work");
assert.equal(sandbox.production_checkout_enabled, false);
assert.equal(sandbox.real_money_mutation_enabled, false);
assert.equal(sandbox.decision_blocked_activation, true, "dangerous intent must remain observable to sandbox guards");

const incompleteExecute = structuredClone(decision);
incompleteExecute.decision_id = "CFG-PILOTO-CHECKOUT-TEST-EXECUTE";
incompleteExecute.decision_state = "EXECUTE";
incompleteExecute.activation_authorized = true;
incompleteExecute.scope.url_decisions[0].decision = "EXECUTE";
assert.equal(decisionGate.productionAuthorized(incompleteExecute, EVIDENCE_OPTIONS), false, "EXECUTE without evidence must fail closed");
assert.ok(decisionGate.validateDecision(incompleteExecute).errors.includes("execute_evidence_incomplete"));

const completeExecute = structuredClone(incompleteExecute);
for (const criterion of completeExecute.reopening_gate.criteria) {
  criterion.status = "PASS";
  criterion.evidence_ref = EXECUTE_EVIDENCE_REF;
  criterion.evidence_sha256 = EXECUTE_EVIDENCE_SHA;
}
completeExecute.execution_authority.canary_offer_id = "CFG-DIAG-EXP-v1";
completeExecute.execution_authority.spend_ceiling_cents = 800000;
completeExecute.execution_authority.evidence_ref = EXECUTE_EVIDENCE_REF;
completeExecute.execution_authority.evidence_sha256 = EXECUTE_EVIDENCE_SHA;
for (const approval of completeExecute.execution_authority.approvals) {
  approval.approver_id = `test-${approval.role.replaceAll("_", "-")}-owner`;
}
completeExecute.execution_authority.approvals.find((row) => row.role === "fiscal_nfse").approver_id = "test-fiscal-owner";
completeExecute.execution_authority.approvals.find((row) => row.role === "delivery_capacity").approver_id = "test-delivery-owner";
assert.equal(decisionGate.productionAuthorized(completeExecute, EVIDENCE_OPTIONS), true, "local versioned evidence may authorize a later execution");
const unguarded = flags.loadFlags(productionEnv, { decision: completeExecute, evidence: EVIDENCE_OPTIONS });
assert.equal(unguarded.ASAAS_MODE, "production");
assert.equal(unguarded.production_checkout_enabled, true);
assert.equal(unguarded.real_money_mutation_enabled, true);

const missingEvidence = structuredClone(completeExecute);
missingEvidence.execution_authority.evidence_ref = "tests/offers/fixtures/piloto-decision/does-not-exist.json";
for (const criterion of missingEvidence.reopening_gate.criteria) criterion.evidence_ref = missingEvidence.execution_authority.evidence_ref;
assert.equal(decisionGate.productionAuthorized(missingEvidence, EVIDENCE_OPTIONS), false, "missing evidence must fail closed");
assert.ok(decisionGate.validateExecutionEvidence(missingEvidence, EVIDENCE_OPTIONS).errors.includes("execute_evidence_missing"));

const digestDrift = structuredClone(completeExecute);
digestDrift.execution_authority.evidence_sha256 = "0".repeat(64);
for (const criterion of digestDrift.reopening_gate.criteria) criterion.evidence_sha256 = digestDrift.execution_authority.evidence_sha256;
assert.equal(decisionGate.productionAuthorized(digestDrift, EVIDENCE_OPTIONS), false, "evidence digest drift must fail closed");

const unversionedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-piloto-evidence-"));
try {
  execFileSync("git", ["init", "-q", unversionedRoot]);
  fs.mkdirSync(path.join(unversionedRoot, "docs/evidence"), { recursive: true });
  fs.copyFileSync(path.join(root, EXECUTE_EVIDENCE_REF), path.join(unversionedRoot, "docs/evidence/execute.json"));
  const unversioned = structuredClone(completeExecute);
  unversioned.execution_authority.evidence_ref = "docs/evidence/execute.json";
  for (const criterion of unversioned.reopening_gate.criteria) criterion.evidence_ref = "docs/evidence/execute.json";
  const check = decisionGate.validateExecutionEvidence(unversioned, {
    root: unversionedRoot,
    requireTracked: true,
    allowSyntheticEvidence: true,
  });
  assert.equal(check.ok, false, "unversioned evidence must fail closed");
  assert.ok(check.errors.includes("execute_evidence_not_versioned"));
} finally {
  fs.rmSync(unversionedRoot, { recursive: true, force: true });
}

const noCanary = structuredClone(completeExecute);
noCanary.execution_authority.canary_offer_id = null;
assert.ok(decisionGate.validateDecision(noCanary).errors.includes("execute_canary_offer_missing"));
const noCeiling = structuredClone(completeExecute);
noCeiling.execution_authority.spend_ceiling_cents = 0;
assert.ok(decisionGate.validateDecision(noCeiling).errors.includes("execute_spend_ceiling_invalid"));
const duplicateApprover = structuredClone(completeExecute);
duplicateApprover.execution_authority.approvals[1].approver_id = duplicateApprover.execution_authority.approvals[0].approver_id;
assert.ok(decisionGate.validateDecision(duplicateApprover).errors.includes("execute_approvers_not_distinct"));

const rollbackDecision = structuredClone(decision);
rollbackDecision.decision_id = "CFG-PILOTO-CHECKOUT-TEST-ROLLBACK";
rollbackDecision.rollback_webhook_receive = {
  authorized: true,
  prior_execute_evidence_ref: EXECUTE_EVIDENCE_REF,
  prior_execute_evidence_sha256: EXECUTE_EVIDENCE_SHA,
  rollback_evidence_ref: ROLLBACK_EVIDENCE_REF,
  rollback_evidence_sha256: ROLLBACK_EVIDENCE_SHA,
};
assert.equal(decisionGate.rollbackWebhookReceiveAuthorized(rollbackDecision, EVIDENCE_OPTIONS), true);
assert.equal(decisionGate.productionAuthorized(rollbackDecision, EVIDENCE_OPTIONS), false);
const rollbackDigestDrift = structuredClone(rollbackDecision);
rollbackDigestDrift.rollback_webhook_receive.rollback_evidence_sha256 = "f".repeat(64);
assert.equal(decisionGate.rollbackWebhookReceiveAuthorized(rollbackDigestDrift, EVIDENCE_OPTIONS), false);

const piiExecute = structuredClone(completeExecute);
piiExecute.analytics.pii_allowlist = ["email"];
assert.equal(decisionGate.productionAuthorized(piiExecute, EVIDENCE_OPTIONS), false, "PII analytics must invalidate EXECUTE");
assert.ok(decisionGate.validateDecision(piiExecute).errors.includes("analytics_contract_invalid"));

const unsafeSunset = structuredClone(decision);
unsafeSunset.decision_state = "SUNSET";
for (const row of unsafeSunset.scope.url_decisions) row.decision = "RETIRE";
unsafeSunset.scope.url_decisions[0] = { url: "/piloto/", decision: "REDIRECT", destination: "/" };
assert.equal(decisionGate.validateDecision(unsafeSunset).ok, false, "blanket home redirects must be rejected");
assert.ok(decisionGate.validateDecision(unsafeSunset).errors.includes("sunset_redirect_invalid"));

const flagsBefore = fs.readFileSync(path.join(root, "data/offers/flags.json"));
assert.equal(
  decision.scope.defer_flags_sha256,
  "afa4be12f2b9ceb0693cee5e36253aca161b92df40d93678b019d7ee4e629b08",
);
assert.equal(flagsBefore.toString("utf8"), `{
  "schema": "confenge.offer-flags/1.0",
  "CONFENGE_OFFER_CATALOG_PUBLIC": false,
  "ASAAS_MODE": "disabled",
  "production_checkout_enabled": false,
  "production_webhook_enabled": false,
  "real_money_mutation_enabled": false
}
`, "data/offers/flags.json must remain bit-for-bit unchanged");

console.log("piloto decision gate passed");
