/**
 * Gate do contrato de página da família "pré-edital" (issue #332, itens 09, 10 e 11).
 *
 * O teste é autossuficiente: lê o próprio JSON com fs e só cruza com artefatos
 * que já existem em main. Ele prova os três pontos que a #332 exige de verdade:
 *
 *   A. o item 9 distingue sinal pré-edital de oportunidade aberta;
 *   B. o item 10 nunca converte ausência de pagamento público em atraso;
 *   C. o item 11 permanece fail-closed enquanto a issue #156 não fechar cobertura.
 *
 * Mais os invariantes de preço, prazo, crédito, contrato de dados e rota.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const NAME = "page-contract-pre-edital";
const DATA_PATH = path.join(root, "data/commercial/page-contract-pre-edital.v1.json");
const REGISTRY_PATH = path.join(root, "data/commercial/deliverables-registry.v1.json");

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
const items = Array.isArray(data.items) ? data.items : [];
const byNumber = new Map(items.map((it) => [it.number, it]));

/* ------------------------------------------------------------------ */
/* 1. envelope: três itens, 09 a 11, sem lacuna e sem estado inventado  */
/* ------------------------------------------------------------------ */

assert("contract_id", data.contract_id === "page-contract-pre-edital.v1", data.contract_id);
assert("schema_version", data.schema_version === "1.0.0", data.schema_version);
assert("source_issue_332", data.source_issue === 332, data.source_issue);
assert("parent_issue_329", data.parent_issue === 329, data.parent_issue);
assert("naming_authority_343", data.naming_authority_issue === 343, data.naming_authority_issue);
assert(
  "related_issues_declare_84_89_156",
  Array.isArray(data.related_issues) && [84, 89, 156].every((n) => data.related_issues.includes(n)),
  data.related_issues,
);
assert("decision_state_validate", data.decision_state === "VALIDATE", data.decision_state);
assert("priority_p1", data.priority === "P1", data.priority);
assert("front_market_intelligence_moat", data.executive_front === "MARKET INTELLIGENCE MOAT", data.executive_front);
assert(
  "leverage_matches_issue",
  JSON.stringify(data.leverage) === JSON.stringify(["data", "revenue", "distribution", "customer"]),
  data.leverage,
);
assert("time_to_evidence_30_days", data.time_to_evidence_days === 30, data.time_to_evidence_days);
assert("price_unit_cents", data.price_unit === "cents" && data.currency === "BRL", [data.price_unit, data.currency]);
assert("price_basis_piloto", data.price_basis === "piloto", data.price_basis);
assert("research_state_not_started", data.research_state === "NOT_STARTED", data.research_state);
assert("evidence_starts_empty", Array.isArray(data.evidence) && data.evidence.length === 0, data.evidence);
assert(
  "human_validation_not_started",
  data.human_validation?.state === "NOT_STARTED" &&
    data.human_validation?.real_proposals_required_per_product_before_promoting_price === 1 &&
    Array.isArray(data.human_validation?.collected) &&
    data.human_validation.collected.length === 0,
  data.human_validation,
);
assert(
  "human_validation_records_accept_hours_margin",
  JSON.stringify(data.human_validation?.records_required_pt_br) ===
    JSON.stringify(["aceitar ou rejeitar", "horas", "margem"]),
  data.human_validation?.records_required_pt_br,
);
assert("hypothesis_filled", filled(data.hypothesis_pt_br) && data.hypothesis_pt_br.length >= 120, data.hypothesis_pt_br?.length);
assert("scope_version_declared", filled(data.scope_version), data.scope_version);

assert("three_items", items.length === 3, items.length);
assert(
  "numbers_9_to_11_contiguous",
  JSON.stringify(items.map((it) => it.number)) === JSON.stringify([9, 10, 11]),
  items.map((it) => it.number),
);
assert(
  "deliverable_ids_unique_and_numbered",
  new Set(items.map((it) => it.deliverable_id)).size === 3 &&
    items.every((it) => it.deliverable_id === `CFG-D${String(it.number).padStart(2, "0")}`),
  items.map((it) => it.deliverable_id),
);

/* todos os campos obrigatórios preenchidos, nos três */
for (const it of items) {
  const n = it.number;
  assert(`item_${n}_public_name_filled`, filled(it.public_name_pt_br), it.public_name_pt_br);
  assert(`item_${n}_value_line_filled`, filled(it.value_line_pt_br), it.value_line_pt_br);
  assert(`item_${n}_decision_question_filled`, filled(it.decision_question_pt_br), it.decision_question_pt_br);
  assert(`item_${n}_verb_filled`, filled(it.verb_pt_br), it.verb_pt_br);
  assert(`item_${n}_inputs_filled`, filledList(it.inputs_pt_br, 4), it.inputs_pt_br?.length);
  assert(`item_${n}_outputs_filled`, filledList(it.outputs_pt_br, 4), it.outputs_pt_br?.length);
  assert(`item_${n}_exclusions_filled`, filledList(it.exclusions_pt_br, 4), it.exclusions_pt_br?.length);
  assert(`item_${n}_scope_unit_filled`, filled(it.scope_pt_br?.unit), it.scope_pt_br?.unit);
  assert(`item_${n}_scope_limits_filled`, filledList(it.scope_pt_br?.limits, 3), it.scope_pt_br?.limits?.length);
  assert(`item_${n}_billing_declared`, filled(it.billing), it.billing);
  assert(
    `item_${n}_prohibitions_all_false`,
    it.prohibitions && Object.keys(it.prohibitions).length >= 5 && Object.values(it.prohibitions).every((v) => v === false),
    it.prohibitions,
  );
}

