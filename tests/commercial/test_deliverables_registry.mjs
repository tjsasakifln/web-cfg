/**
 * Fail-closed gate for the taxative deliverables catalogue (#329 family).
 *
 * The registry is the auditable commercial source. This gate proves the
 * invariants a reviewer cannot hold in their head: frozen prices, package
 * arithmetic, pilot prices that cannot reach checkout, blocked items that
 * cannot be published, credits that cannot stack, names that cannot drift from
 * their authority, and evidence that cannot be asserted without a record.
 *
 * It deliberately does not prove that a customer exists or that a price is
 * validated. Those need observed evidence, not a test.
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
  const id = entry.deliverable_id;
  const missing = lib.REQUIRED_FIELDS.filter((field) => !(field in entry));
  assert(`fields_${id}`, missing.length === 0, missing);
  assert(`id_matches_number_${id}`, id === `CFG-D${entry.catalog_number}`, id);
  assert(`task_door_${id}`, lib.TASK_DOORS.includes(entry.task_door), entry.task_door);
  assert(`public_state_${id}`, lib.PUBLIC_STATES.has(entry.public_state), entry.public_state);
  assert(`price_state_${id}`, lib.PRICE_STATES.has(entry.price_state), entry.price_state);
  assert(`name_state_${id}`, lib.NAME_STATES.has(entry.name_state), entry.name_state);
  assert(`market_fit_state_${id}`, lib.MARKET_FIT_STATES.has(entry.market_fit.state), entry.market_fit.state);
  assert(`decision_question_${id}`, /\?$/.test(entry.decision_question), entry.decision_question);
  assert(`trigger_${id}`, typeof entry.trigger === "string" && entry.trigger.length > 10, entry.trigger);
  assert(`inputs_${id}`, entry.required_inputs.length > 0);
  assert(`outputs_${id}`, entry.included_outputs.length > 0);
  assert(`exclusions_${id}`, entry.exclusions.length > 0);
  assert(`data_owner_${id}`, entry.data_contract.owner === "extra-cli", entry.data_contract.owner);
  assert(
    `evidence_grades_${id}`,
    JSON.stringify(entry.data_contract.evidence_grades) === JSON.stringify(lib.EVIDENCE_GRADES),
    entry.data_contract.evidence_grades
  );
  assert(
    `offer_container_resolves_${id}`,
    entry.offer_container === "none" || containerIds.has(entry.offer_container),
    entry.offer_container
  );
  assert(`priced_${id}`, lib.isPriced(entry), entry.price);
  // #329 rule 7: scope is bounded by object, not by page count.
  const scopeText = JSON.stringify(entry.scope).toLowerCase();
  assert(`scope_not_page_limited_${id}`, !/limitad\w* (a|por) \d+ p[áa]ginas/.test(scopeText), entry.scope);
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
const expansionPlan = expansion.plans[0];
assert("expansion_amount", expansionPlan.amount_cents === lib.PACKAGE_AMOUNT_CENTS, expansionPlan.amount_cents);
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
  // The published page still carries the name the registry records as current.
  assert(`html_name_${id}`, entregasHtml.includes(byId.get(id).public_name), byId.get(id).public_name);
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
  assert(`container_has_plans_${container.container_id}`, container.plans.length > 0, container.container_id);
  assert(`container_route_${container.container_id}`, fs.existsSync(routeFile(container.route)), container.route);
  for (const plan of container.plans) {
    const offer = snapshotById.get(plan.offer_id);
    assert(`offer_known_${plan.plan_id}`, Boolean(offer), plan.offer_id);
    if (!offer) continue;
    assert(`offer_cents_${plan.plan_id}`, offer.amount_cents === plan.amount_cents, {
      snapshot: offer.amount_cents,
      registry: plan.amount_cents,
    });
    assert(`offer_commitment_${plan.plan_id}`, offer.commitment_months === plan.commitment_months, {
      snapshot: offer.commitment_months,
      registry: plan.commitment_months,
    });
    assert(`offer_total_${plan.plan_id}`, offer.total_commitment_cents === plan.total_commitment_cents, {
      snapshot: offer.total_commitment_cents,
      registry: plan.total_commitment_cents,
    });
  }
}
// Every approved money offer must be reachable from the registry.
const registryOfferIds = new Set(registry.containers.flatMap((c) => c.plans.map((p) => p.offer_id)));
for (const offer of offerSnapshot.offers) {
  assert(`snapshot_offer_mapped_${offer.offer_id}`, registryOfferIds.has(offer.offer_id), offer.offer_id);
}

// ------------------------------------------------------------- fail-closed

for (const entry of entries) {
  const id = entry.deliverable_id;
  // #88 owns money. No registry entry may open checkout on its own.
  assert(`checkout_closed_${id}`, entry.checkout_enabled === false, entry.checkout_enabled);
  if (Number(entry.catalog_number) >= 9) {
    assert(`pilot_price_state_${id}`, entry.price_state === "PILOT_HYPOTHESIS", entry.price_state);
    assert(`pilot_not_published_${id}`, entry.public_state !== "PUBLISHED", entry.public_state);
    assert(`pilot_not_promoted_${id}`, entry.market_fit.state !== "PROMOTE", entry.market_fit.state);
  }
  if (entry.public_state === "BLOCKED") {
    assert(`blocked_issue_${id}`, typeof entry.blocking_issue === "string" && /^#\d+$/.test(entry.blocking_issue), entry.blocking_issue);
    assert(`blocked_no_route_${id}`, entry.route === null, entry.route);
    assert(`blocked_no_lead_${id}`, entry.lead_destination === null, entry.lead_destination);
    assert(`blocked_no_credit_${id}`, entry.credit_rule === null, entry.credit_rule);
  } else {
    assert(`unblocked_no_issue_${id}`, entry.blocking_issue === null, entry.blocking_issue);
    assert(`lead_destination_${id}`, entry.lead_destination === "warmbly:CONFENGE_WEB", entry.lead_destination);
    assert(`analytics_attr_${id}`, entry.analytics.deliverable_attr === id, entry.analytics);
  }
}

// #332 and #342: both integrity items stay blocked until #156 proves coverage.
for (const id of ["CFG-D11", "CFG-D43"]) {
  const entry = byId.get(id);
  assert(`blocked_by_156_${id}`, entry.public_state === "BLOCKED" && entry.blocking_issue === "#156", {
    state: entry.public_state,
    issue: entry.blocking_issue,
  });
}

// ------------------------------------------------------------- credit rules

for (const entry of entries) {
  const rule = entry.credit_rule;
  if (!rule) continue;
  const id = entry.deliverable_id;
  assert(`credit_not_stackable_${id}`, rule.stackable === false, rule.stackable);
  assert(`credit_window_${id}`, rule.window_days > 0 && rule.window_days <= lib.MAX_CREDIT_WINDOW_DAYS, rule.window_days);
  assert(`credit_basis_${id}`, rule.basis === "highest_single_paid", rule.basis);
  assert(`credit_cap_${id}`, rule.max_cents > 0 && rule.max_cents <= lib.entryAmountCents(entry), {
    cap: rule.max_cents,
    price: lib.entryAmountCents(entry),
  });
  assert(`credit_targets_${id}`, rule.credits_into.length > 0, rule.credits_into);
  const unknown = rule.credits_into.filter((target) => !byId.has(target) && !containerIds.has(target));
  assert(`credit_targets_resolve_${id}`, unknown.length === 0, unknown);
  assert(`credit_no_self_${id}`, !rule.credits_into.includes(id), rule.credits_into);
  // #331 keeps the 60-day package rule exactly as published.
  if (entry.offer_container === "expansion_package") {
    assert(`credit_package_window_${id}`, rule.window_days === 60, rule.window_days);
  }
}

// #329 rules 2, 3 and 4 live in the registry, not only in prose.
assert("common_urgency_surcharge", registry.common_rules.urgency_surcharge_pct === 50, registry.common_rules);
assert("common_no_success_fee", registry.common_rules.success_fee_allowed === false, registry.common_rules);
assert("common_no_stacking", registry.common_rules.credit_stacking_allowed === false, registry.common_rules);
assert("common_not_page_limited", registry.common_rules.scope_limited_by_pages === false, registry.common_rules);
assert("common_checkout_authority", registry.common_rules.checkout_authority === "#88", registry.common_rules);
assert("common_data_authority", registry.common_rules.data_authority === "extra-cli", registry.common_rules);

// --------------------------------------------------- task doors, #335 primary nav

const doorMeta = new Map(registry.task_doors.map((door) => [door.door, door]));
assert("doors_complete", lib.TASK_DOORS.every((door) => doorMeta.has(door)), [...doorMeta.keys()]);
assert("doors_count", registry.task_doors.length === lib.TASK_DOORS.length, registry.task_doors.length);

const membership = new Map();
for (const door of registry.task_doors) {
  assert(`door_order_${door.door}`, Number.isInteger(door.order) && door.order >= 1 && door.order <= 7, door.order);
  assert(`door_question_${door.door}`, /\?$/.test(door.decision_question), door.decision_question);
  for (const id of door.members) {
    assert(`door_member_known_${id}`, byId.has(id), id);
    // #335: each item appears exactly once in the primary navigation.
    assert(`door_member_unique_${id}`, !membership.has(id), { first: membership.get(id), second: door.door });
    membership.set(id, door.door);
  }
  // #335: no more than six options on one screen before subgroup or filter.
  if (door.members.length > lib.MAX_OPTIONS_WITHOUT_DISCLOSURE) {
    assert(`door_disclosure_${door.door}`, door.requires_progressive_disclosure === true, {
      count: door.members.length,
      declared: door.requires_progressive_disclosure,
    });
  } else {
    assert(`door_no_disclosure_${door.door}`, door.requires_progressive_disclosure === false, door.requires_progressive_disclosure);
  }
}
assert("doors_cover_catalogue", membership.size === entries.length, { covered: membership.size, entries: entries.length });
for (const entry of entries) {
  assert(`door_matches_${entry.deliverable_id}`, membership.get(entry.deliverable_id) === entry.task_door, {
    door_members: membership.get(entry.deliverable_id),
    entry: entry.task_door,
  });
}

// ------------------------------------------------- deadline gates and boundaries

// Only these items declare a safe-deadline gate, because only their issues do.
// Anything else with a gate is a number invented from the SLA.
const DEADLINE_GATED = new Set(["CFG-D12", "CFG-D23", "CFG-D27", "CFG-D39", "CFG-D51", "CFG-D53"]);
for (const entry of entries) {
  const gate = entry.sla.safe_deadline_business_days;
  if (DEADLINE_GATED.has(entry.deliverable_id)) {
    assert(`deadline_gate_${entry.deliverable_id}`, typeof gate === "number" && gate > 0, gate);
  } else {
    assert(`no_invented_deadline_${entry.deliverable_id}`, gate === null, gate);
  }
}

// Items that touch disputa, sanção, recurso, diligência, sessão ou integridade
// must draw the same line: no advocacia, no protocolo, no representação, no promise.
const ADVERSARIAL = ["CFG-D23", "CFG-D27", "CFG-D28", "CFG-D31", "CFG-D39", "CFG-D40", "CFG-D41", "CFG-D42", "CFG-D43", "CFG-D51", "CFG-D52", "CFG-D53", "CFG-D54"];
const BOUNDARY_PROBES = [
  { key: "advocacia", re: /advocacia|parecer jur[íi]dico|pe[çc]a jur[íi]dica/i },
  { key: "protocolo", re: /protocol/i },
  { key: "representacao", re: /represent/i },
  { key: "sem_promessa", re: /promet\w*|garantia de|nenhuma garantia/i },
];
for (const id of ADVERSARIAL) {
  const entry = byId.get(id);
  const text = entry.exclusions.join(" | ");
  for (const probe of BOUNDARY_PROBES) {
    assert(`boundary_${probe.key}_${id}`, probe.re.test(text), { id, probe: probe.key });
  }
}

// ------------------------------------------------------ legacy name leakage

// A legacy name may live in its own entry's aliases. It must never be how one
// entry refers to another, or the catalogue teaches the name #343 retired.
const legacyNames = new Map();
for (const entry of entries) {
  for (const alias of entry.name_aliases) legacyNames.set(alias, entry.deliverable_id);
}
for (const entry of entries) {
  const scanned = { ...entry };
  delete scanned.public_name;
  delete scanned.name_aliases;
  const text = JSON.stringify(scanned);
  for (const [alias, owner] of legacyNames) {
    if (owner === entry.deliverable_id) continue;
    assert(`no_legacy_reference_${entry.deliverable_id}_${owner}`, !text.includes(alias), { alias, owner });
  }
}

// #343 retires these six anglicisms from public names; they must not survive in copy.
const RETIRED_ANGLICISMS = ["Go/No-Go", "Bid Room", "Win/Loss", "post-mortem", "quantum", "in company"];
for (const entry of entries) {
  const scanned = { ...entry };
  delete scanned.public_name;
  delete scanned.name_aliases;
  const text = JSON.stringify(scanned).toLowerCase();
  for (const banned of RETIRED_ANGLICISMS) {
    const needle = banned.toLowerCase();
    assert(`no_anglicism_${entry.deliverable_id}_${needle.replace(/\W+/g, "_")}`, !text.includes(needle), { banned, id: entry.deliverable_id });
  }
}

// ------------------------------------------------------------------- claims

assert("no_forbidden_claims_registry", lib.scanForbiddenClaims(registry, "registry").length === 0, lib.scanForbiddenClaims(registry, "registry"));

// Nothing in the rol may be promoted: every item is HOLD with zero evidence in
// every class. The #336 protocol PR owns the gate that can ever change that.
for (const entry of entries) {
  const fit = entry.market_fit;
  assert(`market_fit_hold_${entry.deliverable_id}`, fit.state === "HOLD", fit.state);
  assert(
    `market_fit_zero_${entry.deliverable_id}`,
    Object.values(fit.evidence).every((count) => count === 0),
    fit.evidence
  );
  assert(`market_fit_unreviewed_${entry.deliverable_id}`, fit.last_reviewed === null, fit.last_reviewed);
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
// Every published money route must be in the census; unbuilt offers have no route yet.
for (const entry of entries) {
  if (!entry.route) continue;
  assert(`census_covers_${entry.deliverable_id}`, censusRoutes.has(entry.route), entry.route);
}
for (const container of registry.containers) {
  assert(`census_covers_${container.container_id}`, censusRoutes.has(container.route), container.route);
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
  assert(`no_review_schema_${surface.route}`, !reviewPattern.test(fs.readFileSync(file, "utf8")), surface.route);
}

// ------------------------------------------------------------------ report

const failed = results.filter((result) => !result.ok);
console.log(`deliverables-registry: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`FAILED ${failed.length} checks`);
  process.exit(1);
}
