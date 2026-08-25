/**
 * Gate do contrato de pagina dos itens 17 a 23 da issue 333.
 * Autossuficiente: le o proprio JSON com fs e cruza apenas com paginas ja publicadas.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const DATA_REL = "data/commercial/page-contract-contratos.v1.json";
const dataPath = path.join(root, DATA_REL);
const raw = fs.readFileSync(dataPath, "utf8");
const doc = JSON.parse(raw);
const selfSource = fs.readFileSync(path.join(__dirname, "test_page_contract_contratos.mjs"), "utf8");

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, detail);
}
function assert(name, cond, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

const items = Array.isArray(doc.items) ? doc.items : [];
const byItem = new Map(items.map((it) => [it.item, it]));

/* ---------------------------------------------------------------------------
 * 1. Sete itens, numerados 17 a 23, sem lacuna, com os campos obrigatorios.
 * ------------------------------------------------------------------------- */
const EXPECTED_NUMBERS = [17, 18, 19, 20, 21, 22, 23];
assert("items_count_is_seven", items.length === 7, items.length);
assert(
  "items_numbered_17_to_23_without_gap",
  JSON.stringify(items.map((it) => it.item)) === JSON.stringify(EXPECTED_NUMBERS),
  items.map((it) => it.item),
);
assert(
  "items_unique",
  new Set(items.map((it) => it.item)).size === items.length,
  items.length,
);
assert(
  "canonical_deliverable_ids_17_to_23",
  JSON.stringify(items.map((it) => it.deliverable_id)) ===
    JSON.stringify(EXPECTED_NUMBERS.map((number) => `CFG-D${number}`)),
  items.map((it) => it.deliverable_id),
);

function filledString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

for (const number of EXPECTED_NUMBERS) {
  const it = byItem.get(number);
  if (!it) {
    fail(`item_${number}_present`, "ausente");
    continue;
  }
  assert(`item_${number}_price_cents`, Number.isInteger(it.pilot_price_cents) && it.pilot_price_cents > 0, it.pilot_price_cents);
  assert(`item_${number}_sla`, Number.isInteger(it.sla_business_days) && it.sla_business_days > 0, it.sla_business_days);
  assert(`item_${number}_minimum_document`, filledString(it.minimum_document_pt_br), it.minimum_document_pt_br);
  assert(`item_${number}_output`, filledString(it.output_pt_br), it.output_pt_br);
  assert(
    `item_${number}_not_included`,
    Array.isArray(it.not_included_pt_br) && it.not_included_pt_br.length > 0 && it.not_included_pt_br.every(filledString),
    it.not_included_pt_br,
  );
  assert(`item_${number}_legal_boundary_object`, it.legal_boundary && typeof it.legal_boundary === "object", it.legal_boundary);
  assert(`item_${number}_public_name`, filledString(it.public_name_pt_br), it.public_name_pt_br);
  assert(`item_${number}_decision_question`, filledString(it.decision_question_pt_br) && it.decision_question_pt_br.trim().endsWith("?"), it.decision_question_pt_br);
  assert(`item_${number}_scope_unit`, filledString(it.scope_unit_pt_br), it.scope_unit_pt_br);
}

/* ---------------------------------------------------------------------------
 * 2. Precos e SLA exatamente como a issue 333 publica, em centavos.
 * ------------------------------------------------------------------------- */
const ISSUE_333 = {
  17: { name: "Diagnóstico de Riscos à Margem", cents: 290000, sla: 5 },
  18: { name: "Dossiê de Medição, Glosa e Pagamento", cents: 490000, sla: 5 },
  19: { name: "Dossiê de Aditivo e Serviço Extra", cents: 590000, sla: 7 },
  20: { name: "Dossiê de Atraso e Prorrogação", cents: 590000, sla: 7 },
  21: { name: "Cálculo de Reajuste Contratual", cents: 290000, sla: 4 },
  22: { name: "Dossiê de Reequilíbrio Econômico-Financeiro", cents: 790000, sla: 10 },
  23: { name: "Subsídio Técnico para Notificação ou Sanção", cents: 690000, sla: 5 },
};
for (const [number, expected] of Object.entries(ISSUE_333)) {
  const it = byItem.get(Number(number));
  if (!it) continue;
  assert(`price_exact_${number}`, it.pilot_price_cents === expected.cents, `${it.pilot_price_cents} != ${expected.cents}`);
  assert(`sla_exact_${number}`, it.sla_business_days === expected.sla, `${it.sla_business_days} != ${expected.sla}`);
  // #343 e a autoridade de nome publico.
  assert(`canonical_name_${number}`, it.public_name_pt_br === expected.name, it.public_name_pt_br);
}
assert(
  "prices_are_integers_in_cents",
  items.every((it) => Number.isInteger(it.pilot_price_cents) && it.pilot_price_cents % 100 === 0),
  items.map((it) => it.pilot_price_cents),
);
assert(
  "no_price_field_in_reais_or_float",
  items.every((it) => !("pilot_price" in it) && !("price_brl" in it) && !("pilot_price_brl" in it)),
  "somente centavos",
);

