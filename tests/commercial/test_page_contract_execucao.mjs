/**
 * Gate do contrato de página da família "execução da licitação" (issue #344, itens 49 a 54).
 *
 * O teste é autossuficiente: lê o próprio JSON com fs e só cruza com artefatos
 * que já existem em main. Ele prova dois pontos centrais da #344:
 *
 *   A. a fronteira por verbo contra as ofertas existentes (12, 13, 14 e 16);
 *   B. a conduta do item 53 na sessão de disputa.
 *
 * Mais os invariantes de preço, prazo-gate, regras comuns, crédito e rota.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const NAME = "page-contract-execucao";
const DATA_PATH = path.join(root, "data/commercial/page-contract-execucao.v1.json");
const REGISTRY_PATH = path.join(root, "data/commercial/deliverables-registry.v1.json");
const NAMING_PATH = path.join(root, "data/commercial/offer-naming.v1.json");

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
const brl = (cents) => `R$ ${Math.round(Number(cents) / 100).toLocaleString("pt-BR")}`;
const items = Array.isArray(data.items) ? data.items : [];
const byNumber = new Map(items.map((it) => [it.number, it]));
const sortedKeys = (value) => Object.keys(value ?? {}).sort();
function assertExactKeys(name, value, expected) {
  assert(name, JSON.stringify(sortedKeys(value)) === JSON.stringify([...expected].sort()), sortedKeys(value));
}

/* ------------------------------------------------------------------ */
/* 0. schema fechado: nenhum campo paralelo ou dado pessoal escondido */
/* ------------------------------------------------------------------ */

assertExactKeys("top_level_schema_exact", data, [
  "checkout_enabled_anywhere", "common_rules", "contract_id", "currency", "decision_state", "evidence",
  "executive_front", "family_pt_br", "human_validation", "items", "leverage", "naming_authority_issue",
  "neighbour_offers", "pages_created_by_this_contract", "parent_issue", "price_basis", "price_unit", "priority",
  "related_issues", "research_state", "routes_owned_by_other_items", "schema_version", "source_issue", "time_to_evidence_days",
]);
assertExactKeys("human_validation_schema_exact", data.human_validation, ["collected", "real_proposals_required_before_promoting_price", "state"]);
for (const [index, neighbour] of (data.neighbour_offers ?? []).entries()) {
  assertExactKeys(`neighbour_${index}_schema_exact`, neighbour, ["item", "public_name_pt_br", "verb_pt_br"]);
}
for (const [index, owned] of (data.routes_owned_by_other_items ?? []).entries()) {
  assertExactKeys(`owned_route_${index}_schema_exact`, owned, ["owner_item", "owner_public_name_pt_br", "route"]);
}

const ITEM_KEYS = [
  "boundary_vs_existing_offers", "checkout_enabled", "credit_rule", "decision_question_pt_br", "deliverable_id",
  "exclusions_pt_br", "inputs_pt_br", "legal_boundary_pt_br", "number", "outputs_pt_br", "page_exists", "pricing",
  "prohibitions", "public_name_pt_br", "route", "safe_deadline_gate", "sla_business_days", "value_line_pt_br", "verb_pt_br",
];
const BASE_PROHIBITION_KEYS = [
  "custody_of_digital_certificate", "custody_of_password", "custody_of_token", "files_or_protocols",
  "operates_client_credential", "promises_victory_or_award", "provides_legal_representation", "signs_for_client", "success_fee",
];
for (const item of items) {
  const itemKeys = item.number === 53 ? [...ITEM_KEYS, "operator_of_record_pt_br", "session_conduct_negatives_pt_br"] : ITEM_KEYS;
  assertExactKeys(`item_${item.number}_schema_exact`, item, itemKeys);
  assertExactKeys(`item_${item.number}_pricing_schema_exact`, item.pricing, ["additional_charges", "model", "tiers"]);
  item.pricing?.tiers?.forEach((tier, index) => assertExactKeys(
    `item_${item.number}_tier_${index}_schema_exact`, tier, ["name_pt_br", "price_cents", "sla_business_days", "unit_pt_br"],
  ));
  item.pricing?.additional_charges?.forEach((charge, index) => assertExactKeys(
    `item_${item.number}_addition_${index}_schema_exact`, charge, ["exhaustive", "name_pt_br", "price_cents", "unit_pt_br"],
  ));
  item.boundary_vs_existing_offers?.forEach((boundary, index) => assertExactKeys(
    `item_${item.number}_boundary_${index}_schema_exact`, boundary,
    ["against_item", "against_public_name_pt_br", "our_verb_pt_br", "statement_pt_br", "their_verb_pt_br"],
  ));
  const prohibitionKeys = item.number === 53
    ? [...BASE_PROHIBITION_KEYS, "operates_platform_for_client", "places_bids", "promises_ranking_or_winning_bid", "represents_client_before_agency"]
    : BASE_PROHIBITION_KEYS;
  assertExactKeys(`item_${item.number}_prohibitions_schema_exact`, item.prohibitions, prohibitionKeys);
}
assertExactKeys("item_51_gate_schema_exact", byNumber.get(51)?.safe_deadline_gate,
  ["declared_by_issue", "extra_conditions_pt_br", "min_business_days_remaining", "statement_pt_br"]);
assertExactKeys("item_53_gate_schema_exact", byNumber.get(53)?.safe_deadline_gate,
  ["declared_by_issue", "extra_conditions_pt_br", "min_business_days_before_session", "statement_pt_br"]);
assertExactKeys("item_51_credit_schema_exact", byNumber.get(51)?.credit_rule, [
  "accumulates", "applies_to_items", "cap_basis_pt_br", "cap_cents", "originates_in_paying_item", "source_item",
  "source_public_name_pt_br", "statement_pt_br", "uses_allowed", "window_days",
]);
const forbiddenKey = /(?:^|_)(?:email|e_mail|phone|telefone|celular|whatsapp|cpf|cnpj)(?:_|$)/i;
function walkKeys(node, at, out) {
  if (!node || typeof node !== "object") return out;
  for (const [key, child] of Object.entries(node)) {
    if (forbiddenKey.test(key)) out.push(`${at}.${key}`);
    walkKeys(child, `${at}.${key}`, out);
  }
  return out;
}
assert("no_pii_bearing_keys", walkKeys(data, "$", []).length === 0, walkKeys(data, "$", []));
assert("no_specific_email_phone_cpf_cnpj_values", allStrings.every(({ value }) =>
  !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) &&
  !/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}/.test(value) &&
  !/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(value)
), allStrings.filter(({ value }) => /@|\d{3}\.\d{3}/.test(value)));
assert("no_forbidden_public_brand", allStrings.every(({ value }) => !/smartlic/i.test(value)), "SmartLic");

