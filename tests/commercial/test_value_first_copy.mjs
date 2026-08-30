/** Contract and fixture checks for issues #527/#531/#532/#534. */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildReport,
  evaluateFixture,
  normalize,
} from "../../scripts/commercial/value_first_copy_audit.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/value-first-copy-contract.v1.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/value-first-copy-fixtures.v1.json"), "utf8"));
const copy = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/copy-contract.v1.json"), "utf8"));
const editorial = JSON.parse(fs.readFileSync(path.join(root, "data/site/editorial-policy.json"), "utf8"));

const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

assert("schema", contract.schema === "confenge.value-first-copy-contract/1.0", contract.schema);
assert("issue_527", contract.issue === "#527", contract.issue);
assert("historical_338_preserved", contract.historical_relationship?.truth_issue === "#338" && /revisa sua hierarquia comercial/i.test(contract.historical_relationship?.statement || ""), contract.historical_relationship);
assert("copy_contract_links_successor", copy.value_first_successor?.contract === "data/commercial/value-first-copy-contract.v1.json" && copy.value_first_successor?.issue === "#527", copy.value_first_successor);
assert("editorial_contract_links_successor", editorial.commercial_copy_contracts?.value_first === "data/commercial/value-first-copy-contract.v1.json", editorial.commercial_copy_contracts);

const delivery = contract.delivery_status || {};
assert("delivery_status_covers_issue_lot", equal(Object.keys(delivery), ["#527", "#528", "#529", "#530", "#531", "#532", "#534"]), Object.keys(delivery));
assert("issue_528_does_not_claim_route_rollout", delivery["#528"]?.state === "MATRICES_ONLY_NO_ROUTE_MUTATION" && /oito rotas/.test(delivery["#528"]?.residual || ""), delivery["#528"]);
assert("issue_529_remains_measurement_wait", delivery["#529"]?.state === "MEASUREMENT_WAIT" && /não autoriza mutação/.test(delivery["#529"]?.residual || ""), delivery["#529"]);
assert("issue_531_names_required_residual_surfaces", /home, \/casos\/, especialista/.test(delivery["#531"]?.residual || ""), delivery["#531"]);
assert("issue_532_does_not_claim_form_rollout", /todos os formulários\/CTAs/.test(delivery["#532"]?.residual || ""), delivery["#532"]);
assert("issue_534_stays_iterate", delivery["#534"]?.state === "SHADOW_REPORT_ITERATE" && /nenhum ratchet está autorizado/.test(delivery["#534"]?.residual || ""), delivery["#534"]);

const hierarchy = contract.canonical_hierarchy || [];
assert("hierarchy_has_seven_roles", hierarchy.length === 7, hierarchy.length);
assert("hierarchy_ordered", hierarchy.every((entry, index) => entry.order === index + 1), hierarchy);
assert("hierarchy_exact_roles", equal(hierarchy.map((entry) => entry.role), [
  "desired_outcome_or_active_problem",
  "value_created",
  "concrete_mechanism",
  "tangible_deliverable",
  "positive_proof",
  "next_action",
  "decision_relevant_condition_or_limit",
]), hierarchy.map((entry) => entry.role));

const destinations = contract.limitation_destinations || [];
assert("five_semantic_destinations", equal(destinations.map((entry) => entry.id), ["price", "data", "legal_interpretation", "synthetic_evidence", "scope"]), destinations);
assert("no_universal_ratio", contract.negation_rule?.universal_ratio === null && contract.diagnostic?.ratchet_policy?.comparison_unit.includes("rota contra seu baseline"), contract.negation_rule);
assert("no_raw_negation_threshold", contract.negation_rule?.raw_negation_threshold === null, contract.negation_rule);
assert("shadow_not_blocking", contract.diagnostic?.mode === "SHADOW_REPORT" && contract.diagnostic?.ci_blocking === false && contract.diagnostic?.decision === "ITERATE", contract.diagnostic);
assert("human_review_not_fabricated", contract.diagnostic?.human_review?.state === "NOT_STARTED" && contract.diagnostic?.human_review?.reviewed_fixtures === 0 && contract.diagnostic?.human_review?.confusion_matrix === null, contract.diagnostic?.human_review);

assert("proof_roles_exact", equal(contract.proof_contract?.roles, [
  "artifact",
  "calculation",
  "source_provenance",
  "freshness",
  "method",
  "expertise",
  "permissioned_client_outcome",
  "boundary",
]), contract.proof_contract?.roles);
assert("client_proof_fail_closed", contract.proof_contract?.client_outcome?.state === "NO_APPROVED_CLIENT_PROOF" && contract.proof_contract?.client_outcome?.fail_closed === true, contract.proof_contract?.client_outcome);
assert("cta_contract_route_derived", /Derivada das famílias públicas/i.test(contract.cta_form_contract?.coverage || "") && !Array.isArray(contract.cta_form_contract?.routes), contract.cta_form_contract?.coverage);
assert("cta_contract_preserves_controls", (contract.cta_form_contract?.rules || []).some((rule) => /Turnstile/.test(rule)) && (contract.cta_form_contract?.rules || []).some((rule) => /Nenhum campo ou PII/.test(rule)), contract.cta_form_contract?.rules);
assert("coverage_refuses_manual_allowlist", contract.coverage_derivation?.manual_route_allowlist === false && !Array.isArray(contract.coverage_derivation?.routes), contract.coverage_derivation);

