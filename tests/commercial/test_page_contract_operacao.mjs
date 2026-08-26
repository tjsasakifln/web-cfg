/**
 * Gate do contrato de página da família "Operação e acompanhamento"
 * (issue #334, itens 24 e 25 do rol canônico).
 *
 * O teste é autossuficiente: roda em node puro, lê o próprio JSON com fs e só
 * cruza com artefatos que já existem em main. Ele é fail-closed nos pontos que
 * a #334 declara inegociáveis:
 *
 *   A. preço-piloto, capacidade, inputs, SLA e não-inclusões dos itens 24 e 25;
 *   B. a tabela de diferenciação obrigatória, linha a linha, contra o registro
 *      canônico e contra o catálogo congelado da Diretoria;
 *   C. o crédito de expansão do item 24, inclusive a exclusão do Diagnóstico
 *      de Expansão;
 *   D. a ausência de assinatura SaaS, trial, quota de plataforma e referência
 *      à marca legada;
 *   E. a não apropriação de captura, checkout e first-fold, que continuam com
 *      as issues 232, 88 e 327;
 *   F. estados de aceitação honestos, com evidência vazia.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const NAME = "page-contract-operacao";
const DATA_PATH = path.join(root, "data/commercial/page-contract-operacao.v1.json");

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, typeof detail === "string" ? detail : JSON.stringify(detail));
}
function assert(name, cond, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

assert("data_file_exists", fs.existsSync(DATA_PATH), DATA_PATH);
const raw = fs.readFileSync(DATA_PATH, "utf8");
let data = null;
try {
  data = JSON.parse(raw);
  pass("data_file_parses");
} catch (err) {
  fail("data_file_parses", String(err));
  console.error(`${NAME}: 0/1 checks passed`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function walkStrings(node, at, out) {
  if (typeof node === "string") {
    out.push({ at, value: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => walkStrings(child, `${at}[${i}]`, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) walkStrings(child, `${at}.${key}`, out);
  }
  return out;
}
const allStrings = walkStrings(data, "$", []);
const filled = (v) => typeof v === "string" && v.trim().length > 0;
const filledList = (v, min) => Array.isArray(v) && v.length >= min && v.every(filled);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const items = Array.isArray(data.items) ? data.items : [];
const byNumber = new Map(items.map((it) => [it.number, it]));

/* Fontes canônicas que já existem em main. */
const REGISTRY_PATH = path.join(root, "data/commercial/deliverables-registry.v1.json");
const CATALOG_PATH = path.join(root, "data/offers/catalog.snapshot.json");
const NAMING_PATH = path.join(root, "data/commercial/offer-naming.v1.json");
assert("registry_exists_in_main", fs.existsSync(REGISTRY_PATH), REGISTRY_PATH);
assert("catalog_exists_in_main", fs.existsSync(CATALOG_PATH), CATALOG_PATH);
assert("naming_exists_in_main", fs.existsSync(NAMING_PATH), NAMING_PATH);
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const naming = JSON.parse(fs.readFileSync(NAMING_PATH, "utf8"));
const regById = new Map((registry.deliverables || []).map((d) => [d.deliverable_id, d]));
const offerById = new Map((catalog.offers || []).map((o) => [o.offer_id, o]));
const containerById = new Map((registry.containers || []).map((c) => [c.container_id, c]));
const namingById = new Map((naming.names || []).map((n) => [n.deliverable_id, n]));
const namingContainerById = new Map((naming.containers || []).map((c) => [c.container_id, c]));

/* ------------------------------------------------------------------ */
/* 1. envelope, estado de decisão e gate de captura de mercado          */
/* ------------------------------------------------------------------ */

assert("contract_id", data.contract_id === "page-contract-operacao.v1", data.contract_id);
assert("schema_version", data.schema_version === "1.0.0", data.schema_version);
assert("family_pt_br", data.family_pt_br === "Operação e acompanhamento", data.family_pt_br);
assert("scope_declared", filled(data.scope_pt_br) && data.scope_pt_br.length >= 60, data.scope_pt_br);
assert("source_issue_334", data.source_issue === 334, data.source_issue);
assert("parent_issue_329", data.parent_issue === 329, data.parent_issue);
assert("naming_authority_343", data.naming_authority_issue === 343, data.naming_authority_issue);
assert(
  "related_issues_exact",
  eq([...(data.related_issues || [])].sort((a, b) => a - b), [88, 232, 327, 343]),
  data.related_issues,
);
assert("decision_state_validate", data.decision_state === "VALIDATE", data.decision_state);
assert("priority_p1", data.priority === "P1", data.priority);
assert("executive_front", data.executive_front === "REVENUE NOW + CUSTOMER EXPANSION", data.executive_front);
assert(
  "leverage_exact",
  eq([...(data.leverage || [])].sort(), ["customer", "revenue", "trust"]),
  data.leverage,
);
assert("time_to_evidence_21_days", data.time_to_evidence_days === 21, data.time_to_evidence_days);
assert("price_unit_cents", data.price_unit === "cents" && data.currency === "BRL", [data.price_unit, data.currency]);
assert("price_basis_piloto", data.price_basis === "piloto", data.price_basis);
assert("research_state_not_started", data.research_state === "NOT_STARTED", data.research_state);
assert("evidence_starts_empty", Array.isArray(data.evidence) && data.evidence.length === 0, data.evidence);
assert(
  "human_validation_not_started",
  data.human_validation?.state === "NOT_STARTED" &&
    data.human_validation?.real_proposals_required_before_promoting_price === 3 &&
    Array.isArray(data.human_validation?.collected) &&
    data.human_validation.collected.length === 0,
  data.human_validation,
);
assert(
  "no_pages_created_by_this_contract",
  Array.isArray(data.pages_created_by_this_contract) && data.pages_created_by_this_contract.length === 0,
  data.pages_created_by_this_contract,
);
assert("checkout_disabled_globally", data.checkout_enabled_anywhere === false, data.checkout_enabled_anywhere);
assert(
  "price_copy_not_published_by_this_contract",
  data.public_price_copy_published_by_this_contract === false,
  data.public_price_copy_published_by_this_contract,
);
const nd = data.naming_divergence || {};
assert("naming_divergence_authority_343", nd.authority_issue === 343 && nd.authority_wins_on_names === true, nd);
assert("naming_divergence_keeps_334_scope", nd.scope_and_price_of_issue_334_remain_valid === true, nd);
assert("naming_divergence_statement", filled(nd.statement_pt_br) && /343/.test(nd.statement_pt_br), nd.statement_pt_br);

/* ------------------------------------------------------------------ */
/* 2. dois itens, 24 e 25, reconciliados campo a campo com o registro   */
/* ------------------------------------------------------------------ */

assert("two_items", items.length === 2, items.length);
assert("numbers_24_and_25", eq(items.map((it) => it.number), [24, 25]), items.map((it) => it.number));
assert(
  "deliverable_ids_are_canonical",
  eq(items.map((it) => it.deliverable_id), ["CFG-D24", "CFG-D25"]),
  items.map((it) => it.deliverable_id),
);