/* ------------------------------------------------------------------ */
/* 1. seis itens, 49 a 54, sem lacuna, todos os campos preenchidos      */
/* ------------------------------------------------------------------ */

assert("six_items", items.length === 6, items.length);
assert(
  "numbers_49_to_54_contiguous",
  JSON.stringify(items.map((it) => it.number)) === JSON.stringify([49, 50, 51, 52, 53, 54]),
  items.map((it) => it.number),
);
assert(
  "deliverable_ids_unique_and_numbered",
  new Set(items.map((it) => it.deliverable_id)).size === 6 &&
    items.every((it) => it.deliverable_id === `CFG-D${it.number}`),
  items.map((it) => it.deliverable_id),
);
assert("source_issue_344", data.source_issue === 344, data.source_issue);
assert("naming_authority_343", data.naming_authority_issue === 343, data.naming_authority_issue);
assert("decision_state_validate", data.decision_state === "VALIDATE", data.decision_state);
assert("price_unit_cents", data.price_unit === "cents" && data.currency === "BRL", [data.price_unit, data.currency]);
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

// nomes públicos e linhas de valor conforme a tabela da #343
const CANON_343 = {
  49: ["Orçamento Completo da Proposta", "Monta preços, composições e BDI em planilha reproduzível."],
  50: ["Cronograma e Plano Executivo da Proposta", "Converte escopo e prazo em sequência, marcos e curva de execução."],
  51: ["Dossiê de Habilitação Pronto para Envio", "Organiza cada exigência e documento no pacote final da licitação."],
  52: ["Verificação de SICAF, Certidões e Regularidade", "Mostra cadastros, vencimentos e lacunas antes que bloqueiem a participação."],
  53: ["Acompanhamento Técnico da Sessão de Disputa", "Sustenta decisões de preço e margem enquanto o cliente opera os lances."],
  54: ["Dossiê de Credenciamento ou Pré-Qualificação", "Organiza requisitos e provas para entrar no procedimento correto."],
};
for (const [n, [name, line]] of Object.entries(CANON_343)) {
  const it = byNumber.get(Number(n));
  assert(`item_${n}_public_name_matches_343`, it?.public_name_pt_br === name, it?.public_name_pt_br);
  assert(`item_${n}_value_line_matches_343`, it?.value_line_pt_br === line, it?.value_line_pt_br);
}

// todos os campos obrigatórios preenchidos, em todos os seis
for (const it of items) {
  const n = it.number;
  assert(`item_${n}_decision_question_filled`, filled(it.decision_question_pt_br), it.decision_question_pt_br);
  assert(`item_${n}_verb_filled`, filled(it.verb_pt_br), it.verb_pt_br);
  assert(`item_${n}_inputs_filled`, filledList(it.inputs_pt_br, 4), it.inputs_pt_br?.length);
  assert(`item_${n}_outputs_filled`, filledList(it.outputs_pt_br, 4), it.outputs_pt_br?.length);
  assert(`item_${n}_exclusions_filled`, filledList(it.exclusions_pt_br, 3), it.exclusions_pt_br?.length);
  assert(`item_${n}_legal_boundary_filled`, filledList(it.legal_boundary_pt_br, 3), it.legal_boundary_pt_br?.length);
  assert(
    `item_${n}_boundary_vs_existing_offers_declared`,
    Array.isArray(it.boundary_vs_existing_offers) && it.boundary_vs_existing_offers.length >= 1,
    it.boundary_vs_existing_offers?.length,
  );
  assert(
    `item_${n}_pricing_tiers_present`,
    Array.isArray(it.pricing?.tiers) && it.pricing.tiers.length >= 1 &&
      it.pricing.tiers.every((t) => Number.isInteger(t.price_cents) && t.price_cents > 0 && filled(t.unit_pt_br) && filled(t.name_pt_br)),
    it.pricing,
  );
}

/* ------------------------------------------------------------------ */
/* 2. preços exatos, em centavos, como a #344 publica                   */
/* ------------------------------------------------------------------ */

