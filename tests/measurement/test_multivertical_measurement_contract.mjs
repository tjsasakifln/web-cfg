/**
 * Gate do contrato semantico de mensuracao multi-vertical (campanha 13 / #336).
 *
 * Carrega os JSON enviados e as funcoes reais de
 * scripts/measurement/multivertical_measurement_contract.mjs.
 * Nao mocka a unidade sob teste e nao afirma evidencia humana.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadAllMeasurementArtifacts,
  loadEventContract,
  loadPrivacyMatrix,
  loadAttributionRules,
  loadCoordinationContracts,
  admitMeasurementEvent,
  collectForbiddenHits,
  assertUniqueProtocolSample,
  coordinationIdentity,
  sha256Canonical,
  PATHS,
  CONTRACT_ROOT,
} from "../../scripts/measurement/multivertical_measurement_contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NAME = "multivertical-measurement-contract";
const results = [];
function assert(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) console.error("FAIL", name, detail === undefined ? "" : JSON.stringify(detail));
}

const artifacts = loadAllMeasurementArtifacts();
const { eventContract, privacy, attribution, coordination, protocol } = artifacts;

assert("event_contract_loads", eventContract.schema === "confenge.multivertical-event-metric-contract/1.0", eventContract.schema);
assert("semantics_only", eventContract.authority === "semantics_only_not_runtime", eventContract.authority);
assert("no_runtime_implementation", eventContract.implementation_forbidden_in_this_contract === true, eventContract);

const requiredDimensions = [
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
for (const dimension of requiredDimensions) {
  assert(`dimension_${dimension}`, Boolean(eventContract.dimensions[dimension]), dimension);
}
assert("qco_observed_only", eventContract.dimensions.qco.admission === "observed_only", eventContract.dimensions.qco);
assert("proposal_observed_only", eventContract.dimensions.proposal.admission === "observed_only", eventContract.dimensions.proposal);
assert("revenue_aggregate_ref", eventContract.dimensions.revenue_margin.admission === "observed_only_aggregate_reference", eventContract.dimensions.revenue_margin);
assert("qco_client_emit_forbidden", eventContract.dimensions.qco.client_emit_forbidden === true, eventContract.dimensions.qco);
assert("client_not_truth", ["qco", "proposal", "revenue"].every((item) => eventContract.client_side_is_not_source_of_truth_for.includes(item)), eventContract.client_side_is_not_source_of_truth_for);
assert("b2g_nucleus_present", eventContract.nuclei.includes("public_works_b2g"), eventContract.nuclei);
assert("five_nuclei", eventContract.nuclei.length === 5, eventContract.nuclei);

const forbiddenIds = privacy.forbidden_fields.map((field) => field.id);
for (const id of [
  "nome", "email", "telefone", "cpf_cnpj_visitante", "endereco", "texto_livre",
  "processo", "empregado", "documento", "valor_informado", "motivo_detalhado_de_conflito",
]) {
  assert(`privacy_forbids_${id}`, forbiddenIds.includes(id), forbiddenIds);
}
assert("allowlist_empty", Array.isArray(privacy.aggregate_pii_allowlist) && privacy.aggregate_pii_allowlist.length === 0, privacy.aggregate_pii_allowlist);

const ruleIds = attribution.rules.map((rule) => rule.id);
for (const id of [
  "source_is_confenge_web", "absence_is_unknown", "layers_do_not_promote",
  "qco_is_downstream_readback", "event_id_idempotent", "b2g_not_removed",
  "ctr_is_not_value", "wtp_does_not_replace_341", "no_outbound_auto_send",
]) {
  assert(`attr_${id}`, ruleIds.includes(id), ruleIds);
}

assert("coordination_test_only", coordination.authority === "test_only_not_production_fallback", coordination.authority);
assert("coordination_not_runtime_fallback", coordination.not_a_runtime_fallback === true, coordination);
assert("invariants", coordination.invariants.source === "CONFENGE_WEB" && coordination.invariants.outbound_eligible === false && coordination.invariants.auto_send === false, coordination.invariants);

const sampleProblems = assertUniqueProtocolSample(protocol);
assert("unique_protocol_sample", sampleProblems.length === 0, sampleProblems);
assert("sample_n_20", protocol.sample_design.n === 20, protocol.sample_design.n);
const quotas = Object.fromEntries(protocol.sample_design.composition.map((row) => [row.nucleus_id, row.quota]));
assert("composition_83333", quotas.building_engineering_documentation === 8 && quotas.expert_evidence_assistance === 3 && quotas.property_valuation === 3 && quotas.occupational_safety === 3 && quotas.public_works_b2g === 3, quotas);
assert("qualitative_not_market", protocol.sample_design.kind === "qualitative_predeclared_sample" && protocol.sample_design.not_market_share === true, protocol.sample_design);
assert("single_revision", protocol.sample_design.single_revision_allowed_before_first_session === true && protocol.sample_design.revision_must_keep_n === 20, protocol.sample_design);
assert("issue_336_only", protocol.issue === "#336" && protocol.second_study_forbidden === true && protocol.second_research_issue_forbidden === true, protocol);
const taskIds = protocol.phases.find((phase) => phase.phase === 2).tasks.map((task) => task.id);
for (const id of [
  "explain_confenge_3_to_5s", "choose_nucleus", "find_first_action", "use_canary_09",
  "predict_triage_result", "understand_credential_and_limit",
  "distinguish_service_free_intel_formal_work", "identify_b2g_without_feeling_removed",
  "evaluate_artifact_use", "explain_internal_alternative",
  "react_to_price_only_when_published", "point_data_would_not_send_on_public_form",
]) {
  assert(`task_${id}`, taskIds.includes(id), taskIds);
}
assert("repeat_change_stop", JSON.stringify(protocol.phases[1].repeat_change_stop) === JSON.stringify(["REPEAT", "CHANGE", "STOP"]), protocol.phases[1].repeat_change_stop);
assert("decision_limits", protocol.decision_limits.n20_does_not_prove_market_share === true && protocol.decision_limits.ctr_is_not_value === true && protocol.decision_limits.wtp_does_not_replace_issue_341 === true && protocol.decision_limits.protocol_not_mutated_after_seeing_results === true, protocol.decision_limits);

const piiPayload = {
  event: "triage_start",
  source: "CONFENGE_WEB",
  producer: "form",
  email: "pessoa@example.invalid",
  nome: "Pessoa",
};
const piiHits = collectForbiddenHits(piiPayload, privacy);
assert("pii_payload_detected", piiHits.some((hit) => hit.includes("email")) && piiHits.some((hit) => hit.includes("nome")), piiHits);
const piiAdmit = admitMeasurementEvent(piiPayload, { contract: eventContract, privacy });
assert("pii_payload_rejected", piiAdmit.admitted === false && piiAdmit.reason === "pii_forbidden", piiAdmit);

const clientQco = admitMeasurementEvent({
  event: "qco",
  source: "CONFENGE_WEB",
  producer: "confengeTrack",
  observed_owner: "warmbly",
  nucleus_id: "property_valuation",
}, { contract: eventContract, privacy });
assert("client_qco_rejected", clientQco.admitted === false && clientQco.reason === "client_side_observed_only_forbidden", clientQco);

const browserProposal = admitMeasurementEvent({
  event: "proposal",
  source: "CONFENGE_WEB",
  producer: "browser",
  observed_owner: "warmbly",
}, { contract: eventContract, privacy });
assert("client_proposal_rejected", browserProposal.admitted === false, browserProposal);

const collectRevenue = admitMeasurementEvent({
  event: "revenue_margin_aggregate_ref",
  source: "CONFENGE_WEB",
  producer: "collect",
  observed_owner: "warmbly",
}, { contract: eventContract, privacy });
assert("client_revenue_rejected", collectRevenue.admitted === false, collectRevenue);

const downstreamQco = admitMeasurementEvent({
  event: "qco",
  source: "CONFENGE_WEB",
  observed_owner: "warmbly",
  nucleus_id: "public_works_b2g",
}, { contract: eventContract, privacy });
assert("downstream_qco_admitted", downstreamQco.admitted === true && downstreamQco.replay === false, downstreamQco);

const unknownNucleus = admitMeasurementEvent({
  event: "triage_start",
  source: "CONFENGE_WEB",
  producer: "form",
  nucleus_id: "unknown",
}, { contract: eventContract, privacy });
assert("unknown_nucleus_allowed", unknownNucleus.admitted === true, unknownNucleus);

const badNucleus = admitMeasurementEvent({
  event: "triage_start",
  source: "CONFENGE_WEB",
  producer: "form",
  nucleus_id: "smartlic",
}, { contract: eventContract, privacy });
assert("unknown_enum_rejected", badNucleus.admitted === false && badNucleus.reason === "nucleus_not_in_enum", badNucleus);

const missingEvent = admitMeasurementEvent({ source: "CONFENGE_WEB" }, { contract: eventContract, privacy });
assert("missing_event_rejected", missingEvent.admitted === false, missingEvent);

const seen = new Set();
const first = admitMeasurementEvent({
  event: "triage_complete",
  source: "CONFENGE_WEB",
  producer: "form",
  event_id: "evt-1",
  nucleus_id: "occupational_safety",
}, { contract: eventContract, privacy, seen });
const replay = admitMeasurementEvent({
  event: "triage_complete",
  source: "CONFENGE_WEB",
  producer: "form",
  event_id: "evt-1",
  nucleus_id: "occupational_safety",
}, { contract: eventContract, privacy, seen });
assert("first_admit", first.admitted === true && first.replay === false, first);
assert("replay_idempotent", replay.admitted === true && replay.replay === true, replay);

const wrongSource = admitMeasurementEvent({
  event: "triage_start",
  source: "OTHER",
  producer: "form",
}, { contract: eventContract, privacy });
assert("wrong_source_rejected", wrongSource.admitted === false && wrongSource.reason === "source_not_confenge_web", wrongSource);

let missingHash = false;
try {
  const clone = JSON.parse(JSON.stringify(coordination));
  delete clone.contracts[0].sha256;
  const tmp = path.join(CONTRACT_ROOT, "data/measurement/.tmp-missing-hash.json");
  fs.writeFileSync(tmp, JSON.stringify(clone));
  fs.unlinkSync(tmp);
  missingHash = true;
} catch {
  missingHash = false;
}
assert("hash_helper_roundtrip", typeof sha256Canonical(coordinationIdentity(coordination, coordination.contracts[0])) === "string", "hash");

const divergent = JSON.parse(JSON.stringify(coordination));
divergent.contracts[0].sha256 = "0".repeat(64);
let divergentFailed = false;
try {
  const expected = sha256Canonical(coordinationIdentity(divergent, divergent.contracts[0]));
  if (divergent.contracts[0].sha256 !== expected) divergentFailed = true;
} catch {
  divergentFailed = true;
}
assert("divergent_hash_fails_closed", divergentFailed === true, divergent.contracts[0].sha256);

let loadedAgain = null;
try {
  loadedAgain = loadCoordinationContracts();
} catch (error) {
  loadedAgain = error.message;
}
assert("coordination_reload_ok", loadedAgain && loadedAgain.contracts.length === 8, loadedAgain);

assert("loaders_are_real_files", [PATHS.eventContract, PATHS.privacyMatrix, PATHS.attribution, PATHS.coordination, PATHS.protocol].every((rel) => fs.existsSync(path.join(CONTRACT_ROOT, rel))), PATHS);

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ ok: false, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(1);
}
