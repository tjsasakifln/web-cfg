/** Proof-role contract and report-only semantic QA for campaign 12 / #531 / #534. */

import childProcess from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CLAIM_MAP_FIELDS,
  PROOF_ROLES,
  QA_LABELS,
  buildReport,
  evaluateClientOutcomeRole,
  evaluateProofQaFixture,
  evaluateRequiredCaveats,
  loadClientRegistry,
  loadContract,
  loadFixtures,
  provenanceIsHonest,
  resolveProvenance,
  reusableRouteCensus,
} from "../../scripts/commercial/multivertical_proof_qa.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(args) {
  return childProcess.execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}

const contract = loadContract();
const fixtures = loadFixtures();
const registry = loadClientRegistry();
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

assert("schema_v2", contract.schema === "confenge.proof-role-contract/2.0", contract.schema);
assert("campaign_id", contract.campaign_id === 12, contract.campaign_id);
assert("twelve_proof_roles", equal(contract.proof_roles.map((role) => role.id), PROOF_ROLES), contract.proof_roles.map((role) => role.id));
assert("claim_map_fields", equal(contract.claim_map_fields, CLAIM_MAP_FIELDS), contract.claim_map_fields);
assert("qa_labels", equal(contract.semantic_qa.labels.map((label) => label.id), QA_LABELS), contract.semantic_qa.labels.map((label) => label.id));
assert("five_nuclei", equal(contract.nuclei.map((item) => item.id), [
  "pericia_assistencia",
  "avaliacao",
  "edificacoes_bim_orcamento",
  "sst",
  "b2g",
]), contract.nuclei);
assert("client_outcome_fail_closed", contract.client_outcome.fail_closed === true && contract.client_outcome.empty_role_fails === true && contract.client_outcome.state === "NO_APPROVED_CLIENT_PROOF", contract.client_outcome);
assert("registry_untouched", registry.state === "NO_APPROVED_CLIENT_PROOF" && registry.approved_public_proof_count === 0 && Array.isArray(registry.records) && registry.records.length === 0, registry.state);
assert("shadow_not_blocking", contract.semantic_qa.mode === "SHADOW_REPORT" && contract.semantic_qa.ci_blocking === false && contract.semantic_qa.decision === "ITERATE", contract.semantic_qa);
assert("no_universal_ratio", contract.semantic_qa.universal_ratio === null && contract.semantic_qa.quality_score === null, contract.semantic_qa);
assert("human_review_awaiting", contract.human_review.state === "AWAITING_HUMAN_ANNOTATION" && contract.human_review.identified_human_corpus === false && contract.human_review.agent_or_llm_self_label_as_human === "FORBIDDEN", contract.human_review);
assert("fixtures_not_human", fixtures.annotation.human_review_state === "AWAITING_HUMAN_ANNOTATION" && fixtures.annotation.identified_human_annotator === null, fixtures.annotation);
assert("error_matrix_awaiting_human", contract.error_matrix.state === "AWAITING_HUMAN_ANNOTATION" && contract.error_matrix.human_confusion_matrix === null, contract.error_matrix);
assert("html_application_deferred", contract.coverage.html_application === "DEFERRED", contract.coverage);
assert("package_json_not_owned", /unchanged/.test(contract.implementation.package_json), contract.implementation.package_json);

for (const claim of contract.claims) {
  assert(`contract_claim_${claim.claim_id}_fields`, CLAIM_MAP_FIELDS.every((field) => Object.hasOwn(claim, field)), Object.keys(claim));
  assert(`contract_claim_${claim.claim_id}_nucleus`, contract.nuclei.some((item) => item.id === claim.nucleus), claim.nucleus);
  assert(`contract_claim_${claim.claim_id}_role`, PROOF_ROLES.includes(claim.proof_role), claim.proof_role);
}

const fixtureNuclei = [...new Set(fixtures.fixtures.map((fixture) => fixture.nucleus).filter(Boolean))].sort();
assert("fixtures_cover_five_nuclei", equal(fixtureNuclei, contract.nuclei.map((item) => item.id).sort()), fixtureNuclei);

const byId = Object.fromEntries(fixtures.fixtures.map((fixture) => [fixture.id, fixture]));
for (const id of [
  "pericia_positive_method_artifact",
  "pericia_negative_cptec_nomeacao",
  "pericia_unknown_case_outcome",
  "avaliacao_positive_calculation",
  "avaliacao_negative_credential_endorsement",
  "avaliacao_unknown_value",
  "edificacoes_positive_synthetic_method",
  "edificacoes_negative_synthetic_as_outcome",
  "edificacoes_unknown_cost",
  "sst_positive_expertise_method",
  "sst_negative_method_as_result",
  "sst_unknown_cause",
  "b2g_positive_public_source_method",
  "b2g_negative_public_source_as_client",
  "b2g_unknown_savings",
  "benefit_with_sem",
  "hype_is_not_value",
  "orphan_claim",
  "proof_mismatch",
  "required_caveat_present",
  "required_caveat_removed",
  "defensive_repetition",
  "absence_of_case_at_confusion_point",
  "empty_client_outcome_fail_closed",
  "user_supplied_fact_not_measurement",
  "inference_not_fact",
]) {
  assert(`fixture_present_${id}`, Boolean(byId[id]), id);
}