/* ------------------------------------------------------------------ */
/* 2. preços e prazos exatos, como a #332 publica                       */
/* ------------------------------------------------------------------ */

const EXPECTED = {
  9: { price: 149000, sla: 5, name: "Radar de Obras Antes do Edital", state: "VALIDATE", block: null },
  10: { price: 240000, sla: 7, name: "Dossiê do Órgão e Risco de Pagamento", state: "VALIDATE", block: null },
  11: { price: 290000, sla: 7, name: "Mapa de Parceiros e Consórcios", state: "BLOCKED", block: 156 },
};
for (const [n, exp] of Object.entries(EXPECTED)) {
  const it = byNumber.get(Number(n));
  assert(`item_${n}_public_name_matches_343`, it?.public_name_pt_br === exp.name, it?.public_name_pt_br);
  assert(`item_${n}_price_cents`, it?.price_cents === exp.price, it?.price_cents);
  assert(`item_${n}_billing_one_time`, it?.billing === "one_time", it?.billing);
  assert(`item_${n}_sla_business_days`, it?.sla_business_days === exp.sla, it?.sla_business_days);
  assert(`item_${n}_sla_starts_after_filled`, filled(it?.sla_starts_after_pt_br), it?.sla_starts_after_pt_br);
  assert(`item_${n}_public_state`, it?.public_state === exp.state, it?.public_state);
  assert(`item_${n}_blocking_issue`, (it?.blocking_issue ?? null) === exp.block, it?.blocking_issue);
}
// nenhum preço fora do conjunto publicado pela #332
const PUBLISHED_CENTS = new Set([149000, 240000, 290000]);
const seenCents = items.map((it) => it.price_cents);
assert(
  "no_price_outside_issue_332",
  seenCents.every((c) => PUBLISHED_CENTS.has(c)),
  seenCents.filter((c) => !PUBLISHED_CENTS.has(c)),
);
// nenhum prazo inventado: a #332 declara apenas 5 e 7 dias úteis
assert(
  "no_sla_outside_issue_332",
  items.every((it) => [5, 7].includes(it.sla_business_days)),
  items.map((it) => it.sla_business_days),
);
// nenhum item declara prazo-gate: a #332 não declara nenhum
assert(
  "no_invented_safe_deadline_gate",
  items.every((it) => !("safe_deadline_gate" in it) || it.safe_deadline_gate === null),
  items.map((it) => it.safe_deadline_gate),
);

/* limites numéricos do recorte do item 9 */
const it9 = byNumber.get(9);
assert("item_9_radius_km_max_200", it9.scope_pt_br.radius_km_max === 200, it9.scope_pt_br.radius_km_max);
assert("item_9_typologies_max_5", it9.scope_pt_br.typologies_max === 5, it9.scope_pt_br.typologies_max);
assert("item_9_horizon_3_to_24_months", it9.scope_pt_br.horizon_months_min === 3 && it9.scope_pt_br.horizon_months_max === 24, it9.scope_pt_br);
assert("item_9_max_40_signals", it9.scope_pt_br.max_prioritised_signals === 40, it9.scope_pt_br.max_prioritised_signals);
const it10 = byNumber.get(10);
assert("item_10_lookback_36_months", it10.scope_pt_br.lookback_months === 36, it10.scope_pt_br.lookback_months);
assert("item_10_typologies_max_5", it10.scope_pt_br.typologies_max === 5, it10.scope_pt_br.typologies_max);
const it11 = byNumber.get(11);
assert("item_11_candidates_max_20", it11.scope_pt_br.candidates_max === 20, it11.scope_pt_br.candidates_max);

/* ------------------------------------------------------------------ */
/* A. o item 9 distingue sinal pré-edital de oportunidade aberta        */
/* ------------------------------------------------------------------ */