/* ---------------------------------------------------------------------------
 * 3. Nenhum prazo-gate inventado: so o item 23 tem gate declarado pela issue.
 * ------------------------------------------------------------------------- */
const ITEMS_WITH_DECLARED_GATE = new Set([23]);
for (const number of EXPECTED_NUMBERS) {
  const it = byItem.get(number);
  if (!it) continue;
  const gate = it.safe_deadline_gate;
  if (ITEMS_WITH_DECLARED_GATE.has(number)) {
    assert(`gate_declared_${number}`, gate && typeof gate === "object", gate);
    assert(
      `gate_value_${number}`,
      gate && gate.min_business_days_remaining_to_respond === 5,
      gate && gate.min_business_days_remaining_to_respond,
    );
    assert(
      `gate_statement_${number}`,
      gate && filledString(gate.statement_pt_br) && /5 dias [úu]teis/i.test(gate.statement_pt_br),
      gate && gate.statement_pt_br,
    );
  } else {
    assert(`gate_null_${number}`, gate === null, gate);
  }
}
assert(
  "only_one_item_carries_a_gate",
  items.filter((it) => it.safe_deadline_gate !== null).length === 1,
  items.filter((it) => it.safe_deadline_gate !== null).map((it) => it.item),
);
assert(
  "no_gate_key_variants",
  items.every((it) => !("deadline_gate" in it) && !("prazo_seguro" in it) && !("min_days" in it)),
  "chave unica safe_deadline_gate",
);

/* ---------------------------------------------------------------------------
 * 4. Fronteira juridica obrigatoria nos sete: as cinco negativas.
 * ------------------------------------------------------------------------- */
const REQUIRED_NEGATIVES = [
  "no_legal_practice",
  "no_legal_document_drafting",
  "no_filing",
  "no_representation",
  "no_outcome_promise",
];
assert(
  "common_rules_list_the_five_negatives",
  JSON.stringify(doc.common_rules?.legal_boundary_required_negatives) === JSON.stringify(REQUIRED_NEGATIVES),
  doc.common_rules?.legal_boundary_required_negatives,
);
const BOUNDARY_PHRASES = [
  /n[ãa]o presta advocacia/i,
  /n[ãa]o elabora pe[çc]a/i,
  /n[ãa]o protocola/i,
  /n[ãa]o representa/i,
  /n[ãa]o promete resultado/i,
];
for (const number of EXPECTED_NUMBERS) {
  const it = byItem.get(number);
  if (!it) continue;
  const lb = it.legal_boundary || {};
  for (const key of REQUIRED_NEGATIVES) {
    assert(`legal_boundary_${key}_${number}`, lb[key] === true, lb[key]);
  }
  const statement = lb.statement_pt_br || "";
  assert(`legal_boundary_statement_${number}`, filledString(statement), statement);
  for (const [i, rx] of BOUNDARY_PHRASES.entries()) {
    assert(`legal_boundary_phrase_${i}_${number}`, rx.test(statement), statement);
  }
  assert(
    `legal_boundary_no_promise_of_receipt_${number}`,
    /recebimento/i.test(statement) && /afastamento de san[çc][ãa]o/i.test(statement),
    statement,
  );
  assert(
    `not_included_has_legal_representation_${number}`,
    (it.not_included_pt_br || []).some((line) => /representa[çc][ãa]o jur[íi]dica|advocacia/i.test(line)),
    it.not_included_pt_br,
  );
}
assert(
  "obligation_rule_is_meio_without_representation",
  doc.common_rules?.obligation_rule?.obligation_type === "meio" &&
    doc.common_rules?.obligation_rule?.includes_legal_representation === false,
  doc.common_rules?.obligation_rule,
);

/* ---------------------------------------------------------------------------
 * 5. Nenhum valor apresentado como recuperavel, devido ou recebimento certo.
 * ------------------------------------------------------------------------- */
