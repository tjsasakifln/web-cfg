/**
 * Gate do contrato de página dos itens 12 a 16 da issue 330.
 *
 * Prova, sem depender de nenhum módulo fora de main:
 *  - cinco itens numerados 12 a 16, sem lacuna, com preço, SLA, insumos,
 *    saída, não inclusões e fronteira jurídica preenchidos;
 *  - preços exatamente como a issue publica, em centavos;
 *  - nenhum prazo-gate inventado: só o item 12 tem prazo seguro próprio,
 *    e o prazo seguro de 10 dias úteis pertence à faixa essencial do item 16;
 *  - nenhuma promessa de vitória, adjudicação, habilitação da empresa ou
 *    preço vencedor fora das listas de não inclusão e de fronteira;
 *  - regra de crédito com teto, janela e não acumulação;
 *  - adicional de urgência de 50 por cento informado antes da cobrança;
 *  - fail closed da issue 155: nenhum parecer automático;
 *  - toda rota declarada tem index.html no repositório;
 *  - nenhum travessão em texto novo.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const dataPath = path.join(root, "data/commercial/page-contract-licitacao.v1.json");
const testPath = path.join(__dirname, "test_page_contract_licitacao.mjs");

const results = [];
function assert(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) console.error("FAIL", name, detail);
}

assert("data_file_exists", fs.existsSync(dataPath), dataPath);
const raw = fs.readFileSync(dataPath, "utf8");
const doc = JSON.parse(raw);

// ---------------------------------------------------------------- estrutura
assert("schema_id", doc.schema === "page-contract-licitacao.v1", doc.schema);
assert("source_issue", doc.source_issue === 330, doc.source_issue);
assert("name_authority_issue", doc.name_authority_issue === 343, doc.name_authority_issue);
assert("research_not_started", doc.research_state === "NOT_STARTED", doc.research_state);
assert(
  "human_evidence_empty",
  Array.isArray(doc.human_evidence) && doc.human_evidence.length === 0,
  doc.human_evidence,
);

const items = Array.isArray(doc.items) ? doc.items : [];
assert("five_items", items.length === 5, items.length);

const numbers = items.map((i) => i.item);
assert("items_12_to_16_no_gap", JSON.stringify(numbers) === JSON.stringify([12, 13, 14, 15, 16]), numbers);

const ids = new Set(items.map((i) => i.deliverable_id));
const scopes = new Set(items.map((i) => i.scope_version));
assert(
  "five_canonical_deliverable_ids",
  JSON.stringify(items.map((i) => i.deliverable_id)) ===
    JSON.stringify(["CFG-D12", "CFG-D13", "CFG-D14", "CFG-D15", "CFG-D16"]),
  [...ids],
);
assert("five_distinct_scope_versions", scopes.size === 5, [...scopes]);

// ------------------------------------------------- nomes canônicos da #343
const CANONICAL = {
  12: "Decisão de Disputar o Edital",
  13: "Mapa de Habilitação e Lacunas de Acervo",
  14: "Auditoria de Orçamento, BDI e Exequibilidade",
  15: "Referência de Concorrência e Faixa de Deságio",
  16: "Operação de Proposta para Licitação Crítica",
};
for (const item of items) {
  assert(
    `canonical_name_${item.item}`,
    item.public_name_pt_br === CANONICAL[item.item],
    item.public_name_pt_br,
  );
  assert(
    `value_line_${item.item}`,
    typeof item.value_line_pt_br === "string" && item.value_line_pt_br.length > 20,
    item.value_line_pt_br,
  );
  assert(
    `decision_question_${item.item}`,
    typeof item.decision_question_pt_br === "string" && item.decision_question_pt_br.trim().endsWith("?"),
    item.decision_question_pt_br,
  );
}
const valueLines = new Set(items.map((i) => i.value_line_pt_br));
assert("value_lines_distinct", valueLines.size === 5, valueLines.size);
const questions = new Set(items.map((i) => i.decision_question_pt_br));
assert("decision_questions_distinct", questions.size === 5, questions.size);

// ------------------------------------------------------- campos obrigatórios
for (const item of items) {
  const n = item.item;
  assert(
    `inputs_${n}`,
    Array.isArray(item.required_inputs_pt_br) && item.required_inputs_pt_br.length >= 3,
    item.required_inputs_pt_br,
  );
  assert(
    `output_${n}`,
    Array.isArray(item.output_pt_br) && item.output_pt_br.length >= 4,
    item.output_pt_br,
  );
  assert(
    `exclusions_${n}`,
    Array.isArray(item.exclusions_pt_br) &&
      item.exclusions_pt_br.length >= 1 &&
      item.exclusions_pt_br.every((e) => typeof e === "string" && e.trim().length > 5),
    item.exclusions_pt_br,
  );
  assert(
    `boundary_${n}`,
    Array.isArray(item.legal_boundary_pt_br) && item.legal_boundary_pt_br.length >= 4,
    item.legal_boundary_pt_br,
  );
  const sla = item.sla_business_days;
  assert(
    `sla_${n}`,
    sla && typeof sla.display_pt_br === "string" && sla.display_pt_br.length > 4,
    sla,
  );
  const price = item.price;
  assert(
    `price_present_${n}`,
    price && typeof price.display_pt_br === "string" && price.display_pt_br.includes("R$"),
    price && price.display_pt_br,
  );
  assert(`no_success_fee_${n}`, price && price.success_fee === false, price && price.success_fee);
}

// ------------------------------------------------------- preços exatos (#330)
const byItem = Object.fromEntries(items.map((i) => [i.item, i]));
assert("price_12_cents", byItem[12].price.amount_cents === 190000, byItem[12].price.amount_cents);
assert("price_13_cents", byItem[13].price.amount_cents === 290000, byItem[13].price.amount_cents);
assert("price_14_base_cents", byItem[14].price.amount_cents === 590000, byItem[14].price.amount_cents);
assert("price_15_cents", byItem[15].price.amount_cents === 375000, byItem[15].price.amount_cents);
assert("price_16_has_no_single_amount", byItem[16].price.amount_cents === null, byItem[16].price.amount_cents);

for (const n of [12, 13, 15]) {
  assert(`price_mode_fixed_${n}`, byItem[n].price.mode === "fixed", byItem[n].price.mode);
  assert(`no_quote_${n}`, byItem[n].price.quote_before_charge === false, byItem[n].price.quote_before_charge);
  assert(`no_tiers_${n}`, byItem[n].price.tiers === null, byItem[n].price.tiers);
}

// item 14: base para um lote e uma planilha principal, escopo maior fecha preço antes
const p14 = byItem[14].price;
assert("price_14_mode", p14.mode === "base_plus_quote", p14.mode);
assert("price_14_base_scope", /um lote/.test(p14.base_scope_pt_br) && /uma planilha principal/.test(p14.base_scope_pt_br), p14.base_scope_pt_br);
assert("price_14_quote_before_charge", p14.quote_before_charge === true, p14.quote_before_charge);
assert(
  "price_14_quote_rule_says_before_charge",
  typeof p14.quote_rule_pt_br === "string" && /antes da cobran/i.test(p14.quote_rule_pt_br),
  p14.quote_rule_pt_br,
);
const drivers14 = (p14.quote_drivers_pt_br || []).join(" | ").toLowerCase();
for (const driver of ["lotes", "itens", "composições próprias", "regime"]) {
  assert(`price_14_driver_${driver.split(" ")[0]}`, drivers14.includes(driver), drivers14);
}
assert(
  "price_14_pages_never_a_driver",
  !/p[áa]gina/i.test(drivers14) && (p14.forbidden_price_drivers_pt_br || []).some((d) => /p[áa]gina/i.test(d)),
  p14.forbidden_price_drivers_pt_br,
);

// item 16: três faixas com enquadramentos fechados
const p16 = byItem[16].price;
assert("price_16_mode", p16.mode === "tiered", p16.mode);
const tiers = p16.tiers || [];
assert("price_16_three_tiers", tiers.length === 3, tiers.length);
const EXPECTED_TIERS = [
  ["essencial", 980000],
  ["complexa", 1480000],
  ["especial", 1980000],
];
EXPECTED_TIERS.forEach(([name, cents], idx) => {
  const tier = tiers[idx];
  assert(`tier_${name}_name`, tier && tier.tier === name, tier && tier.tier);
  assert(`tier_${name}_cents`, tier && tier.amount_cents === cents, tier && tier.amount_cents);
  assert(
    `tier_${name}_framing`,
    tier && typeof tier.framing_pt_br === "string" && tier.framing_pt_br.length > 20,
    tier && tier.framing_pt_br,
  );
});
assert("price_16_selected_at_triagem", /triagem/i.test(p16.selected_at_pt_br || ""), p16.selected_at_pt_br);
assert(
  "price_16_display_lists_three_prices",
  ["9.800", "14.800", "19.800"].every((v) => p16.display_pt_br.includes(v)),
  p16.display_pt_br,
);

// --------------------------------------------- nenhum prazo-gate inventado
const ITEM_LEVEL_SAFE_DEADLINE = { 12: 5, 13: null, 14: null, 15: null, 16: null };
for (const item of items) {
  assert(
    `safe_deadline_${item.item}`,
    item.safe_deadline_business_days === ITEM_LEVEL_SAFE_DEADLINE[item.item],
    item.safe_deadline_business_days,
  );
}
assert(
  "safe_deadline_12_statement",
  /5 dias [úu]teis/.test(byItem[12].safe_deadline_statement_pt_br || ""),
  byItem[12].safe_deadline_statement_pt_br,
);
for (const n of [13, 14, 15]) {
  assert(
    `no_invented_deadline_statement_${n}`,
    byItem[n].safe_deadline_statement_pt_br === null,
    byItem[n].safe_deadline_statement_pt_br,
  );
}
// o prazo seguro de 10 dias úteis é da faixa essencial, não do item 16 inteiro
const tierDeadlines = tiers.map((t) => t.safe_deadline_business_days);
assert("tier_deadlines_only_essencial", JSON.stringify(tierDeadlines) === JSON.stringify([10, null, null]), tierDeadlines);
assert(
  "item_16_deadline_belongs_to_tier",
  /enquadramento essencial/i.test(byItem[16].safe_deadline_statement_pt_br || "") &&
    byItem[16].safe_deadline_business_days === null,
  byItem[16].safe_deadline_statement_pt_br,
);
// nenhum outro campo do documento carrega um número de dias úteis de gate
const declaredDeadlines = [];
(function walk(node, keyPath) {
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "safe_deadline_business_days" && v !== null) declaredDeadlines.push(`${keyPath}.${k}=${v}`);
      walk(v, `${keyPath}.${k}`);
    }
  }
})(doc, "$");
assert(
  "exactly_two_declared_deadlines",
  declaredDeadlines.length === 2 && declaredDeadlines.every((d) => /=5$|=10$/.test(d)),
  declaredDeadlines,
);

// ------------------------------------ nenhuma promessa de vitória/habilitação
const PROMISE_TERMS = [
  /vit[óo]ria/i,
  /vencedor|vencedora|vencer a licita|ganhar a licita/i,
  /adjudica/i,
  /habilita a empresa|habilitar a empresa|empresa habilitada|garante a habilita/i,
  /pre[çc]o vencedor|lance vencedor/i,
];
const ALLOWED_KEYS = new Set(["exclusions_pt_br", "legal_boundary_pt_br"]);
const promiseHits = [];
for (const item of items) {
  (function scan(node, keyPath, key) {
    if (typeof node === "string") {
      if (ALLOWED_KEYS.has(key)) return;
      for (const re of PROMISE_TERMS) {
        if (re.test(node)) promiseHits.push(`${keyPath}: ${node}`);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => scan(v, `${keyPath}[${i}]`, key));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        scan(v, `${keyPath}.${k}`, ALLOWED_KEYS.has(k) ? k : k);
      }
    }
  })(item, `item_${item.item}`, null);
}
assert("no_outcome_promise_outside_boundaries", promiseHits.length === 0, promiseHits);
// e os termos aparecem de fato onde a issue os nega
for (const item of items) {
  const negations = [...item.exclusions_pt_br, ...item.legal_boundary_pt_br].join(" ");
  assert(
    `explicit_no_outcome_${item.item}`,
    /não promete resultado/i.test(negations),
    negations,
  );
}
assert(
  "item_16_denies_victory",
  byItem[16].exclusions_pt_br.some((e) => /não promete vit[óo]ria/i.test(e)),
  byItem[16].exclusions_pt_br,
);
assert(
  "item_15_denies_winning_bid",
  byItem[15].exclusions_pt_br.some((e) => /lance vencedor/i.test(e)),
  byItem[15].exclusions_pt_br,
);
assert(
  "item_13_denies_qualifying_company",
  byItem[13].exclusions_pt_br.some((e) => /não habilita a empresa/i.test(e)),
  byItem[13].exclusions_pt_br,
);

// -------------------------------------------------- fronteira jurídica plena
const BOUNDARY_REQUIRED = [
  [/não presta advocacia/i, "advocacia"],
  [/não protocola/i, "protocolo"],
  [/não representa/i, "representacao"],
  [/não promete resultado/i, "resultado"],
];
for (const item of items) {
  const joined = item.legal_boundary_pt_br.join(" ");
  for (const [re, label] of BOUNDARY_REQUIRED) {
    assert(`boundary_${label}_${item.item}`, re.test(joined), joined);
  }
}
assert(
  "shared_boundary_matches_items",
  Array.isArray(doc.shared_legal_boundary_pt_br) && doc.shared_legal_boundary_pt_br.length === 4,
  doc.shared_legal_boundary_pt_br,
);

// ------------------------------------------------------------ crédito (#330)
const credit = doc.credit_rule || {};
assert(
  "credit_sources_12_to_15",
  JSON.stringify(credit.eligible_source_items) === JSON.stringify([12, 13, 14, 15]),
  credit.eligible_source_items,
);
assert("credit_target_16", credit.target_item === 16, credit.target_item);
assert("credit_window_30_days", credit.window_days === 30, credit.window_days);
assert("credit_cap_highest_paid", credit.credit_basis === "maior_valor_pago", credit.credit_basis);
assert("credit_once", credit.credit_applications_max === 1, credit.credit_applications_max);
assert("credit_not_cumulative", credit.cumulative === false, credit.cumulative);
assert(
  "credit_statement_complete",
  /maior valor pago/i.test(credit.statement_pt_br || "") &&
    /30 dias/.test(credit.statement_pt_br || "") &&
    /sem ac[úu]mulo/i.test(credit.statement_pt_br || "") &&
    /uma vez/i.test(credit.statement_pt_br || ""),
  credit.statement_pt_br,
);

// ------------------------------------------------------------ urgência (#330)
const urgency = doc.urgency_rule || {};
assert("urgency_50_percent", urgency.surcharge_percent === 50, urgency.surcharge_percent);
assert("urgency_disclosed_before_charge", urgency.disclosed_before_charge === true, urgency.disclosed_before_charge);
assert("urgency_requires_triage", urgency.requires_capacity_triage === true, urgency.requires_capacity_triage);
assert("urgency_capacity_may_refuse", urgency.capacity_may_refuse === true, urgency.capacity_may_refuse);
assert(
  "urgency_statement_complete",
  /50 por cento/i.test(urgency.statement_pt_br || "") &&
    /antes da cobran/i.test(urgency.statement_pt_br || "") &&
    /pode recusar/i.test(urgency.statement_pt_br || ""),
  urgency.statement_pt_br,
);
assert(
  "urgency_never_expressed_as_symbol",
  !/50\s*%/.test(raw),
  "usar por cento em texto público",
);

// --------------------------------------------------- fail closed (#155/#330)
const failClosed = doc.fail_closed || {};
assert("fail_closed_issue", doc.fail_closed_canary_issue === 155, doc.fail_closed_canary_issue);
assert("fail_closed_no_automated_opinion", failClosed.automated_opinion === false, failClosed.automated_opinion);
assert("fail_closed_human", failClosed.human_decision_and_publication === true, failClosed.human_decision_and_publication);
assert(
  "fail_closed_statement",
  /fail closed/i.test(failClosed.statement_pt_br || "") &&
    /parecer autom[áa]tico/i.test(failClosed.statement_pt_br || "") &&
    /humanas/i.test(failClosed.statement_pt_br || ""),
  failClosed.statement_pt_br,
);
// a issue declara o parecer automático como não inclusão apenas no item 12
assert(
  "item_12_excludes_automated_opinion",
  byItem[12].exclusions_pt_br.includes("parecer automático") &&
    byItem[12].disclaims_automated_opinion === true &&
    byItem[12].legal_boundary_pt_br.some((b) => /parecer autom[áa]tico/i.test(b)),
  byItem[12].exclusions_pt_br,
);
for (const n of [13, 14, 15, 16]) {
  assert(
    `no_invented_automated_opinion_clause_${n}`,
    byItem[n].disclaims_automated_opinion === false,
    byItem[n].disclaims_automated_opinion,
  );
}

// ------------------------------------------------------------------- rotas
const EXPECTED_ROUTES = {
  12: "/diagnostico-pre-licitacao/",
  13: null,
  14: "/auditoria-orcamento-licitacao/",
  15: null,
  16: "/bid-room-licitacoes-obras/",
};
for (const item of items) {
  assert(`route_${item.item}`, item.route === EXPECTED_ROUTES[item.item], item.route);
  if (item.route) {
    const rel = `${item.route.replace(/^\/|\/$/g, "")}/index.html`;
    assert(`route_page_exists_${item.item}`, fs.existsSync(path.join(root, rel)), rel);
  }
}
assert(
  "legacy_slug_flagged",
  byItem[16].route_slug_is_legacy === true && typeof byItem[16].route_slug_note_pt_br === "string",
  byItem[16].route_slug_is_legacy,
);
for (const n of [12, 14]) {
  assert(`slug_not_legacy_${n}`, byItem[n].route_slug_is_legacy === false, byItem[n].route_slug_is_legacy);
}

// ------------------------------------------------- anglicismos aposentados
const RETIRED = [/go\s*\/?\s*no[\s-]?go/i, /bid\s*room/i, /win\s*\/?\s*loss/i, /post-?mortem/i, /in\s+company/i];
const anglicismHits = [];
(function scanPublic(node, keyPath) {
  if (typeof node === "string") {
    if (/^\/[a-z0-9/-]*\/$/.test(node)) return; // rota anterior preservada
    for (const re of RETIRED) if (re.test(node)) anglicismHits.push(`${keyPath}: ${node}`);
    return;
  }
  if (Array.isArray(node)) return node.forEach((v, i) => scanPublic(v, `${keyPath}[${i}]`));
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) scanPublic(v, `${keyPath}.${k}`);
  }
})(doc, "$");
assert("no_retired_anglicisms_in_new_copy", anglicismHits.length === 0, anglicismHits);

// ------------------------------------------------------------- sem travessão
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
for (const [label, file] of [["data", dataPath], ["test", testPath]]) {
  const text = fs.readFileSync(file, "utf8");
  assert(`no_em_dash_${label}`, !text.includes(EM_DASH), label);
  assert(`no_en_dash_${label}`, !text.includes(EN_DASH), label);
}

// ------------------------------------------------ o que esta entrega não faz
const notDelivered = (doc.not_delivered_here_pt_br || []).join(" ").toLowerCase();
assert(
  "declares_no_new_page",
  /nenhuma p[áa]gina nova/.test(notDelivered),
  notDelivered,
);
assert("declares_no_checkout", /nenhum checkout/.test(notDelivered), notDelivered);
assert("declares_missing_synthetic_example", /exemplos sint[ée]ticos/.test(notDelivered), notDelivered);
assert("declares_missing_first_sale", /primeira venda/.test(notDelivered), notDelivered);

const failed = results.filter((r) => !r.ok);
console.log(`page-contract-licitacao: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2));
  process.exit(1);
}
