/** Gate fail-closed da família integridade e maturidade, issue 342. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_PATH = path.join(root, "data/commercial/page-contract-integridade.v1.json");
const REGISTRY_PATH = path.join(root, "data/commercial/deliverables-registry.v1.json");
const SELF_PATH = fileURLToPath(import.meta.url);
const NAME = "page-contract-integridade";
const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
const filled = (value) => typeof value === "string" && value.trim().length > 0;
const filledList = (value, minimum = 1) => Array.isArray(value) && value.length >= minimum && value.every(filled);
function walkStrings(node, at = "$", out = []) {
  if (typeof node === "string") out.push({ at, value: node });
  else if (Array.isArray(node)) node.forEach((child, index) => walkStrings(child, `${at}[${index}]`, out));
  else if (node && typeof node === "object") Object.entries(node).forEach(([key, child]) => walkStrings(child, `${at}.${key}`, out));
  return out;
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
const allStrings = walkStrings(data);

assert("contract_id", data.contract_id === "page-contract-integridade.v1", data.contract_id);
assert("schema_version", data.schema_version === "1.0.0", data.schema_version);
assert("source_issue", data.source_issue === 342, data.source_issue);
assert("parent_issue", data.parent_issue === 329, data.parent_issue);
assert("related_issues", JSON.stringify(data.related_issues) === JSON.stringify([156, 332, 343]), data.related_issues);
assert("naming_authority", data.naming_authority_issue === 343, data.naming_authority_issue);
assert("decision_state", data.decision_state === "VALIDATE", data.decision_state);
assert("priority", data.priority === "P1", data.priority);
assert("fronts", JSON.stringify(data.executive_fronts) === JSON.stringify(["REVENUE NOW", "MARKET INTELLIGENCE MOAT"]), data.executive_fronts);
assert("leverage", JSON.stringify(data.leverage) === JSON.stringify(["trust", "data", "revenue"]), data.leverage);
assert("time_to_evidence", data.time_to_evidence_days === 30, data.time_to_evidence_days);
assert("research_not_started", data.research_state === "NOT_STARTED", data.research_state);
assert("evidence_empty", Array.isArray(data.evidence) && data.evidence.length === 0, data.evidence);
assert("human_not_started", data.human_validation?.state === "NOT_STARTED", data.human_validation);
assert("human_requires_three", data.human_validation?.real_proposals_required_before_promoting_price === 3, data.human_validation);
assert("human_empty", Array.isArray(data.human_validation?.collected) && data.human_validation.collected.length === 0, data.human_validation);
assert("no_pages", Array.isArray(data.pages_created_by_this_contract) && data.pages_created_by_this_contract.length === 0, data.pages_created_by_this_contract);
assert("checkout_disabled", data.checkout_enabled_anywhere === false, data.checkout_enabled_anywhere);

const EXPECTED = {
  43: { name: "Verificação de Sanções e Restrições Públicas", price: 490000, sla: 5, state: "BLOCKED", block: "#156", inputs: 4, outputs: 9, exclusions: 7 },
  44: { name: "Auditoria de Prontidão do Empreendimento Público", price: 490000, sla: 7, state: "VALIDATE", block: null, inputs: 5, outputs: 12, exclusions: 5 },
};
assert("two_items", items.length === 2, items.length);
assert("numbers_43_44", JSON.stringify(items.map((item) => item.number)) === JSON.stringify([43, 44]), items.map((item) => item.number));
assert("ids_unique", new Set(items.map((item) => item.deliverable_id)).size === 2, items.map((item) => item.deliverable_id));

for (const [numberText, expected] of Object.entries(EXPECTED)) {
  const number = Number(numberText);
  const item = byNumber.get(number);
  const prefix = `item_${number}`;
  assert(`${prefix}_exists`, Boolean(item), number);
  if (!item) continue;
  assert(`${prefix}_id`, item.deliverable_id === `CFG-D${number}`, item.deliverable_id);
  assert(`${prefix}_name`, item.public_name_pt_br === expected.name, item.public_name_pt_br);
  assert(`${prefix}_price`, item.price_cents === expected.price && item.pricing?.tiers?.length === 1 && item.pricing.tiers[0].price_cents === expected.price, item.pricing);
  assert(`${prefix}_billing`, item.billing === "one_time" && item.pricing?.billing === "one_time", [item.billing, item.pricing]);
  assert(`${prefix}_sla`, item.sla_business_days === expected.sla && item.sla_business_days_min === expected.sla && item.sla_business_days_max === expected.sla, item);
  assert(`${prefix}_tier_sla`, item.pricing?.tiers?.[0]?.sla_business_days === expected.sla, item.pricing);
  assert(`${prefix}_inputs`, filledList(item.inputs_pt_br, expected.inputs) && item.inputs_pt_br.length === expected.inputs, item.inputs_pt_br?.length);
  assert(`${prefix}_outputs`, filledList(item.outputs_pt_br, expected.outputs) && item.outputs_pt_br.length === expected.outputs, item.outputs_pt_br?.length);
  assert(`${prefix}_exclusions`, filledList(item.exclusions_pt_br, expected.exclusions) && item.exclusions_pt_br.length === expected.exclusions, item.exclusions_pt_br?.length);
  assert(`${prefix}_route_null`, item.route === null && item.page_exists === false, [item.route, item.page_exists]);
  assert(`${prefix}_state`, item.public_state === expected.state, item.public_state);
  assert(`${prefix}_block`, item.blocking_issue === expected.block, item.blocking_issue);
  assert(`${prefix}_door`, item.task_door === "QUALIFY", item.task_door);
  assert(`${prefix}_capacity`, item.capacity_required === false, item.capacity_required);
  assert(`${prefix}_checkout`, item.checkout_enabled === false, item.checkout_enabled);
  assert(`${prefix}_price_hypothesis`, item.price_state === "PILOT_HYPOTHESIS", item.price_state);
  assert(`${prefix}_no_credit`, item.credit_rule === null, item.credit_rule);
  assert(`${prefix}_no_deadline_gate`, item.safe_deadline_gate === null, item.safe_deadline_gate);
  assert(`${prefix}_legal_boundary`, filledList(item.legal_boundary_pt_br, 5) && item.legal_boundary_pt_br.length === 5, item.legal_boundary_pt_br);
  assert(`${prefix}_prohibitions_false`, Object.keys(item.prohibitions ?? {}).length === 17 && Object.values(item.prohibitions ?? {}).every((value) => value === false), item.prohibitions);

  const canonical = canonicalById.get(item.deliverable_id);
  assert(`${prefix}_canonical_exists`, Boolean(canonical), item.deliverable_id);
  if (!canonical) continue;
  assert(`${prefix}_canonical_name`, canonical.public_name_pt_br === item.public_name_pt_br, [canonical.public_name_pt_br, item.public_name_pt_br]);
  assert(`${prefix}_canonical_price`, canonical.price?.amount_cents === expected.price, canonical.price);
  assert(`${prefix}_canonical_sla`, canonical.sla?.business_days_min === expected.sla && canonical.sla?.business_days_max === expected.sla, canonical.sla);
  assert(`${prefix}_canonical_starts_after`, canonical.sla?.starts_after === item.sla_starts_after_pt_br, [canonical.sla?.starts_after, item.sla_starts_after_pt_br]);
  assert(`${prefix}_canonical_route`, canonical.route === item.route, [canonical.route, item.route]);
  assert(`${prefix}_canonical_state`, canonical.public_state === item.public_state, [canonical.public_state, item.public_state]);
  assert(`${prefix}_canonical_block`, canonical.blocking_issue === item.blocking_issue, [canonical.blocking_issue, item.blocking_issue]);
  assert(`${prefix}_canonical_door`, canonical.task_door === item.task_door, [canonical.task_door, item.task_door]);
  assert(`${prefix}_canonical_capacity`, canonical.capacity_required === item.capacity_required, [canonical.capacity_required, item.capacity_required]);
  assert(`${prefix}_canonical_source`, canonical.source_issue === "#342", canonical.source_issue);
}

const item43 = byNumber.get(43);
assert("item_43_max_five_cnpjs", item43?.scope_unit?.max_cnpjs === 5, item43?.scope_unit);
assert("item_43_entities_by_client", item43?.scope_unit?.entities_identified_by === "cliente" && item43?.scope_unit?.entities_identified_by_confenge === false, item43?.scope_unit);
assert("item_43_sources_possible", item43?.sources?.are_possible_not_guaranteed === true && item43?.sources?.coverage_declared_per_source === true, item43?.sources);
assert("item_43_official_lists", JSON.stringify(item43?.sources?.official_lists_pt_br) === JSON.stringify(["CEIS", "CNEP", "CEPIM"]), item43?.sources);
assert("item_43_portal_url", item43?.sources?.public_source_urls?.[0]?.url === "https://portaldatransparencia.gov.br/sancoes", item43?.sources);
assert(
  "item_43_classification_exact",
  JSON.stringify(item43?.classification?.values) === JSON.stringify(["ENCONTRADO", "NÃO ENCONTRADO NA COBERTURA", "UNKNOWN"]),
  item43?.classification,
);
assert("item_43_three_values", item43?.classification?.value_count === 3 && item43?.classification?.closed_vocabulary === true, item43?.classification);
assert("item_43_no_clean_value", item43?.classification?.has_clean_value === false, item43?.classification);
assert("item_43_definitions", Object.keys(item43?.classification?.definitions_pt_br ?? {}).length === 3 && Object.values(item43?.classification?.definitions_pt_br ?? {}).every(filled), item43?.classification);
const dependency = item43?.dependency ?? {};
assert("item_43_dependency_156", dependency.blocking_issue === "#156" && dependency.blocking_issue_number === 156, dependency);
assert("item_43_fail_closed", dependency.state === "BLOCKED" && dependency.fail_closed === true, dependency);
for (const key of ["may_be_promoted", "may_be_charged", "may_issue_conclusion", "may_open_checkout"]) {
  assert(`item_43_${key}_false`, dependency[key] === false, dependency);
}
const RELEASE_KEYS = ["official_key", "terminal_pagination", "freshness", "identity", "coverage", "correct_unknown"];
assert("item_43_release_six", dependency.release_conditions?.length === 6, dependency.release_conditions);
assert("item_43_release_exact", JSON.stringify(dependency.release_conditions?.map((condition) => condition.key)) === JSON.stringify(RELEASE_KEYS), dependency.release_conditions);
assert("item_43_release_incomplete", dependency.release_conditions_complete === false, dependency.release_conditions_complete);
for (const condition of dependency.release_conditions ?? []) {
  assert(`release_${condition.key}_label`, filled(condition.label_pt_br), condition);
  assert(`release_${condition.key}_statement`, filled(condition.statement_pt_br), condition);
}

const item44 = byNumber.get(44);
assert("item_44_unit_one_one", item44?.scope_unit?.enterprises_per_unit === 1 && item44?.scope_unit?.territories_or_agencies_per_unit === 1, item44?.scope_unit);
assert("item_44_sources_six", filledList(item44?.sources?.list_pt_br, 6) && item44.sources.list_pt_br.length === 6, item44?.sources);
const URLS_44 = [
  "https://www.gov.br/pncp/pt-br",
  "https://www.gov.br/transferegov/pt-br/ferramentas-gestao/dados-abertos/download-dados",
  "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/pac/selecoes-novo-pac/investimentos-selecionados",
];
assert("item_44_urls_exact", JSON.stringify(item44?.sources?.public_source_urls?.map((source) => source.url)) === JSON.stringify(URLS_44), item44?.sources);
assert("item_44_no_field_inspection", item44?.sources?.field_inspection === false, item44?.sources);
assert(
  "item_44_decisions_exact",
  JSON.stringify(item44?.decision_effect?.states) === JSON.stringify(["GO", "GO COM CONDIÇÕES", "AGUARDAR", "NO-GO"]),
  item44?.decision_effect,
);
assert("item_44_four_states", item44?.decision_effect?.state_count === 4 && item44?.decision_effect?.closed_vocabulary === true, item44?.decision_effect);
assert("item_44_not_seal_or_veto", item44?.decision_effect?.is_a_seal === false && item44?.decision_effect?.automates_veto === false, item44?.decision_effect);

const communication = data.communication_principle ?? {};
assert("not_found_not_nonexistent", communication.not_found_means_nonexistent === false, communication);
assert("not_seal", communication.is_a_seal === false, communication);
assert("screen_artifact_beside", communication.disclosure_required_on_screen === true && communication.disclosure_required_on_artifact === true && communication.disclosure_sits_beside_conclusion === true, communication);
const DISCLOSURES = ["source", "coverage", "query", "date", "limitations", "unknown"];
assert("six_disclosures", communication.required_disclosure?.length === 6, communication.required_disclosure);
assert("disclosures_exact", JSON.stringify(communication.required_disclosure?.map((entry) => entry.element)) === JSON.stringify(DISCLOSURES), communication.required_disclosure);
for (const disclosure of communication.required_disclosure ?? []) {
  assert(`disclosure_${disclosure.element}_label`, filled(disclosure.label_pt_br), disclosure);
  assert(`disclosure_${disclosure.element}_statement`, filled(disclosure.statement_pt_br), disclosure);
}
assert("fact_provenance_exact", JSON.stringify(communication.every_fact_carries_pt_br) === JSON.stringify(["entidade", "fonte", "consulta ou corte", "data", "cobertura"]), communication.every_fact_carries_pt_br);
assert("negative_inference_not_accusation", communication.negative_inference_becomes_accusation === false && communication.negative_inference_becomes_seal === false, communication);
assert("human_decision_not_veto", communication.results_promote_human_decision === true && communication.results_promote_diligence === true && communication.automates_veto === false, communication);

const forbidden = data.forbidden_claims ?? {};
assert("forbidden_six_patterns", filledList(forbidden.patterns_pt_br, 6) && forbidden.patterns_pt_br.length === 6, forbidden.patterns_pt_br);
assert("forbidden_five_values", filledList(forbidden.forbidden_classification_values, 5) && forbidden.forbidden_classification_values.length === 5, forbidden.forbidden_classification_values);
assert("absence_not_fact", forbidden.absence_of_record_is_not_absence_of_fact === true && forbidden.unknown_never_becomes_zero === true, forbidden);
const claimHits = allStrings.filter(({ at, value }) => {
  if (at.startsWith("$.forbidden_claims") || at.includes(".exclusions_pt_br")) return false;
  return /empresa limpa|ficha limpa|nada consta|certidão negativa universal/i.test(value);
});
assert("no_positive_clean_claim", claimHits.length === 0, claimHits);

const architecture = data.architecture ?? {};
assert("architecture_extra_cli", architecture.consumes_versioned_contracts_from === "extra-cli" && architecture.contract_access === "SELECT-only", architecture);
assert("architecture_contract", JSON.stringify(architecture.producer_contracts) === JSON.stringify(["public-read-integrity/1.0"]), architecture.producer_contracts);
assert("architecture_no_parallel_plane", architecture.crawler_in_web_cfg === false && architecture.identity_store_in_web_cfg === false && architecture.parallel_datalake_in_web_cfg === false, architecture);
assert("architecture_warmbly", architecture.commercial_action_owner === "warmbly", architecture);

const synthetic = data.synthetic_example ?? {};
assert("synthetic_not_started", synthetic.state === "NOT_STARTED" && synthetic.produced === false && synthetic.published === false, synthetic);
assert("synthetic_empty", Array.isArray(synthetic.artifacts) && synthetic.artifacts.length === 0, synthetic.artifacts);
assert("synthetic_no_real_entity", synthetic.contains_real_cnpj === false && synthetic.contains_real_company === false, synthetic);
assert("synthetic_three_cases", JSON.stringify(synthetic.required_cases?.map((entry) => entry.case)) === JSON.stringify(["homonym", "divergent_cnpj", "unavailable_source"]), synthetic.required_cases);

const common = data.common_rules ?? {};
assert("common_registry_prices", common.prices_come_from_registry === true && common.prices_not_changed_by_this_contract === true, common);
assert("common_price_hypothesis", common.price_state === "PILOT_HYPOTHESIS", common.price_state);
assert("common_no_checkout", common.no_checkout_enabled_by_this_contract === true, common);
assert("common_data_boundary", common.no_data_or_identity_originates_in_web_cfg === true && common.truth_and_provenance_remain_in === "extra-cli", common);
assert("common_provenance", common.every_fact_carries_entity_source_query_date_and_coverage === true, common);

const acceptance = data.acceptance ?? [];
assert("acceptance_nine", acceptance.length === 9, acceptance.length);
assert("acceptance_unique", new Set(acceptance.map((entry) => entry.key)).size === 9, acceptance);
assert("acceptance_honest", acceptance.every((entry) => ["MET_BY_CONTRACT", "NOT_STARTED"].includes(entry.state)), acceptance);
assert("acceptance_evidence_empty", acceptance.every((entry) => Array.isArray(entry.evidence) && entry.evidence.length === 0), acceptance);

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const selfRaw = fs.readFileSync(SELF_PATH, "utf8");
assert("no_em_dash_data", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_data", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
assert("no_em_dash_test", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_test", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert("npm_script", pkg.scripts?.["test:page-contract-integridade"] === "node tests/commercial/test_page_contract_integridade.mjs", pkg.scripts?.["test:page-contract-integridade"]);
assert("npm_chain", String(pkg.scripts?.test ?? "").includes("npm run test:page-contract-integridade"), pkg.scripts?.test);
const workflow = fs.readFileSync(path.join(root, ".github/workflows/site-ci.yml"), "utf8");
assert("workflow", workflow.includes("npm run test:page-contract-integridade"), "site-ci.yml");
const graph = fs.readFileSync(path.join(root, "scripts/site/affected_graph.mjs"), "utf8");
assert("graph", graph.includes('"test:page-contract-integridade"'), "affected_graph.mjs");
assert("graph_contract", graph.includes("data/commercial/page-contract-integridade.v1.json"), "affected_graph.mjs");
assert("graph_test", graph.includes("tests/commercial/test_page_contract_integridade.mjs"), "affected_graph.mjs");

const failed = results.filter((result) => !result.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