for (const fixture of fixtures.fixtures) {
  const audit = evaluateProofQaFixture(fixture, { registry });
  if (fixture.expected?.defensive_opening !== undefined) {
    assert(`fixture_${fixture.id}_defensive_opening`, audit.defensive_opening === fixture.expected.defensive_opening, audit.sequence_findings);
  }
  for (const label of fixture.expected?.required_qa_labels || []) {
    assert(`fixture_${fixture.id}_requires_${label}`, audit.qa_labels.includes(label), audit.qa_labels);
  }
  for (const label of fixture.expected?.forbidden_qa_labels || []) {
    assert(`fixture_${fixture.id}_forbids_${label}`, !audit.qa_labels.includes(label), audit.qa_labels);
  }
  for (const code of fixture.expected?.promotion_codes || []) {
    const observed = audit.claims.flatMap((claim) => claim.promotion_codes);
    assert(`fixture_${fixture.id}_promotion_${code}`, observed.includes(code), observed);
  }
  if (fixture.expected?.unknown_is_neither_proof) {
    assert(`fixture_${fixture.id}_unknown_neither`, audit.claims.every((claim) => !claim.unknown.applicable || claim.unknown.neither), audit.claims);
  }
  if (fixture.expected?.benefit_with_sem_not_punished) {
    const needle = Object.keys(fixture.expected.text_contains_primary || {})[0];
    const block = audit.blocks.find((entry) => entry.normalized.includes(needle ? needle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR") : "sem montar"));
    assert(`fixture_${fixture.id}_sem_is_value`, block?.primary === "value_outcome" && !audit.qa_labels.includes("defensive_repetition"), block);
  }
  if (fixture.expected?.text_contains_primary) {
    for (const [needle, primary] of Object.entries(fixture.expected.text_contains_primary)) {
      const block = audit.blocks.find((entry) => entry.normalized.includes(needle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")));
      assert(`fixture_${fixture.id}_primary_${primary}`, block?.primary === primary, block);
    }
  }
  if (fixture.expected?.hype_does_not_improve_score) {
    assert(`fixture_${fixture.id}_hype_zero_value_points`, audit.semantic_score.value_points === 0 && audit.semantic_score.hype_points === 0 && audit.semantic_score.quality_score === null, audit.semantic_score);
  }
  if (fixture.expected?.claim_without_proof_reported) {
    assert(`fixture_${fixture.id}_orphan_reported`, audit.qa_labels.includes("orphan_claim") && audit.claims.some((claim) => claim.orphan), audit.claims);
  }
  if (fixture.expected?.client_outcome_fail_closed) {
    assert(`fixture_${fixture.id}_client_fail_closed`, audit.independent_truth_gate.client_outcome_fail_closed === true, audit.independent_truth_gate);
  }
  if (fixture.expected?.caveat_gate_pass !== undefined) {
    assert(`fixture_${fixture.id}_caveat_gate`, audit.caveats.pass === fixture.expected.caveat_gate_pass, audit.caveats);
  }
  if (fixture.expected?.independent_truth_gate_fails) {
    assert(`fixture_${fixture.id}_truth_gate`, audit.independent_truth_gate.caveat_removed === true && audit.caveats.independent_of_semantic_score === true, audit.independent_truth_gate);
  }
  if (Number.isInteger(fixture.expected?.minimum_negations)) {
    assert(`fixture_${fixture.id}_negations`, audit.metrics.negation_occurrences >= fixture.expected.minimum_negations, audit.metrics);
  }
  if (fixture.expected?.absence_of_case_does_not_dominate) {
    assert(`fixture_${fixture.id}_case_absence_boundary_only`, !audit.qa_labels.includes("defensive_repetition") && audit.caveats.pass, audit.qa_labels);
  }
}

const present = evaluateProofQaFixture(byId.required_caveat_present, { registry });
const removed = evaluateProofQaFixture(byId.required_caveat_removed, { registry });
assert("caveat_removal_fails_independent_gate", present.caveats.pass === true && removed.caveats.pass === false && removed.qa_labels.includes("caveat_removed"), {
  present: present.caveats,
  removed: removed.qa_labels,
});
assert(
  "caveat_removal_not_hidden_by_better_score",
  removed.metrics.limitation_blocks <= present.metrics.limitation_blocks && removed.independent_truth_gate.caveat_removed === true && removed.semantic_score.quality_score === null,
  { present: present.metrics, removed: removed.metrics },
);
const stripped = evaluateRequiredCaveats({
  html: byId.required_caveat_present.html.replace(/\sdata-boundary-id=["']synthetic["']/i, ""),
  requiredCaveats: byId.required_caveat_present.required_caveats,
});
assert("stripped_boundary_fails_even_if_needle_remains_or_not", stripped.pass === false, stripped);

const emptyAttempt = evaluateClientOutcomeRole({
  proof_role: "permissioned_client_outcome",
  status: "PUBLISHED",
  publishable: true,
}, registry);
assert("empty_client_outcome_role_fails_closed", emptyAttempt.pass === false && emptyAttempt.fail_closed === true && emptyAttempt.code === "EMPTY_CLIENT_OUTCOME_FAIL_CLOSED", emptyAttempt);

const sentinel = evaluateClientOutcomeRole({
  proof_role: "permissioned_client_outcome",
  status: "NO_APPROVED_CLIENT_PROOF",
  publishable: false,
}, registry);
assert("sentinel_empty_client_outcome_allowed", sentinel.pass === true && sentinel.sentinel === true && sentinel.publishable === false, sentinel);

const headSha = git(["rev-parse", "HEAD"]);
const dirtyProvenance = resolveProvenance({
  ref: null,
  statusPorcelain: " M index.html",
  headSha,
  surfaceOrigin: "working_tree",
});
assert("dirty_wt_not_labeled_head", dirtyProvenance.source_sha !== headSha && dirtyProvenance.source_sha !== "HEAD" && dirtyProvenance.source_kind === "working_tree_dirty" && dirtyProvenance.labeled_as_head === false, dirtyProvenance);
assert("dirty_wt_not_labeled_main", dirtyProvenance.source_sha !== "main" && dirtyProvenance.labeled_as_main === false, dirtyProvenance);
assert("dirty_wt_honest", provenanceIsHonest(dirtyProvenance), dirtyProvenance);

const refProvenance = resolveProvenance({
  ref: headSha,
  resolvedSha: headSha,
  surfaceOrigin: "git_object",
  headSha,
});
assert("ref_source_sha_equals_ref", refProvenance.source_sha === headSha && refProvenance.source_kind === "git_object", refProvenance);

const wtReport = buildReport({
  ref: null,
  includeCensus: false,
  statusPorcelain: " M data/commercial/proof-qa-fixtures.v2.json",
  headSha,
  surfaceHtml: { "index.html": "<main><p>working tree bytes</p></main>" },
});
assert("wt_report_not_head", wtReport.provenance.source_sha !== headSha && wtReport.provenance.source_sha !== "HEAD" && wtReport.provenance.source_sha !== "main", wtReport.provenance);
assert("wt_report_kind", wtReport.provenance.source_kind.startsWith("working_tree") && wtReport.provenance.surface_origin === "working_tree", wtReport.provenance);
assert("report_shadow", wtReport.mode === "SHADOW_REPORT" && wtReport.ci_blocking === false && wtReport.future_ratchet === "ITERATE", [wtReport.mode, wtReport.ci_blocking, wtReport.future_ratchet]);
assert("report_corpus_awaiting", wtReport.corpus.state === "AWAITING_HUMAN_ANNOTATION" && wtReport.interpretation.human_annotation_claimed === false, wtReport.corpus);
assert("report_nuclei", wtReport.nuclei_covered.length === 5, wtReport.nuclei_covered);
assert("report_no_pii_keys", !JSON.stringify(wtReport).includes("cpf") && !JSON.stringify(wtReport).includes("@gmail"), "pii");
assert("report_preserves_no_client_proof", wtReport.client_outcome.no_approved_client_proof === true, wtReport.client_outcome);

let missingAtMainThrew = false;
try {
  buildReport({ ref: headSha, includeCensus: false });
} catch (error) {
  missingAtMainThrew = /PROOF_QA_MISSING_AT_REF/.test(error.message);
}
const v2ExistsAtHead = (() => {
  try {
    git(["cat-file", "-e", `${headSha}:data/commercial/proof-role-contract.v2.json`]);
    return true;
  } catch {
    return false;
  }
})();
if (v2ExistsAtHead) {
  const refReport = buildReport({ ref: headSha, includeCensus: false });
  assert("ref_report_source_sha", refReport.provenance.source_sha === headSha, refReport.provenance);
  assert("ref_report_bytes_are_git_object", refReport.analyzed_inputs.every((item) => item.origin === "git_object"), refReport.analyzed_inputs);
} else {
  assert("ref_without_v2_does_not_fallback_to_wt_labeled_head", missingAtMainThrew, { missingAtMainThrew, headSha });
}

const census = reusableRouteCensus({ ref: null });
assert("census_reusable_for_100_routes", census.reusable === true && census.published_indexable_routes >= 50 && census.manual_route_allowlist === false, census);
assert("census_uses_family_registry", census.public_authority === "data/organic/public-family-registry.json", census);

const failed = results.filter((result) => !result.ok);
console.log(`multivertical-proof-qa: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