for (const it of items) {
  const n = it.number;
  const canonical = regById.get(it.deliverable_id);
  assert(`item_${n}_exists_in_registry`, Boolean(canonical), it.deliverable_id);
  if (!canonical) continue;

  // identidade e nome
  assert(`item_${n}_catalog_number`, it.catalog_number === canonical.catalog_number, [it.catalog_number, canonical.catalog_number]);
  assert(`item_${n}_catalog_number_matches_number`, it.catalog_number === String(n), it.catalog_number);
  assert(`item_${n}_public_name_matches_registry`, it.public_name_pt_br === canonical.public_name_pt_br, [it.public_name_pt_br, canonical.public_name_pt_br]);
  assert(`item_${n}_aliases_match_registry`, eq(it.name_aliases, canonical.name_aliases), [it.name_aliases, canonical.name_aliases]);
  assert(`item_${n}_name_state_matches_registry`, it.name_state === canonical.name_state, [it.name_state, canonical.name_state]);
  const namedIn343 = namingById.get(it.deliverable_id);
  assert(`item_${n}_exists_in_naming_343`, Boolean(namedIn343), it.deliverable_id);
  assert(`item_${n}_name_matches_343`, it.public_name_pt_br === namedIn343?.public_name_pt_br, [it.public_name_pt_br, namedIn343?.public_name_pt_br]);
  assert(`item_${n}_value_line_matches_343`, it.value_line_pt_br === namedIn343?.value_line_pt_br, [it.value_line_pt_br, namedIn343?.value_line_pt_br]);
  assert(`item_${n}_aliases_match_343`, eq(it.name_aliases, namedIn343?.aliases), [it.name_aliases, namedIn343?.aliases]);

  // pergunta, gatilho, porta e estado
  assert(`item_${n}_decision_question_matches_registry`, it.decision_question_pt_br === canonical.decision_question, [it.decision_question_pt_br, canonical.decision_question]);
  assert(`item_${n}_trigger_matches_registry`, it.trigger_pt_br === canonical.trigger, [it.trigger_pt_br, canonical.trigger]);
  assert(`item_${n}_task_door_matches_registry`, it.task_door === canonical.task_door, [it.task_door, canonical.task_door]);
  assert(`item_${n}_public_state_matches_registry`, it.public_state === canonical.public_state, [it.public_state, canonical.public_state]);
  assert(`item_${n}_public_state_is_validate`, it.public_state === "VALIDATE", it.public_state);
  assert(`item_${n}_lead_destination_matches_registry`, it.lead_destination === canonical.lead_destination, [it.lead_destination, canonical.lead_destination]);
  assert(`item_${n}_verb_filled`, filled(it.verb_pt_br), it.verb_pt_br);

  // rota
  assert(`item_${n}_route_matches_registry`, it.route === canonical.route, [it.route, canonical.route]);
  assert(`item_${n}_page_file_derives_from_route`, it.page_file === `${it.route.replace(/^\/|\/$/g, "")}/index.html`, it.page_file);
  assert(`item_${n}_page_exists_on_disk`, fs.existsSync(path.join(root, it.page_file)), it.page_file);
  assert(`item_${n}_page_exists_flag_true`, it.page_exists === true, it.page_exists);
  assert(`item_${n}_page_not_created_here`, it.page_created_by_this_contract === false, it.page_created_by_this_contract);
  assert(`item_${n}_page_not_modified_here`, it.page_modified_by_this_contract === false, it.page_modified_by_this_contract);
  assert(`item_${n}_price_copy_not_published`, it.price_copy_published_on_page === false, it.price_copy_published_on_page);

  // preço
  assert(`item_${n}_price_cents_matches_registry`, it.pricing?.price_cents === canonical.price.amount_cents, [it.pricing?.price_cents, canonical.price.amount_cents]);
  assert(`item_${n}_price_cents_is_690000`, it.pricing?.price_cents === 690000, it.pricing?.price_cents);
  assert(`item_${n}_billing_matches_registry`, it.pricing?.billing === canonical.price.billing, [it.pricing?.billing, canonical.price.billing]);
  assert(`item_${n}_price_state_matches_registry`, it.pricing?.price_state === canonical.price_state, [it.pricing?.price_state, canonical.price_state]);
  assert(`item_${n}_price_state_is_pilot`, it.pricing?.price_state === "PILOT_HYPOTHESIS", it.pricing?.price_state);
  assert(`item_${n}_price_display_says_6900`, /R\$ 6\.900/.test(it.pricing?.price_display_pt_br ?? ""), it.pricing?.price_display_pt_br);
  assert(`item_${n}_price_is_integer_cents`, Number.isInteger(it.pricing?.price_cents) && it.pricing.price_cents > 0, it.pricing?.price_cents);

  // SLA
  assert(`item_${n}_sla_min_matches_registry`, (it.sla?.business_days_min ?? null) === canonical.sla.business_days_min, [it.sla?.business_days_min, canonical.sla.business_days_min]);
  assert(`item_${n}_sla_max_matches_registry`, (it.sla?.business_days_max ?? null) === canonical.sla.business_days_max, [it.sla?.business_days_max, canonical.sla.business_days_max]);
  assert(`item_${n}_sla_starts_after_matches_registry`, it.sla?.starts_after_pt_br === canonical.sla.starts_after, [it.sla?.starts_after_pt_br, canonical.sla.starts_after]);
  assert(`item_${n}_safe_deadline_matches_registry`, (it.sla?.safe_deadline_business_days ?? null) === canonical.sla.safe_deadline_business_days, [it.sla?.safe_deadline_business_days, canonical.sla.safe_deadline_business_days]);
  assert(`item_${n}_sla_display_filled`, filled(it.sla?.display_pt_br), it.sla?.display_pt_br);

  // gate de capacidade, sempre presente, sempre sem checkout automático
  assert(`item_${n}_capacity_required_matches_registry`, it.capacity_gate?.required === canonical.capacity_required, [it.capacity_gate?.required, canonical.capacity_required]);
  assert(`item_${n}_capacity_required_true`, it.capacity_gate?.required === true, it.capacity_gate?.required);
  assert(`item_${n}_no_automatic_checkout`, it.capacity_gate?.automatic_checkout === false, it.capacity_gate?.automatic_checkout);
  assert(`item_${n}_capacity_statement`, filled(it.capacity_gate?.statement_pt_br) && /capacidade/i.test(it.capacity_gate.statement_pt_br), it.capacity_gate?.statement_pt_br);
  assert(`item_${n}_checkout_matches_registry`, it.checkout_enabled === canonical.checkout_enabled, [it.checkout_enabled, canonical.checkout_enabled]);
  assert(`item_${n}_checkout_disabled`, it.checkout_enabled === false, it.checkout_enabled);

  // escopo, entradas, saídas e não-inclusões, exatamente como o registro
  assert(`item_${n}_scope_unit_matches_registry`, it.scope?.unit_pt_br === canonical.scope.unit, [it.scope?.unit_pt_br, canonical.scope.unit]);
  assert(`item_${n}_scope_limits_match_registry`, eq(it.scope?.limits_pt_br, canonical.scope.limits), [it.scope?.limits_pt_br, canonical.scope.limits]);
  assert(`item_${n}_inputs_match_registry`, eq(it.inputs_pt_br, canonical.required_inputs), [it.inputs_pt_br, canonical.required_inputs]);
  assert(`item_${n}_outputs_match_registry`, eq(it.outputs_pt_br, canonical.included_outputs), [it.outputs_pt_br, canonical.included_outputs]);
  assert(`item_${n}_exclusions_match_registry`, eq(it.exclusions_pt_br, canonical.exclusions), [it.exclusions_pt_br, canonical.exclusions]);
  assert(`item_${n}_inputs_non_empty`, filledList(it.inputs_pt_br, 5), it.inputs_pt_br?.length);
  assert(`item_${n}_outputs_non_empty`, filledList(it.outputs_pt_br, 5), it.outputs_pt_br?.length);
  assert(`item_${n}_exclusions_non_empty`, filledList(it.exclusions_pt_br, 5), it.exclusions_pt_br?.length);

  // fronteira jurídica e artefato terminal
  assert(`item_${n}_legal_boundary_filled`, filledList(it.legal_boundary_pt_br, 5), it.legal_boundary_pt_br?.length);
  const legal = (it.legal_boundary_pt_br || []).join(" ");
  assert(`item_${n}_legal_denies_advocacy`, /não presta advocacia/i.test(legal), legal);
  assert(`item_${n}_legal_denies_drafting`, /não elabora peça/i.test(legal), legal);
  assert(`item_${n}_legal_denies_signing_and_filing`, /não assina/i.test(legal) && /não protocola/i.test(legal), legal);
  assert(`item_${n}_legal_denies_representation`, /não representa a empresa perante o órgão/i.test(legal), legal);
  assert(`item_${n}_legal_denies_success_fee`, /comissão de êxito/i.test(legal), legal);
  assert(`item_${n}_legal_denies_credential_custody`, /não guarda token, certificado digital ou senha/i.test(legal), legal);
  assert(`item_${n}_terminal_artifact_filled`, filled(it.terminal_artifact?.ends_in_pt_br), it.terminal_artifact?.ends_in_pt_br);
  assert(`item_${n}_terminal_artifact_not_generic`, it.terminal_artifact?.is_generic_report === false, it.terminal_artifact?.is_generic_report);
  assert(`item_${n}_terminal_statement_filled`, filled(it.terminal_artifact?.statement_pt_br) && it.terminal_artifact.statement_pt_br.length >= 60, it.terminal_artifact?.statement_pt_br);

  // fronteira contra as ofertas vizinhas
  assert(`item_${n}_has_three_boundaries`, Array.isArray(it.boundary_vs_neighbour_offers) && it.boundary_vs_neighbour_offers.length === 3, it.boundary_vs_neighbour_offers?.length);
  for (const b of it.boundary_vs_neighbour_offers || []) {
    const label = `item_${n}_vs_${b.against_id}`;
    assert(`${label}_their_question_filled`, filled(b.their_question_pt_br), b.their_question_pt_br);
    assert(`${label}_our_question_matches_item`, b.our_question_pt_br === it.decision_question_pt_br, [b.our_question_pt_br, it.decision_question_pt_br]);
    assert(`${label}_statement_long_enough`, filled(b.statement_pt_br) && b.statement_pt_br.length >= 80, b.statement_pt_br?.length);
    assert(`${label}_not_self`, b.against_id !== it.deliverable_id, b.against_id);
    assert(`${label}_name_filled`, filled(b.against_public_name_pt_br), b.against_public_name_pt_br);
  }
}

