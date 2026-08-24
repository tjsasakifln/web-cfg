import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
assert.equal(decision.review_on, "2026-09-20");
assert.equal(decision.owner, "tiago-jun-sasaki");
assert.equal(decision.scope.url_decisions.length, 24);
assert.equal(decisionGate.productionAuthorized(decision), false);

const repoState = decisionGate.validateRepository(root, decision, { today: "2026-08-24" });
assert.equal(repoState.ok, true, repoState.errors.join(", "));
const overdue = decisionGate.validateRepository(root, decision, { today: "2026-09-21" });
assert.equal(overdue.ok, false, "an expired DEFER must force a new review");
assert.ok(overdue.errors.includes("defer_review_overdue"));
const invalidToday = decisionGate.validateRepository(root, decision, { today: "not-a-date" });
assert.equal(invalidToday.ok, false);
assert.ok(invalidToday.errors.includes("validation_date_invalid"));

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

const guardedUnknowns = decisionGate.applyDecisionGuard({
  ASAAS_MODE: "production",
  legal_authority_hash: "sha256:stale",
  customer_email: "person@example.invalid",
});
assert.equal(guardedUnknowns.legal_authority_hash, "");
assert.equal(guardedUnknowns.decision_blocked_activation, true);
assert.equal(Object.hasOwn(guardedUnknowns, "customer_email"), false, "guard output must be schema-closed");

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
assert.ok(decisionGate.validateDecision(unsafeSunset).errors.includes("decision_state_not_defer"));
assert.ok(decisionGate.validateDecision(unsafeSunset).errors.includes("url_decision_schema_invalid:0"));

const unknownTopLevel = structuredClone(decision);
unknownTopLevel.customer_email = "person@example.invalid";
assert.ok(decisionGate.validateDecision(unknownTopLevel).errors.includes("decision_schema_not_closed"));

const impossibleDate = structuredClone(decision);
impossibleDate.decided_on = "2026-02-30";
assert.ok(decisionGate.validateDecision(impossibleDate).errors.includes("decision_dates_invalid"));

const genericOwner = structuredClone(decision);
genericOwner.owner = "CONFENGE founder";
assert.ok(decisionGate.validateDecision(genericOwner).errors.includes("owner_not_authorized"));

const lateReview = structuredClone(decision);
lateReview.review_on = "2026-09-21";
assert.ok(decisionGate.validateDecision(lateReview).errors.includes("decision_calendar_drift"));
assert.ok(decisionGate.validateDecision(lateReview).errors.includes("time_to_evidence_mismatch"));

const forgedCriterion = structuredClone(decision);
forgedCriterion.reopening_gate.criteria[0].status = "PASS";
forgedCriterion.reopening_gate.criteria[0].evidence_ref = "docs/evidence/unverified.json";
assert.ok(
  decisionGate.validateDecision(forgedCriterion).errors.includes("reopening_criterion_drift:parent-88-execute"),
);

const traversalUrl = structuredClone(decision);
traversalUrl.scope.url_decisions[0].url = "/piloto/../../private/";
assert.ok(decisionGate.validateDecision(traversalUrl).errors.includes("url_decision_drift:0"));

const runtimeDrift = structuredClone(decision);
runtimeDrift.analytics.new_runtime_while_deferred = true;
assert.ok(decisionGate.validateDecision(runtimeDrift).errors.includes("analytics_contract_invalid"));

const indexabilityRoot = fs.mkdtempSync(path.join(os.tmpdir(), "piloto-decision-indexability-"));
try {
  fs.cpSync(path.join(root, "piloto"), path.join(indexabilityRoot, "piloto"), { recursive: true });
  fs.mkdirSync(path.join(indexabilityRoot, "data/offers"), { recursive: true });
  for (const file of ["flags.json", "provider-mapping.json"]) {
    fs.copyFileSync(path.join(root, "data/offers", file), path.join(indexabilityRoot, "data/offers", file));
  }
  fs.copyFileSync(path.join(root, "robots.txt"), path.join(indexabilityRoot, "robots.txt"));
  fs.copyFileSync(path.join(root, "_headers"), path.join(indexabilityRoot, "_headers"));

  const indexPath = path.join(indexabilityRoot, "piloto/index.html");
  const indexHtml = fs.readFileSync(indexPath, "utf8");
  const deceptiveRobots = indexHtml.replace(
    /<meta\b[^>]*name=["']robots["'][^>]*>/i,
    '<meta name="robots" content="index" data-content="noindex">',
  );
  assert.notEqual(deceptiveRobots, indexHtml, "fixture must replace the real robots tag");
  fs.writeFileSync(indexPath, deceptiveRobots);
  const deceptiveResult = decisionGate.validateRepository(indexabilityRoot, decision, { today: "2026-08-24" });
  assert.ok(deceptiveResult.errors.includes("piloto_noindex_missing:index.html"));

  const headers = fs.readFileSync(path.join(indexabilityRoot, "_headers"), "utf8");
  const unsafeHeaders = headers.replace(
    "/piloto/ofertas/*\n  X-Robots-Tag: noindex, nofollow",
    "/piloto/ofertas/*\n  X-Robots-Tag: index, follow",
  );
  assert.notEqual(unsafeHeaders, headers, "fixture must replace the offer header block");
  fs.writeFileSync(path.join(indexabilityRoot, "_headers"), unsafeHeaders);
  const headerResult = decisionGate.validateRepository(indexabilityRoot, decision, { today: "2026-08-24" });
  assert.ok(headerResult.errors.includes("offer_headers_noindex_missing"));
} finally {
  fs.rmSync(indexabilityRoot, { recursive: true, force: true });
}

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