const EXPECTED_PRICING = {
  49: { model: "tiers", tiers: [["Essencial", 980000, 10], ["Complexo", 1480000, 15], ["Extenso", 2480000, 20]], additions: [] },
  50: { model: "tiers", tiers: [["Essencial", 590000, 7], ["Complexo", 980000, 10]], additions: [] },
  51: { model: "single", tiers: [["Único", 490000, 3]], additions: [] },
  52: { model: "single", tiers: [["Único", 149000, 2]], additions: [] },
  53: { model: "single_plus_additions", tiers: [["Base", 375000, null]], additions: [["Lote adicional na mesma sessão", 149000]] },
  54: { model: "single", tiers: [["Único", 590000, 7]], additions: [] },
};
for (const [n, expected] of Object.entries(EXPECTED_PRICING)) {
  const it = byNumber.get(Number(n));
  const tiers = it?.pricing?.tiers ?? [];
  assert(`item_${n}_pricing_model`, it?.pricing?.model === expected.model, it?.pricing?.model);
  assert(`item_${n}_tier_count`, tiers.length === expected.tiers.length, tiers.length);
  expected.tiers.forEach(([tname, cents, sla], i) => {
    const tier = tiers[i];
    assert(`item_${n}_tier_${i}_name`, tier?.name_pt_br === tname, tier?.name_pt_br);
    assert(`item_${n}_tier_${i}_price_cents`, tier?.price_cents === cents, tier?.price_cents);
    assert(`item_${n}_tier_${i}_sla`, (tier?.sla_business_days ?? null) === sla, tier?.sla_business_days);
  });
  const additions = it?.pricing?.additional_charges ?? [];
  assert(`item_${n}_addition_count`, additions.length === expected.additions.length, additions.length);
  expected.additions.forEach(([aname, cents], i) => {
    assert(`item_${n}_addition_${i}_name`, additions[i]?.name_pt_br === aname, additions[i]?.name_pt_br);
    assert(`item_${n}_addition_${i}_cents`, additions[i]?.price_cents === cents, additions[i]?.price_cents);
    assert(`item_${n}_addition_${i}_exhaustive`, additions[i]?.exhaustive === true, additions[i]?.exhaustive);
  });
}
// as faixas do 49 e do 50 são estritamente crescentes em preço e em SLA
for (const n of [49, 50]) {
  const tiers = byNumber.get(n).pricing.tiers;
  const priceAsc = tiers.every((t, i) => i === 0 || t.price_cents > tiers[i - 1].price_cents);
  const slaAsc = tiers.every((t, i) => i === 0 || t.sla_business_days >= tiers[i - 1].sla_business_days);
  assert(`item_${n}_tiers_price_ascending`, priceAsc, tiers.map((t) => t.price_cents));
  assert(`item_${n}_tiers_sla_non_decreasing`, slaAsc, tiers.map((t) => t.sla_business_days));
}
// nenhum preço fora do conjunto publicado pela #344
const PUBLISHED_CENTS = new Set([980000, 1480000, 2480000, 590000, 490000, 149000, 375000]);
const seenCents = [];
for (const it of items) {
  it.pricing.tiers.forEach((t) => seenCents.push(t.price_cents));
  (it.pricing.additional_charges ?? []).forEach((a) => seenCents.push(a.price_cents));
}
assert(
  "no_price_outside_issue_344",
  seenCents.every((c) => PUBLISHED_CENTS.has(c)),
  seenCents.filter((c) => !PUBLISHED_CENTS.has(c)),
);
// SLA de item declarado só onde a #344 declara um número único
const EXPECTED_ITEM_SLA = { 49: null, 50: null, 51: 3, 52: 2, 53: null, 54: 7 };
for (const [n, sla] of Object.entries(EXPECTED_ITEM_SLA)) {
  assert(`item_${n}_item_level_sla`, (byNumber.get(Number(n)).sla_business_days ?? null) === sla, byNumber.get(Number(n)).sla_business_days);
}

/* ------------------------------------------------------------------ */
/* 3. nenhum prazo-gate inventado                                       */
/* ------------------------------------------------------------------ */

const GATE_ITEMS = [51, 53];
for (const it of items) {
  const declared = it.safe_deadline_gate !== null && it.safe_deadline_gate !== undefined;
  assert(
    `item_${it.number}_gate_only_when_issue_declares`,
    declared === GATE_ITEMS.includes(it.number),
    { number: it.number, gate: it.safe_deadline_gate },
  );
  if (!GATE_ITEMS.includes(it.number)) {
    assert(`item_${it.number}_gate_is_null`, it.safe_deadline_gate === null, it.safe_deadline_gate);
  }
}
const gate51 = byNumber.get(51).safe_deadline_gate;
assert("item_51_gate_declared_by_issue", gate51.declared_by_issue === true, gate51);
assert("item_51_gate_min_5_business_days", gate51.min_business_days_remaining === 5, gate51.min_business_days_remaining);
assert(
  "item_51_gate_requires_base_documents",
  filledList(gate51.extra_conditions_pt_br, 1) && /documentos-base/i.test(gate51.extra_conditions_pt_br.join(" ")),
  gate51.extra_conditions_pt_br,
);
assert("item_51_gate_statement", filled(gate51.statement_pt_br) && /5 dias úteis/.test(gate51.statement_pt_br), gate51.statement_pt_br);
const gate53 = byNumber.get(53).safe_deadline_gate;
assert("item_53_gate_declared_by_issue", gate53.declared_by_issue === true, gate53);
assert("item_53_gate_min_3_business_days_before_session", gate53.min_business_days_before_session === 3, gate53.min_business_days_before_session);
assert("item_53_gate_statement", filled(gate53.statement_pt_br) && /3 dias úteis/.test(gate53.statement_pt_br), gate53.statement_pt_br);
assert("item_51_gate_has_no_session_field", !("min_business_days_before_session" in gate51), gate51);
assert("item_53_gate_has_no_remaining_field", !("min_business_days_remaining" in gate53), gate53);

/* ------------------------------------------------------------------ */
/* 4. regras comuns codificadas                                         */
/* ------------------------------------------------------------------ */

const cr = data.common_rules ?? {};
assert("rule_pilot_does_not_change_01_48", cr.pilot_prices_do_not_change_items_01_to_48 === true, cr.pilot_prices_do_not_change_items_01_to_48);
assert("rule_price_basis_piloto", data.price_basis === "piloto", data.price_basis);
const EXPECTED_UNITS = ["objeto", "item", "atividade", "lote", "sistema", "revisão", "evento"];
assert(
  "rule_scope_units_exact",
  JSON.stringify(cr.scope_units_allowed_pt_br) === JSON.stringify(EXPECTED_UNITS),
  cr.scope_units_allowed_pt_br,
);
assert(
  "rule_scope_never_by_pages",
  cr.scope_never_measured_by_pages === true &&
    Array.isArray(cr.scope_units_forbidden_pt_br) &&
    cr.scope_units_forbidden_pt_br.includes("página"),
  cr.scope_units_forbidden_pt_br,
);
assert(
  "no_tier_unit_measures_pages",
  items.every((it) => it.pricing.tiers.every((t) => !/páginas?/i.test(t.unit_pt_br))),
  items.flatMap((it) => it.pricing.tiers.map((t) => t.unit_pt_br)),
);
assert("rule_urgency_50_percent", cr.urgency_surcharge_percent === 50, cr.urgency_surcharge_percent);
assert("rule_urgency_requires_capacity", cr.urgency_requires_confirmed_capacity === true, cr.urgency_requires_confirmed_capacity);
assert("rule_urgency_disclosed_before_charging", cr.urgency_disclosed_before_charging === true, cr.urgency_disclosed_before_charging);
assert(
  "rule_compose_16_and_stay_separately_purchasable",
  cr.may_compose_item_16 === true && cr.remains_separately_purchasable === true,
  [cr.may_compose_item_16, cr.remains_separately_purchasable],
);
assert(
  "rule_16_itemized_no_silent_sum",
  cr.item_16_composition_is_itemized === true && cr.item_16_never_sums_prices_silently === true,
  [cr.item_16_composition_is_itemized, cr.item_16_never_sums_prices_silently],
);
assert(
  "rule_nothing_originates_in_web_cfg",
  cr.no_data_or_identity_originates_in_web_cfg === true && cr.truth_and_provenance_remain_in === "extra-cli",
  [cr.no_data_or_identity_originates_in_web_cfg, cr.truth_and_provenance_remain_in],
);
assert(
  "rule_statements_cover_every_common_rule",
  filledList(cr.statements_pt_br, 6),
  cr.statements_pt_br?.length,
);
const rulesText = (cr.statements_pt_br ?? []).join(" ");
for (const [key, re] of [
  ["01_48", /01 a 48/],
  ["pages", /nunca por número de páginas/i],
  ["urgency", /50 por cento sobre o preço-piloto ou preço publicado daquela entrega/],
  ["item16", /item 16/],
  ["extra_cli", /extra-cli/],
  ["no_success_fee", /comissão de êxito/i],
]) {
  assert(`rule_statement_mentions_${key}`, re.test(rulesText), key);
}