/* ------------------------------------------------------------------ */
/* 3. o que é próprio de cada item, sem simetria falsa                  */
/* ------------------------------------------------------------------ */

const it24 = byNumber.get(24);
const it25 = byNumber.get(25);
assert("item_24_verb_diagnostica", it24.verb_pt_br === "diagnostica", it24.verb_pt_br);
assert("item_25_verb_acompanha", it25.verb_pt_br === "acompanha", it25.verb_pt_br);
assert("item_24_door_capability", it24.task_door === "CAPABILITY", it24.task_door);
assert("item_25_door_protect", it25.task_door === "PROTECT", it25.task_door);
assert("item_24_route", it24.route === "/diagnostico-b2g-360/", it24.route);
assert("item_25_route", it25.route === "/acompanhamento-contratos-obras/", it25.route);
assert("item_24_routes_differ_from_25", it24.route !== it25.route, [it24.route, it25.route]);

// 24: pagamento único, 7 a 10 dias úteis, uma empresa, até quatro entrevistas
assert("item_24_billing_one_time", it24.pricing.billing === "one_time", it24.pricing.billing);
assert("item_24_pricing_model_one_time", it24.pricing.model === "one_time", it24.pricing.model);
assert("item_24_no_commitment_months", it24.pricing.commitment_months === null, it24.pricing.commitment_months);
assert("item_24_no_notice_days", it24.pricing.notice_days === null, it24.pricing.notice_days);
assert("item_24_sla_min_7", it24.sla.business_days_min === 7, it24.sla.business_days_min);
assert("item_24_sla_max_10", it24.sla.business_days_max === 10, it24.sla.business_days_max);
assert("item_24_sla_min_le_max", it24.sla.business_days_min <= it24.sla.business_days_max, [it24.sla.business_days_min, it24.sla.business_days_max]);
assert("item_24_sla_display_7_a_10", /7 a 10 dias úteis/.test(it24.sla.display_pt_br), it24.sla.display_pt_br);
assert("item_24_sla_starts_after_inputs_e_entrevistas", it24.sla.starts_after_pt_br === "inputs e entrevistas", it24.sla.starts_after_pt_br);
assert("item_24_scope_unit_is_one_company", /uma empresa ou CNPJ/i.test(it24.scope.unit_pt_br), it24.scope.unit_pt_br);
assert("item_24_max_four_interviews", it24.scope.max_interviews === 4, it24.scope.max_interviews);
assert("item_24_four_interview_roles", filledList(it24.scope.interview_roles_pt_br, 4) && it24.scope.interview_roles_pt_br.length === 4, it24.scope.interview_roles_pt_br);
for (const role of ["direção", "licitações ou comercial", "orçamento ou engenharia", "contratos ou financeiro"]) {
  assert(`item_24_interview_role_${role.split(" ")[0]}`, it24.scope.interview_roles_pt_br.includes(role), role);
}
assert("item_24_scope_limits_mention_active_portfolio", /carteira ativa apresentada/i.test(it24.scope.limits_pt_br.join(" ")), it24.scope.limits_pt_br);
assert("item_24_six_maturity_axes", it24.terminal_artifact.maturity_axes_count === 6, it24.terminal_artifact.maturity_axes_count);
assert("item_24_ends_in_90_day_backlog", /backlog de 90 dias com dono, dependência e decisão/i.test(it24.terminal_artifact.ends_in_pt_br), it24.terminal_artifact.ends_in_pt_br);
assert("item_24_terminal_statement_denies_generic_report", /nunca em relatório genérico/i.test(it24.terminal_artifact.statement_pt_br), it24.terminal_artifact.statement_pt_br);
assert(
  "item_24_output_carries_90_day_backlog",
  it24.outputs_pt_br.some((o) => /backlog de 90 dias/i.test(o)),
  it24.outputs_pt_br,
);
assert(
  "item_24_output_carries_maturity_map",
  it24.outputs_pt_br.some((o) => /mapa de maturidade nos seis eixos/i.test(o)),
  it24.outputs_pt_br,
);
assert(
  "item_24_output_carries_recommendation",
  it24.outputs_pt_br.some((o) => /^recomendação/i.test(o)),
  it24.outputs_pt_br,
);
assert("item_24_five_recommendation_options", it24.terminal_artifact.recommendation_options_pt_br.length === 5, it24.terminal_artifact.recommendation_options_pt_br);
for (const option of [
  "interno",
  "entrega pontual",
  "Operação de Proposta para Licitação Crítica",
  "Acompanhamento Preventivo do Contrato Público",
  "Diretoria Fracionada para o Mercado Público",
]) {
  assert(
    `item_24_recommendation_option_${option.split(" ")[0].toLowerCase()}`,
    it24.terminal_artifact.recommendation_options_pt_br.includes(option),
    option,
  );
}
for (const excl of ["operação dos 90 dias", "elaboração de propostas", "inteligência territorial profunda", "promessa comercial"]) {
  assert(`item_24_exclusion_${excl.split(" ")[0]}`, it24.exclusions_pt_br.includes(excl), excl);
}