const EXPECTED_STAGES = [
  "planejamento",
  "selecionado",
  "habilitado",
  "financiado",
  "contratacao_publicada",
  "UNKNOWN",
];
assert(
  "item_9_signal_stages_exact",
  JSON.stringify(it9.signal_stages) === JSON.stringify(EXPECTED_STAGES),
  it9.signal_stages,
);
assert("item_9_signal_stages_include_unknown", it9.signal_stages.includes("UNKNOWN"), it9.signal_stages);
const boundary9 = it9.pre_edital_boundary ?? {};
assert("item_9_boundary_separates_pre_edital", boundary9.separates_pre_edital_signal_from_open_opportunity === true, boundary9);
assert("item_9_boundary_owner_is_item_1", boundary9.open_opportunity_owner_item === 1, boundary9.open_opportunity_owner_item);
assert(
  "item_9_boundary_owner_name_canonical",
  boundary9.open_opportunity_owner_public_name_pt_br === "Radar de Licitações Prioritárias",
  boundary9.open_opportunity_owner_public_name_pt_br,
);
assert(
  "item_9_boundary_statement_names_both_sides",
  filled(boundary9.statement_pt_br) &&
    /sinal pré-edital/i.test(boundary9.statement_pt_br) &&
    /oportunidade aberta/i.test(boundary9.statement_pt_br),
  boundary9.statement_pt_br,
);
assert(
  "item_9_boundary_statement_denies_both_confusions",
  /nunca apresenta um sinal como oportunidade/i.test(boundary9.statement_pt_br ?? "") &&
    /nunca apresenta uma oportunidade aberta como previsão/i.test(boundary9.statement_pt_br ?? ""),
  boundary9.statement_pt_br,
);
assert(
  "item_9_output_declares_stage_per_signal",
  it9.outputs_pt_br.some((s) => /estágio/i.test(s) && /UNKNOWN/.test(s)),
  it9.outputs_pt_br,
);
assert(
  "item_9_output_declares_what_does_not_prove_an_edital",
  it9.outputs_pt_br.some((s) => /não permite afirmar que haverá edital/i.test(s)),
  it9.outputs_pt_br,
);
assert(
  "item_9_excludes_guaranteed_forecast",
  it9.exclusions_pt_br.some((s) => /previsão garantida/i.test(s)),
  it9.exclusions_pt_br,
);
assert(
  "item_9_excludes_influence_and_political_contact",
  it9.exclusions_pt_br.some((s) => /influência sobre órgão/i.test(s)) &&
    it9.exclusions_pt_br.some((s) => /contato político/i.test(s)),
  it9.exclusions_pt_br,
);
assert(
  "item_9_excludes_recurring_monitoring_and_points_to_45",
  it9.exclusions_pt_br.some((s) => /monitoramento recorrente/i.test(s) && /45/.test(s)),
  it9.exclusions_pt_br,
);
assert(
  "item_9_prohibits_presenting_signal_as_open_opportunity",
  it9.prohibitions.presents_signal_as_open_opportunity === false &&
    it9.prohibitions.guarantees_that_an_edital_will_exist === false,
  it9.prohibitions,
);
// as três fontes públicas que a #332 cita, todas em https
const EXPECTED_SOURCES_9 = [
  "https://www.gov.br/pncp/pt-br",
  "https://www.gov.br/transferegov/pt-br/ferramentas-gestao/dados-abertos/download-dados",
  "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/pac/selecoes-novo-pac/investimentos-selecionados",
];
assert("item_9_has_three_public_sources", (it9.public_sources ?? []).length === 3, it9.public_sources?.length);
for (const url of EXPECTED_SOURCES_9) {
  assert(`item_9_source_${url.slice(-24)}`, (it9.public_sources ?? []).some((s) => s.url === url), url);
}
assert(
  "item_9_sources_all_https_and_named",
  (it9.public_sources ?? []).every((s) => filled(s.name) && /^https:\/\//.test(s.url ?? "")),
  it9.public_sources,
);

/* ------------------------------------------------------------------ */
/* B. o item 10 nunca converte ausência de pagamento em atraso          */
/* ------------------------------------------------------------------ */

const pay = it10.payment_evidence_rule ?? {};
assert("item_10_absence_is_never_delay", pay.absence_of_public_payment_is_never_delay === true, pay);
assert("item_10_absence_state_is_unknown", pay.absence_state_pt_br === "UNKNOWN", pay.absence_state_pt_br);
assert("item_10_fact_requires_publishing_source", pay.fact_requires_source_that_publishes_payment === true, pay);
assert("item_10_availability_varies_by_agency", pay.availability_varies_by_agency === true, pay);
assert(
  "item_10_payment_statement_says_absence_is_not_delay",
  filled(pay.statement_pt_br) && /nunca atraso/i.test(pay.statement_pt_br),
  pay.statement_pt_br,
);
assert(
  "item_10_payment_statement_records_query_coverage_date",
  /consulta/i.test(pay.statement_pt_br ?? "") &&
    /cobertura/i.test(pay.statement_pt_br ?? "") &&
    /data/i.test(pay.statement_pt_br ?? ""),
  pay.statement_pt_br,
);
assert(
  "item_10_payment_reference_is_tcu_pagamento",
  pay.reference?.url === "https://licitacoesecontratos.tcu.gov.br/6-1-7-pagamento/" && filled(pay.reference?.name),
  pay.reference,
);
const FORBIDDEN_INFERENCES = ["bom pagador", "corrupção", "favorecimento", "qualidade de gestão"];
assert(
  "item_10_forbidden_inferences_exact",
  JSON.stringify(it10.forbidden_inferences_pt_br) === JSON.stringify(FORBIDDEN_INFERENCES),
  it10.forbidden_inferences_pt_br,
);
for (const label of FORBIDDEN_INFERENCES) {
  assert(
    `item_10_exclusion_denies_${label.replace(/\s+/g, "_")}`,
    it10.exclusions_pt_br.some((s) => s.toLowerCase().includes(label.toLowerCase())),
    label,
  );
}
assert(
  "item_10_exclusion_denies_absence_to_delay_conversion",
  it10.exclusions_pt_br.some((s) => /ausência de pagamento público em atraso/i.test(s)),
  it10.exclusions_pt_br,
);
assert(
  "item_10_prohibitions_cover_payer_label_and_delay",
  it10.prohibitions.labels_agency_as_good_or_bad_payer === false &&
    it10.prohibitions.converts_missing_payment_into_delay === false &&
    it10.prohibitions.asserts_corruption_or_favouring === false &&
    it10.prohibitions.rates_management_quality_by_inference === false,
  it10.prohibitions,
);
assert(
  "item_10_output_grades_payment_as_fact_or_unknown",
  it10.outputs_pt_br.some((s) => /FACT/.test(s) && /UNKNOWN/.test(s) && /pagamento/i.test(s)),
  it10.outputs_pt_br,
);
// nenhuma string do contrato afirma que o órgão é bom ou mau pagador
const payerClaims = allStrings.filter(
  (s) => /(é|e) (um )?(bom|mau) pagador/i.test(s.value) || /pagador confiável/i.test(s.value),
);
assert("no_good_or_bad_payer_claim_anywhere", payerClaims.length === 0, payerClaims.map((s) => s.at));

/* ------------------------------------------------------------------ */
/* C. o item 11 permanece fail-closed enquanto a #156 não fechar        */
/* ------------------------------------------------------------------ */

const blocker = it11.blocker ?? {};
assert("item_11_blocked_by_156", blocker.blocked_by_issue === 156, blocker.blocked_by_issue);
assert("item_11_blocker_state_blocked", blocker.state === "BLOCKED", blocker.state);
assert(
  "item_11_may_not_be_published_sold_or_promoted",
  blocker.may_be_published === false && blocker.may_be_sold === false && blocker.may_be_promoted === false,
  blocker,
);
assert("item_11_release_conditions_declared", filledList(blocker.release_conditions_pt_br, 3), blocker.release_conditions_pt_br);
const releaseText = (blocker.release_conditions_pt_br ?? []).join(" ");
for (const [key, re] of [
  ["official_key", /chave oficial/i],
  ["terminal_pagination", /paginação terminal/i],
  ["live_safe_canary", /canário live-safe/i],
  ["no_cnpj_in_public_artifact", /sem CNPJ em artefato público/i],
]) {
  assert(`item_11_release_condition_${key}`, re.test(releaseText), key);
}
assert(
  "item_11_blocker_statement_names_156",
  filled(blocker.statement_pt_br) && /#156/.test(blocker.statement_pt_br),
  blocker.statement_pt_br,
);
assert("item_11_prohibited_before_156", it11.prohibitions.is_published_before_issue_156 === false, it11.prohibitions);
assert("item_11_has_no_credit_rule", it11.credit_rule === null, it11.credit_rule);

const integrity = it11.integrity_signal_rule ?? {};
assert(
  "item_11_ceis_cnep_are_preliminary_signals",
  integrity.is_preliminary_signal === true && integrity.is_clean_company_certificate === false,
  integrity,
);
assert(
  "item_11_sources_are_ceis_and_cnep",
  JSON.stringify(integrity.sources_pt_br) === JSON.stringify(["CEIS", "CNEP"]),
  integrity.sources_pt_br,
);
assert("item_11_not_found_means_not_found_in_coverage", integrity.not_found_means_not_found_in_coverage === true, integrity);
assert(
  "item_11_integrity_statement_denies_clean_certificate",
  filled(integrity.statement_pt_br) && /nunca certificado de empresa limpa/i.test(integrity.statement_pt_br),
  integrity.statement_pt_br,
);
assert(
  "item_11_integrity_statement_requires_source_query_date_limit",
  /fonte/i.test(integrity.statement_pt_br ?? "") &&
    /consulta/i.test(integrity.statement_pt_br ?? "") &&
    /data/i.test(integrity.statement_pt_br ?? "") &&
    /limitação/i.test(integrity.statement_pt_br ?? ""),
  integrity.statement_pt_br,
);
assert(
  "item_11_integrity_reference_is_portal_da_transparencia",
  integrity.reference?.url === "https://portaldatransparencia.gov.br/sancoes" && filled(integrity.reference?.name),
  integrity.reference,
);
const consortium = it11.consortium_rule ?? {};
assert("item_11_consortium_quantities_are_scenario_only", consortium.quantities_are_scenario_only === true, consortium);
assert("item_11_consortium_never_habilitation_opinion", consortium.never_an_habilitation_opinion === true, consortium);
assert(
  "item_11_consortium_statement_denies_agency_acceptance",
  filled(consortium.statement_pt_br) && /nunca afirma que a soma será aceita pelo órgão/i.test(consortium.statement_pt_br),
  consortium.statement_pt_br,
);
assert(
  "item_11_prohibitions_cover_certificate_broker_and_investigation",
  it11.prohibitions.issues_clean_company_certificate === false &&
    it11.prohibitions.issues_habilitation_opinion === false &&
    it11.prohibitions.brokers_or_negotiates_with_candidate === false &&
    it11.prohibitions.runs_private_investigation === false &&
    it11.prohibitions.guarantees_partner_acceptance === false,
  it11.prohibitions,
);
assert(
  "item_11_output_declares_unknown_when_coverage_does_not_close",
  it11.outputs_pt_br.some((s) => /UNKNOWN/.test(s) && /(paginação|cobertura)/i.test(s)),
  it11.outputs_pt_br,
);

/* nenhuma string do contrato promete empresa limpa ou idônea */
const CLEAN_CLAIMS = [/empresa limpa/i, /empresa idônea/i, /nada consta/i, /selo de integridade/i];
// a expressão só pode aparecer para ser negada: numa exclusão, numa proibição
// ou numa frase que a nega explicitamente. Em qualquer outro lugar, é claim.
const DENIAL_PATHS = /(exclusions_pt_br|forbidden_inferences_pt_br|prohibitions)/;
const DENIAL_WORDS = /(nunca|não|jamais|sem |fora:|proibid)/i;
for (const re of CLEAN_CLAIMS) {
  const hits = allStrings.filter(
    (s) => re.test(s.value) && !DENIAL_PATHS.test(s.at) && !DENIAL_WORDS.test(s.value),
  );
  assert(`no_positive_clean_claim_${re.source.slice(0, 16)}`, hits.length === 0, hits.map((s) => s.at));
}
// e a expressão precisa aparecer pelo menos uma vez, negada, no item 11
assert(
  "item_11_explicitly_denies_clean_company_certificate",
  allStrings.some((s) => /empresa limpa/i.test(s.value) && /(nunca|exclus)/i.test(s.value + s.at)),
  "empresa limpa",
);

/* ------------------------------------------------------------------ */
/* 3. regra de crédito, exatamente como a #332 escreve                  */
/* ------------------------------------------------------------------ */

const family = data.credit_rule_family ?? {};
assert("credit_family_eligible_9_and_10", JSON.stringify(family.eligible_items) === JSON.stringify([9, 10]), family.eligible_items);
assert("credit_family_ineligible_11", JSON.stringify(family.ineligible_items) === JSON.stringify([11]), family.ineligible_items);
assert(
  "credit_family_target_is_expansion",
  family.credits_into_public_name_pt_br === "Diagnóstico de Expansão no Mercado Público",
  family.credits_into_public_name_pt_br,
);
assert("credit_family_cap_is_highest_paid", /maior valor pago/i.test(family.cap_basis_pt_br ?? ""), family.cap_basis_pt_br);
assert("credit_family_window_30_days", family.window_days === 30, family.window_days);
assert("credit_family_used_once", family.uses_allowed === 1, family.uses_allowed);
assert("credit_family_does_not_accumulate", family.accumulates === false, family.accumulates);
assert(
  "credit_family_does_not_change_02_to_08",
  family.changes_units_02_to_08_without_versioned_commercial_decision === false,
  family.changes_units_02_to_08_without_versioned_commercial_decision,
);
assert(
  "credit_family_statement_mentions_versioned_decision",
  /decisão comercial versionada/i.test(family.statement_pt_br ?? "") && /02 a 08/.test(family.statement_pt_br ?? ""),
  family.statement_pt_br,
);
for (const n of [9, 10]) {
  const c = byNumber.get(n).credit_rule;
  assert(`item_${n}_credit_rule_present`, c && typeof c === "object", c);
  assert(`item_${n}_credit_window_30`, c.window_days === 30, c.window_days);
  assert(`item_${n}_credit_once`, c.uses_allowed === 1, c.uses_allowed);
  assert(`item_${n}_credit_not_stackable`, c.accumulates === false, c.accumulates);
  assert(`item_${n}_credit_cap_equals_price`, c.cap_cents === byNumber.get(n).price_cents, [c.cap_cents, byNumber.get(n).price_cents]);
  assert(`item_${n}_credit_cap_basis`, /maior valor pago/i.test(c.cap_basis_pt_br ?? ""), c.cap_basis_pt_br);
  assert(`item_${n}_credit_does_not_change_02_to_08`, c.changes_units_02_to_08 === false, c.changes_units_02_to_08);
  assert(
    `item_${n}_credit_target_is_expansion_package`,
    JSON.stringify(c.credits_into) === JSON.stringify(["expansion_package"]),
    c.credits_into,
  );
}

/* ------------------------------------------------------------------ */
/* 4. contrato de dados: nada nasce no web-cfg                          */
/* ------------------------------------------------------------------ */

const dc = data.data_contract ?? {};
assert("data_owner_is_extra_cli", dc.owner === "extra-cli", dc.owner);
assert("data_consumption_select_only", dc.consumption === "SELECT_ONLY_SNAPSHOT", dc.consumption);
assert("data_contracts_are_versioned", dc.public_read_contracts_versioned === true, dc.public_read_contracts_versioned);
assert(
  "data_requires_provenance_freshness_coverage_dedup",
  dc.provenance_required === true &&
    dc.freshness_required === true &&
    dc.coverage_required === true &&
    dc.deduplication_required === true,
  dc,
);
assert(
  "data_evidence_grades_exact",
  JSON.stringify(dc.evidence_grades) === JSON.stringify(["FACT", "CALCULATION", "INFERENCE", "UNKNOWN"]),
  dc.evidence_grades,
);
assert("data_no_new_crawler_in_web_cfg", dc.no_new_crawler_in_web_cfg === true, dc.no_new_crawler_in_web_cfg);
assert("data_no_source_acquired_by_web_cfg", dc.no_source_acquired_directly_by_web_cfg === true, dc.no_source_acquired_directly_by_web_cfg);
assert("data_web_cfg_role_is_publish_and_capture", /publicar e capturar/i.test(dc.web_cfg_role_pt_br ?? ""), dc.web_cfg_role_pt_br);
assert(
  "data_statement_names_extra_cli_and_denies_crawler",
  /extra-cli/.test(dc.statement_pt_br ?? "") && /nenhum crawler novo/i.test(dc.statement_pt_br ?? ""),
  dc.statement_pt_br,
);

/* ------------------------------------------------------------------ */
/* 5. captura de lead e donos de gate que esta issue não toma           */
/* ------------------------------------------------------------------ */

const cg = data.conversion_gate ?? {};
assert("conversion_every_priced_route_captures_lead", cg.every_priced_route_captures_lead === true, cg);
assert("conversion_lead_destination_is_warmbly", cg.lead_destination === "warmbly:CONFENGE_WEB", cg.lead_destination);
assert(
  "conversion_gate_owner_issues_88_300_327",
  JSON.stringify(cg.gate_owner_issues) === JSON.stringify([88, 300, 327]),
  cg.gate_owner_issues,
);
assert(
  "conversion_statement_names_the_three_owners",
  /#88/.test(cg.statement_pt_br ?? "") && /#300/.test(cg.statement_pt_br ?? "") && /#327/.test(cg.statement_pt_br ?? ""),
  cg.statement_pt_br,
);

/* ------------------------------------------------------------------ */
/* 6. três exemplos sintéticos exigidos e nenhum publicado ainda        */
/* ------------------------------------------------------------------ */

const ex = data.synthetic_examples ?? {};
assert("synthetic_required_count_3", ex.required_count === 3, ex.required_count);
assert("synthetic_must_be_comparable", ex.must_be_comparable === true, ex.must_be_comparable);
assert("synthetic_must_be_labelled", ex.must_be_labelled_synthetic === true, ex.must_be_labelled_synthetic);
assert("synthetic_state_not_started", ex.state === "NOT_STARTED", ex.state);
assert("synthetic_published_is_empty", Array.isArray(ex.published) && ex.published.length === 0, ex.published);

/* ------------------------------------------------------------------ */
/* 7. acceptance honesta: nada declarado pronto sem estar pronto        */
/* ------------------------------------------------------------------ */

const acceptance = data.acceptance ?? [];
const ALLOWED_STATES = new Set(["MET_BY_CONTRACT", "NOT_STARTED"]);
assert("acceptance_has_eight_criteria", acceptance.length === 8, acceptance.length);
assert(
  "acceptance_states_are_allowed",
  acceptance.every((a) => ALLOWED_STATES.has(a.state)),
  acceptance.map((a) => a.state),
);
assert(
  "acceptance_every_criterion_has_statement",
  acceptance.every((a) => filled(a.key) && filled(a.statement_pt_br)),
  acceptance.map((a) => a.key),
);
const byKey = new Map(acceptance.map((a) => [a.key, a.state]));
assert("acceptance_synthetic_examples_not_started", byKey.get("three_comparable_synthetic_examples") === "NOT_STARTED", byKey.get("three_comparable_synthetic_examples"));
assert("acceptance_real_proposal_not_started", byKey.get("one_real_proposal_per_product") === "NOT_STARTED", byKey.get("one_real_proposal_per_product"));
assert("acceptance_partner_map_blocked_met", byKey.get("partner_map_blocked_by_156") === "MET_BY_CONTRACT", byKey.get("partner_map_blocked_by_156"));
// nenhuma acceptance pode se declarar cumprida por humano ou por venda
const HUMAN_KEYS = ["three_comparable_synthetic_examples", "one_real_proposal_per_product"];
assert(
  "no_human_acceptance_claims_met",
  HUMAN_KEYS.every((k) => byKey.get(k) === "NOT_STARTED"),
  HUMAN_KEYS.map((k) => [k, byKey.get(k)]),
);

/* ------------------------------------------------------------------ */
/* 8. nenhuma rota criada, nenhum checkout ligado                       */
/* ------------------------------------------------------------------ */

assert(
  "no_pages_created",
  Array.isArray(data.pages_created_by_this_contract) && data.pages_created_by_this_contract.length === 0,
  data.pages_created_by_this_contract,
);
assert("checkout_disabled_globally", data.checkout_enabled_anywhere === false, data.checkout_enabled_anywhere);
for (const it of items) {
  assert(`item_${it.number}_route_is_null`, it.route === null, it.route);
  assert(`item_${it.number}_page_does_not_exist`, it.page_exists === false, it.page_exists);
  assert(`item_${it.number}_checkout_disabled`, it.checkout_enabled === false, it.checkout_enabled);
}
// e nenhuma dessas rotas existe mesmo no repositório
for (const it of items) {
  const slug = it.deliverable_id.toLowerCase();
  assert(`item_${it.number}_no_directory_in_repo`, !fs.existsSync(path.join(root, slug)), slug);
}

/* ------------------------------------------------------------------ */
/* 9. reconciliação com o registro canônico                             */
/* ------------------------------------------------------------------ */

assert("registry_exists", fs.existsSync(REGISTRY_PATH), REGISTRY_PATH);
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const registryById = new Map((registry.deliverables ?? []).map((d) => [d.deliverable_id, d]));
for (const it of items) {
  const canonical = registryById.get(it.deliverable_id);
  const prefix = `registry_${it.deliverable_id}`;
  assert(`${prefix}_exists`, Boolean(canonical), it.deliverable_id);
  if (!canonical) continue;
  assert(`${prefix}_catalog_number`, canonical.catalog_number === String(it.number).padStart(2, "0"), canonical.catalog_number);
  assert(`${prefix}_name`, canonical.public_name_pt_br === it.public_name_pt_br, [canonical.public_name_pt_br, it.public_name_pt_br]);
  assert(`${prefix}_question`, canonical.decision_question === it.decision_question_pt_br, [canonical.decision_question, it.decision_question_pt_br]);
  assert(`${prefix}_price`, canonical.price?.amount_cents === it.price_cents, [canonical.price?.amount_cents, it.price_cents]);
  assert(`${prefix}_billing`, canonical.price?.billing === it.billing, [canonical.price?.billing, it.billing]);
  assert(`${prefix}_sla_min`, canonical.sla?.business_days_min === it.sla_business_days, [canonical.sla?.business_days_min, it.sla_business_days]);
  assert(`${prefix}_sla_max`, canonical.sla?.business_days_max === it.sla_business_days, [canonical.sla?.business_days_max, it.sla_business_days]);
  assert(`${prefix}_sla_starts_after`, canonical.sla?.starts_after === it.sla_starts_after_pt_br, [canonical.sla?.starts_after, it.sla_starts_after_pt_br]);
  assert(`${prefix}_no_safe_deadline`, (canonical.sla?.safe_deadline_business_days ?? null) === null, canonical.sla?.safe_deadline_business_days);
  assert(`${prefix}_route_null`, canonical.route === null && it.route === null, [canonical.route, it.route]);
  assert(`${prefix}_public_state`, canonical.public_state === it.public_state, [canonical.public_state, it.public_state]);
  assert(`${prefix}_price_state_pilot`, canonical.price_state === "PILOT_HYPOTHESIS", canonical.price_state);
  assert(`${prefix}_checkout_disabled`, canonical.checkout_enabled === false, canonical.checkout_enabled);
  assert(`${prefix}_source_issue`, canonical.source_issue === "#332", canonical.source_issue);
  assert(`${prefix}_door_grow`, canonical.task_door === "GROW", canonical.task_door);
  const canonicalBlock = canonical.blocking_issue === null ? null : Number(String(canonical.blocking_issue).replace("#", ""));
  assert(`${prefix}_blocking_issue`, canonicalBlock === (it.blocking_issue ?? null), [canonical.blocking_issue, it.blocking_issue]);
  // crédito: presente ou ausente exatamente como o registro diz
  const canonicalCredit = canonical.credit_rule;
  if (it.credit_rule === null) {
    assert(`${prefix}_credit_absent_in_registry`, canonicalCredit === null, canonicalCredit);
  } else {
    assert(`${prefix}_credit_present_in_registry`, Boolean(canonicalCredit), canonicalCredit);
    assert(`${prefix}_credit_cap`, canonicalCredit?.max_cents === it.credit_rule.cap_cents, [canonicalCredit?.max_cents, it.credit_rule.cap_cents]);
    assert(`${prefix}_credit_window`, canonicalCredit?.window_days === it.credit_rule.window_days, [canonicalCredit?.window_days, it.credit_rule.window_days]);
    assert(`${prefix}_credit_not_stackable`, canonicalCredit?.stackable === false, canonicalCredit?.stackable);
    assert(
      `${prefix}_credit_target`,
      JSON.stringify(canonicalCredit?.credits_into) === JSON.stringify(it.credit_rule.credits_into),
      [canonicalCredit?.credits_into, it.credit_rule.credits_into],
    );
  }
}
// o registro continua marcando o item 11 como bloqueado pela #156
const canonical11 = registryById.get("CFG-D11");
assert("registry_d11_still_blocked", canonical11?.public_state === "BLOCKED", canonical11?.public_state);
assert("registry_d11_blocked_by_156", canonical11?.blocking_issue === "#156", canonical11?.blocking_issue);

/* o pacote de expansão, alvo do crédito, existe e continua congelado */
const catalogPath = path.join(root, "data/offers/catalog.snapshot.json");
assert("catalog_snapshot_exists", fs.existsSync(catalogPath), catalogPath);
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const expansion = (catalog.offers ?? []).find((o) => o.offer_id === "CFG-DIAG-EXP-v1");
assert("expansion_offer_exists", Boolean(expansion), (catalog.offers ?? []).map((o) => o.offer_id));
assert("expansion_amount_unchanged", expansion?.amount_cents === 800000, expansion?.amount_cents);
assert("catalog_still_frozen", catalog.frozen_at === "2026-08-17", catalog.frozen_at);
assert("expansion_page_exists_in_repo", fs.existsSync(path.join(root, "diagnostico-b2g-expansao/index.html")), "diagnostico-b2g-expansao/index.html");
// nenhum deliverable_id desta família colide com um offer_id do catálogo
const catalogIds = new Set((catalog.offers ?? []).map((o) => o.offer_id));
assert(
  "deliverable_ids_do_not_collide_with_offer_ids",
  items.every((it) => !catalogIds.has(it.deliverable_id)),
  items.map((it) => it.deliverable_id).filter((id) => catalogIds.has(id)),
);
// o hub de entregas não linka página que este contrato não cria
assert("deliverables_hub_exists_in_main", fs.existsSync(path.join(root, "entregas/index.html")), "entregas/index.html");
const hub = fs.readFileSync(path.join(root, "entregas/index.html"), "utf8");
assert(
  "hub_does_not_link_pages_this_pr_does_not_create",
  items.every((it) => !hub.includes(`/${it.deliverable_id.toLowerCase()}/`)),
  items.map((it) => it.deliverable_id),
);

/* ------------------------------------------------------------------ */
/* 10. sem travessão em nenhum lugar do contrato                        */
/* ------------------------------------------------------------------ */

const EM_DASH = "\u2014";
const EN_DASH = "\u2013";
assert("no_em_dash_in_data_file", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_in_data_file", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
const selfRaw = fs.readFileSync(path.join(__dirname, "test_page_contract_pre_edital.mjs"), "utf8");
assert("no_em_dash_in_test_file", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_in_test_file", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));

/* ------------------------------------------------------------------ */

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert(
  "npm_script_registered",
  pkg.scripts?.["test:page-contract-pre-edital"] === "node tests/commercial/test_page_contract_pre_edital.mjs",
  pkg.scripts?.["test:page-contract-pre-edital"],
);
assert("npm_test_runs_gate", String(pkg.scripts?.test ?? "").includes("npm run test:page-contract-pre-edital"), pkg.scripts?.test);
const workflow = fs.readFileSync(path.join(root, ".github/workflows/site-ci.yml"), "utf8");
assert("site_ci_runs_gate", workflow.includes("npm run test:page-contract-pre-edital"), ".github/workflows/site-ci.yml");
const affectedGraph = fs.readFileSync(path.join(root, "scripts/site/affected_graph.mjs"), "utf8");
assert("affected_graph_declares_gate", affectedGraph.includes('"test:page-contract-pre-edital"'), "scripts/site/affected_graph.mjs");
assert("affected_graph_declares_contract", affectedGraph.includes("data/commercial/page-contract-pre-edital.v1.json"), "scripts/site/affected_graph.mjs");

/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
