/** Gate fail-closed do contrato comercial da issue 339. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_PATH = path.join(root, "data/commercial/page-contract-disputas.v1.json");
const REGISTRY_PATH = path.join(root, "data/commercial/deliverables-registry.v1.json");
const SELF_PATH = fileURLToPath(import.meta.url);
const NAME = "page-contract-disputas";
const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
const filled = (value) => typeof value === "string" && value.trim().length > 0;
const filledList = (value, minimum = 1) => Array.isArray(value) && value.length >= minimum && value.every(filled);
function additions(price) {
  return (price?.additional_units ?? []).map((unit) => [unit.label, unit.amount_cents]);
}

assert("data_exists", fs.existsSync(DATA_PATH), DATA_PATH);
assert("registry_exists", fs.existsSync(REGISTRY_PATH), REGISTRY_PATH);
const raw = fs.readFileSync(DATA_PATH, "utf8");
let data;
try {
  data = JSON.parse(raw);
  assert("data_parses", true, DATA_PATH);
} catch (error) {
  assert("data_parses", false, String(error));
  process.exit(1);
}
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const canonicalById = new Map((registry.deliverables ?? []).map((item) => [item.deliverable_id, item]));
const items = data.items ?? [];
const byNumber = new Map(items.map((item) => [item.number, item]));

assert("contract_id", data.contract_id === "page-contract-disputas.v1", data.contract_id);
assert("schema_version", data.schema_version === "1.0.0", data.schema_version);
assert("source_issue", data.source_issue === 339, data.source_issue);
assert("parent_issue", data.parent_issue === 329, data.parent_issue);
assert("related_issues", JSON.stringify(data.related_issues) === JSON.stringify([333, 343]), data.related_issues);
assert("naming_authority", data.naming_authority_issue === 343, data.naming_authority_issue);
assert("priority", data.priority === "P1", data.priority);
assert("decision_state", data.decision_state === "VALIDATE", data.decision_state);
assert("executive_front", data.executive_front === "REVENUE NOW", data.executive_front);
assert("leverage", JSON.stringify(data.leverage) === JSON.stringify(["revenue", "trust", "customer", "data"]), data.leverage);
assert("time_to_evidence", data.time_to_evidence_days === 30, data.time_to_evidence_days);
assert("research_not_started", data.research_state === "NOT_STARTED", data.research_state);
assert("evidence_empty", Array.isArray(data.evidence) && data.evidence.length === 0, data.evidence);
assert("human_not_started", data.human_validation?.state === "NOT_STARTED", data.human_validation);
assert("human_requires_three", data.human_validation?.real_proposals_required_before_promoting_price === 3, data.human_validation);
assert("human_empty", Array.isArray(data.human_validation?.collected) && data.human_validation.collected.length === 0, data.human_validation);
assert("no_pages", Array.isArray(data.pages_created_by_this_contract) && data.pages_created_by_this_contract.length === 0, data.pages_created_by_this_contract);
assert("checkout_disabled", data.checkout_enabled_anywhere === false, data.checkout_enabled_anywhere);

const EXPECTED = {
  40: {
    name: "Análise de Causas e Impactos de Atrasos",
    base: 1290000,
    sla: 15,
    additions: [["janela adicional no mesmo contrato", 490000]],
    inputs: 6,
    outputs: 11,
    exclusions: 6,
    prohibitionKeys: ["asserts_causality_without_contemporaneous_record", "fabricates_baseline"],
  },
  41: {
    name: "Análise de Custos e Valores em Disputa",
    base: 1490000,
    sla: 15,
    additions: [["família de custos adicional com a mesma causalidade", 490000]],
    inputs: 6,
    outputs: 10,
    exclusions: 6,
    prohibitionKeys: ["audits_financial_statements", "legal_opinion_on_entitlement", "uses_presumed_profit_without_proof", "presents_recoverable_amount_as_certain"],
  },
  42: {
    name: "Assistência Técnica em Disputa Contratual Complexa",
    base: 1980000,
    sla: 20,
    additions: [
      ["rodada adicional de esclarecimento documentada", 290000],
      ["reunião técnica, oitiva ou audiência de até um dia, quando admissível, com deslocamento cobrado à parte", 490000],
    ],
    inputs: 6,
    outputs: 8,
    exclusions: 7,
    prohibitionKeys: ["drafts_or_signs_pleadings", "leads_legal_strategy"],
  },
};
const CORE_PROHIBITIONS = [
  "provides_legal_representation",
  "files_or_protocols",
  "official_expert_examination",
  "witness_testimony",
  "guarantees_settlement_or_judgment",
  "conceals_conflict_of_interest",
  "acts_as_law_firm",
  "acts_as_court_appointed_expert",
  "issues_forensic_report",
  "issues_legal_opinion",
  "success_fee",
  "promises_recovery_of_value",
  "signs_for_client",
  "open_hourly_billing",
];

assert("three_items", items.length === 3, items.length);
assert("numbers_40_to_42", JSON.stringify(items.map((item) => item.number)) === JSON.stringify([40, 41, 42]), items.map((item) => item.number));
assert("ids_unique", new Set(items.map((item) => item.deliverable_id)).size === 3, items.map((item) => item.deliverable_id));

for (const [numberText, expected] of Object.entries(EXPECTED)) {
  const number = Number(numberText);
  const item = byNumber.get(number);
  const prefix = `item_${number}`;
  assert(`${prefix}_exists`, Boolean(item), number);
  if (!item) continue;
  assert(`${prefix}_id`, item.deliverable_id === `CFG-D${number}`, item.deliverable_id);
  assert(`${prefix}_name`, item.public_name_pt_br === expected.name, item.public_name_pt_br);
  assert(`${prefix}_base_price`, item.pricing?.tiers?.length === 1 && item.pricing.tiers[0].price_cents === expected.base, item.pricing);
  assert(`${prefix}_base_sla`, item.pricing?.tiers?.[0]?.sla_business_days === expected.sla && item.sla_business_days === expected.sla, item.pricing);
  assert(`${prefix}_billing`, item.pricing?.billing === "one_time", item.pricing);
  assert(`${prefix}_no_open_hours`, item.pricing?.open_hourly_billing === false, item.pricing);
  assert(`${prefix}_additions_exhaustive`, item.pricing?.additional_charges_are_exhaustive === true, item.pricing);
  assert(
    `${prefix}_additions_exact`,
    JSON.stringify(item.pricing?.additional_charges?.map((charge) => [charge.name_pt_br, charge.price_cents])) === JSON.stringify(expected.additions),
    item.pricing?.additional_charges,
  );
  for (const charge of item.pricing?.additional_charges ?? []) {
    assert(`${prefix}_charge_exhaustive_${item.pricing.additional_charges.indexOf(charge)}`, charge.exhaustive === true, charge);
    assert(`${prefix}_charge_disclosed_${item.pricing.additional_charges.indexOf(charge)}`, charge.disclosed_before_charging === true, charge);
    assert(`${prefix}_charge_unit_${item.pricing.additional_charges.indexOf(charge)}`, filled(charge.unit_pt_br), charge);
  }
  assert(`${prefix}_inputs`, filledList(item.inputs_pt_br, expected.inputs) && item.inputs_pt_br.length === expected.inputs, item.inputs_pt_br?.length);
  assert(`${prefix}_outputs`, filledList(item.outputs_pt_br, expected.outputs) && item.outputs_pt_br.length === expected.outputs, item.outputs_pt_br?.length);
  assert(`${prefix}_scope_limits`, filledList(item.scope_limits_pt_br, 4) && item.scope_limits_pt_br.length === 4, item.scope_limits_pt_br);
  assert(`${prefix}_exclusions`, filledList(item.exclusions_pt_br, expected.exclusions) && item.exclusions_pt_br.length === expected.exclusions, item.exclusions_pt_br?.length);
  assert(`${prefix}_legal_boundary`, filledList(item.legal_boundary_pt_br, 6) && item.legal_boundary_pt_br.length === 6, item.legal_boundary_pt_br);
  assert(`${prefix}_entry_gate`, item.entry_gate_required === true, item.entry_gate_required);
  assert(`${prefix}_route_null`, item.route === null && item.page_exists === false, [item.route, item.page_exists]);
  assert(`${prefix}_validate`, item.public_state === "VALIDATE", item.public_state);
  assert(`${prefix}_protect`, item.task_door === "PROTECT", item.task_door);
  assert(`${prefix}_capacity`, item.capacity_required === true, item.capacity_required);
  assert(`${prefix}_checkout`, item.checkout_enabled === false, item.checkout_enabled);
  assert(`${prefix}_credit_null`, item.credit_rule === null, item.credit_rule);
  assert(`${prefix}_no_invented_safe_deadline`, item.safe_deadline_gate === null, item.safe_deadline_gate);
  for (const key of [...CORE_PROHIBITIONS, ...expected.prohibitionKeys]) {
    assert(`${prefix}_prohibition_${key}`, item.prohibitions?.[key] === false, item.prohibitions);
  }
  assert(`${prefix}_all_prohibitions_false`, Object.values(item.prohibitions ?? {}).every((value) => value === false), item.prohibitions);
  assert(
    `${prefix}_positioning`,
    filled(item.positioning_statement_pt_br) &&
      /não (é|se apresenta como) laudo pericial/i.test(item.positioning_statement_pt_br) &&
      /não (é|se apresenta como) parecer jurídico/i.test(item.positioning_statement_pt_br),
    item.positioning_statement_pt_br,
  );

  const canonical = canonicalById.get(item.deliverable_id);
  assert(`${prefix}_canonical_exists`, Boolean(canonical), item.deliverable_id);
  if (!canonical) continue;
  assert(`${prefix}_canonical_name`, canonical.public_name_pt_br === item.public_name_pt_br, [canonical.public_name_pt_br, item.public_name_pt_br]);
  assert(`${prefix}_canonical_base`, canonical.price?.amount_cents === expected.base, canonical.price);
  assert(`${prefix}_canonical_additions`, JSON.stringify(additions(canonical.price)) === JSON.stringify(expected.additions), canonical.price);
  assert(`${prefix}_canonical_sla`, canonical.sla?.business_days_min === expected.sla && canonical.sla?.business_days_max === expected.sla, canonical.sla);
  assert(`${prefix}_canonical_route`, canonical.route === null && item.route === canonical.route, canonical.route);
  assert(`${prefix}_canonical_state`, canonical.public_state === item.public_state, canonical.public_state);
  assert(`${prefix}_canonical_door`, canonical.task_door === item.task_door, canonical.task_door);
  assert(`${prefix}_canonical_capacity`, canonical.capacity_required === item.capacity_required, canonical.capacity_required);
  assert(`${prefix}_canonical_source`, canonical.source_issue === "#339", canonical.source_issue);
}

const positioning = data.positioning_boundary ?? {};
assert("positioning_is_technical_assistance", /assistência técnica/i.test(positioning.acts_as_pt_br ?? ""), positioning);
assert("positioning_never_two_roles", JSON.stringify(positioning.never_acts_as_pt_br) === JSON.stringify(["escritório jurídico", "perito nomeado sem contratação e regulação compatíveis"]), positioning);
assert("positioning_requires_compatible_engagement", positioning.requires_compatible_engagement_and_regulation === true, positioning);
assert("positioning_lawyer_owns_thesis", positioning.legal_thesis_owner_pt_br === "o advogado do cliente", positioning);
assert("positioning_asserted_for_all", positioning.asserted_for_every_item === true, positioning);
assert("positioning_statements_eight", filledList(positioning.statements_pt_br, 8) && positioning.statements_pt_br.length === 8, positioning.statements_pt_br);
assert("positioning_forbidden_four", filledList(positioning.forbidden_claims_pt_br, 4) && positioning.forbidden_claims_pt_br.length === 4, positioning.forbidden_claims_pt_br);

const gate = data.entry_gate ?? {};
const GATE_IDS = [
  "conflito_de_interesses_documentado",
  "objeto_e_tese_delimitados",
  "acesso_autorizado_ao_corpus",
  "integridade_e_proveniencia_dos_documentos",
  "advogado_do_cliente_responsavel_pela_tese",
  "responsavel_tecnico_definido",
  "cronograma_e_capacidade_compativeis",
  "regra_de_confidencialidade_e_retencao_acordada",
];
assert("gate_applies_all_items", JSON.stringify(gate.applies_to_items) === JSON.stringify([40, 41, 42]), gate.applies_to_items);
assert("gate_before_sale", gate.must_pass_before_selling === true, gate.must_pass_before_selling);
assert("gate_eight_conditions", gate.conditions?.length === 8, gate.conditions?.length);
assert("gate_ids_exact", JSON.stringify(gate.conditions?.map((condition) => condition.id)) === JSON.stringify(GATE_IDS), gate.conditions);
assert("gate_order_exact", JSON.stringify(gate.conditions?.map((condition) => condition.order)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]), gate.conditions);
for (const condition of gate.conditions ?? []) {
  assert(`gate_${condition.id}_critical`, condition.critical === true, condition);
  assert(`gate_${condition.id}_label`, filled(condition.label_pt_br), condition);
  assert(`gate_${condition.id}_prose`, filled(condition.prose_pt_br) && condition.prose_pt_br.length >= 90, condition.prose_pt_br);
}
assert("gate_failure_refuse_redirect", gate.failure_policy?.on_critical_failure === "REFUSE_OR_REDIRECT", gate.failure_policy);
assert("gate_no_partial", gate.failure_policy?.never_sells_anyway === true && gate.failure_policy?.no_partial_pass === true, gate.failure_policy);
assert("gate_redirect_diagnosis", gate.failure_policy?.redirect_target_pt_br === "diagnóstico de lacunas", gate.failure_policy);

const EXPECTED_URLS = [
  "https://licitacoesecontratos.tcu.gov.br/4-5-5-matriz-de-riscos/",
  "https://licitacoesecontratos.tcu.gov.br/6-2-2-1-1-reequilibrio-economico-financeiro-recomposicao-ou-revisao-2/",
  "https://licitacoesecontratos.tcu.gov.br/6-1-8-infracoes-e-sancoes-administrativas-contratado/",
];
assert("three_tcu_references", data.context_references?.length === 3, data.context_references);
assert("tcu_urls_exact", JSON.stringify(data.context_references?.map((reference) => reference.url)) === JSON.stringify(EXPECTED_URLS), data.context_references);
for (const reference of data.context_references ?? []) {
  assert(`reference_source_${data.context_references.indexOf(reference)}`, reference.source === "TCU", reference);
  assert(`reference_use_${data.context_references.indexOf(reference)}`, filled(reference.title_pt_br) && filled(reference.use_pt_br), reference);
}

assert("review_required", data.adversarial_review?.required_before_first_sale === true && data.adversarial_review?.independent === true && data.adversarial_review?.reviewer_is_not_the_author === true, data.adversarial_review);
assert("review_not_started", data.adversarial_review?.state === "NOT_STARTED" && data.adversarial_review?.reviews?.length === 0, data.adversarial_review);
assert("unit_economics_not_started", data.unit_economics?.state === "NOT_STARTED" && data.unit_economics?.records?.length === 0, data.unit_economics);
assert("unit_economics_fields", JSON.stringify(data.unit_economics?.recorded_fields) === JSON.stringify(["actual_hours", "rework_hours", "seniority_mix", "contribution_margin"]), data.unit_economics);
assert("recalibration_three", data.recalibration?.paid_cases_required === 3 && data.recalibration?.state_until_recalibration === "VALIDATE", data.recalibration);
assert("recalibration_empty", Array.isArray(data.recalibration?.paid_cases_recorded) && data.recalibration.paid_cases_recorded.length === 0, data.recalibration);
assert("patterns_consent_governance", data.anonymised_patterns?.consent_required === true && data.anonymised_patterns?.governance_required === true, data.anonymised_patterns);
assert("patterns_no_identity", data.anonymised_patterns?.identifies_client_or_counterparty === false && data.anonymised_patterns?.originates_data_in_web_cfg === false, data.anonymised_patterns);
assert("patterns_empty", Array.isArray(data.anonymised_patterns?.patterns_published) && data.anonymised_patterns.patterns_published.length === 0, data.anonymised_patterns);
assert("synthetic_required", data.synthetic_example_requirements?.required_before_first_sale === true && data.synthetic_example_requirements?.state === "NOT_STARTED", data.synthetic_example_requirements);
assert("synthetic_empty", Array.isArray(data.synthetic_example_requirements?.produced) && data.synthetic_example_requirements.produced.length === 0, data.synthetic_example_requirements);
assert("synthetic_five_elements", filledList(data.synthetic_example_requirements?.required_elements_pt_br, 5) && data.synthetic_example_requirements.required_elements_pt_br.length === 5, data.synthetic_example_requirements);
assert("synthetic_no_client_data", data.synthetic_example_requirements?.uses_real_client_data === false, data.synthetic_example_requirements);

const common = data.common_rules ?? {};
assert("common_no_hours", common.scope_never_measured_by_open_hours === true && common.no_open_hourly_billing === true, common);
assert("common_additions_exhaustive", common.additional_charges_are_exhaustive === true && common.additional_charges_disclosed_before_charging === true, common);
assert("common_entry_gate", common.entry_gate_required_before_selling === true && common.capacity_required_before_accepting === true, common);
assert("common_data_boundary", common.no_data_or_identity_originates_in_web_cfg === true && common.truth_and_provenance_remain_in === "extra-cli", common);
assert("common_legal_boundary", common.no_success_fee === true && common.no_promise_of_settlement_or_judgment === true && common.no_legal_practice === true && common.no_official_expert_examination === true, common);
assert("common_grades", JSON.stringify(common.evidence_grades) === JSON.stringify(["FACT", "CALCULATION", "INFERENCE", "UNKNOWN"]), common.evidence_grades);

const acceptance = data.acceptance ?? [];
assert("acceptance_seven", acceptance.length === 7, acceptance.length);
assert("acceptance_unique", new Set(acceptance.map((entry) => entry.id)).size === 7, acceptance);
assert("acceptance_honest_states", acceptance.every((entry) => ["MET_BY_CONTRACT", "NOT_STARTED"].includes(entry.state)), acceptance);
assert("acceptance_empty_evidence", acceptance.every((entry) => Array.isArray(entry.evidence) && entry.evidence.length === 0), acceptance);
for (const entry of acceptance.filter((criterion) => criterion.state === "NOT_STARTED")) {
  assert(`acceptance_blocker_${entry.id}`, filled(entry.blocked_by_pt_br), entry);
}

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const selfRaw = fs.readFileSync(SELF_PATH, "utf8");
assert("no_em_dash_data", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_data", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
assert("no_em_dash_test", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_test", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert("npm_script", pkg.scripts?.["test:page-contract-disputas"] === "node tests/commercial/test_page_contract_disputas.mjs", pkg.scripts?.["test:page-contract-disputas"]);
assert("npm_chain", String(pkg.scripts?.test ?? "").includes("npm run test:page-contract-disputas"), pkg.scripts?.test);
const workflow = fs.readFileSync(path.join(root, ".github/workflows/site-ci.yml"), "utf8");
assert("workflow", workflow.includes("npm run test:page-contract-disputas"), "site-ci.yml");
const graph = fs.readFileSync(path.join(root, "scripts/site/affected_graph.mjs"), "utf8");
assert("graph", graph.includes('"test:page-contract-disputas"'), "affected_graph.mjs");
assert("graph_contract", graph.includes("data/commercial/page-contract-disputas.v1.json"), "affected_graph.mjs");
assert("graph_test", graph.includes("tests/commercial/test_page_contract_disputas.mjs"), "affected_graph.mjs");

const failed = results.filter((result) => !result.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