/* ------------------------------------------------------------------ */
/* 5. sem êxito, sem promessa, sem custódia de credencial               */
/* ------------------------------------------------------------------ */

assert("rule_no_success_fee_global", cr.no_success_fee === true, cr.no_success_fee);
assert("rule_no_victory_promise_global", cr.no_promise_of_victory_or_award === true, cr.no_promise_of_victory_or_award);
assert("rule_no_credential_custody_global", cr.no_custody_of_token_certificate_or_password === true, cr.no_custody_of_token_certificate_or_password);
const REQUIRED_PROHIBITIONS = [
  "success_fee",
  "promises_victory_or_award",
  "custody_of_token",
  "custody_of_digital_certificate",
  "custody_of_password",
  "operates_client_credential",
  "signs_for_client",
  "files_or_protocols",
  "provides_legal_representation",
];
for (const it of items) {
  const p = it.prohibitions ?? {};
  for (const key of REQUIRED_PROHIBITIONS) {
    assert(`item_${it.number}_prohibition_${key}_false`, p[key] === false, { key, value: p[key] });
  }
  assert(
    `item_${it.number}_no_prohibition_is_true`,
    Object.values(p).every((v) => v === false),
    p,
  );
  const legal = it.legal_boundary_pt_br.join(" ");
  assert(`item_${it.number}_legal_boundary_denies_success_fee`, /comissão de êxito/i.test(legal), legal);
  assert(`item_${it.number}_legal_boundary_denies_advocacy`, /advocacia|representação jurídica/i.test(legal), legal);
  assert(
    `item_${it.number}_legal_boundary_denies_signing_and_filing`,
    /não assina/i.test(legal) && /não protocola/i.test(legal),
    legal,
  );
  assert(
    `item_${it.number}_legal_boundary_denies_credential_custody`,
    /não guarda token, certificado digital ou senha/i.test(legal),
    legal,
  );
}

/* ------------------------------------------------------------------ */
/* 6. regra de crédito do item 13                                       */
/* ------------------------------------------------------------------ */

for (const it of items) {
  if (it.number !== 51) {
    assert(`item_${it.number}_no_invented_credit_rule`, it.credit_rule === null, it.credit_rule);
  }
}
const credit = byNumber.get(51).credit_rule;
assert("credit_rule_present_on_51", credit && typeof credit === "object", credit);
assert("credit_source_is_item_13", credit.source_item === 13, credit.source_item);
assert(
  "credit_source_name_is_canonical",
  credit.source_public_name_pt_br === "Mapa de Habilitação e Lacunas de Acervo",
  credit.source_public_name_pt_br,
);
assert("credit_cap_is_highest_paid_in_13", /maior valor pago/i.test(credit.cap_basis_pt_br ?? ""), credit.cap_basis_pt_br);
assert("credit_cap_cents_not_invented", credit.cap_cents === null, credit.cap_cents);
assert("credit_window_30_days", credit.window_days === 30, credit.window_days);
assert("credit_used_once", credit.uses_allowed === 1, credit.uses_allowed);
assert("credit_does_not_accumulate", credit.accumulates === false, credit.accumulates);
assert(
  "credit_applies_to_51_or_16",
  JSON.stringify(credit.applies_to_items) === JSON.stringify([51, 16]),
  credit.applies_to_items,
);
assert("credit_originates_in_paying_item", credit.originates_in_paying_item === true, credit.originates_in_paying_item);
assert(
  "credit_statement_says_paying_item",
  /crédito nasce no item pagador/i.test(credit.statement_pt_br ?? "") && /13/.test(credit.statement_pt_br ?? ""),
  credit.statement_pt_br,
);

/* ------------------------------------------------------------------ */
/* 7. nenhuma rota, nenhuma apropriação de rota alheia                  */
/* ------------------------------------------------------------------ */

