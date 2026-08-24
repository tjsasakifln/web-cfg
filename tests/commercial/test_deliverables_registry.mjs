/**
 * Fail-closed gate for the cumulative deliverables catalogue (#329 family).
 *
 * The registry is the auditable commercial source. This gate proves the
 * invariants a reviewer cannot hold in their head: frozen prices, package
 * arithmetic, pilot prices that cannot reach checkout, blocked items that
 * cannot be published, credits that cannot stack, and evidence that cannot be
 * asserted without a record. It deliberately does not prove that a customer
 * exists or that a price is validated.
 */

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const lib = require(path.join(root, "scripts/commercial/deliverables.cjs"));

const results = [];
function assert(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) console.error("FAIL", name, detail === undefined ? "" : JSON.stringify(detail));
}

const registry = lib.loadRegistry();
const protocol = lib.loadProtocol();
const firstFold = lib.loadFirstFoldContract();
const realProof = lib.loadRealProofRegistry();
const offerSnapshot = lib.loadOfferSnapshot();

const entries = registry.deliverables;
const byId = new Map(entries.map((entry) => [entry.deliverable_id, entry]));
const containerIds = new Set(registry.containers.map((container) => container.container_id));

function brl(cents) {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function routeFile(route) {
  if (route === "/") return path.join(root, "index.html");
  return path.join(root, route.replace(/^\//, "").replace(/\/$/, ""), "index.html");
}

// ---------------------------------------------------------------- shape

assert("schema_id", registry.schema === "confenge.deliverables-registry/1.0", registry.schema);
assert("registry_version_present", typeof registry.registry_version === "string" && registry.registry_version.length > 0);
assert("ids_unique", byId.size === entries.length, { ids: byId.size, entries: entries.length });

// #329: catalog_count is derived from the registry, never hand-written per page.
assert("catalog_count_derived", registry.catalog_count === entries.length, { declared: registry.catalog_count, actual: entries.length });
assert("container_count_derived", registry.container_count === registry.containers.length, {
  declared: registry.container_count,
  actual: registry.containers.length,
});

// The catalogue is taxative: numbering runs 01..N with no gap and no duplicate.
const numbers = entries.map((entry) => entry.catalog_number);
const expectedNumbers = Array.from({ length: entries.length }, (_, i) => String(i + 1).padStart(2, "0"));
assert("catalog_numbers_contiguous", JSON.stringify(numbers) === JSON.stringify(expectedNumbers), numbers);
for (const entry of entries) {
  assert(`id_matches_number_${entry.deliverable_id}`, entry.deliverable_id === `CFG-D${entry.catalog_number}`, entry.deliverable_id);
}

for (const entry of entries) {
  const missing = lib.REQUIRED_FIELDS.filter((field) => !(field in entry));
  assert(`fields_${entry.deliverable_id}`, missing.length === 0, missing);
  assert(`lifecycle_${entry.deliverable_id}`, lib.LIFECYCLE_STAGES.includes(entry.lifecycle_stage), entry.lifecycle_stage);
  assert(`public_state_${entry.deliverable_id}`, lib.PUBLISHED_STATES.has(entry.public_state), entry.public_state);
  assert(`price_state_${entry.deliverable_id}`, lib.PRICE_STATES.has(entry.price_state), entry.price_state);
  assert(`market_fit_state_${entry.deliverable_id}`, lib.MARKET_FIT_STATES.has(entry.market_fit.state), entry.market_fit.state);
  assert(`decision_question_${entry.deliverable_id}`, /\?$/.test(entry.decision_question), entry.decision_question);
  assert(`trigger_${entry.deliverable_id}`, typeof entry.trigger === "string" && entry.trigger.length > 10, entry.trigger);
  assert(`inputs_${entry.deliverable_id}`, entry.required_inputs.length > 0);
  assert(`outputs_${entry.deliverable_id}`, entry.included_outputs.length > 0);
  assert(`exclusions_${entry.deliverable_id}`, entry.exclusions.length > 0);
  assert(`data_owner_${entry.deliverable_id}`, entry.data_contract.owner === "extra-cli", entry.data_contract.owner);
  assert(
    `offer_container_resolves_${entry.deliverable_id}`,
    entry.offer_container === "none" || containerIds.has(entry.offer_container),
    entry.offer_container
  );
  assert(
    `evidence_grades_${entry.deliverable_id}`,
    JSON.stringify(entry.data_contract.evidence_grades) === JSON.stringify(lib.EVIDENCE_GRADES),
    entry.data_contract.evidence_grades
  );
  // #329 rule 7: scope is bounded by object, not by page count.
  const scopeText = JSON.stringify(entry.scope).toLowerCase();
  assert(`scope_not_page_limited_${entry.deliverable_id}`, !/limitad\w* (a|por) \d+ p[áa]ginas/.test(scopeText), entry.scope);
}

// -------------------------------------------------- frozen published prices

for (const [id, cents] of Object.entries(lib.FROZEN_PUBLISHED_PRICES_CENTS)) {
  const entry = byId.get(id);
  assert(`frozen_present_${id}`, Boolean(entry), id);
  if (!entry) continue;
  assert(`frozen_cents_${id}`, lib.entryAmountCents(entry) === cents, { got: lib.entryAmountCents(entry), want: cents });
  assert(`frozen_price_state_${id}`, entry.price_state === "PUBLISHED_FIRM", entry.price_state);
  assert(`frozen_public_state_${id}`, entry.public_state === "PUBLISHED", entry.public_state);
  assert(`frozen_route_${id}`, typeof entry.route === "string" && entry.route.length > 1, entry.route);
}

const packageSum = lib.PACKAGE_MEMBERS.reduce((total, id) => total + lib.entryAmountCents(byId.get(id)), 0);
assert("package_unbundled_sum", packageSum === lib.PACKAGE_UNBUNDLED_SUM_CENTS, { got: packageSum, want: lib.PACKAGE_UNBUNDLED_SUM_CENTS });

const expansion = lib.containerById(registry, "expansion_package");
assert("expansion_amount", expansion.amount_cents === lib.PACKAGE_AMOUNT_CENTS, expansion.amount_cents);
assert("expansion_declared_sum", expansion.unbundled_sum_cents === lib.PACKAGE_UNBUNDLED_SUM_CENTS, expansion.unbundled_sum_cents);
assert(
  "expansion_members",
  JSON.stringify(expansion.composes_deliverables) === JSON.stringify(lib.PACKAGE_MEMBERS),
  expansion.composes_deliverables
);
assert("expansion_credit_window", expansion.credit_window_days === 60, expansion.credit_window_days);
assert("expansion_credit_not_stackable", expansion.credit_stackable === false, expansion.credit_stackable);

// #331: unit 01 stays outside the package and generates no credit.
const unit01 = byId.get("CFG-D01");
assert("unit01_no_credit", unit01.credit_rule === null, unit01.credit_rule);
assert("unit01_no_container", unit01.offer_container === "none", unit01.offer_container);
assert("unit01_not_in_package", !expansion.composes_deliverables.includes("CFG-D01"));

// ------------------------------------------------------- published HTML parity

const entregasHtml = fs.readFileSync(path.join(root, "entregas/index.html"), "utf8");
for (const [id, cents] of Object.entries(lib.FROZEN_PUBLISHED_PRICES_CENTS)) {
  assert(`html_price_${id}`, entregasHtml.includes(brl(cents)), brl(cents));
}
assert("html_unbundled_sum", entregasHtml.includes(brl(lib.PACKAGE_UNBUNDLED_SUM_CENTS)), brl(lib.PACKAGE_UNBUNDLED_SUM_CENTS));
assert("html_package_amount", entregasHtml.includes(brl(lib.PACKAGE_AMOUNT_CENTS)), brl(lib.PACKAGE_AMOUNT_CENTS));

for (const entry of entries) {
  if (!entry.route) continue;
  assert(`route_exists_${entry.deliverable_id}`, fs.existsSync(routeFile(entry.route)), entry.route);
}

// --------------------------------------------------- container parity with #88

const snapshotById = new Map(offerSnapshot.offers.map((offer) => [offer.offer_id, offer]));
for (const container of registry.containers) {
  if (!container.offer_id) continue;
  const offer = snapshotById.get(container.offer_id);
  assert(`offer_known_${container.container_id}`, Boolean(offer), container.offer_id);
  if (!offer) continue;
  assert(`offer_cents_${container.container_id}`, offer.amount_cents === container.amount_cents, {
    snapshot: offer.amount_cents,
    registry: container.amount_cents,
  });
  if ("commitment_months" in container) {
    assert(`offer_commitment_${container.container_id}`, offer.commitment_months === container.commitment_months, {
      snapshot: offer.commitment_months,
      registry: container.commitment_months,
    });
  }
  if ("total_commitment_cents" in container) {
    assert(`offer_total_${container.container_id}`, offer.total_commitment_cents === container.total_commitment_cents, {
      snapshot: offer.total_commitment_cents,
      registry: container.total_commitment_cents,
    });
  }
}

// ------------------------------------------------------------- fail-closed

for (const entry of entries) {
  // #88 owns money. No registry entry may open checkout on its own.
  assert(`checkout_closed_${entry.deliverable_id}`, entry.checkout_enabled === false, entry.checkout_enabled);
  if (Number(entry.catalog_number) >= 9) {
    assert(`pilot_price_state_${entry.deliverable_id}`, entry.price_state === "PILOT_HYPOTHESIS", entry.price_state);
    assert(`pilot_not_published_${entry.deliverable_id}`, entry.public_state !== "PUBLISHED", entry.public_state);
    assert(`pilot_not_promoted_${entry.deliverable_id}`, entry.market_fit.state !== "PROMOTE", entry.market_fit.state);
  }
  if (entry.public_state === "BLOCKED") {
    assert(`blocked_issue_${entry.deliverable_id}`, typeof entry.blocking_issue === "string" && /^#\d+$/.test(entry.blocking_issue), entry.blocking_issue);
    assert(`blocked_no_route_${entry.deliverable_id}`, entry.route === null, entry.route);
    assert(`blocked_no_lead_${entry.deliverable_id}`, entry.lead_destination === null, entry.lead_destination);
    assert(`blocked_no_credit_${entry.deliverable_id}`, entry.credit_rule === null, entry.credit_rule);
  } else {
    assert(`unblocked_no_issue_${entry.deliverable_id}`, entry.blocking_issue === null, entry.blocking_issue);
  }
  // Anything sellable must know where the lead goes (#329 rule 5).
  if (lib.isPriced(entry) && entry.public_state !== "BLOCKED") {
    assert(`lead_destination_${entry.deliverable_id}`, entry.lead_destination === "warmbly:CONFENGE_WEB", entry.lead_destination);
    assert(`analytics_attr_${entry.deliverable_id}`, entry.analytics.deliverable_attr === entry.deliverable_id, entry.analytics);
  }
}

const blocked11 = byId.get("CFG-D11");
assert("d11_blocked_by_156", blocked11.public_state === "BLOCKED" && blocked11.blocking_issue === "#156", {
  state: blocked11.public_state,
  issue: blocked11.blocking_issue,
});

// ------------------------------------------------------------- credit rules

for (const entry of entries) {
  const rule = entry.credit_rule;
  if (!rule) continue;
  assert(`credit_not_stackable_${entry.deliverable_id}`, rule.stackable === false, rule.stackable);
  assert(`credit_window_${entry.deliverable_id}`, rule.window_days > 0 && rule.window_days <= lib.MAX_CREDIT_WINDOW_DAYS, rule.window_days);
  assert(`credit_basis_${entry.deliverable_id}`, rule.basis === "highest_single_paid", rule.basis);
  assert(`credit_cap_${entry.deliverable_id}`, rule.max_cents > 0 && rule.max_cents <= lib.entryAmountCents(entry), {
    cap: rule.max_cents,
    price: lib.entryAmountCents(entry),
  });
  assert(`credit_targets_${entry.deliverable_id}`, rule.credits_into.length > 0, rule.credits_into);
  const unknown = rule.credits_into.filter((target) => !byId.has(target) && !containerIds.has(target));
  assert(`credit_targets_resolve_${entry.deliverable_id}`, unknown.length === 0, unknown);
  assert(`credit_no_self_${entry.deliverable_id}`, !rule.credits_into.includes(entry.deliverable_id), rule.credits_into);
  // #331 keeps the 60-day package rule exactly as published.
  if (entry.offer_container === "expansion_package") {
    assert(`credit_package_window_${entry.deliverable_id}`, rule.window_days === 60, rule.window_days);
  }
}

// ------------------------------------------------------- lifecycle grouping

const stageCounts = { DISCOVER: 0, DECIDE: 0, PROTECT: 0, OPERATE: 0 };
for (const entry of entries) stageCounts[entry.lifecycle_stage] += 1;
// #335: every item belongs to exactly one moment of the cycle, and every moment is used.
const stageTotal = Object.values(stageCounts).reduce((total, count) => total + count, 0);
assert("stage_covers_catalogue", stageTotal === entries.length, { stageTotal, entries: entries.length });
assert("stage_none_empty", Object.values(stageCounts).every((count) => count > 0), stageCounts);

const stageMeta = new Map(registry.lifecycle_stages.map((stage) => [stage.stage, stage]));
assert("stage_meta_complete", lib.LIFECYCLE_STAGES.every((stage) => stageMeta.has(stage)), [...stageMeta.keys()]);
for (const [stage, count] of Object.entries(stageCounts)) {
  const meta = stageMeta.get(stage);
  // #335: no track shows more than seven options without progressive disclosure.
  if (count > lib.MAX_OPTIONS_WITHOUT_DISCLOSURE) {
    assert(`stage_disclosure_${stage}`, meta.requires_progressive_disclosure === true, { count, meta });
  }
  assert(`stage_question_${stage}`, /\?$/.test(meta.decision_question), meta.decision_question);
}

// ------------------------------------------------------------------- claims

const claimFindings = lib.scanForbiddenClaims(registry, "registry");
assert("no_forbidden_claims_registry", claimFindings.length === 0, claimFindings);
const protocolClaims = lib.scanForbiddenClaims(protocol, "protocol");
assert("no_forbidden_claims_protocol", protocolClaims.length === 0, protocolClaims);

// ------------------------------------------------------- market-fit protocol

assert("protocol_not_started", protocol.state === "NOT_STARTED", protocol.state);
assert("protocol_runs_empty", Array.isArray(protocol.runs) && protocol.runs.length === 0, protocol.runs);

const phase1 = protocol.phases.find((phase) => phase.phase === 1);
const quotaSum = phase1.quotas.reduce((total, quota) => total + quota.minimum, 0);
assert("protocol_sample", phase1.minimum_sample === 12, phase1.minimum_sample);
assert("protocol_quota_sum", quotaSum === phase1.minimum_sample, { quotaSum, minimum: phase1.minimum_sample });

const phase2 = protocol.phases.find((phase) => phase.phase === 2);
assert("protocol_card_sort_covers_catalogue", phase2.cards === entries.length, { cards: phase2.cards, entries: entries.length });

const phase3 = protocol.phases.find((phase) => phase.phase === 3);
for (const offer of phase3.founder_led_offers) {
  const entry = byId.get(offer.deliverable_id);
  assert(`wtp_known_${offer.deliverable_id}`, Boolean(entry), offer.deliverable_id);
  if (!entry) continue;
  assert(`wtp_price_${offer.deliverable_id}`, lib.entryAmountCents(entry) === offer.amount_cents, {
    protocol: offer.amount_cents,
    registry: lib.entryAmountCents(entry),
  });
}

assert(
  "protocol_funnel",
  JSON.stringify(protocol.instrumentation.funnel) ===
    JSON.stringify(["view", "detail", "example", "handraise", "qco", "proposal", "paid", "delivered", "outcome", "expansion"]),
  protocol.instrumentation.funnel
);
assert("protocol_no_pii", protocol.instrumentation.pii_in_analytics === false);
assert("protocol_not_crm", protocol.instrumentation.web_cfg_is_crm === false);

// Nothing may claim promotion without the evidence the protocol requires.
for (const entry of entries) {
  const verdict = lib.evaluatePromotion(entry, protocol);
  if (entry.market_fit.state === "PROMOTE") {
    assert(`promotion_backed_${entry.deliverable_id}`, verdict.eligible, verdict.reasons);
  } else {
    assert(`promotion_withheld_${entry.deliverable_id}`, !verdict.eligible, verdict.reasons);
  }
}

// ---------------------------------------------------- first-fold contract #327

assert(
  "first_fold_answers",
  JSON.stringify(firstFold.required_answers.map((answer) => answer.key)) ===
    JSON.stringify(["what", "who", "why_believe", "next_action"]),
  firstFold.required_answers
);
assert("first_fold_sessions_pending", firstFold.human_validation.state === "NOT_STARTED", firstFold.human_validation);
assert("first_fold_min_sessions", firstFold.human_validation.minimum_icp_sessions === 5, firstFold.human_validation);

const censusRoutes = new Set(firstFold.census.map((surface) => surface.route));
for (const surface of firstFold.census) {
  assert(`census_route_exists_${surface.route}`, fs.existsSync(routeFile(surface.route)), surface.route);
  assert(`census_state_${surface.route}`, firstFold.evidence_states.includes(surface.evidence_state), surface.evidence_state);
  if (surface.evidence_state === "PENDING") {
    assert(`census_pending_unmeasured_${surface.route}`, surface.measurement === null, surface.measurement);
  } else {
    assert(`census_measured_has_record_${surface.route}`, surface.measurement && surface.measurement.date, surface.measurement);
  }
}
for (const entry of entries) {
  if (!entry.route || !lib.isPriced(entry)) continue;
  assert(`census_covers_${entry.deliverable_id}`, censusRoutes.has(entry.route), entry.route);
}

// ------------------------------------------------------- real proof gate #328

assert("real_proof_blocked", realProof.state === "BLOCKED_EXTERNAL", realProof.state);
assert("real_proof_no_entries", realProof.entries.length === 0, realProof.entries.length);
assert("real_proof_consent_fields", realProof.required_consent_fields.length === 6, realProof.required_consent_fields);
for (const entry of realProof.entries) {
  const missing = realProof.required_consent_fields.filter((field) => !entry[field]);
  assert(`real_proof_consent_${entry.id || "unnamed"}`, missing.length === 0, missing);
}

// No money surface may carry review or rating markup while zero real cases exist.
const reviewPattern = /"@type"\s*:\s*"(Review|AggregateRating)"/;
for (const surface of firstFold.census) {
  const file = routeFile(surface.route);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, "utf8");
  assert(`no_review_schema_${surface.route}`, !reviewPattern.test(html), surface.route);
}

// ------------------------------------------------------------------ report

const failed = results.filter((result) => !result.ok);
console.log(`deliverables-registry: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`FAILED ${failed.length} checks`);
  process.exit(1);
}