const VALUE_PROMISE_PATTERNS = [
  /recuper[áa]ve/i,
  /a recuperar/i,
  /valor(?:es)? devid/i,
  /montante devid/i,
  /cr[ée]dito devid/i,
  /recebimento (?:certo|garantido|assegurado)/i,
  /garantia de (?:recebimento|pagamento|[êe]xito)/i,
  /pagamento garantido/i,
  /[êe]xito garantido/i,
  /ganho (?:certo|garantido)/i,
  /vit[óo]ria garantida/i,
  /reembolso garantido/i,
];
for (const rx of VALUE_PROMISE_PATTERNS) {
  assert(`no_value_promise_${rx.source.slice(0, 24)}`, !rx.test(raw), rx.source);
}
assert(
  "public_sources_do_not_replace_records",
  doc.common_rules?.public_sources_rule?.replaces_contemporaneous_records === false &&
    /n[ãa]o substituem/i.test(doc.common_rules?.public_sources_rule?.statement_pt_br || ""),
  doc.common_rules?.public_sources_rule,
);
assert(
  "urgency_rule_matches_issue",
  doc.common_rules?.urgency_rule?.surcharge_percent === 50 &&
    doc.common_rules?.urgency_rule?.requires_confirmed_capacity === true &&
    doc.common_rules?.urgency_rule?.surcharge_prepaid === true,
  doc.common_rules?.urgency_rule,
);

/* ---------------------------------------------------------------------------
 * 6. Quatro graus de evidencia por item, mais a regra do UNKNOWN.
 * ------------------------------------------------------------------------- */
const GRADES = ["FACT", "CALCULATION", "INFERENCE", "UNKNOWN"];
assert(
  "common_rules_declare_the_four_grades",
  JSON.stringify(doc.common_rules?.evidence_grades) === JSON.stringify(GRADES),
  doc.common_rules?.evidence_grades,
);
for (const number of EXPECTED_NUMBERS) {
  const it = byItem.get(number);
  if (!it) continue;
  const grades = it.evidence_grades || {};
  assert(
    `evidence_grades_exactly_four_${number}`,
    JSON.stringify(Object.keys(grades)) === JSON.stringify(GRADES),
    Object.keys(grades),
  );
  for (const grade of GRADES) {
    assert(`evidence_grade_${grade}_${number}`, filledString(grades[grade]), grades[grade]);
  }
  assert(
    `unknown_rule_${number}`,
    filledString(it.missing_data_rule_pt_br) &&
      /UNKNOWN/.test(it.missing_data_rule_pt_br) &&
      /aus[êe]ncia de dado/i.test(it.missing_data_rule_pt_br),
    it.missing_data_rule_pt_br,
  );
  assert(
    `calculation_is_reproducible_${number}`,
    /reproduz[íi]ve|reproduc|met[óo]dolo|metodologia|f[óo]rmula|insumos/i.test(grades.CALCULATION || ""),
    grades.CALCULATION,
  );
  assert(
    `inference_is_declared_${number}`,
    /interpreta[çc][ãa]o/i.test(grades.INFERENCE || ""),
    grades.INFERENCE,
  );
}

/* ---------------------------------------------------------------------------
 * 7. Regra de credito do item 17: teto, janela, alvo unico e nao acumulacao.
 * ------------------------------------------------------------------------- */
const credit = doc.common_rules?.credit_rule || {};
assert("credit_source_is_item_17", credit.source_item === 17, credit.source_item);
assert("credit_cap_is_290000_cents", credit.cap_cents === 290000, credit.cap_cents);
assert(
  "credit_cap_equals_item_17_price",
  credit.cap_cents === byItem.get(17)?.pilot_price_cents,
  `${credit.cap_cents} vs ${byItem.get(17)?.pilot_price_cents}`,
);
assert("credit_window_is_30_days", credit.window_days === 30, credit.window_days);
assert(
  "credit_targets_items_18_to_23",
  JSON.stringify(credit.eligible_items) === JSON.stringify([18, 19, 20, 21, 22, 23]),
  credit.eligible_items,
);
assert("credit_single_target", credit.max_credited_items === 1, credit.max_credited_items);
assert("credit_not_cumulative", credit.cumulative === false, credit.cumulative);
assert(
  "credit_statement_says_single_and_no_stacking",
  filledString(credit.statement_pt_br) &&
    /2\.900/.test(credit.statement_pt_br) &&
    /30 dias/.test(credit.statement_pt_br) &&
    /[úu]nico/i.test(credit.statement_pt_br) &&
    /sem ac[úu]mulo/i.test(credit.statement_pt_br),
  credit.statement_pt_br,
);
assert(
  "credit_does_not_reach_item_17_itself",
  !(credit.eligible_items || []).includes(17),
  credit.eligible_items,
);