assert("no_pages_created", Array.isArray(data.pages_created_by_this_contract) && data.pages_created_by_this_contract.length === 0, data.pages_created_by_this_contract);
assert("checkout_disabled_globally", data.checkout_enabled_anywhere === false, data.checkout_enabled_anywhere);
for (const it of items) {
  assert(`item_${it.number}_route_is_null`, it.route === null, it.route);
  assert(`item_${it.number}_page_does_not_exist`, it.page_exists === false, it.page_exists);
  assert(`item_${it.number}_checkout_disabled`, it.checkout_enabled === false, it.checkout_enabled);
}
const OWNED_ROUTES = [
  ["/auditoria-orcamento-licitacao/", 14, "Auditoria de Orçamento, BDI e Exequibilidade"],
  ["/diagnostico-pre-licitacao/", 12, "Decisão de Disputar o Edital"],
  ["/bid-room-licitacoes-obras/", 16, "Operação de Proposta para Licitação Crítica"],
];
const declaredOwned = data.routes_owned_by_other_items ?? [];
assert("owned_routes_declared", declaredOwned.length === OWNED_ROUTES.length, declaredOwned.length);
for (const [route, owner, ownerName] of OWNED_ROUTES) {
  const entry = declaredOwned.find((r) => r.route === route);
  assert(`owned_route_${owner}_declared`, Boolean(entry), route);
  assert(`owned_route_${owner}_owner_item`, entry?.owner_item === owner, entry?.owner_item);
  assert(`owned_route_${owner}_owner_name`, entry?.owner_public_name_pt_br === ownerName, entry?.owner_public_name_pt_br);
  // cruza com main: a página do dono existe de verdade no repositório
  const onDisk = path.join(root, route.replace(/^\/|\/$/g, ""), "index.html");
  assert(`owned_route_${owner}_page_exists_in_repo`, fs.existsSync(onDisk), onDisk);
}
// nenhum item, em nenhum campo, se apropria de uma dessas rotas
const itemStrings = walkStrings(items, "$.items", []);
for (const [route, owner] of OWNED_ROUTES) {
  assert(
    `no_item_claims_route_of_${owner}`,
    itemStrings.every((s) => !s.value.includes(route)),
    itemStrings.filter((s) => s.value.includes(route)).map((s) => s.at),
  );
}

/* ------------------------------------------------------------------ */
/* A. fronteira por verbo contra as ofertas existentes                  */
/* ------------------------------------------------------------------ */

const NEIGHBOURS = {
  12: ["Decisão de Disputar o Edital", "decide"],
  13: ["Mapa de Habilitação e Lacunas de Acervo", "diagnostica"],
  14: ["Auditoria de Orçamento, BDI e Exequibilidade", "audita"],
  16: ["Operação de Proposta para Licitação Crítica", "coordena"],
};
for (const [n, [name, verb]] of Object.entries(NEIGHBOURS)) {
  const entry = (data.neighbour_offers ?? []).find((o) => o.item === Number(n));
  assert(`neighbour_${n}_name_canonical`, entry?.public_name_pt_br === name, entry?.public_name_pt_br);
  assert(`neighbour_${n}_verb`, entry?.verb_pt_br === verb, entry?.verb_pt_br);
}
const PRODUCE_VERBS = new Set(["produz", "monta", "verifica", "apoia"]);
for (const it of items) {
  assert(`item_${it.number}_verb_is_production_side`, PRODUCE_VERBS.has(it.verb_pt_br), it.verb_pt_br);
  for (const b of it.boundary_vs_existing_offers) {
    const label = `item_${it.number}_vs_${b.against_item}`;
    assert(`${label}_has_their_verb`, filled(b.their_verb_pt_br), b.their_verb_pt_br);
    assert(`${label}_has_our_verb`, filled(b.our_verb_pt_br), b.our_verb_pt_br);
    assert(`${label}_our_verb_matches_item_verb`, b.our_verb_pt_br === it.verb_pt_br, [b.our_verb_pt_br, it.verb_pt_br]);
    assert(`${label}_statement_long_enough`, filled(b.statement_pt_br) && b.statement_pt_br.length >= 80, b.statement_pt_br?.length);
    assert(
      `${label}_statement_names_both_items`,
      new RegExp(`item ${it.number}\\b`).test(b.statement_pt_br) && new RegExp(`item ${b.against_item}\\b`).test(b.statement_pt_br),
      b.statement_pt_br,
    );
    const canonical = NEIGHBOURS[b.against_item]?.[0] ?? CANON_343[b.against_item]?.[0];
    assert(`${label}_against_name_canonical`, b.against_public_name_pt_br === canonical, b.against_public_name_pt_br);
    if (NEIGHBOURS[b.against_item]) {
      assert(`${label}_their_verb_canonical`, b.their_verb_pt_br === NEIGHBOURS[b.against_item][1], b.their_verb_pt_br);
    }
  }
}
function boundary(from, against) {
  return byNumber.get(from)?.boundary_vs_existing_offers.find((b) => b.against_item === against);
}
// 14 audita um orçamento que já existe; 49 produz o orçamento
const b49_14 = boundary(49, 14);
assert("boundary_49_vs_14_exists", Boolean(b49_14), b49_14);
assert("boundary_49_vs_14_verbs", b49_14?.their_verb_pt_br === "audita" && b49_14?.our_verb_pt_br === "produz", b49_14);
assert("boundary_49_vs_14_says_already_exists", /já existe/i.test(b49_14?.statement_pt_br ?? ""), b49_14?.statement_pt_br);
// 13 diagnostica cobertura de habilitação; 51 monta a versão final
const b51_13 = boundary(51, 13);
assert("boundary_51_vs_13_exists", Boolean(b51_13), b51_13);
assert("boundary_51_vs_13_verbs", b51_13?.their_verb_pt_br === "diagnostica" && b51_13?.our_verb_pt_br === "monta", b51_13);
assert("boundary_51_vs_13_says_final_version", /versão final/i.test(b51_13?.statement_pt_br ?? ""), b51_13?.statement_pt_br);
// 16 coordena a oportunidade inteira; 49, 50 e 53 são artefatos ou sessão únicos
for (const n of [49, 50, 53]) {
  const b = boundary(n, 16);
  assert(`boundary_${n}_vs_16_exists`, Boolean(b), b);
  assert(`boundary_${n}_vs_16_their_verb_coordena`, b?.their_verb_pt_br === "coordena", b?.their_verb_pt_br);
  assert(`boundary_${n}_vs_16_says_whole_opportunity`, /oportunidade inteira/i.test(b?.statement_pt_br ?? ""), b?.statement_pt_br);
  assert(
    `boundary_${n}_vs_16_says_single_unit`,
    /(artefato único|evento único|apenas o pacote)/i.test(b?.statement_pt_br ?? ""),
    b?.statement_pt_br,
  );
}
// 51 é habilitação de edital de licitação; 54 é credenciamento ou pré-qualificação
const b51_54 = boundary(51, 54);
const b54_51 = boundary(54, 51);
assert("boundary_51_vs_54_exists", Boolean(b51_54), b51_54);
assert("boundary_54_vs_51_exists", Boolean(b54_51), b54_51);
for (const [label, b] of [["51_vs_54", b51_54], ["54_vs_51", b54_51]]) {
  assert(`boundary_${label}_says_distinct_procedures`, /procedimentos distintos/i.test(b?.statement_pt_br ?? ""), b?.statement_pt_br);
  assert(`boundary_${label}_says_not_interchangeable`, /não se substituem/i.test(b?.statement_pt_br ?? ""), b?.statement_pt_br);
  assert(`boundary_${label}_names_credenciamento_or_prequalificacao`, /credenciamento/i.test(b?.statement_pt_br ?? "") && /pré-qualificação/i.test(b?.statement_pt_br ?? ""), b?.statement_pt_br);
}
assert("boundary_51_vs_54_says_edital_de_licitacao", /edital de licitação/i.test(b51_54?.statement_pt_br ?? ""), b51_54?.statement_pt_br);
// nenhum item declara fronteira contra si mesmo
assert(
  "no_self_boundary",
  items.every((it) => it.boundary_vs_existing_offers.every((b) => b.against_item !== it.number)),
  items.map((it) => it.number),
);
// nomes proibidos pela #343
const NAME_EXEMPT = new Set(OWNED_ROUTES.map(([r]) => r));
const forbiddenName = allStrings.filter(
  (s) => !NAME_EXEMPT.has(s.value) && (/bid\s*room/i.test(s.value) || /go\s*\/?\s*-?\s*no[\s\-\/]*go/i.test(s.value)),
);
assert("no_forbidden_legacy_names", forbiddenName.length === 0, forbiddenName.map((s) => s.at));