assert("fixture_schema", fixtures.schema === "confenge.value-first-copy-fixtures/1.0", fixtures.schema);
assert("fixture_human_review_not_claimed", fixtures.annotation?.human_review_state === "NOT_STARTED", fixtures.annotation);
assert("fixture_profiles_stratified", equal([...new Set(fixtures.fixtures.map((fixture) => fixture.profile))].sort(), ["commercial", "public_data", "trust_legal"]), fixtures.fixtures.map((fixture) => fixture.profile));

for (const fixture of fixtures.fixtures) {
  const audit = evaluateFixture(fixture);
  assert(`fixture_${fixture.id}_defensive_opening`, audit.defensive_opening === fixture.expected.defensive_opening, audit.sequence_findings);
  for (const role of fixture.expected.required_roles || []) {
    assert(`fixture_${fixture.id}_requires_${role}`, audit.observed_roles.includes(role), audit.observed_roles);
  }
  for (const role of fixture.expected.forbidden_roles || []) {
    assert(`fixture_${fixture.id}_forbids_${role}`, !audit.observed_roles.includes(role), audit.blocks.map((block) => ({ text: block.text, roles: block.roles })));
  }
  if (Number.isInteger(fixture.expected.minimum_negations)) {
    assert(`fixture_${fixture.id}_negations`, audit.metrics.negation_occurrences >= fixture.expected.minimum_negations, audit.metrics);
  }
  for (const [needle, primary] of Object.entries(fixture.expected.text_contains_primary || {})) {
    const block = audit.blocks.find((entry) => entry.normalized.includes(normalize(needle)));
    assert(`fixture_${fixture.id}_primary_${primary}`, block?.primary === primary, block);
  }
  for (const boundary of fixture.expected.required_boundary_ids || []) {
    assert(`fixture_${fixture.id}_boundary_${boundary}`, audit.boundary_ids.includes(boundary), audit.boundary_ids);
    const removed = { ...fixture, html: fixture.html.replace(new RegExp(`\\sdata-boundary-id=["']${boundary}["']`, "i"), "") };
    const removedAudit = evaluateFixture(removed);
    assert(`fixture_${fixture.id}_removed_boundary_fails`, !removedAudit.boundary_ids.includes(boundary), removedAudit.boundary_ids);
  }
}

const baselineSha = contract.diagnostic.baseline.source_sha;
const report = buildReport({ ref: baselineSha });
assert("baseline_sha_exact", report.source_sha === baselineSha, report.source_sha);
assert("report_is_shadow", report.mode === "SHADOW_REPORT" && report.ci_blocking === false, [report.mode, report.ci_blocking]);
assert("report_uses_no_allowlist", report.coverage.manual_route_allowlist === false, report.coverage);
assert("report_covers_every_indexable_family_route", report.coverage.problems.length === 0 && report.coverage.classified_routes === report.coverage.published_indexable_routes, report.coverage);
assert("report_has_three_profiles", equal([...new Set(report.routes.map((route) => route.diagnostic_profile))].sort(), ["commercial", "public_data", "trust_legal"]), [...new Set(report.routes.map((route) => route.diagnostic_profile))]);
assert("report_has_all_dimensions", equal(Object.keys(report.totals), contract.semantic_taxonomy.reported_dimensions.map((name) => name === "value_outcome_blocks" ? name : name)), Object.keys(report.totals));
assert("report_has_route_and_family_rows", report.routes.length > 50 && report.families.length === new Set(report.routes.map((route) => route.family_id)).size, [report.routes.length, report.families.length]);
assert("route_matrices_cover_derived_census", report.routes.every((route) => route.value_first_matrix?.current_proposition && route.value_first_matrix?.actual_contract_value?.source && Array.isArray(route.value_first_matrix?.message_direction)), report.routes.filter((route) => !route.value_first_matrix?.current_proposition).map((route) => route.route));
const measurementWait = report.routes.filter((route) => route.value_first_matrix?.mutation_state?.state === "MEASUREMENT_WAIT");
assert("six_routes_remain_measurement_wait", measurementWait.length === 6, measurementWait.map((route) => route.route));
assert("measurement_wait_never_authorizes_html", measurementWait.every((route) => route.value_first_matrix.mutation_state.html_mutation_authorized === false && /não autoriza mutação/i.test(route.value_first_matrix.mutation_state.note)), measurementWait.map((route) => route.value_first_matrix.mutation_state));
assert("route_matrix_is_not_manual_allowlist", contract.coverage_derivation?.child_route_matrices?.manual_route_allowlist === false && /unlock-plan/.test(contract.coverage_derivation?.child_route_matrices?.protected_route_authority || ""), contract.coverage_derivation?.child_route_matrices);
assert("report_does_not_claim_quality", report.interpretation.quality_score === null && report.interpretation.universal_ratio === null && report.interpretation.human_persuasion_claimed === false, report.interpretation);

const baselinePath = path.join(root, contract.diagnostic.baseline.report);
assert("baseline_file_exists", fs.existsSync(baselinePath), baselinePath);
if (fs.existsSync(baselinePath)) {
  const recorded = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  assert("baseline_is_reproducible", equal(recorded, report), { recorded_sha: recorded.source_sha, live_sha: report.source_sha });
}

const failed = results.filter((result) => !result.ok);
console.log(`value-first-copy: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