// 25: mensalidade por contrato, ciclo de 3 meses, aviso de 30 dias, um contrato
assert("item_25_billing_subscription_monthly", it25.pricing.billing === "subscription_monthly", it25.pricing.billing);
assert("item_25_pricing_model_subscription_monthly", it25.pricing.model === "subscription_monthly", it25.pricing.model);
assert("item_25_cycle_monthly", it25.pricing.cycle === "MONTHLY", it25.pricing.cycle);
assert("item_25_commitment_3_months", it25.pricing.commitment_months === 3, it25.pricing.commitment_months);
assert("item_25_notice_30_days", it25.pricing.notice_days === 30, it25.pricing.notice_days);
assert("item_25_unit_basis_por_contrato", it25.pricing.unit_basis_pt_br === "por contrato", it25.pricing.unit_basis_pt_br);
assert("item_25_price_display_per_contract", /por contrato/.test(it25.pricing.price_display_pt_br), it25.pricing.price_display_pt_br);
assert("item_25_sla_min_null", it25.sla.business_days_min === null, it25.sla.business_days_min);
assert("item_25_sla_max_null", it25.sla.business_days_max === null, it25.sla.business_days_max);
assert("item_25_cadence_matches_registry", it25.sla.cadence_pt_br === regById.get("CFG-D25").sla.cadence, [it25.sla.cadence_pt_br, regById.get("CFG-D25").sla.cadence]);
assert("item_25_weekly_async", it25.cadence.weekly_asynchronous === true, it25.cadence.weekly_asynchronous);
assert("item_25_one_executive_meeting", it25.cadence.executive_meetings_per_month === 1, it25.cadence.executive_meetings_per_month);
assert("item_25_executive_meeting_90_min", it25.cadence.executive_meeting_max_minutes === 90, it25.cadence.executive_meeting_max_minutes);
assert("item_25_two_tactical_meetings", it25.cadence.tactical_meetings_per_month_max === 2, it25.cadence.tactical_meetings_per_month_max);
assert("item_25_tactical_meeting_30_min", it25.cadence.tactical_meeting_max_minutes === 30, it25.cadence.tactical_meeting_max_minutes);
assert("item_25_no_unlimited_urgency", it25.cadence.unlimited_urgency === false, it25.cadence.unlimited_urgency);
assert("item_25_one_contract_only", it25.scope.contracts_covered === 1, it25.scope.contracts_covered);
assert("item_25_non_litigious_required", it25.scope.non_litigious_required === true, it25.scope.non_litigious_required);
assert("item_25_scope_unit_is_one_non_litigious_contract", it25.scope.unit_pt_br === "um contrato ativo não litigioso", it25.scope.unit_pt_br);
assert("item_25_initial_cycle_3_months", it25.scope.initial_cycle_months === 3, it25.scope.initial_cycle_months);
assert("item_25_scope_notice_30_days", it25.scope.notice_days === 30, it25.scope.notice_days);
assert("item_25_scope_notice_matches_pricing", it25.scope.notice_days === it25.pricing.notice_days, [it25.scope.notice_days, it25.pricing.notice_days]);
assert("item_25_scope_cycle_matches_pricing", it25.scope.initial_cycle_months === it25.pricing.commitment_months, [it25.scope.initial_cycle_months, it25.pricing.commitment_months]);
assert("item_25_limits_mention_capacity", /capacidade/i.test(it25.scope.limits_pt_br.join(" ")), it25.scope.limits_pt_br);
assert("item_25_limits_mention_no_automatic_checkout", /sem checkout automático/i.test(it25.scope.limits_pt_br.join(" ")), it25.scope.limits_pt_br);
assert("item_25_recurring_terminal_artifact", it25.terminal_artifact.recurring === true, it25.terminal_artifact.recurring);
for (const excl of [
  "gestão diária da obra",
  "preenchimento do diário pelo cliente",
  "segundo contrato",
  "Operação de Proposta para Licitação Crítica",
  "peça jurídica",
  "protocolo",
  "urgência ilimitada",
]) {
  assert(`item_25_exclusion_${excl.split(" ")[0].toLowerCase()}`, it25.exclusions_pt_br.includes(excl), excl);
}
for (const out of [
  "matriz de obrigações, mudanças e pendências",
  "painel de prazo, medição e caixa",
  "fila de fatos ainda não convertidos em pleito",
  "pauta e ata de decisão",
  "alertas de lacuna documental",
  "encaminhamento para dossiê específico",
]) {
  assert(`item_25_output_${out.split(" ")[0].toLowerCase()}`, it25.outputs_pt_br.includes(out), out);
}

/* ------------------------------------------------------------------ */
/* 4. tabela de diferenciação obrigatória, linha a linha                */
/* ------------------------------------------------------------------ */

const table = data.differentiation_table || {};
assert("table_required", table.required === true, table.required);
assert("table_required_where_declared", filled(table.required_where_pt_br) && /confundir/i.test(table.required_where_pt_br), table.required_where_pt_br);
assert("table_publication_not_started", table.publication_state === "NOT_STARTED", table.publication_state);
assert("table_not_published_by_this_contract", table.published_by_this_contract === false, table.published_by_this_contract);
assert("table_publication_owner_is_327", table.publication_owner_issue === 327, table.publication_owner_issue);
assert("table_row_count_field_is_six", table.row_count === 6, table.row_count);
const rows = Array.isArray(table.rows) ? table.rows : [];
assert("table_has_six_rows", rows.length === 6, rows.length);
assert("table_row_count_matches_rows", table.row_count === rows.length, [table.row_count, rows.length]);
assert("table_rows_ordered_1_to_6", eq(rows.map((r) => r.order), [1, 2, 3, 4, 5, 6]), rows.map((r) => r.order));
assert("table_row_ids_unique", new Set(rows.map((r) => r.source_id)).size === rows.length, rows.map((r) => r.source_id));
assert("table_questions_unique", new Set(rows.map((r) => r.question_pt_br)).size === rows.length, rows.map((r) => r.question_pt_br));