/* ------------------------------------------------------------------ */
/* B. conduta do item 53 na sessão de disputa                           */
/* ------------------------------------------------------------------ */

const it53 = byNumber.get(53);
const neg = it53.session_conduct_negatives_pt_br ?? {};
const REQUIRED_NEGATIVES = {
  nao_da_lance: /não dá lance/i,
  nao_opera_portal: /não opera o portal ou a plataforma pelo cliente/i,
  nao_opera_credencial: /não opera credencial, login ou certificado/i,
  nao_assina: /não assina/i,
  nao_representa: /não representa a empresa perante o órgão ou o pregoeiro/i,
  nao_presta_advocacia: /não presta advocacia/i,
  nao_protocola: /não protocola/i,
  nao_promete_resultado: /não promete resultado, classificação nem lance vencedor/i,
};
assert(
  "item_53_negatives_exactly_eight",
  Object.keys(neg).length === Object.keys(REQUIRED_NEGATIVES).length,
  Object.keys(neg),
);
const exclusions53 = it53.exclusions_pt_br ?? [];
for (const [key, re] of Object.entries(REQUIRED_NEGATIVES)) {
  assert(`item_53_negative_${key}_present`, filled(neg[key]), neg[key]);
  assert(`item_53_negative_${key}_wording`, re.test(neg[key] ?? ""), neg[key]);
  assert(`item_53_negative_${key}_starts_with_confenge`, /^A CONFENGE /.test(neg[key] ?? ""), neg[key]);
  assert(`item_53_negative_${key}_in_exclusions`, exclusions53.includes(neg[key]), key);
}
assert(
  "item_53_operator_of_record_is_the_bidder",
  /representante do licitante é o único operador da plataforma/i.test(it53.operator_of_record_pt_br ?? ""),
  it53.operator_of_record_pt_br,
);
assert(
  "item_53_operator_of_record_is_the_only_bid_decider",
  /único decisor de lance/i.test(it53.operator_of_record_pt_br ?? ""),
  it53.operator_of_record_pt_br,
);
for (const [key, re] of [
  ["no_automation", /automatizar a disputa/i],
  ["no_collusion", /combinar conduta/i],
  ["only_public_data", /não seja público/i],
  ["respects_approved_limit", /ultrapassar o preço-limite aprovado/i],
]) {
  assert(`item_53_exclusion_${key}`, re.test(exclusions53.join(" ")), key);
}
for (const key of ["places_bids", "operates_platform_for_client", "represents_client_before_agency", "promises_ranking_or_winning_bid"]) {
  assert(`item_53_prohibition_${key}_false`, it53.prohibitions?.[key] === false, it53.prohibitions?.[key]);
}
assert(
  "item_53_price_limit_is_approved_by_client",
  it53.inputs_pt_br.some((s) => /preço-limite aprovado por escrito pelo cliente/i.test(s)),
  it53.inputs_pt_br,
);
assert(
  "item_53_legal_boundary_says_session_belongs_to_bidder",
  /sessão de disputa é do licitante/i.test(it53.legal_boundary_pt_br.join(" ")),
  it53.legal_boundary_pt_br,
);

/* ------------------------------------------------------------------ */
/* 8. sem travessão em nenhum lugar do contrato                         */
/* ------------------------------------------------------------------ */