/* ---------------------------------------------------------------------------
 * 8. Nenhum limite expresso em numero de paginas.
 * ------------------------------------------------------------------------- */
assert("no_page_count_limit_plural", !/\bp[áa]ginas\b/i.test(raw), "paginas");
assert("no_page_count_with_digits", !/\d+\s*p[áa]gina/i.test(raw), "n paginas");
assert(
  "no_page_count_keys",
  !/"(max_pages|page_count|pages|limite_paginas)"/i.test(raw),
  "chaves de contagem",
);

/* ---------------------------------------------------------------------------
 * 9. A issue 60 continua dona da prova publica vertical e nao e reaberta.
 * ------------------------------------------------------------------------- */
assert("public_proof_owner_is_60", doc.public_proof_ownership?.owner_issue === 60, doc.public_proof_ownership);
assert("public_proof_not_reopened", doc.public_proof_ownership?.reopened_here === false, doc.public_proof_ownership);
const PUBLIC_CASE_PATTERNS = [
  /caso[s]? p[úu]blico/i,
  /estudo de caso/i,
  /publica[çc][ãa]o/i,
  /publicar/i,
  /divulga/i,
  /vitrine/i,
  /portf[óo]lio/i,
  /case study/i,
];
for (const number of EXPECTED_NUMBERS) {
  const it = byItem.get(number);
  if (!it) continue;
  const blob = JSON.stringify(it);
  assert(`item_${number}_no_public_case_promise_flag`, it.promises_public_case_publication === false, it.promises_public_case_publication);
  for (const rx of PUBLIC_CASE_PATTERNS) {
    assert(`item_${number}_no_public_case_text_${rx.source.slice(0, 14)}`, !rx.test(blob), rx.source);
  }
}

/* ---------------------------------------------------------------------------
 * 10. Toda rota declarada tem index.html no repositorio.
 * ------------------------------------------------------------------------- */
let routed = 0;
for (const number of EXPECTED_NUMBERS) {
  const it = byItem.get(number);
  if (!it) continue;
  const route = it.route;
  assert(`route_shape_${number}`, route === null || /^\/[a-z0-9-]+\/$/.test(route), route);
  if (route === null) {
    assert(`page_file_null_when_no_route_${number}`, it.page_file === null, it.page_file);
    continue;
  }
  routed += 1;
  const expectedFile = `${route.slice(1, -1)}/index.html`;
  assert(`page_file_matches_route_${number}`, it.page_file === expectedFile, `${it.page_file} vs ${expectedFile}`);
  assert(`page_exists_${number}`, fs.existsSync(path.join(root, expectedFile)), expectedFile);
}
assert("routes_are_unique", new Set(items.map((it) => it.route).filter(Boolean)).size === routed, routed);
assert("at_least_one_route_declared", routed >= 1, routed);

/* ---------------------------------------------------------------------------
 * 11. Nenhum travessao no arquivo de dados nem neste gate.
 * ------------------------------------------------------------------------- */
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
assert("no_em_dash_in_data", !raw.includes(EM_DASH), "travessao");
assert("no_en_dash_in_data", !raw.includes(EN_DASH), "meia risca");
assert("no_em_dash_in_gate", !selfSource.includes(EM_DASH), "travessao");
assert("no_en_dash_in_gate", !selfSource.includes(EN_DASH), "meia risca");

/* ---------------------------------------------------------------------------
 * Procedencia: nada declarado validado antes da evidencia humana.
 * ------------------------------------------------------------------------- */
assert("source_issue_is_333", doc.source_issue === 333, doc.source_issue);
assert("name_authority_is_343", doc.name_authority_issue === 343, doc.name_authority_issue);
assert("validation_not_started", doc.validation?.state === "NOT_STARTED", doc.validation);
assert(
  "validation_evidence_empty",
  Array.isArray(doc.validation?.evidence) && doc.validation.evidence.length === 0,
  doc.validation,
);

const failed = results.filter((r) => !r.ok);
console.log(`page-contract-contratos: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(JSON.stringify({ ok: false, failed: failed.length, results: failed }, null, 2));
  process.exit(1);
}