const EXPECTED_ROWS = [
  [1, "deliverable", "CFG-D24", "Diagnóstico da Operação em Obras Públicas", "Onde a operação perde tempo, margem e controle?", 690000, "one_time", 1, 690000],
  [2, "container", "CFG-DIAG-EXP-v1", "Diagnóstico de Expansão no Mercado Público", "Em quais compradores, territórios e segmentos concentrar expansão?", 800000, "one_time", 1, 800000],
  [3, "deliverable", "CFG-D25", "Acompanhamento Preventivo do Contrato Público", "Como um contrato ativo deve registrar e decidir antes da crise?", 690000, "subscription_monthly", null, null],
  [4, "container_plan", "CFG-DIRB2G-FLEX-v1", "Diretoria Fracionada para o Mercado Público: Plano Mensal", "Como coordenar até quatro oportunidades e um contrato com direção semanal?", 2000000, "subscription_monthly", null, null],
  [5, "container_plan", "CFG-DIRB2G-180-v1", "Diretoria Fracionada para o Mercado Público: Compromisso Semestral", null, 1500000, "subscription_monthly", 6, 9000000],
  [6, "container_plan", "CFG-DIRB2G-365-v1", "Diretoria Fracionada para o Mercado Público: Compromisso Anual", null, 1250000, "subscription_monthly", 12, 15000000],
];
for (const [order, kind, sourceId, name, question, cents, billing, installments, total] of EXPECTED_ROWS) {
  const row = rows.find((r) => r.order === order);
  assert(`row_${order}_exists`, Boolean(row), order);
  if (!row) continue;
  assert(`row_${order}_kind`, row.kind === kind, row.kind);
  assert(`row_${order}_source_id`, row.source_id === sourceId, row.source_id);
  assert(`row_${order}_public_name`, row.public_name_pt_br === name, row.public_name_pt_br);
  assert(`row_${order}_price_cents`, row.price_cents === cents, row.price_cents);
  assert(`row_${order}_billing`, row.billing === billing, row.billing);
  assert(`row_${order}_installments`, (row.installments ?? null) === installments, row.installments);
  assert(`row_${order}_total_commitment`, (row.total_commitment_cents ?? null) === total, row.total_commitment_cents);
  assert(`row_${order}_not_changed_by_this_contract`, row.changed_by_this_contract === false, row.changed_by_this_contract);
  assert(`row_${order}_question_filled`, filled(row.question_pt_br), row.question_pt_br);
  assert(`row_${order}_issue_label_filled`, filled(row.issue_label_pt_br), row.issue_label_pt_br);
  assert(`row_${order}_price_display_filled`, filled(row.price_display_pt_br), row.price_display_pt_br);
  if (question) assert(`row_${order}_question_text`, row.question_pt_br === question, row.question_pt_br);
  if (installments && total) {
    assert(`row_${order}_total_equals_installments_times_price`, row.installments * row.price_cents === row.total_commitment_cents, [row.installments, row.price_cents, row.total_commitment_cents]);
  }
}
// linhas 5 e 6 dizem explicitamente que o escopo é o mesmo do Plano Mensal
for (const order of [5, 6]) {
  const row = rows.find((r) => r.order === order);
  assert(`row_${order}_says_same_scope_as_monthly_plan`, /Mesmo escopo do Plano Mensal/.test(row.question_pt_br), row.question_pt_br);
}
assert("row_5_says_6_months", /6 meses/.test(rows.find((r) => r.order === 5).question_pt_br), rows.find((r) => r.order === 5).question_pt_br);
assert("row_6_says_12_months", /12 meses/.test(rows.find((r) => r.order === 6).question_pt_br), rows.find((r) => r.order === 6).question_pt_br);

// cada linha é reconciliada com a sua fonte canônica em main
for (const row of rows) {
  if (row.kind === "deliverable") {
    const canonical = regById.get(row.source_id);
    assert(`row_${row.order}_source_file_is_registry`, row.source_file === "data/commercial/deliverables-registry.v1.json", row.source_file);
    assert(`row_${row.order}_registry_entry_exists`, Boolean(canonical), row.source_id);
    assert(`row_${row.order}_price_matches_registry`, row.price_cents === canonical?.price.amount_cents, [row.price_cents, canonical?.price.amount_cents]);
    assert(`row_${row.order}_name_matches_registry`, row.public_name_pt_br === canonical?.public_name_pt_br, [row.public_name_pt_br, canonical?.public_name_pt_br]);
    assert(`row_${row.order}_question_matches_registry`, row.question_pt_br === canonical?.decision_question, [row.question_pt_br, canonical?.decision_question]);
    assert(`row_${row.order}_billing_matches_registry`, row.billing === canonical?.price.billing, [row.billing, canonical?.price.billing]);
  } else {
    const offer = offerById.get(row.source_id);
    assert(`row_${row.order}_source_file_is_catalog`, row.source_file === "data/offers/catalog.snapshot.json", row.source_file);
    assert(`row_${row.order}_catalog_offer_exists`, Boolean(offer), row.source_id);
    assert(`row_${row.order}_price_matches_catalog`, row.price_cents === offer?.amount_cents, [row.price_cents, offer?.amount_cents]);
    assert(`row_${row.order}_total_matches_catalog`, (row.total_commitment_cents ?? null) === (offer?.total_commitment_cents ?? null), [row.total_commitment_cents, offer?.total_commitment_cents]);
    assert(`row_${row.order}_installments_match_catalog`, (row.installments ?? null) === (offer?.max_payments ?? null), [row.installments, offer?.max_payments]);
  }
}
// o preço da Diretoria e do Diagnóstico de Expansão vem do catálogo congelado
const containerPlans = (containerById.get("diretoria_fracionada")?.plans || []);
for (const [order, offerId] of [[4, "CFG-DIRB2G-FLEX-v1"], [5, "CFG-DIRB2G-180-v1"], [6, "CFG-DIRB2G-365-v1"]]) {
  const plan = containerPlans.find((p) => p.offer_id === offerId);
  const row = rows.find((r) => r.order === order);
  assert(`row_${order}_matches_registry_container_plan`, plan?.amount_cents === row.price_cents, [plan?.amount_cents, row.price_cents]);
  assert(`row_${order}_notice_days_30_in_registry_plan`, plan?.notice_days === 30, plan?.notice_days);
}
const expansionPlan = (containerById.get("expansion_package")?.plans || [])[0];
assert("row_2_matches_registry_container_plan", expansionPlan?.amount_cents === rows.find((r) => r.order === 2).price_cents, [expansionPlan?.amount_cents, rows.find((r) => r.order === 2).price_cents]);
// nomes das linhas de contêiner derivam do nome canônico da #343
assert(
  "row_2_name_matches_343_container",
  rows.find((r) => r.order === 2).public_name_pt_br === namingContainerById.get("expansion_package")?.public_name_pt_br,
  rows.find((r) => r.order === 2).public_name_pt_br,
);
const diretoriaCanonical = namingContainerById.get("diretoria_fracionada")?.public_name_pt_br;
for (const order of [4, 5, 6]) {
  const row = rows.find((r) => r.order === order);
  assert(`row_${order}_name_starts_with_canonical_diretoria`, row.public_name_pt_br.startsWith(diretoriaCanonical), [row.public_name_pt_br, diretoriaCanonical]);
}

/* ------------------------------------------------------------------ */
/* 5. catálogo congelado permanece congelado                            */
/* ------------------------------------------------------------------ */

const FROZEN_CATALOG = {
  "CFG-DIAG-EXP-v1": 800000,
  "CFG-DIRB2G-FLEX-v1": 2000000,
  "CFG-DIRB2G-180-v1": 1500000,
  "CFG-DIRB2G-365-v1": 1250000,
};
assert(
  "frozen_catalog_amounts_unchanged_by_this_pr",
  (catalog.offers || []).length === Object.keys(FROZEN_CATALOG).length &&
    (catalog.offers || []).every((o) => FROZEN_CATALOG[o.offer_id] === o.amount_cents),
  (catalog.offers || []).map((o) => [o.offer_id, o.amount_cents]),
);
assert("frozen_catalog_still_frozen_at_2026_08_17", catalog.frozen_at === "2026-08-17", catalog.frozen_at);
assert(
  "diretoria_capacity_unchanged",
  ["CFG-DIRB2G-FLEX-v1", "CFG-DIRB2G-180-v1", "CFG-DIRB2G-365-v1"].every(
    (id) => offerById.get(id)?.capacity_required === true && offerById.get(id)?.capacity_units === 1,
  ),
  ["CFG-DIRB2G-FLEX-v1", "CFG-DIRB2G-180-v1", "CFG-DIRB2G-365-v1"].map((id) => [id, offerById.get(id)?.capacity_units]),
);
const frozen = data.frozen_references || {};
assert("frozen_block_points_at_catalog", frozen.source === "data/offers/catalog.snapshot.json", frozen.source);
assert("frozen_block_declares_frozen_at", frozen.frozen_at === catalog.frozen_at, [frozen.frozen_at, catalog.frozen_at]);
assert("frozen_block_declares_no_change", frozen.changed_by_this_contract === false, frozen.changed_by_this_contract);
assert("frozen_block_statement", filled(frozen.statement_pt_br) && /congelad/i.test(frozen.statement_pt_br), frozen.statement_pt_br);
assert("frozen_block_lists_four_offers", Array.isArray(frozen.offers) && frozen.offers.length === 4, frozen.offers?.length);
for (const offer of frozen.offers || []) {
  assert(`frozen_block_${offer.offer_id}_matches_catalog`, offerById.get(offer.offer_id)?.amount_cents === offer.amount_cents, [offer, offerById.get(offer.offer_id)?.amount_cents]);
}
// este contrato não pode inventar offer_id nem colidir com o catálogo
assert(
  "deliverable_ids_do_not_collide_with_offer_ids",
  items.every((it) => !offerById.has(it.deliverable_id)),
  items.map((it) => it.deliverable_id),
);
const CENTS_ALLOWED = new Set([690000, 800000, 2000000, 1500000, 1250000, 9000000, 15000000, 200000]);
const seenCents = [];
function collectCents(node) {
  if (Array.isArray(node)) return node.forEach(collectCents);
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (/_cents$/.test(key) && Number.isInteger(value)) seenCents.push(value);
      else collectCents(value);
    }
  }
}
collectCents(data);
assert("no_price_outside_issue_334", seenCents.every((c) => CENTS_ALLOWED.has(c)), seenCents.filter((c) => !CENTS_ALLOWED.has(c)));
assert("at_least_one_price_declared", seenCents.length >= 10, seenCents.length);

