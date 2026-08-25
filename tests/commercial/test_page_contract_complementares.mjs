/**
 * Gate fail-closed do contrato dos itens 45 a 48, issue 337.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_PATH = path.join(root, "data/commercial/page-contract-complementares.v1.json");
const REGISTRY_PATH = path.join(root, "data/commercial/deliverables-registry.v1.json");
const SELF_PATH = fileURLToPath(import.meta.url);
const NAME = "page-contract-complementares";
const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
function filled(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function filledList(value, minimum = 1) {
  return Array.isArray(value) && value.length >= minimum && value.every(filled);
}
function walkStrings(node, at = "$", out = []) {
  if (typeof node === "string") out.push({ at, value: node });
  else if (Array.isArray(node)) node.forEach((child, index) => walkStrings(child, `${at}[${index}]`, out));
  else if (node && typeof node === "object") {
    Object.entries(node).forEach(([key, child]) => walkStrings(child, `${at}.${key}`, out));
  }
  return out;
}
function amounts(price) {
  if (Number.isInteger(price?.amount_cents)) return [price.amount_cents];
  return (price?.tiers ?? []).map((tier) => tier.amount_cents);
}

assert("data_file_exists", fs.existsSync(DATA_PATH), DATA_PATH);
assert("registry_exists", fs.existsSync(REGISTRY_PATH), REGISTRY_PATH);
const raw = fs.readFileSync(DATA_PATH, "utf8");
let data;
try {
  data = JSON.parse(raw);
  assert("data_file_parses", true, DATA_PATH);
} catch (error) {
  assert("data_file_parses", false, String(error));
  process.exit(1);
}
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const canonicalById = new Map((registry.deliverables ?? []).map((item) => [item.deliverable_id, item]));
const items = data.items ?? [];
const byNumber = new Map(items.map((item) => [item.number, item]));
const allStrings = walkStrings(data);

assert("contract_id", data.contract_id === "page-contract-complementares.v1", data.contract_id);
assert("schema_version", data.schema_version === "1.0.0", data.schema_version);
assert("source_issue", data.source_issue === 337, data.source_issue);
assert("parent_issue", data.parent_issue === 329, data.parent_issue);
assert("naming_authority", data.naming_authority_issue === 343, data.naming_authority_issue);
assert("decision_state", data.decision_state === "VALIDATE", data.decision_state);
assert("priority", data.priority === "P1", data.priority);
assert(
  "executive_fronts",
  JSON.stringify(data.executive_fronts) === JSON.stringify(["REVENUE NOW", "MARKET INTELLIGENCE MOAT"]),
  data.executive_fronts,
);
assert(
  "leverage",
  JSON.stringify(data.leverage) === JSON.stringify(["revenue", "data", "trust", "customer"]),
  data.leverage,
);
assert("time_to_evidence", data.time_to_evidence_days === 30, data.time_to_evidence_days);
assert("research_not_started", data.research_state === "NOT_STARTED", data.research_state);
assert("evidence_empty", Array.isArray(data.evidence) && data.evidence.length === 0, data.evidence);
assert("human_not_started", data.human_validation?.state === "NOT_STARTED", data.human_validation);
assert("human_requires_three", data.human_validation?.real_proposals_required_before_promoting_price === 3, data.human_validation);
assert("human_evidence_empty", Array.isArray(data.human_validation?.collected) && data.human_validation.collected.length === 0, data.human_validation);
assert("no_pages_created", Array.isArray(data.pages_created_by_this_contract) && data.pages_created_by_this_contract.length === 0, data.pages_created_by_this_contract);
assert("checkout_disabled_globally", data.checkout_enabled_anywhere === false, data.checkout_enabled_anywhere);

assert("four_items", items.length === 4, items.length);
assert("numbers_45_to_48", JSON.stringify(items.map((item) => item.number)) === JSON.stringify([45, 46, 47, 48]), items.map((item) => item.number));
assert("ids_unique", new Set(items.map((item) => item.deliverable_id)).size === 4, items.map((item) => item.deliverable_id));

const EXPECTED = {
  45: { name: "Monitoramento Mensal de Mercado e Contratos Públicos", prices: [490000], billing: "subscription_monthly", sla: [null, null], door: "GROW", inputs: 5, delivery: 6, limits: 7, exclusions: 8 },
  46: { name: "Oficina para Decidir Quais Licitações Disputar", prices: [790000], billing: "one_time", sla: [7, 7], door: "CAPABILITY", inputs: 5, delivery: 7, limits: 7, exclusions: 8 },
  47: { name: "Capacitação de Equipes de Licitações e Contratos", prices: [1290000, 1980000], billing: "one_time", sla: [null, null], door: "CAPABILITY", inputs: 5, delivery: 7, limits: 7, exclusions: 9 },
  48: { name: "Estudo Sob Medida com Dados Públicos", prices: [980000, 1980000, 3980000], billing: "one_time", sla: [10, 30], door: "CAPABILITY", inputs: 6, delivery: 10, limits: 8, exclusions: 9 },
};

for (const [numberText, expected] of Object.entries(EXPECTED)) {
  const number = Number(numberText);
  const item = byNumber.get(number);
  const prefix = `item_${number}`;
  assert(`${prefix}_exists`, Boolean(item), number);
  if (!item) continue;
  assert(`${prefix}_id`, item.deliverable_id === `CFG-D${number}`, item.deliverable_id);
  assert(`${prefix}_name`, item.public_name_pt_br === expected.name, item.public_name_pt_br);
  assert(`${prefix}_route_null`, item.route === null && item.page_exists === false, [item.route, item.page_exists]);
  assert(`${prefix}_public_state`, item.public_state === "VALIDATE", item.public_state);
  assert(`${prefix}_door`, item.task_door === expected.door, item.task_door);
  assert(`${prefix}_capacity`, item.capacity_required === true, item.capacity_required);
  assert(`${prefix}_checkout`, item.checkout_enabled === false, item.checkout_enabled);
  assert(`${prefix}_prices`, JSON.stringify(item.pricing?.tiers?.map((tier) => tier.price_cents)) === JSON.stringify(expected.prices), item.pricing);
  assert(`${prefix}_billing`, item.pricing?.billing === expected.billing, item.pricing?.billing);
  assert(`${prefix}_tiers_exhaustive`, item.pricing?.tiers_are_exhaustive === true, item.pricing?.tiers_are_exhaustive);
  assert(`${prefix}_not_price_on_request`, item.pricing?.price_on_request === false, item.pricing?.price_on_request);
  assert(`${prefix}_sla_min`, item.sla?.business_days_min === expected.sla[0], item.sla);
  assert(`${prefix}_sla_max`, item.sla?.business_days_max === expected.sla[1], item.sla);
  assert(`${prefix}_inputs`, filledList(item.required_inputs_pt_br, expected.inputs) && item.required_inputs_pt_br.length === expected.inputs, item.required_inputs_pt_br?.length);
  assert(`${prefix}_delivery`, filledList(item.delivery_pt_br, expected.delivery) && item.delivery_pt_br.length === expected.delivery, item.delivery_pt_br?.length);
  assert(`${prefix}_limits`, filledList(item.limits_pt_br, expected.limits) && item.limits_pt_br.length === expected.limits, item.limits_pt_br?.length);
  assert(`${prefix}_exclusions`, filledList(item.exclusions_pt_br, expected.exclusions) && item.exclusions_pt_br.length === expected.exclusions, item.exclusions_pt_br?.length);
  assert(`${prefix}_step_up`, item.step_up?.declared_by_issue === true && filled(item.step_up?.trigger_pt_br) && filled(item.step_up?.statement_pt_br), item.step_up);
  assert(`${prefix}_lead_destination`, item.lead_destination === "warmbly:CONFENGE_WEB", item.lead_destination);
  assert(`${prefix}_analytics_id`, item.analytics?.deliverable_attr === item.deliverable_id, item.analytics);
  assert(`${prefix}_data_owner`, item.data_contract?.owner === "extra-cli", item.data_contract);
  assert(`${prefix}_no_crawler`, item.data_contract?.web_cfg_hosts_crawler === false, item.data_contract);
  assert(`${prefix}_no_datalake`, item.data_contract?.web_cfg_hosts_datalake === false, item.data_contract);
  assert(`${prefix}_grades`, JSON.stringify(item.data_contract?.evidence_grades) === JSON.stringify(["FACT", "CALCULATION", "INFERENCE", "UNKNOWN"]), item.data_contract);
  assert(`${prefix}_reusable_asset`, item.reusable_asset?.produces_governed_reusable_asset === true && item.reusable_asset?.hours_only === false, item.reusable_asset);
  assert(`${prefix}_price_not_promoted`, item.price_promotion?.state === "NOT_PROMOTED", item.price_promotion);
  assert(`${prefix}_promotion_three_conditions`, item.price_promotion?.requires_real_proposal === true && item.price_promotion?.requires_observed_cost === true && item.price_promotion?.requires_recorded_outcome === true, item.price_promotion);
  assert(`${prefix}_promotion_evidence_empty`, Array.isArray(item.price_promotion?.evidence) && item.price_promotion.evidence.length === 0, item.price_promotion?.evidence);
  assert(`${prefix}_prohibitions_false`, Object.keys(item.prohibitions ?? {}).length >= 19 && Object.values(item.prohibitions ?? {}).every((value) => value === false), item.prohibitions);

  const canonical = canonicalById.get(item.deliverable_id);
  assert(`${prefix}_canonical_exists`, Boolean(canonical), item.deliverable_id);
  if (!canonical) continue;
  assert(`${prefix}_canonical_name`, canonical.public_name_pt_br === item.public_name_pt_br, [canonical.public_name_pt_br, item.public_name_pt_br]);
  assert(`${prefix}_canonical_route`, canonical.route === item.route, [canonical.route, item.route]);
  assert(`${prefix}_canonical_state`, canonical.public_state === item.public_state, [canonical.public_state, item.public_state]);
  assert(`${prefix}_canonical_door`, canonical.task_door === item.task_door, [canonical.task_door, item.task_door]);
  assert(`${prefix}_canonical_capacity`, canonical.capacity_required === item.capacity_required, [canonical.capacity_required, item.capacity_required]);
  assert(`${prefix}_canonical_prices`, JSON.stringify(amounts(canonical.price)) === JSON.stringify(expected.prices), canonical.price);
  assert(`${prefix}_canonical_billing`, canonical.price?.billing === item.pricing?.billing, [canonical.price?.billing, item.pricing?.billing]);
  assert(`${prefix}_canonical_sla_min`, canonical.sla?.business_days_min === item.sla?.business_days_min, [canonical.sla, item.sla]);
  assert(`${prefix}_canonical_sla_max`, canonical.sla?.business_days_max === item.sla?.business_days_max, [canonical.sla, item.sla]);
  assert(`${prefix}_source_issue`, canonical.source_issue === "#337", canonical.source_issue);
}

const item45 = byNumber.get(45);
assert("item_45_managed_by_people", item45?.managed_service?.is_managed_service === true && item45?.managed_service?.delivered_by_people === true, item45?.managed_service);
assert("item_45_no_real_time", item45?.managed_service?.promises_real_time === false, item45?.managed_service);
assert("item_45_not_alert_platform", item45?.managed_service?.is_alerts_platform === false, item45?.managed_service);
assert("item_45_twenty_objects", item45?.watch_objects?.max_count === 20 && item45?.watch_objects?.kinds_are_exhaustive === true, item45?.watch_objects);
assert("item_45_initial_commitment", item45?.pricing?.commitment_months === 3, item45?.pricing);

for (const number of [46, 47]) {
  const application = byNumber.get(number)?.icp_application;
  assert(`item_${number}_applied_to_icp`, application?.applied_to_icp === true && application?.uses_client_own_cases === true, application);
  assert(`item_${number}_not_beginners_school`, application?.is_beginners_school === false && application?.is_open_class_for_beginners === false && application?.is_introductory_course === false, application);
  assert(`item_${number}_no_credentials`, application?.grants_certification === false && application?.grants_diploma === false && application?.grants_graduation === false, application);
}
const item47 = byNumber.get(47);
assert("item_47_class_cap", item47?.class?.max_participants === 20 && item47?.class?.tracks_per_class === 1, item47?.class);
assert("item_47_two_tiers", JSON.stringify(item47?.pricing?.tiers?.map((tier) => tier.tier_id)) === JSON.stringify(["8h", "16h"]), item47?.pricing);
assert("item_47_travel_at_cost", item47?.travel_and_lodging?.charged_at_cost_outside_base_area === true && item47?.travel_and_lodging?.markup_percent === 0, item47?.travel_and_lodging);
assert("item_47_travel_prior_approval", item47?.travel_and_lodging?.requires_prior_approval === true && item47?.travel_and_lodging?.base_area_pt_br === "Grande Florianópolis", item47?.travel_and_lodging);

const item48 = byNumber.get(48);
const INPUTS_48 = ["decisão a tomar", "pergunta falsificável", "universo de análise", "corte temporal", "cobertura mínima aceitável", "formato de consumo do resultado"];
assert("item_48_inputs_exact", JSON.stringify(item48?.mandatory_entry_inputs_pt_br) === JSON.stringify(INPUTS_48), item48?.mandatory_entry_inputs_pt_br);
assert("item_48_inputs_mandatory", item48?.entry_inputs_are_mandatory === true && item48?.entry_inputs_are_exhaustive === true, item48);
assert("item_48_common_delivery_ten", filledList(item48?.common_delivery_pt_br, 10) && item48.common_delivery_pt_br.length === 10, item48?.common_delivery_pt_br);
assert("item_48_materialises_extra_cli", item48?.data_materialisation?.materialises_in === "extra-cli" && item48?.data_materialisation?.web_cfg_materialises_data === false, item48?.data_materialisation);
assert("item_48_web_only_publication_capture", item48?.data_materialisation?.web_cfg_publishes === true && item48?.data_materialisation?.web_cfg_captures === true, item48?.data_materialisation);
assert("item_48_reproducible", item48?.reproducibility?.method_must_be_reproducible === true && item48?.reproducibility?.provenance_per_field === true, item48?.reproducibility);
assert("item_48_closed_sla_tiers", JSON.stringify(item48?.pricing?.tiers?.map((tier) => tier.sla_business_days)) === JSON.stringify([10, 20, 30]), item48?.pricing);
for (const key of ["uses_private_data_without_authorisation", "scrapes_against_terms_or_licence", "performs_personal_surveillance", "sells_disguised_continuous_product", "hosts_crawler_in_web_cfg", "hosts_datalake_in_web_cfg", "delivers_non_reproducible_result"]) {
  assert(`item_48_forbidden_${key}`, item48?.prohibitions?.[key] === false, item48?.prohibitions);
}

const boundary = data.container_boundary ?? {};
assert("boundary_exhaustive", boundary.exhaustive === true, boundary);
assert("boundary_mutually_exclusive", boundary.mutually_exclusive === true, boundary);
assert("boundary_six_rows", boundary.row_count === 6 && boundary.rows?.length === 6, boundary);
assert("boundary_needs_unique", new Set((boundary.rows ?? []).map((row) => row.dominant_need_pt_br)).size === 6, boundary.rows);
assert(
  "boundary_targets_exact",
  JSON.stringify((boundary.rows ?? []).map((row) => row.target_item ?? row.target_container_id)) === JSON.stringify([45, 46, 47, 48, "diretoria_fracionada", 25]),
  boundary.rows,
);
for (const row of boundary.rows ?? []) {
  assert(`boundary_row_need_${boundary.rows.indexOf(row)}`, filled(row.dominant_need_pt_br), row);
  assert(`boundary_row_name_${boundary.rows.indexOf(row)}`, filled(row.target_public_name_pt_br), row);
}

assert("no_price_on_request_enforced", data.no_price_on_request?.enforced === true, data.no_price_on_request);
assert("all_prices_or_tiers", data.no_price_on_request?.every_item_has_concrete_price_or_exhaustive_tiers === true, data.no_price_on_request);
for (const item of items) {
  const tierPrices = item.pricing?.tiers?.map((tier) => tier.price_cents) ?? [];
  assert(`item_${item.number}_concrete_prices`, tierPrices.length > 0 && tierPrices.every((price) => Number.isInteger(price) && price > 0), tierPrices);
}
const forbiddenPhrases = data.no_price_on_request?.forbidden_phrases_pt_br ?? [];
assert("forbidden_price_phrases_declared", forbiddenPhrases.length === 10, forbiddenPhrases);
const positiveOfferStrings = allStrings.filter(({ at }) => !at.startsWith("$.no_price_on_request") && !at.includes(".exclusions_pt_br"));
for (const phrase of forbiddenPhrases) {
  const hits = positiveOfferStrings.filter(({ value }) => value.toLowerCase().includes(phrase.toLowerCase()));
  assert(`no_positive_price_request_${forbiddenPhrases.indexOf(phrase)}`, hits.length === 0, hits.map((hit) => hit.at));
}

const common = data.common_rules ?? {};
assert("common_truth_owner", common.truth_and_provenance_remain_in === "extra-cli", common);
assert("common_web_role", common.web_cfg_only_publishes_and_captures === true, common);
assert("common_no_crawler", common.no_crawler_in_web_cfg === true && common.no_datalake_in_web_cfg === true, common);
assert("common_reusable", common.every_repetition_produces_governed_reusable_asset === true && common.hours_alone_are_not_the_deliverable === true, common);
assert("common_no_success_fee", common.no_success_fee === true && common.no_promise_of_victory_or_award === true, common);
assert("common_promotion_locked", common.price_promotion_rule?.state === "NOT_PROMOTED" && common.price_promotion_rule?.all_three_required === true, common.price_promotion_rule);

const acceptance = data.acceptance ?? [];
assert("acceptance_ten", acceptance.length === 10, acceptance.length);
assert("acceptance_ids_unique", new Set(acceptance.map((item) => item.id)).size === acceptance.length, acceptance.map((item) => item.id));
assert("acceptance_states_honest", acceptance.every((item) => ["MET_BY_CONTRACT", "NOT_STARTED"].includes(item.state)), acceptance);
assert("acceptance_evidence_empty", acceptance.every((item) => Array.isArray(item.evidence) && item.evidence.length === 0), acceptance);
for (const item of acceptance.filter((entry) => entry.state === "NOT_STARTED")) {
  assert(`acceptance_blocker_${item.id}`, filled(item.blocked_by_pt_br), item);
}

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const selfRaw = fs.readFileSync(SELF_PATH, "utf8");
assert("no_em_dash_in_data", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_in_data", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
assert("no_em_dash_in_test", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_in_test", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert("npm_script", pkg.scripts?.["test:page-contract-complementares"] === "node tests/commercial/test_page_contract_complementares.mjs", pkg.scripts?.["test:page-contract-complementares"]);
assert("npm_test_chain", String(pkg.scripts?.test ?? "").includes("npm run test:page-contract-complementares"), pkg.scripts?.test);
const workflow = fs.readFileSync(path.join(root, ".github/workflows/site-ci.yml"), "utf8");
assert("workflow_wiring", workflow.includes("npm run test:page-contract-complementares"), "site-ci.yml");
const graph = fs.readFileSync(path.join(root, "scripts/site/affected_graph.mjs"), "utf8");
assert("graph_wiring", graph.includes('"test:page-contract-complementares"'), "affected_graph.mjs");
assert("graph_contract", graph.includes("data/commercial/page-contract-complementares.v1.json"), "affected_graph.mjs");
assert("graph_test", graph.includes("tests/commercial/test_page_contract_complementares.mjs"), "affected_graph.mjs");

const failed = results.filter((result) => !result.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