const EM_DASH = "\u2014";
const EN_DASH = "\u2013";
assert("no_em_dash_in_data_file", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_in_data_file", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
const selfRaw = fs.readFileSync(path.join(__dirname, "test_page_contract_execucao.mjs"), "utf8");
assert("no_em_dash_in_test_file", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_in_test_file", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));

/* ------------------------------------------------------------------ */
/* cruzamento com main: identidade canônica não colide com offer_id      */
/* ------------------------------------------------------------------ */

const catalogPath = path.join(root, "data/offers/catalog.snapshot.json");
assert("catalog_snapshot_exists", fs.existsSync(catalogPath), catalogPath);
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const catalogIds = new Set((catalog.offers ?? []).map((o) => o.offer_id));
assert(
  "canonical_deliverable_id_does_not_collide_with_offer_id",
  items.every((it) => !catalogIds.has(it.deliverable_id)),
  items.map((it) => it.deliverable_id).filter((id) => catalogIds.has(id)),
);
const FROZEN_CATALOG = { "CFG-DIAG-EXP-v1": 800000, "CFG-DIRB2G-FLEX-v1": 2000000, "CFG-DIRB2G-180-v1": 1500000, "CFG-DIRB2G-365-v1": 1250000 };
assert(
  "frozen_catalog_amounts_unchanged_by_this_pr",
  (catalog.offers ?? []).length === Object.keys(FROZEN_CATALOG).length &&
    (catalog.offers ?? []).every((o) => FROZEN_CATALOG[o.offer_id] === o.amount_cents),
  (catalog.offers ?? []).map((o) => [o.offer_id, o.amount_cents]),
);
assert("frozen_catalog_still_frozen", catalog.frozen_at === "2026-08-17", catalog.frozen_at);
assert("deliverables_hub_exists_in_main", fs.existsSync(path.join(root, "entregas/index.html")), "entregas/index.html");
const hub = fs.readFileSync(path.join(root, "entregas/index.html"), "utf8");
assert(
  "hub_does_not_link_pages_this_pr_does_not_create",
  items.every((it) => !hub.includes(`/${it.deliverable_id.toLowerCase()}/`)),
  items.map((it) => it.deliverable_id),
);

/* ------------------------------------------------------------------ */
/* contrato de página não pode divergir do registro canônico          */
/* ------------------------------------------------------------------ */

assert("deliverables_registry_exists", fs.existsSync(REGISTRY_PATH), REGISTRY_PATH);
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const canonicalById = new Map((registry.deliverables ?? []).map((entry) => [entry.deliverable_id, entry]));
assert("offer_naming_contract_exists", fs.existsSync(NAMING_PATH), NAMING_PATH);
const naming = JSON.parse(fs.readFileSync(NAMING_PATH, "utf8"));
const namingById = new Map((naming.names ?? []).map((entry) => [entry.deliverable_id, entry]));
for (const item of items) {
  const canonical = canonicalById.get(item.deliverable_id);
  const canonicalName = namingById.get(item.deliverable_id);
  const n = item.number;
  assert(`item_${n}_exists_in_canonical_registry`, Boolean(canonical), item.deliverable_id);
  assert(`item_${n}_catalog_number_matches_registry`, canonical?.catalog_number === String(n), canonical?.catalog_number);
  assert(`item_${n}_name_matches_registry`, item.public_name_pt_br === canonical?.public_name_pt_br, canonical?.public_name_pt_br);
  assert(`item_${n}_value_line_matches_naming_authority`, item.value_line_pt_br === canonicalName?.value_line_pt_br, canonicalName?.value_line_pt_br);
  assert(`item_${n}_source_issue_matches_registry`, canonical?.source_issue === "#344", canonical?.source_issue);
  assert(`item_${n}_state_matches_registry`, canonical?.public_state === data.decision_state, canonical?.public_state);
  assert(`item_${n}_route_matches_registry`, item.route === canonical?.route, [item.route, canonical?.route]);
  assert(`item_${n}_checkout_matches_registry`, item.checkout_enabled === canonical?.checkout_enabled, canonical?.checkout_enabled);
  assert(`item_${n}_data_owner_is_extra_cli`, canonical?.data_contract?.owner === "extra-cli", canonical?.data_contract);
  assert(`item_${n}_lead_destination_is_warmbly_confenge_web`, canonical?.lead_destination === "warmbly:CONFENGE_WEB", canonical?.lead_destination);

  const contractBasePrices = item.pricing.tiers.map((tier) => tier.price_cents);
  const registryBasePrices = canonical?.price?.tiers
    ? canonical.price.tiers.map((tier) => tier.amount_cents)
    : [canonical?.price?.amount_cents];
  assert(`item_${n}_base_prices_match_registry`,
    JSON.stringify(contractBasePrices) === JSON.stringify(registryBasePrices),
    { contractBasePrices, registryBasePrices });
  const contractAdditionPrices = (item.pricing.additional_charges ?? []).map((charge) => charge.price_cents);
  const registryAdditionPrices = (canonical?.price?.additional_units ?? []).map((charge) => charge.amount_cents);
  assert(`item_${n}_additional_prices_match_registry`,
    JSON.stringify(contractAdditionPrices) === JSON.stringify(registryAdditionPrices),
    { contractAdditionPrices, registryAdditionPrices });
  assert(`item_${n}_currency_matches_registry`, canonical?.price?.currency === data.currency, canonical?.price?.currency);
  assert(`item_${n}_billing_is_one_time`, canonical?.price?.billing === "one_time", canonical?.price?.billing);

  const tierSlas = item.pricing.tiers.map((tier) => tier.sla_business_days).filter(Number.isInteger);
  const expectedMin = tierSlas.length ? Math.min(...tierSlas) : null;
  const expectedMax = tierSlas.length ? Math.max(...tierSlas) : null;
  assert(`item_${n}_sla_min_matches_registry`, canonical?.sla?.business_days_min === expectedMin,
    [canonical?.sla?.business_days_min, expectedMin]);
  assert(`item_${n}_sla_max_matches_registry`, canonical?.sla?.business_days_max === expectedMax,
    [canonical?.sla?.business_days_max, expectedMax]);
  const contractSafeDays = item.safe_deadline_gate?.min_business_days_remaining
    ?? item.safe_deadline_gate?.min_business_days_before_session
    ?? null;
  assert(`item_${n}_safe_deadline_matches_registry`, canonical?.sla?.safe_deadline_business_days === contractSafeDays,
    [canonical?.sla?.safe_deadline_business_days, contractSafeDays]);
}
const canonicalCreditSource = canonicalById.get("CFG-D13");
assert("credit_source_13_exists_in_registry", Boolean(canonicalCreditSource), canonicalCreditSource);
assert("credit_source_13_name_matches_contract",
  canonicalCreditSource?.public_name_pt_br === credit.source_public_name_pt_br, canonicalCreditSource?.public_name_pt_br);
assert("credit_targets_match_registry",
  JSON.stringify([...(canonicalCreditSource?.credit_rule?.credits_into ?? [])].sort()) ===
    JSON.stringify(credit.applies_to_items.map((n) => `CFG-D${n}`).sort()),
  canonicalCreditSource?.credit_rule?.credits_into);
assert("credit_window_matches_registry", canonicalCreditSource?.credit_rule?.window_days === credit.window_days,
  canonicalCreditSource?.credit_rule?.window_days);
assert("credit_stackability_matches_registry", canonicalCreditSource?.credit_rule?.stackable === credit.accumulates,
  canonicalCreditSource?.credit_rule?.stackable);
assert("credit_basis_matches_registry", canonicalCreditSource?.credit_rule?.basis === "highest_single_paid", canonicalCreditSource?.credit_rule?.basis);
assert("credit_dynamic_cap_cannot_exceed_registry_max",
  credit.cap_cents === null && canonicalCreditSource?.credit_rule?.max_cents === canonicalCreditSource?.price?.amount_cents,
  canonicalCreditSource?.credit_rule);

/* ------------------------------------------------------------------ */
/* publicação progressiva da família no catálogo                       */
/* ------------------------------------------------------------------ */

const catalogDataScript = fs.readFileSync(path.join(root, "entregas/catalog-data.js"), "utf8");
const catalogDataMatch = /^window\.CONFENGE_CATALOG_DATA=(\{.*\});\s*$/.exec(catalogDataScript);
const catalogData = catalogDataMatch ? JSON.parse(catalogDataMatch[1]) : null;
const catalogIdIndex = catalogData?.fields?.indexOf("id") ?? -1;
const catalogContractIndex = catalogData?.fields?.indexOf("contractHtml") ?? -1;
const contractById = new Map((catalogData?.items || []).map((row) => [row[catalogIdIndex], row[catalogContractIndex]]));
assert("catalog_copy_contract_asset_is_versioned", catalogData?.schema === "confenge.public-deliverable-catalog/1.1", catalogData?.schema);
assert("catalog_copy_contract_fields_exist", catalogIdIndex >= 0 && catalogContractIndex >= 0, catalogData?.fields);

function articleFor(number) {
  const idAt = hub.indexOf(`id="entrega-${number}"`);
  const start = hub.lastIndexOf("<article", idAt);
  const end = hub.indexOf("</article>", idAt);
  return idAt >= 0 && start >= 0 && end > idAt ? hub.slice(start, end) : "";
}

function sectionFor(article, clause) {
  const marker = `data-copy-clause="${clause}"`;
  const markerAt = article.indexOf(marker);
  const start = article.lastIndexOf("<section", markerAt);
  const end = article.indexOf("</section>", markerAt);
  return markerAt >= 0 && start >= 0 && end > markerAt ? article.slice(start, end) : "";
}

function publicHtml(value) {
  return String(value ?? "")
    .replace(/\bUNKNOWN\b/g, "DESCONHECIDO")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

for (const item of items) {
  const article = articleFor(item.number);
  const canonical = canonicalById.get(item.deliverable_id);
  const copyContract = contractById.get(item.deliverable_id) || "";
  const inputSection = sectionFor(copyContract, "client_inputs_and_sla_start");
  const outputSection = sectionFor(copyContract, "concrete_result_and_artifact_example");
  assert(`item_${item.number}_is_not_sold_on_vitrine`, article.length === 0 && !hub.includes(`id="entrega-${item.number}"`), item.deliverable_id);
  assert(`item_${item.number}_kept_in_internal_copy_contract`, copyContract.includes(item.public_name_pt_br), item.public_name_pt_br);
  assert(`item_${item.number}_value_line_kept_internally`, namingById.get(item.deliverable_id)?.value_line_pt_br === item.value_line_pt_br, item.value_line_pt_br);
  assert(
    `item_${item.number}_inputs_are_progressively_visible`,
    canonical?.required_inputs?.length >= 4 &&
      canonical.required_inputs.every((value) => inputSection.includes(`<li>${publicHtml(value)}</li>`)),
    canonical?.required_inputs,
  );
  assert(
    `item_${item.number}_outputs_are_progressively_visible`,
    canonical?.included_outputs?.length >= 4 &&
      canonical.included_outputs.every((value) => outputSection.includes(`<li>${publicHtml(value)}</li>`)),
    canonical?.included_outputs,
  );
}

const item16 = contractById.get("CFG-D16") || "";
assert("item_16_shows_execution_composition", item16.includes('data-execution-composition="CFG-D16"'), item16.length);
assert(
  "item_16_links_all_six_separate_executions",
  items.every((item) => item16.includes(`href="#entrega-${item.number}"`) && item16.includes(item.public_name_pt_br)),
  items.map((item) => item.number),
);
assert(
  "item_16_forbids_silent_double_charging",
  item16.includes("não soma preços silenciosamente") && item16.includes("proposta discrimina cada item incluído"),
  "composition disclosure",
);
assert(
  "item_16_shows_item_13_credit_once",
  item16.includes("maior valor efetivamente pago no item 13") && item16.includes("um único crédito") && item16.includes("em até 30 dias") && item16.includes("sem acúmulo") && item16.includes("limitado ao valor pago"),
  "credit disclosure",
);

const item49 = contractById.get("CFG-D49") || "";
assert(
  "item_49_visibly_differs_from_item_14",
  item49.includes('data-execution-boundary="14-49"') && item49.includes("item 14 audita") && item49.includes("item 49 produz"),
  "audit versus production",
);
const item51 = contractById.get("CFG-D51") || "";
assert(
  "item_51_visibly_differs_from_item_13",
  item51.includes('data-execution-boundary="13-51"') && item51.includes("item 13 diagnostica") && item51.includes("item 51 monta"),
  "diagnosis versus assembly",
);
assert(
  "item_51_visibly_discloses_item_13_credit",
  item51.includes('data-execution-credit="13-51"') &&
    item51.includes("maior valor efetivamente pago no item 13") &&
    item51.includes("um único crédito") &&
    item51.includes("em até 30 dias") &&
    item51.includes("sem acúmulo") &&
    item51.includes("limitado ao valor pago"),
  "credit visible at the offer where it applies",
);
const item53 = contractById.get("CFG-D53") || "";
assert(
  "item_53_visibly_keeps_client_as_operator",
  item53.includes('data-execution-operator="client-only"') &&
    item53.includes("único operador da plataforma") &&
    item53.includes("A CONFENGE não dá lance") &&
    item53.includes("não opera credencial, login, certificado ou plataforma"),
  "client only operator",
);

assert("execution_items_are_not_public_vitrine", items.every((item) => !hub.includes(`id="entrega-${item.number}"`)), items.map((item) => item.number));
assert("terminal_capture_still_present", hub.includes('id="captura-entregas"'), "capture");

/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