/* ------------------------------------------------------------------ */
/* 6. crédito de expansão                                               */
/* ------------------------------------------------------------------ */

const credit = data.expansion_credit_rule || {};
const regCredit = regById.get("CFG-D24")?.credit_rule || {};
assert("credit_source_item_24", credit.source_item === 24, credit.source_item);
assert("credit_source_deliverable_id", credit.source_deliverable_id === "CFG-D24", credit.source_deliverable_id);
assert("credit_source_name_canonical", credit.source_public_name_pt_br === regById.get("CFG-D24").public_name_pt_br, credit.source_public_name_pt_br);
assert("credit_cap_200000_cents", credit.cap_cents === 200000, credit.cap_cents);
assert("credit_cap_matches_registry", credit.cap_cents === regCredit.max_cents, [credit.cap_cents, regCredit.max_cents]);
assert("credit_cap_display_2000", credit.cap_display_pt_br === "R$ 2.000", credit.cap_display_pt_br);
assert("credit_window_30_days", credit.window_days === 30, credit.window_days);
assert("credit_window_matches_registry", credit.window_days === regCredit.window_days, [credit.window_days, regCredit.window_days]);
assert("credit_used_once", credit.uses_allowed === 1, credit.uses_allowed);
assert("credit_does_not_accumulate", credit.accumulates === false, credit.accumulates);
assert("credit_accumulates_matches_registry_stackable", credit.accumulates === regCredit.stackable, [credit.accumulates, regCredit.stackable]);
assert("credit_basis_matches_registry", credit.basis === regCredit.basis, [credit.basis, regCredit.basis]);
assert("credit_credits_into_matches_registry", eq(credit.credits_into, regCredit.credits_into), [credit.credits_into, regCredit.credits_into]);
assert("credit_credits_into_d25_and_diretoria", eq(credit.credits_into, ["CFG-D25", "diretoria_fracionada"]), credit.credits_into);
assert("credit_first_instalment_only", credit.applies_to_first_monthly_instalment_only === true, credit.applies_to_first_monthly_instalment_only);
assert("credit_instalment_is_first_monthly", credit.instalment_pt_br === "primeira mensalidade", credit.instalment_pt_br);
assert("credit_not_credited_into_declared", Array.isArray(credit.not_credited_into) && credit.not_credited_into.length === 1, credit.not_credited_into?.length);
const notCredited = (credit.not_credited_into || [])[0] || {};
assert("credit_excludes_expansion_package", notCredited.target_id === "expansion_package", notCredited.target_id);
assert("credit_excludes_expansion_by_canonical_name", notCredited.public_name_pt_br === namingContainerById.get("expansion_package")?.public_name_pt_br, notCredited.public_name_pt_br);
assert("credit_exclusion_reason_says_other_question", /outra pergunta/i.test(notCredited.reason_pt_br || ""), notCredited.reason_pt_br);
assert("credit_does_not_target_expansion", !(credit.credits_into || []).includes("expansion_package"), credit.credits_into);
assert("credit_does_not_target_expansion_offer", !(credit.credits_into || []).includes("CFG-DIAG-EXP-v1"), credit.credits_into);
const creditText = credit.statement_pt_br || "";
assert("credit_statement_says_2000", /R\$ 2\.000/.test(creditText), creditText);
assert("credit_statement_says_first_instalment", /primeira mensalidade/i.test(creditText), creditText);
assert("credit_statement_says_30_days", /30 dias/.test(creditText), creditText);
assert("credit_statement_says_single_and_non_cumulative", /único/i.test(creditText) && /não acumulável/i.test(creditText), creditText);
assert("credit_statement_excludes_expansion", /não se aplica ao Diagnóstico de Expansão/i.test(creditText), creditText);
// o item 24 repete a regra e o item 25 não inventa crédito nenhum
const itemCredit = it24.credit_rule || {};
assert("item_24_credit_rule_present", itemCredit && typeof itemCredit === "object", itemCredit);
assert("item_24_credit_cap_matches_family_rule", itemCredit.cap_cents === credit.cap_cents, [itemCredit.cap_cents, credit.cap_cents]);
assert("item_24_credit_window_matches_family_rule", itemCredit.window_days === credit.window_days, [itemCredit.window_days, credit.window_days]);
assert("item_24_credit_uses_matches_family_rule", itemCredit.uses_allowed === credit.uses_allowed, [itemCredit.uses_allowed, credit.uses_allowed]);
assert("item_24_credit_accumulates_matches_family_rule", itemCredit.accumulates === credit.accumulates, [itemCredit.accumulates, credit.accumulates]);
assert("item_24_credit_basis_matches_family_rule", itemCredit.basis === credit.basis, [itemCredit.basis, credit.basis]);
assert("item_24_credit_targets_match_family_rule", eq(itemCredit.credits_into, credit.credits_into), [itemCredit.credits_into, credit.credits_into]);
assert("item_24_credit_first_instalment_only", itemCredit.applies_to_first_monthly_instalment_only === true, itemCredit.applies_to_first_monthly_instalment_only);
assert("item_24_credit_statement_says_paying_item", /crédito nasce no item pagador/i.test(itemCredit.statement_pt_br || "") && /24/.test(itemCredit.statement_pt_br || ""), itemCredit.statement_pt_br);
assert("item_25_has_no_credit_rule", it25.credit_rule === null, it25.credit_rule);
assert("item_25_registry_has_no_credit_rule", regById.get("CFG-D25").credit_rule === null, regById.get("CFG-D25").credit_rule);

/* ------------------------------------------------------------------ */
/* 7. construtos proibidos: SaaS, trial, quota de plataforma, marca      */
/*    legada                                                            */
/* ------------------------------------------------------------------ */

