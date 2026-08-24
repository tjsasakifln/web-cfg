import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const decisionGate = require(path.join(root, "scripts/offers/piloto-decision.cjs"));
const flags = require(path.join(root, "scripts/offers/flags.cjs"));
const productionConfig = require(path.join(root, "scripts/offers/providers/config-production.cjs"));

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

const sandbox = flags.loadFlags({
  ASAAS_MODE: "sandbox",
  CONFENGE_OFFER_SANDBOX_ENABLED: "true",
  CONFENGE_PRODUCTION_CHECKOUT: "true",
});
assert.equal(sandbox.ASAAS_MODE, "sandbox", "DEFER may preserve isolated sandbox work");
assert.equal(sandbox.production_checkout_enabled, false);
assert.equal(sandbox.real_money_mutation_enabled, false);
assert.equal(sandbox.decision_blocked_activation, true, "dangerous intent must remain observable to sandbox guards");

const forgedExecute = structuredClone(decision);
forgedExecute.decision_state = "EXECUTE";
forgedExecute.activation_authorized = true;
forgedExecute.scope.url_decisions[0].decision = "EXECUTE";
for (const criterion of forgedExecute.reopening_gate.criteria) {
  criterion.status = "PASS";
  criterion.evidence_ref = "docs/evidence/forged.json";
  criterion.evidence_sha256 = "a".repeat(64);
}
forgedExecute.execution_authority = {
  canary_offer_id: "CFG-DIAG-EXP-v1",
  spend_ceiling_cents: 800000,
  individual_charge_approval_required: true,
};
forgedExecute.production_evidence = true;
const forgedValidation = decisionGate.validateDecision(forgedExecute);
assert.equal(forgedValidation.ok, false, "schema 1.0 must never become executable by editing data");
assert.ok(forgedValidation.errors.includes("execute_requires_separate_authority_schema"));
assert.equal(decisionGate.productionAuthorized(forgedExecute), false);
assert.equal(flags.loadFlags(productionEnv).ASAAS_MODE, "disabled");

const missingProductionEvidence = structuredClone(forgedExecute);
delete missingProductionEvidence.production_evidence;
assert.equal(decisionGate.productionAuthorized(missingProductionEvidence), false);

const piiExecute = structuredClone(forgedExecute);
piiExecute.analytics.pii_allowlist = ["email"];
assert.equal(decisionGate.productionAuthorized(piiExecute), false, "PII analytics must never authorize EXECUTE");
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