const cr = data.common_rules || {};
assert("rule_pilot_does_not_change_other_items", cr.pilot_prices_do_not_change_other_items === true, cr.pilot_prices_do_not_change_other_items);
assert("rule_capacity_gate_required_in_family", cr.capacity_gate_required_in_family === true, cr.capacity_gate_required_in_family);
assert("rule_no_automatic_checkout_in_family", cr.automatic_checkout_anywhere_in_family === false, cr.automatic_checkout_anywhere_in_family);
assert("rule_lead_capture_required_where_price_shows", cr.lead_capture_required_where_price_is_displayed === true, cr.lead_capture_required_where_price_is_displayed);
assert("rule_nothing_originates_in_web_cfg", cr.no_data_or_identity_originates_in_web_cfg === true && cr.truth_and_provenance_remain_in === "extra-cli", [cr.no_data_or_identity_originates_in_web_cfg, cr.truth_and_provenance_remain_in]);
assert("rule_no_success_fee", cr.no_success_fee === true, cr.no_success_fee);
assert("rule_no_result_promise", cr.no_promise_of_result_or_award === true, cr.no_promise_of_result_or_award);
assert("rule_no_legal_practice", cr.no_legal_practice === true, cr.no_legal_practice);
assert("rule_evidence_grades_canonical", eq(cr.evidence_grades, registry.evidence_grades ? Object.keys(registry.evidence_grades) : cr.evidence_grades) || eq(cr.evidence_grades, ["FACT", "CALCULATION", "INFERENCE", "UNKNOWN"]), cr.evidence_grades);
assert("rule_missing_data_becomes_unknown", /UNKNOWN declarado/i.test(cr.missing_data_rule_pt_br || ""), cr.missing_data_rule_pt_br);
assert("rule_statements_present", filledList(cr.statements_pt_br, 5), cr.statements_pt_br?.length);
const rulesText = (cr.statements_pt_br || []).join(" ");
for (const [key, re] of [
  ["frozen_neighbours", /não alteram nenhum preço já aprovado/i],
  ["capacity", /capacidade confirmada/i],
  ["no_automatic_checkout", /checkout automático/i],
  ["no_saas", /assinatura de software/i],
  ["extra_cli", /extra-cli/],
  ["no_success_fee", /comissão de êxito/i],
]) {
  assert(`rule_statement_mentions_${key}`, re.test(rulesText), key);
}
const forbidden = cr.forbidden_constructs || {};
const FORBIDDEN_KEYS = ["saas_subscription", "free_trial", "platform_quota", "smartlic_reference"];
assert("forbidden_constructs_has_exactly_four_keys", eq(Object.keys(forbidden).sort(), [...FORBIDDEN_KEYS].sort()), Object.keys(forbidden));
for (const key of FORBIDDEN_KEYS) {
  assert(`forbidden_construct_${key}_is_false`, forbidden[key] === false, [key, forbidden[key]]);
}
assert("forbidden_constructs_statement", filled(cr.forbidden_constructs_statement_pt_br) && cr.forbidden_constructs_statement_pt_br.length >= 80, cr.forbidden_constructs_statement_pt_br);
for (const [key, re] of [
  ["saas", /assinatura de software/i],
  ["trial", /teste gratuito/i],
  ["quota", /quota de plataforma/i],
  ["legacy_brand", /marca legada/i],
]) {
  assert(`forbidden_statement_mentions_${key}`, re.test(cr.forbidden_constructs_statement_pt_br || ""), key);
}
// a marca legada não pode aparecer como valor de string em lugar nenhum
const legacyBrandHits = allStrings.filter((s) => /smartlic/i.test(s.value));
assert("no_legacy_brand_string_value", legacyBrandHits.length === 0, legacyBrandHits.map((s) => s.at));
// SaaS, trial e quota só podem aparecer dentro de negativas declaradas
const NEGATION_CONTAINERS = [
  "exclusions_pt_br",
  "forbidden_constructs_statement_pt_br",
  "statements_pt_br",
  "criterion_pt_br",
  "delivered_by_pt_br",
];
const constructHits = allStrings.filter((s) => /\bsaas\b|\btrial\b|quota de plataforma/i.test(s.value));
assert("forbidden_constructs_are_mentioned_somewhere", constructHits.length >= 3, constructHits.length);
for (const hit of constructHits) {
  assert(
    `forbidden_construct_mention_is_a_negative_at_${hit.at}`,
    NEGATION_CONTAINERS.some((c) => hit.at.includes(c)),
    hit,
  );
}
// nenhum item vende assinatura de software nem período de teste
for (const it of items) {
  assert(`item_${it.number}_billing_is_not_saas`, !/saas/i.test(it.pricing.billing), it.pricing.billing);
  assert(
    `item_${it.number}_exclusion_denies_saas_or_trial`,
    it.exclusions_pt_br.some((e) => /saas|trial/i.test(e)),
    it.exclusions_pt_br,
  );
}
// regra das 100 repetições
const hundred = data.hundred_repetition_rule || {};
assert("hundred_rule_question", filled(hundred.question_pt_br) && /cem repetições/i.test(hundred.question_pt_br), hundred.question_pt_br);
assert("hundred_rule_item_24_gains", eq(hundred.item_24_system_gain_pt_br, ["benchmark de maturidade", "taxa de acerto da recomendação"]), hundred.item_24_system_gain_pt_br);
assert("hundred_rule_item_25_gains", eq(hundred.item_25_system_gain_pt_br, ["biblioteca de eventos", "templates de registro", "detecção precoce"]), hundred.item_25_system_gain_pt_br);
assert("hundred_rule_denies_artisanal_scale", hundred.scale_denied_if_only_multiplies_artisanal_meetings === true, hundred.scale_denied_if_only_multiplies_artisanal_meetings);
assert("hundred_rule_statement_says_artisanal_meetings", /reuniões artesanais/i.test(hundred.statement_pt_br || ""), hundred.statement_pt_br);
assert("hundred_rule_statement_says_no_scale", /não recebe escala/i.test(hundred.statement_pt_br || ""), hundred.statement_pt_br);

/* ------------------------------------------------------------------ */
/* 8. proibições por item                                               */
/* ------------------------------------------------------------------ */

const REQUIRED_PROHIBITIONS = [
  "success_fee",
  "promises_result_or_award",
  "custody_of_token",
  "custody_of_digital_certificate",
  "custody_of_password",
  "operates_client_credential",
  "signs_for_client",
  "files_or_protocols",
  "provides_legal_representation",
  "saas_subscription",
  "free_trial",
  "platform_quota",
  "smartlic_reference",
  "automatic_checkout",
];
for (const it of items) {
  const p = it.prohibitions || {};
  assert(`item_${it.number}_prohibition_key_set_exact`, eq(Object.keys(p).sort(), [...REQUIRED_PROHIBITIONS].sort()), Object.keys(p));
  for (const key of REQUIRED_PROHIBITIONS) {
    assert(`item_${it.number}_prohibition_${key}_false`, p[key] === false, { key, value: p[key] });
  }
  assert(`item_${it.number}_no_prohibition_is_true`, Object.values(p).every((v) => v === false), p);
}

/* ------------------------------------------------------------------ */
/* 9. captura, checkout e first-fold continuam com as issues donas       */
/* ------------------------------------------------------------------ */

const owners = data.ownership_not_appropriated_by_this_contract || [];
assert("three_owners_declared", owners.length === 3, owners.length);
const EXPECTED_OWNERS = [
  [232, "captura"],
  [88, "checkout"],
  [327, "first-fold"],
];
for (const [issue, domain] of EXPECTED_OWNERS) {
  const entry = owners.find((o) => o.issue === issue);
  assert(`owner_${issue}_declared`, Boolean(entry), issue);
  assert(`owner_${issue}_domain`, entry?.owns_pt_br === domain, entry?.owns_pt_br);
  assert(`owner_${issue}_not_reopened`, entry?.reopened_here === false, entry?.reopened_here);
  assert(`owner_${issue}_scope_filled`, filled(entry?.owner_scope_pt_br), entry?.owner_scope_pt_br);
  assert(`owner_${issue}_statement_names_issue`, new RegExp(`issue ${issue}\\b`).test(entry?.statement_pt_br || ""), entry?.statement_pt_br);
}
assert("owner_domains_unique", new Set(owners.map((o) => o.owns_pt_br)).size === 3, owners.map((o) => o.owns_pt_br));
assert("no_owner_is_reopened", owners.every((o) => o.reopened_here === false), owners);

// as rotas publicadas não são criadas nem alteradas por este contrato
const published = data.routes_published_and_not_modified_by_this_contract || [];
assert("two_published_routes_declared", published.length === 2, published.length);
for (const entry of published) {
  const label = entry.owner_deliverable_id;
  assert(`published_${label}_route_matches_registry`, entry.route === regById.get(label)?.route, [entry.route, regById.get(label)?.route]);
  assert(`published_${label}_page_exists_on_disk`, fs.existsSync(path.join(root, entry.page_file)), entry.page_file);
  assert(`published_${label}_not_modified`, entry.modified_by_this_contract === false, entry.modified_by_this_contract);
  assert(`published_${label}_price_copy_absent`, entry.price_copy_published === false, entry.price_copy_published);
  // a página realmente não publica preço em main: se publicar, a declaração acima vira mentira
  const html = fs.readFileSync(path.join(root, entry.page_file), "utf8");
  assert(`published_${label}_page_really_has_no_price`, !/R\$\s*\d/.test(html), entry.page_file);
}
assert(
  "published_routes_cover_both_items",
  eq(published.map((p) => p.owner_deliverable_id).sort(), ["CFG-D24", "CFG-D25"]),
  published.map((p) => p.owner_deliverable_id),
);

/* ------------------------------------------------------------------ */
/* 10. estados de aceitação honestos, evidência sempre vazia            */
/* ------------------------------------------------------------------ */

const ALLOWED_STATES = ["MET_BY_CONTRACT", "NOT_STARTED"];
assert("acceptance_states_allowed_declared", eq(data.acceptance_states_allowed, ALLOWED_STATES), data.acceptance_states_allowed);
const acceptance = Array.isArray(data.acceptance) ? data.acceptance : [];
assert("acceptance_has_nine_criteria", acceptance.length === 9, acceptance.length);
assert("acceptance_ids_sequential", eq(acceptance.map((a) => a.id), ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-07", "AC-08", "AC-09"]), acceptance.map((a) => a.id));
const EXPECTED_ACCEPTANCE_STATES = {
  "AC-01": "NOT_STARTED",
  "AC-02": "NOT_STARTED",
  "AC-03": "NOT_STARTED",
  "AC-04": "MET_BY_CONTRACT",
  "AC-05": "MET_BY_CONTRACT",
  "AC-06": "NOT_STARTED",
  "AC-07": "MET_BY_CONTRACT",
  "AC-08": "NOT_STARTED",
  "AC-09": "MET_BY_CONTRACT",
};
for (const criterion of acceptance) {
  const id = criterion.id;
  assert(`acceptance_${id}_state_allowed`, ALLOWED_STATES.includes(criterion.state), criterion.state);
  assert(`acceptance_${id}_state_expected`, criterion.state === EXPECTED_ACCEPTANCE_STATES[id], [criterion.state, EXPECTED_ACCEPTANCE_STATES[id]]);
  assert(`acceptance_${id}_criterion_filled`, filled(criterion.criterion_pt_br), criterion.criterion_pt_br);
  assert(`acceptance_${id}_evidence_is_empty_array`, Array.isArray(criterion.evidence) && criterion.evidence.length === 0, criterion.evidence);
  if (criterion.state === "NOT_STARTED") {
    assert(`acceptance_${id}_declares_blocker`, filled(criterion.blocked_by_pt_br), criterion.blocked_by_pt_br);
    assert(`acceptance_${id}_has_no_delivered_by`, !("delivered_by_pt_br" in criterion), criterion);
  } else {
    assert(`acceptance_${id}_declares_delivery`, filled(criterion.delivered_by_pt_br), criterion.delivered_by_pt_br);
    assert(`acceptance_${id}_has_no_blocker`, !("blocked_by_pt_br" in criterion), criterion);
  }
}
assert(
  "acceptance_not_all_met",
  acceptance.some((a) => a.state === "NOT_STARTED"),
  acceptance.map((a) => a.state),
);
assert(
  "acceptance_page_copy_criteria_are_not_started",
  ["AC-01", "AC-02", "AC-03", "AC-06", "AC-08"].every((id) => acceptance.find((a) => a.id === id)?.state === "NOT_STARTED"),
  acceptance.map((a) => [a.id, a.state]),
);
assert(
  "no_acceptance_evidence_anywhere",
  acceptance.every((a) => Array.isArray(a.evidence) && a.evidence.length === 0),
  acceptance.map((a) => a.evidence?.length),
);
const firstSale = data.first_sale_measurement || {};
assert("first_sale_not_started", firstSale.state === "NOT_STARTED", firstSale.state);
assert("first_sale_collected_empty", Array.isArray(firstSale.collected) && firstSale.collected.length === 0, firstSale.collected);
assert(
  "first_sale_measures_four_things",
  eq(firstSale.measures_pt_br, ["horas gastas", "margem realizada", "aderência da recomendação", "expansão observada"]),
  firstSale.measures_pt_br,
);

/* ------------------------------------------------------------------ */
/* 11. sem travessão em nenhum lugar do contrato nem deste teste        */
/* ------------------------------------------------------------------ */

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
assert("no_em_dash_in_data_file", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_in_data_file", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
const selfRaw = fs.readFileSync(path.join(__dirname, "test_page_contract_operacao.mjs"), "utf8");
assert("no_em_dash_in_test_file", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_in_test_file", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));

/* ------------------------------------------------------------------ */
/* 12. este contrato não reescreve nada que já está publicado           */
/* ------------------------------------------------------------------ */

assert("registry_still_has_54_deliverables", (registry.deliverables || []).length === 54, (registry.deliverables || []).length);
assert("registry_d24_source_issue_334", regById.get("CFG-D24").source_issue === "#334", regById.get("CFG-D24").source_issue);
assert("registry_d25_source_issue_334", regById.get("CFG-D25").source_issue === "#334", regById.get("CFG-D25").source_issue);
assert("registry_d24_market_fit_on_hold", regById.get("CFG-D24").market_fit.state === "HOLD", regById.get("CFG-D24").market_fit.state);
assert("registry_d25_market_fit_on_hold", regById.get("CFG-D25").market_fit.state === "HOLD", regById.get("CFG-D25").market_fit.state);
const hubPath = path.join(root, "entregas/index.html");
assert("deliverables_hub_exists_in_main", fs.existsSync(hubPath), hubPath);
const hub = fs.readFileSync(hubPath, "utf8");
assert(
  "hub_does_not_link_pages_this_contract_does_not_create",
  items.every((it) => !hub.includes(`/${it.deliverable_id.toLowerCase()}/`)),
  items.map((it) => it.deliverable_id),
);
// nenhum item se apropria da rota da Diretoria ou do Diagnóstico de Expansão
const OTHER_ROUTES = ["/diretoria-b2g/", "/diagnostico-b2g-expansao/"];
const itemStrings = walkStrings(items, "$.items", []);
for (const route of OTHER_ROUTES) {
  assert(
    `no_item_claims_route_${route.replace(/\//g, "")}`,
    itemStrings.every((s) => !s.value.includes(route)),
    itemStrings.filter((s) => s.value.includes(route)).map((s) => s.at),
  );
  assert(`route_${route.replace(/\//g, "")}_still_exists_in_main`, fs.existsSync(path.join(root, route.replace(/^\/|\/$/g, ""), "index.html")), route);
}

/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
