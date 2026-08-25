/**
 * Gate do contrato de página da família "ciclo completo" (issue #340, itens 26 a 39).
 *
 * O teste é autossuficiente: lê o próprio JSON com fs e cruza com artefatos que já
 * existem em main. Ele prova, item a item:
 *
 *   A. identidade, nome, rota, preço, SLA, prazo seguro e porta batem com o registro
 *      canônico de entregáveis e com a tabela de nomes da #343;
 *   B. o gate de prazo seguro existe exatamente nos itens 27, 28 e 39, com o número
 *      declarado pela #340, e não existe em nenhum outro;
 *   C. as seis regras comuns estão codificadas em campo e em texto;
 *   D. nenhum item vende advocacia, responsabilidade técnica regulada, garantia de
 *      resultado ou documento retroativo;
 *   E. as onze referências do TCU estão presentes, em https, amarradas ao evento do
 *      ciclo que justificam;
 *   F. o contrato não cria página, não liga checkout e mantém preço em VALIDATE.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const NAME = "page-contract-ciclo";
const DATA_PATH = path.join(root, "data/commercial/page-contract-ciclo.v1.json");
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
assert("registry_exists", fs.existsSync(REGISTRY_PATH), REGISTRY_PATH);
assert("naming_exists", fs.existsSync(NAMING_PATH), NAMING_PATH);
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
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const naming = JSON.parse(fs.readFileSync(NAMING_PATH, "utf8"));

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
const NUMBERS = Array.from({ length: 14 }, (_, i) => 26 + i);

const regByNumber = new Map(
  (registry.deliverables ?? []).map((d) => [Number(d.catalog_number), d]),
);
const namingByNumber = new Map((naming.names ?? []).map((d) => [Number(d.catalog_number), d]));
const doorByDeliverable = new Map();
for (const door of registry.task_doors ?? []) {
  for (const member of door.members ?? []) doorByDeliverable.set(member, door.door);
}

/* ------------------------------------------------------------------ */
/* 1. cabeçalho do contrato                                            */
/* ------------------------------------------------------------------ */

assert("contract_id", data.contract_id === "page-contract-ciclo.v1", data.contract_id);
assert("schema_matches_contract_id", data.schema === data.contract_id, [data.schema, data.contract_id]);
assert("family_name", data.family_pt_br === "Ciclo completo", data.family_pt_br);
assert("source_issue_340", data.source_issue === 340, data.source_issue);
assert("parent_issue_329", data.parent_issue === 329, data.parent_issue);
assert("related_issues", eq(data.related_issues, [330, 333, 334]), data.related_issues);
assert("naming_authority_343", data.naming_authority_issue === 343, data.naming_authority_issue);
assert("decision_state_validate", data.decision_state === "VALIDATE", data.decision_state);
assert("priority_p1", data.priority === "P1", data.priority);
assert(
  "executive_fronts",
  eq(data.executive_fronts, ["REVENUE NOW", "MARKET INTELLIGENCE MOAT"]),
  data.executive_fronts,
);
assert(
  "leverage_declared",
  eq([...(data.leverage ?? [])].sort(), ["customer", "data", "revenue", "trust"]),
  data.leverage,
);
assert("time_to_evidence_30_days", data.time_to_evidence_days === 30, data.time_to_evidence_days);
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
assert("currency_brl", data.currency === "BRL", data.currency);
assert("price_unit_cents", data.price_unit === "cents", data.price_unit);
assert("price_basis_piloto", data.price_basis === "piloto", data.price_basis);
assert("purpose_filled", filled(data.purpose_pt_br) && data.purpose_pt_br.length >= 120, data.purpose_pt_br?.length);
assert(
  "purpose_says_it_does_not_ship_page_copy",
  /não cria texto de página pública/i.test(data.purpose_pt_br ?? ""),
  data.purpose_pt_br,
);
assert("not_delivered_here_declared", filledList(data.not_delivered_here_pt_br, 4), data.not_delivered_here_pt_br);
assert(
  "not_delivered_here_says_no_public_page",
  /nenhuma página pública é criada/i.test((data.not_delivered_here_pt_br ?? []).join(" ")),
  data.not_delivered_here_pt_br,
);

/* preço permanece VALIDATE até oferta real, aceite/rejeição e custo observado */
assert("price_state_validate", data.price_state === "VALIDATE", data.price_state);
const promo = data.price_promotion_rule ?? {};
assert("price_promotion_requires_real_offer", promo.requires_real_offer === true, promo.requires_real_offer);
assert("price_promotion_requires_accept_or_reject", promo.requires_accept_or_reject === true, promo.requires_accept_or_reject);
assert("price_promotion_requires_observed_cost", promo.requires_observed_delivery_cost === true, promo.requires_observed_delivery_cost);
assert("price_not_promoted_yet", promo.promoted === false, promo.promoted);
assert(
  "price_promotion_statement",
  /VALIDATE/.test(promo.statement_pt_br ?? "") && /custo de entrega observado/i.test(promo.statement_pt_br ?? ""),
  promo.statement_pt_br,
);

/* ------------------------------------------------------------------ */
/* 2. catorze itens, 26 a 39, contíguos, sem lacuna                    */
/* ------------------------------------------------------------------ */

assert("fourteen_items", items.length === 14, items.length);
assert("numbers_26_to_39_contiguous", eq(items.map((it) => it.number), NUMBERS), items.map((it) => it.number));
assert(
  "numbers_have_no_gap",
  items.every((it, i) => i === 0 || it.number === items[i - 1].number + 1),
  items.map((it) => it.number),
);
assert(
  "deliverable_ids_unique",
  new Set(items.map((it) => it.deliverable_id)).size === 14,
  items.map((it) => it.deliverable_id),
);
assert(
  "deliverable_id_matches_number",
  items.every((it) => it.deliverable_id === `CFG-D${it.number}`),
  items.map((it) => [it.number, it.deliverable_id]),
);
assert(
  "public_names_unique",
  new Set(items.map((it) => it.public_name_pt_br)).size === 14,
  items.map((it) => it.public_name_pt_br),
);
assert(
  "decision_questions_unique",
  new Set(items.map((it) => it.decision_question_pt_br)).size === 14,
  items.length,
);
assert(
  "scope_versions_unique_and_named",
  new Set(items.map((it) => it.scope_version)).size === 14 &&
    items.every((it) => it.scope_version === `ciclo-${it.number}.v1`),
  items.map((it) => it.scope_version),
);

/* ------------------------------------------------------------------ */
/* 3. tabela canônica da #340, campo a campo                           */
/* ------------------------------------------------------------------ */

const CANON = {
  26: { name: "Auditoria do Projeto Básico e dos Riscos", cents: [490000], sla: [5, 5], safe: null, door: "QUALIFY" },
  27: { name: "Subsídio Técnico para Esclarecimento ou Impugnação", cents: [375000], sla: [3, 3], safe: 4, door: "PROPOSE" },
  28: { name: "Comprovação de Exequibilidade e Resposta à Diligência", cents: [490000], sla: [3, 3], safe: null, door: "PROPOSE" },
  29: { name: "Desenvolvimento da Proposta Técnica", cents: [790000, 1290000], sla: [10, 10], safe: null, door: "PROPOSE" },
  30: { name: "Plano de Garantias, Seguros e Capital de Giro", cents: [240000], sla: [5, 5], safe: null, door: "QUALIFY" },
  31: { name: "Análise do Resultado da Licitação", cents: [240000], sla: [5, 5], safe: null, door: "CLOSE" },
  32: { name: "Plano de Acervo para Licitações Futuras", cents: [375000], sla: [7, 7], safe: null, door: "CLOSE" },
  33: { name: "Revisão Técnica Antes de Assinar o Contrato", cents: [375000], sla: [5, 5], safe: null, door: "START" },
  34: { name: "Plano de Mobilização e Obrigações do Contrato", cents: [490000], sla: [7, 7], safe: null, door: "START" },
  35: { name: "Auditoria do Fluxo de Caixa do Contrato", cents: [490000], sla: [10, 10], safe: null, door: "START" },
  36: { name: "Dossiê de Recebimento e Encerramento do Contrato", cents: [490000], sla: [7, 7], safe: null, door: "CLOSE" },
  37: { name: "Dossiê de Atestação e Acervo da Obra", cents: [290000], sla: [5, 5], safe: null, door: "CLOSE" },
  38: { name: "Análise Pós-Contrato e Lições para Próximas Obras", cents: [375000], sla: [7, 7], safe: null, door: "CLOSE" },
  39: { name: "Subsídio Técnico para Recurso e Contrarrazão", cents: [490000], sla: [4, 4], safe: 5, door: "PROPOSE" },
};
assert("canon_table_covers_fourteen", Object.keys(CANON).length === 14, Object.keys(CANON).length);

for (const n of NUMBERS) {
  const it = byNumber.get(n);
  const c = CANON[n];
  assert(`item_${n}_present`, Boolean(it), n);
  if (!it) continue;
  assert(`item_${n}_name_matches_issue_340`, it.public_name_pt_br === c.name, it.public_name_pt_br);
  const cents = (it.pricing?.tiers ?? []).map((t) => t.price_cents);
  assert(`item_${n}_prices_match_issue_340`, eq(cents, c.cents), [cents, c.cents]);
  assert(
    `item_${n}_sla_matches_issue_340`,
    it.sla_business_days?.min === c.sla[0] && it.sla_business_days?.max === c.sla[1],
    it.sla_business_days,
  );
  assert(
    `item_${n}_safe_deadline_matches_issue_340`,
    (it.safe_deadline_business_days ?? null) === c.safe,
    it.safe_deadline_business_days,
  );
  assert(`item_${n}_door_matches_issue_340`, it.task_door === c.door, it.task_door);
  assert(`item_${n}_route_is_null`, it.route === null, it.route);
  assert(`item_${n}_public_state_validate`, it.public_state === "VALIDATE", it.public_state);
}

/* ------------------------------------------------------------------ */
/* 4. reconciliação campo a campo com o registro canônico              */
/* ------------------------------------------------------------------ */

for (const n of NUMBERS) {
  const it = byNumber.get(n);
  const reg = regByNumber.get(n);
  const nm = namingByNumber.get(n);
  assert(`registry_${n}_exists`, Boolean(reg), n);
  assert(`naming_${n}_exists`, Boolean(nm), n);
  if (!it || !reg || !nm) continue;

  assert(`reconcile_${n}_deliverable_id`, it.deliverable_id === reg.deliverable_id, [it.deliverable_id, reg.deliverable_id]);
  assert(`reconcile_${n}_name`, it.public_name_pt_br === reg.public_name_pt_br, [it.public_name_pt_br, reg.public_name_pt_br]);
  assert(`reconcile_${n}_name_vs_naming_343`, it.public_name_pt_br === nm.public_name_pt_br, [it.public_name_pt_br, nm.public_name_pt_br]);
  assert(`reconcile_${n}_value_line_vs_343`, it.value_line_pt_br === nm.value_line, [it.value_line_pt_br, nm.value_line]);
  assert(`reconcile_${n}_route`, (it.route ?? null) === (reg.route ?? null), [it.route, reg.route]);
  assert(`reconcile_${n}_public_state`, it.public_state === reg.public_state, [it.public_state, reg.public_state]);
  assert(`reconcile_${n}_price_state`, it.price_state === reg.price_state, [it.price_state, reg.price_state]);
  assert(`reconcile_${n}_checkout`, it.checkout_enabled === reg.checkout_enabled, [it.checkout_enabled, reg.checkout_enabled]);
  assert(`reconcile_${n}_decision_question`, it.decision_question_pt_br === reg.decision_question, [it.decision_question_pt_br, reg.decision_question]);
  assert(`reconcile_${n}_trigger`, it.trigger_pt_br === reg.trigger, [it.trigger_pt_br, reg.trigger]);
  assert(`reconcile_${n}_unit`, it.unit_pt_br === reg.scope.unit, [it.unit_pt_br, reg.scope.unit]);
  assert(`reconcile_${n}_scope_limits`, eq(it.scope_limits_pt_br, reg.scope.limits), [it.scope_limits_pt_br, reg.scope.limits]);
  assert(`reconcile_${n}_inputs`, eq(it.inputs_pt_br, reg.required_inputs), [it.inputs_pt_br, reg.required_inputs]);
  assert(`reconcile_${n}_outputs`, eq(it.outputs_pt_br, reg.included_outputs), [it.outputs_pt_br, reg.included_outputs]);
  assert(`reconcile_${n}_exclusions`, eq(it.exclusions_pt_br, reg.exclusions), [it.exclusions_pt_br, reg.exclusions]);
  assert(`reconcile_${n}_source_issue`, reg.source_issue === "#340", reg.source_issue);
  assert(`reconcile_${n}_offer_container`, it.offer_container === reg.offer_container, [it.offer_container, reg.offer_container]);
  assert(`reconcile_${n}_capacity_required`, it.capacity_required === reg.capacity_required, [it.capacity_required, reg.capacity_required]);
  assert(`reconcile_${n}_lead_destination`, it.lead_destination === reg.lead_destination, [it.lead_destination, reg.lead_destination]);
  assert(
    `reconcile_${n}_analytics`,
    it.analytics?.route_family === reg.analytics.route_family &&
      it.analytics?.deliverable_attr === reg.analytics.deliverable_attr &&
      it.analytics.deliverable_attr === it.deliverable_id,
    [it.analytics, reg.analytics],
  );
  assert(
    `reconcile_${n}_data_contract`,
    it.data_contract?.owner === reg.data_contract.owner &&
      it.data_contract?.provenance_required === reg.data_contract.provenance_required &&
      it.data_contract?.freshness_required === reg.data_contract.freshness_required &&
      eq(it.data_contract?.evidence_grades, reg.data_contract.evidence_grades),
    [it.data_contract, reg.data_contract],
  );
  assert(`reconcile_${n}_credit_rule_null`, it.credit_rule === null && reg.credit_rule === null, [it.credit_rule, reg.credit_rule]);

  // preço
  const localCents = (it.pricing?.tiers ?? []).map((t) => t.price_cents);
  const regCents = reg.price.tiers
    ? reg.price.tiers.map((t) => t.amount_cents)
    : [reg.price.amount_cents];
  assert(`reconcile_${n}_prices`, eq(localCents, regCents), [localCents, regCents]);
  assert(`reconcile_${n}_currency`, reg.price.currency === data.currency, reg.price.currency);
  assert(
    `reconcile_${n}_pricing_model`,
    it.pricing?.model === (reg.price.tiers ? "tiers" : "fixed"),
    it.pricing?.model,
  );
  assert(
    `reconcile_${n}_no_additional_charges`,
    Array.isArray(it.pricing?.additional_charges) && it.pricing.additional_charges.length === 0,
    it.pricing?.additional_charges,
  );

  // prazo
  assert(
    `reconcile_${n}_sla_min_max`,
    it.sla_business_days?.min === reg.sla.business_days_min && it.sla_business_days?.max === reg.sla.business_days_max,
    [it.sla_business_days, reg.sla],
  );
  assert(
    `reconcile_${n}_sla_starts_after`,
    it.sla_business_days?.starts_after_pt_br === reg.sla.starts_after,
    [it.sla_business_days?.starts_after_pt_br, reg.sla.starts_after],
  );
  assert(
    `reconcile_${n}_sla_display`,
    it.sla_business_days?.display_pt_br === `${reg.sla.business_days_max} dias úteis`,
    it.sla_business_days?.display_pt_br,
  );
  assert(
    `reconcile_${n}_safe_deadline`,
    (it.safe_deadline_business_days ?? null) === (reg.sla.safe_deadline_business_days ?? null),
    [it.safe_deadline_business_days, reg.sla.safe_deadline_business_days],
  );

  // porta
  assert(
    `reconcile_${n}_task_door`,
    it.task_door === doorByDeliverable.get(it.deliverable_id) && it.task_door === reg.task_door,
    [it.task_door, doorByDeliverable.get(it.deliverable_id), reg.task_door],
  );
}

/* nenhum item do contrato existe fora do registro, e nenhum item 26..39 do registro
   ficou de fora do contrato */
assert(
  "registry_covers_every_contract_item",
  items.every((it) => regByNumber.has(it.number)),
  items.map((it) => it.number).filter((n) => !regByNumber.has(n)),
);
const registryInRange = (registry.deliverables ?? [])
  .map((d) => Number(d.catalog_number))
  .filter((n) => n >= 26 && n <= 39)
  .sort((a, b) => a - b);
assert("contract_covers_every_registry_item_in_range", eq(registryInRange, NUMBERS), registryInRange);

/* ------------------------------------------------------------------ */
/* 5. campos obrigatórios preenchidos em todos os catorze              */
/* ------------------------------------------------------------------ */

for (const it of items) {
  const n = it.number;
  assert(`item_${n}_value_line_filled`, filled(it.value_line_pt_br), it.value_line_pt_br);
  assert(`item_${n}_decision_question_filled`, filled(it.decision_question_pt_br), it.decision_question_pt_br);
  assert(`item_${n}_decision_question_is_a_question`, /\?$/.test(it.decision_question_pt_br ?? ""), it.decision_question_pt_br);
  assert(`item_${n}_trigger_filled`, filled(it.trigger_pt_br), it.trigger_pt_br);
  assert(`item_${n}_verb_filled`, filled(it.verb_pt_br), it.verb_pt_br);
  assert(`item_${n}_unit_filled`, filled(it.unit_pt_br), it.unit_pt_br);
  assert(`item_${n}_inputs_filled`, filledList(it.inputs_pt_br, 4), it.inputs_pt_br?.length);
  assert(`item_${n}_outputs_filled`, filledList(it.outputs_pt_br, 3), it.outputs_pt_br?.length);
  assert(`item_${n}_exclusions_filled`, filledList(it.exclusions_pt_br, 4), it.exclusions_pt_br?.length);
  assert(`item_${n}_scope_limits_filled`, filledList(it.scope_limits_pt_br, 4), it.scope_limits_pt_br?.length);
  assert(`item_${n}_legal_boundary_filled`, filledList(it.legal_boundary_pt_br, 5), it.legal_boundary_pt_br?.length);
  assert(`item_${n}_derivation_filled`, filled(it.inputs_derivation_pt_br), it.inputs_derivation_pt_br);
  assert(
    `item_${n}_pricing_tiers_well_formed`,
    Array.isArray(it.pricing?.tiers) && it.pricing.tiers.length >= 1 &&
      it.pricing.tiers.every(
        (t) =>
          Number.isInteger(t.price_cents) &&
          t.price_cents > 0 &&
          t.price_cents % 1000 === 0 &&
          filled(t.name_pt_br) &&
          filled(t.tier_key) &&
          filled(t.unit_pt_br) &&
          filled(t.framing_pt_br) &&
          filled(t.display_pt_br),
      ),
    it.pricing,
  );
  assert(
    `item_${n}_price_display_matches_cents`,
    it.pricing.tiers.every((t) => {
      const reais = Math.floor(t.price_cents / 100);
      const expected = `R$ ${reais.toLocaleString("pt-BR")}`;
      return t.display_pt_br === expected;
    }),
    it.pricing.tiers.map((t) => [t.price_cents, t.display_pt_br]),
  );
  assert(
    `item_${n}_sla_is_positive_integer`,
    Number.isInteger(it.sla_business_days?.min) && it.sla_business_days.min > 0 &&
      Number.isInteger(it.sla_business_days?.max) && it.sla_business_days.max >= it.sla_business_days.min,
    it.sla_business_days,
  );
}

/* só o item 29 tem faixas, e elas crescem em preço */
for (const it of items) {
  const expectedTierCount = it.number === 29 ? 2 : 1;
  assert(`item_${it.number}_tier_count`, it.pricing.tiers.length === expectedTierCount, it.pricing.tiers.length);
}
const t29 = byNumber.get(29).pricing.tiers;
assert("item_29_tier_names", eq(t29.map((t) => t.name_pt_br), ["Essencial", "Complexa"]), t29.map((t) => t.name_pt_br));
assert("item_29_tier_keys", eq(t29.map((t) => t.tier_key), ["essencial", "complexa"]), t29.map((t) => t.tier_key));
assert("item_29_tiers_price_ascending", t29[1].price_cents > t29[0].price_cents, t29.map((t) => t.price_cents));
assert("item_29_essencial_three_criteria_one_revision", /até três critérios de julgamento e uma revisão/.test(t29[0].framing_pt_br), t29[0].framing_pt_br);
assert("item_29_complexa_eight_criteria_two_revisions", /até oito critérios de julgamento e duas revisões/.test(t29[1].framing_pt_br), t29[1].framing_pt_br);

/* nenhum preço fora do conjunto publicado pela #340 */
const PUBLISHED_CENTS = new Set([490000, 375000, 790000, 1290000, 240000, 290000]);
const seenCents = items.flatMap((it) => it.pricing.tiers.map((t) => t.price_cents));
assert("no_price_outside_issue_340", seenCents.every((c) => PUBLISHED_CENTS.has(c)), seenCents.filter((c) => !PUBLISHED_CENTS.has(c)));
assert("every_published_price_is_used", [...PUBLISHED_CENTS].every((c) => seenCents.includes(c)), [...PUBLISHED_CENTS]);
assert("fifteen_prices_total", seenCents.length === 15, seenCents.length);

/* ------------------------------------------------------------------ */
/* 6. gate de prazo seguro: apenas 27, 28 e 39                         */
/* ------------------------------------------------------------------ */

const GATE_ITEMS = [27, 28, 39];
for (const it of items) {
  const declared = it.safe_deadline_gate !== null && it.safe_deadline_gate !== undefined;
  assert(
    `item_${it.number}_gate_only_when_issue_declares`,
    declared === GATE_ITEMS.includes(it.number),
    { number: it.number, gate: it.safe_deadline_gate },
  );
  assert(
    `item_${it.number}_refuses_unsafe_deadline_flag`,
    it.refuses_unsafe_deadline === GATE_ITEMS.includes(it.number),
    { number: it.number, refuses: it.refuses_unsafe_deadline },
  );
  if (!GATE_ITEMS.includes(it.number)) {
    assert(`item_${it.number}_gate_is_null`, it.safe_deadline_gate === null, it.safe_deadline_gate);
    assert(`item_${it.number}_safe_deadline_is_null`, it.safe_deadline_business_days === null, it.safe_deadline_business_days);
    // o registro tampouco declara prazo seguro nem recusa por prazo neste item
    const limits = (regByNumber.get(it.number)?.scope.limits ?? []).join(" ");
    assert(
      `item_${it.number}_registry_declares_no_deadline_gate`,
      !/restarem ao menos/i.test(limits) && !/prazo inseguro/i.test(limits) && !/prazo remanescente/i.test(limits),
      limits,
    );
  }
}
assert(
  "exactly_three_gates",
  items.filter((it) => it.safe_deadline_gate).length === 3,
  items.filter((it) => it.safe_deadline_gate).map((it) => it.number),
);
assert(
  "exactly_three_items_refuse_unsafe_deadline",
  items.filter((it) => it.refuses_unsafe_deadline === true).map((it) => it.number).join(",") === "27,28,39",
  items.filter((it) => it.refuses_unsafe_deadline === true).map((it) => it.number),
);

for (const n of GATE_ITEMS) {
  const it = byNumber.get(n);
  const gate = it.safe_deadline_gate;
  assert(`gate_${n}_declared_by_issue`, gate.declared_by_issue === true, gate.declared_by_issue);
  assert(`gate_${n}_issue_is_340`, gate.issue === 340, gate.issue);
  assert(`gate_${n}_refuses_unsafe_deadline`, gate.refuses_unsafe_deadline === true, gate.refuses_unsafe_deadline);
  assert(`gate_${n}_conditioned_on_remaining_deadline`, gate.conditioned_on_remaining_deadline === true, gate.conditioned_on_remaining_deadline);
  assert(`gate_${n}_extra_conditions_filled`, filledList(gate.extra_conditions_pt_br, 2), gate.extra_conditions_pt_br);
  assert(`gate_${n}_statement_filled`, filled(gate.statement_pt_br) && gate.statement_pt_br.length >= 80, gate.statement_pt_br?.length);
  assert(
    `gate_${n}_unsafe_deadline_action`,
    /recusar o pedido ou converter o trabalho em diagnóstico de lacunas/i.test(gate.on_unsafe_deadline_pt_br ?? ""),
    gate.on_unsafe_deadline_pt_br,
  );
  assert(
    `gate_${n}_min_matches_registry`,
    (gate.min_business_days_remaining ?? null) === (regByNumber.get(n)?.sla.safe_deadline_business_days ?? null),
    [gate.min_business_days_remaining, regByNumber.get(n)?.sla.safe_deadline_business_days],
  );
  assert(
    `gate_${n}_min_matches_item_field`,
    (gate.min_business_days_remaining ?? null) === (it.safe_deadline_business_days ?? null),
    [gate.min_business_days_remaining, it.safe_deadline_business_days],
  );
  assert(`gate_${n}_statement_names_the_item`, new RegExp(`item ${n}\\b`).test(gate.statement_pt_br ?? ""), gate.statement_pt_br);
}

// 27: pelo menos 4 dias úteis restantes, sem condição de documentação mínima
const gate27 = byNumber.get(27).safe_deadline_gate;
assert("gate_27_min_is_4", gate27.min_business_days_remaining === 4, gate27.min_business_days_remaining);
assert("gate_27_no_minimum_documentation_condition", gate27.conditioned_on_minimum_documentation === false, gate27.conditioned_on_minimum_documentation);
assert("gate_27_statement_says_4_business_days", /ao menos 4 dias úteis/.test(gate27.statement_pt_br ?? ""), gate27.statement_pt_br);
assert(
  "gate_27_registry_limit_says_4_business_days",
  (regByNumber.get(27)?.scope.limits ?? []).some((l) => /restarem ao menos 4 dias úteis/.test(l)),
  regByNumber.get(27)?.scope.limits,
);

// 28: condicionado a prazo remanescente E documentação mínima, sem número inventado
const gate28 = byNumber.get(28).safe_deadline_gate;
assert("gate_28_has_no_invented_number", gate28.min_business_days_remaining === null, gate28.min_business_days_remaining);
assert("gate_28_requires_minimum_documentation", gate28.conditioned_on_minimum_documentation === true, gate28.conditioned_on_minimum_documentation);
assert("gate_28_statement_says_prazo_remanescente", /prazo remanescente/i.test(gate28.statement_pt_br ?? ""), gate28.statement_pt_br);
assert("gate_28_statement_says_documentacao_minima", /documentação mínima/i.test(gate28.statement_pt_br ?? ""), gate28.statement_pt_br);
assert(
  "gate_28_registry_limit_says_remaining_deadline_and_documentation",
  (regByNumber.get(28)?.scope.limits ?? []).some((l) => /prazo remanescente/i.test(l) && /documentação mínima/i.test(l)),
  regByNumber.get(28)?.scope.limits,
);

// 39: pelo menos 5 dias úteis restantes
const gate39 = byNumber.get(39).safe_deadline_gate;
assert("gate_39_min_is_5", gate39.min_business_days_remaining === 5, gate39.min_business_days_remaining);
assert("gate_39_no_minimum_documentation_condition", gate39.conditioned_on_minimum_documentation === false, gate39.conditioned_on_minimum_documentation);
assert("gate_39_statement_says_5_business_days", /ao menos 5 dias úteis/.test(gate39.statement_pt_br ?? ""), gate39.statement_pt_br);
assert(
  "gate_39_registry_limit_says_5_business_days",
  (regByNumber.get(39)?.scope.limits ?? []).some((l) => /restarem ao menos 5 dias úteis/.test(l)),
  regByNumber.get(39)?.scope.limits,
);
assert("gate_27_and_39_differ", gate27.min_business_days_remaining !== gate39.min_business_days_remaining, [gate27.min_business_days_remaining, gate39.min_business_days_remaining]);

/* ------------------------------------------------------------------ */
/* 7. as seis regras comuns, em campo e em texto                       */
/* ------------------------------------------------------------------ */

const cr = data.common_rules ?? {};

// 7.1 escopo delimitado por decisão, edital/lote, contrato, evento, cenário, critério, revisão
const EXPECTED_UNITS = ["decisão", "edital", "lote", "contrato", "evento", "cenário", "critério", "revisão"];
assert("rule_scope_units_exact", eq(cr.scope_units_allowed_pt_br, EXPECTED_UNITS), cr.scope_units_allowed_pt_br);
assert("rule_scope_never_by_pages", cr.scope_never_measured_by_pages === true, cr.scope_never_measured_by_pages);
assert(
  "rule_pages_are_forbidden_units",
  Array.isArray(cr.scope_units_forbidden_pt_br) &&
    cr.scope_units_forbidden_pt_br.includes("página") &&
    cr.scope_units_forbidden_pt_br.includes("número de páginas"),
  cr.scope_units_forbidden_pt_br,
);
assert(
  "no_tier_unit_measures_pages",
  items.every((it) => it.pricing.tiers.every((t) => !/páginas?/i.test(t.unit_pt_br))),
  items.flatMap((it) => it.pricing.tiers.filter((t) => /páginas?/i.test(t.unit_pt_br)).map((t) => t.unit_pt_br)),
);
assert(
  "no_item_unit_measures_pages",
  items.every((it) => !/páginas?/i.test(it.unit_pt_br)),
  items.filter((it) => /páginas?/i.test(it.unit_pt_br)).map((it) => it.number),
);
assert(
  "no_tier_framing_measures_pages",
  items.every((it) => it.pricing.tiers.every((t) => !/páginas?/i.test(t.framing_pt_br))),
  items.flatMap((it) => it.pricing.tiers.map((t) => t.framing_pt_br)).filter((f) => /páginas?/i.test(f)),
);

// 7.2 insumos mínimos ausentes: não iniciar ou diagnóstico de lacunas, nunca inferência
assert(
  "rule_missing_inputs_responses",
  eq(cr.missing_inputs_response_pt_br, ["não iniciar", "diagnóstico de lacunas"]),
  cr.missing_inputs_response_pt_br,
);
assert("rule_never_fill_silence_with_inference", cr.missing_inputs_never_filled_with_inference === true, cr.missing_inputs_never_filled_with_inference);
assert(
  "every_item_scope_limit_repeats_missing_inputs_rule",
  items.every((it) => it.scope_limits_pt_br.some((l) => /não iniciar/i.test(l) && /diagnóstico de lacunas/i.test(l))),
  items.filter((it) => !it.scope_limits_pt_br.some((l) => /não iniciar/i.test(l))).map((it) => it.number),
);

// 7.3 preços não incluem deslocamento, ART/RRT, parecer jurídico, projeto, terceiros, taxa pública
const EXPECTED_EXCLUDES = [
  "deslocamento",
  "ART ou RRT",
  "parecer jurídico",
  "projeto de engenharia",
  "emissão de documento por terceiros",
  "taxa pública",
];
assert("rule_price_excludes_exact", eq(cr.price_excludes_pt_br, EXPECTED_EXCLUDES), cr.price_excludes_pt_br);
assert("rule_price_excludes_has_six_entries", (cr.price_excludes_pt_br ?? []).length === 6, cr.price_excludes_pt_br?.length);
assert(
  "every_item_excludes_travel_art_and_public_fee",
  items.every((it) => it.exclusions_pt_br.some((e) => /deslocamento/i.test(e) && /ART ou RRT/i.test(e) && /taxa pública/i.test(e))),
  items.filter((it) => !it.exclusions_pt_br.some((e) => /deslocamento/i.test(e))).map((it) => it.number),
);
assert(
  "every_item_excludes_third_party_issuance",
  items.every((it) => it.exclusions_pt_br.some((e) => /documentos emitidos por terceiros/i.test(e))),
  items.filter((it) => !it.exclusions_pt_br.some((e) => /documentos emitidos por terceiros/i.test(e))).map((it) => it.number),
);
assert(
  "every_item_legal_boundary_denies_legal_opinion",
  items.every((it) => /não emite parecer jurídico/i.test(it.legal_boundary_pt_br.join(" "))),
  items.filter((it) => !/não emite parecer jurídico/i.test(it.legal_boundary_pt_br.join(" "))).map((it) => it.number),
);
assert(
  "every_item_legal_boundary_denies_art_rrt",
  items.every((it) => /não emite ART ou RRT/i.test(it.legal_boundary_pt_br.join(" "))),
  items.filter((it) => !/não emite ART ou RRT/i.test(it.legal_boundary_pt_br.join(" "))).map((it) => it.number),
);

// 7.4 o prazo começa após aceite de escopo e recebimento íntegro dos insumos
assert("rule_clock_starts_after_acceptance", cr.clock_starts_after_scope_acceptance_and_intact_inputs === true, cr.clock_starts_after_scope_acceptance_and_intact_inputs);
assert(
  "rule_clock_start_statement",
  /aceite de escopo/i.test(cr.clock_start_statement_pt_br ?? "") && /recebimento íntegro dos insumos/i.test(cr.clock_start_statement_pt_br ?? ""),
  cr.clock_start_statement_pt_br,
);
assert(
  "every_item_sla_starts_after_acceptance_and_intact_inputs",
  items.every((it) => /aceite de escopo/i.test(it.sla_business_days.starts_after_pt_br)),
  items.filter((it) => !/aceite de escopo/i.test(it.sla_business_days.starts_after_pt_br)).map((it) => it.number),
);
assert(
  "every_item_scope_limit_repeats_clock_rule",
  items.every((it) => it.scope_limits_pt_br.some((l) => /prazo começa após aceite de escopo/i.test(l))),
  items.filter((it) => !it.scope_limits_pt_br.some((l) => /prazo começa após aceite de escopo/i.test(l))).map((it) => it.number),
);

// 7.5 urgência abaixo do SLA só após capacidade, com 50 por cento informado antes da contratação
assert("rule_urgency_requires_capacity", cr.urgency_below_sla_requires_capacity === true, cr.urgency_below_sla_requires_capacity);
assert("rule_urgency_surcharge_is_50", cr.urgency_surcharge_percent === 50, cr.urgency_surcharge_percent);
assert("rule_urgency_disclosed_before_contracting", cr.urgency_disclosed_before_contracting === true, cr.urgency_disclosed_before_contracting);
assert(
  "every_item_scope_limit_repeats_urgency_rule",
  items.every((it) => it.scope_limits_pt_br.some((l) => /urgência abaixo do SLA/i.test(l) && /50%/.test(l))),
  items.filter((it) => !it.scope_limits_pt_br.some((l) => /urgência abaixo do SLA/i.test(l))).map((it) => it.number),
);
assert(
  "every_item_requires_capacity",
  items.every((it) => it.capacity_required === true),
  items.filter((it) => it.capacity_required !== true).map((it) => it.number),
);

// 7.6 plano de verdade no extra-cli, web-cfg publica e captura, Warmbly registra
assert("rule_truth_plane_is_extra_cli", cr.truth_plane_owner === "extra-cli", cr.truth_plane_owner);
assert("rule_web_cfg_only_publishes_and_captures", cr.web_cfg_only_publishes_and_captures === true, cr.web_cfg_only_publishes_and_captures);
assert("rule_warmbly_records_action_and_outcome", cr.warmbly_records_action_and_outcome === true, cr.warmbly_records_action_and_outcome);
assert("rule_no_parallel_datalake", cr.no_parallel_datalake_in_web_cfg === true, cr.no_parallel_datalake_in_web_cfg);
assert(
  "every_item_data_contract_owned_by_extra_cli",
  items.every((it) => it.data_contract.owner === "extra-cli" && it.data_contract.provenance_required === true && it.data_contract.freshness_required === true),
  items.filter((it) => it.data_contract.owner !== "extra-cli").map((it) => it.number),
);
assert(
  "every_item_lead_goes_to_warmbly",
  items.every((it) => it.lead_destination === "warmbly:CONFENGE_WEB"),
  items.map((it) => it.lead_destination),
);

// as seis regras também aparecem como frases
const statements = cr.statements_pt_br ?? [];
assert("rule_statements_are_six", statements.length === 6, statements.length);
assert("rule_statements_filled", filledList(statements, 6), statements);
assert(
  "rule_statements_unique",
  new Set(statements).size === statements.length,
  statements.length,
);
const rulesText = statements.join(" ");
const STATEMENT_CHECKS = [
  ["scope_by_decision_and_edital", /delimitado por decisão, edital ou lote, contrato, evento, cenário, critério e revisão/i],
  ["never_by_pages", /nunca por número de páginas/i],
  ["not_start", /não iniciar/i],
  ["gap_diagnosis", /diagnóstico de lacunas/i],
  ["no_inference_on_silence", /nunca preenche o silêncio com inferência/i],
  ["excludes_travel", /deslocamento/i],
  ["excludes_art_rrt", /ART ou RRT/],
  ["excludes_legal_opinion", /parecer jurídico/i],
  ["excludes_engineering_design", /projeto de engenharia/i],
  ["excludes_third_party", /emissão de documento por terceiros/i],
  ["excludes_public_fee", /taxa pública/i],
  ["clock_after_acceptance", /aceite de escopo e o recebimento íntegro dos insumos/i],
  ["urgency_after_capacity", /após confirmação de capacidade/i],
  ["urgency_50_percent", /50 por cento/],
  ["urgency_before_contracting", /antes da contratação/i],
  ["extra_cli_truth_plane", /plano de verdade do extra-cli/i],
  ["web_cfg_publishes_and_captures", /web-cfg apenas publica e captura/i],
  ["warmbly_records", /Warmbly registra ação e outcome/i],
];
for (const [key, re] of STATEMENT_CHECKS) {
  assert(`rule_statement_mentions_${key}`, re.test(rulesText), key);
}
// cada frase é uma regra distinta, nenhuma frase vazia ou duplicada de outra família
for (let i = 0; i < statements.length; i += 1) {
  assert(`rule_statement_${i}_ends_with_period`, /\.$/.test(statements[i]), statements[i]);
  assert(`rule_statement_${i}_long_enough`, statements[i].length >= 60, statements[i].length);
}

/* ------------------------------------------------------------------ */
/* 8. proibições: advocacia, RT regulada, garantia de resultado,        */
/*    documento retroativo                                             */
/* ------------------------------------------------------------------ */

const gp = data.global_prohibitions ?? {};
const CORE_PROHIBITIONS = [
  "sells_advocacy",
  "assumes_regulated_technical_responsibility",
  "guarantees_result",
  "produces_backdated_document",
];
for (const key of CORE_PROHIBITIONS) {
  assert(`global_prohibition_${key}_false`, gp[key] === false, gp[key]);
}
assert("global_prohibitions_exactly_four", Object.keys(gp).length === 4, Object.keys(gp));
assert("no_global_prohibition_is_true", Object.values(gp).every((v) => v === false), gp);

const REQUIRED_PROHIBITIONS = [
  ...CORE_PROHIBITIONS,
  "signs_for_client",
  "files_or_protocols_for_client",
  "represents_client_before_agency",
  "success_fee",
];
for (const it of items) {
  const p = it.prohibitions ?? {};
  for (const key of REQUIRED_PROHIBITIONS) {
    assert(`item_${it.number}_prohibition_${key}_false`, p[key] === false, { key, value: p[key] });
  }
  assert(
    `item_${it.number}_no_prohibition_is_true`,
    Object.keys(p).length === REQUIRED_PROHIBITIONS.length && Object.values(p).every((v) => v === false),
    p,
  );
  const legal = it.legal_boundary_pt_br.join(" ");
  assert(`item_${it.number}_legal_denies_advocacy`, /não presta advocacia/i.test(legal), legal);
  assert(`item_${it.number}_legal_denies_legal_thesis`, /não elabora tese jurídica/i.test(legal), legal);
  assert(
    `item_${it.number}_legal_denies_regulated_responsibility`,
    /não assume responsabilidade técnica regulada/i.test(legal),
    legal,
  );
  assert(`item_${it.number}_legal_denies_signing`, /não assina/i.test(legal), legal);
  assert(`item_${it.number}_legal_denies_filing`, /não protocola/i.test(legal), legal);
  assert(`item_${it.number}_legal_denies_representation`, /não representa a empresa/i.test(legal), legal);
  assert(`item_${it.number}_legal_denies_result_promise`, /não promete resultado/i.test(legal), legal);
  assert(
    `item_${it.number}_legal_denies_backdated_document`,
    /não produz documento retroativo/i.test(legal) && /data anterior/i.test(legal),
    legal,
  );
  assert(
    `item_${it.number}_legal_boundary_matches_shared`,
    eq(it.legal_boundary_pt_br, data.shared_legal_boundary_pt_br),
    it.number,
  );
}
assert("shared_legal_boundary_has_five_lines", filledList(data.shared_legal_boundary_pt_br, 5), data.shared_legal_boundary_pt_br?.length);
assert(
  "shared_legal_boundary_lines_start_with_confenge",
  (data.shared_legal_boundary_pt_br ?? []).every((l) => /^A CONFENGE /.test(l)),
  data.shared_legal_boundary_pt_br,
);

// nenhum texto do contrato promete vitória, deferimento ou provimento como resultado
const promiseHits = allStrings.filter(
  (s) =>
    !s.at.includes(".exclusions_pt_br") &&
    /\b(garantimos|asseguramos|assegura o resultado|garantia de vitória|garantia de provimento|garantia de deferimento)\b/i.test(s.value),
);
assert("no_result_promise_anywhere", promiseHits.length === 0, promiseHits.map((s) => s.at));
// nenhum texto do contrato oferece comissão de êxito
const successFeeHits = allStrings.filter((s) => /comissão de êxito|success fee|taxa de êxito/i.test(s.value));
assert("no_success_fee_anywhere", successFeeHits.length === 0, successFeeHits.map((s) => s.at));

/* ------------------------------------------------------------------ */
/* 9. onze referências do TCU, https, amarradas ao evento              */
/* ------------------------------------------------------------------ */

const EXPECTED_REFS = [
  ["projeto_basico", "https://licitacoesecontratos.tcu.gov.br/4-4-3-projeto-basico-pb/", [26]],
  ["matriz_de_riscos", "https://licitacoesecontratos.tcu.gov.br/4-5-5-matriz-de-riscos/", [26]],
  ["impugnacao_esclarecimento", "https://licitacoesecontratos.tcu.gov.br/5-1-1-impugnacao-e-pedidos-de-esclarecimento/", [27]],
  ["apresentacao_de_propostas", "https://licitacoesecontratos.tcu.gov.br/5-2-apresentacao-de-propostas/", [29]],
  ["envio_de_lances", "https://licitacoesecontratos.tcu.gov.br/5-3-envio-de-lances/", [28]],
  ["garantia_de_proposta", "https://licitacoesecontratos.tcu.gov.br/5-2-1-garantia-de-proposta/", [30]],
  ["garantias_contratuais", "https://licitacoesecontratos.tcu.gov.br/5-11-2-garantias-2/", [30, 33]],
  ["providencias_previas", "https://licitacoesecontratos.tcu.gov.br/6-1-2-providencias-previas-ao-inicio-da-execucao-do-contrato/", [33, 34]],
  ["recebimento_provisorio", "https://licitacoesecontratos.tcu.gov.br/6-1-4-fiscalizacao-tecnica-e-recebimento-provisorio-2/", [36]],
  ["recebimento_definitivo", "https://licitacoesecontratos.tcu.gov.br/6-1-6-gestao-do-contrato-e-recebimento-definitivo-2/", [36, 37]],
  ["extincao_normal", "https://licitacoesecontratos.tcu.gov.br/6-4-1-extincao-normal-do-contrato/", [36, 38]],
];
const refs = data.lifecycle_references ?? [];
assert("eleven_lifecycle_references", refs.length === 11, refs.length);
assert("lifecycle_reference_urls_unique", new Set(refs.map((r) => r.url)).size === refs.length, refs.length);
assert("lifecycle_reference_keys_unique", new Set(refs.map((r) => r.key)).size === refs.length, refs.length);
for (const [key, url, justifies] of EXPECTED_REFS) {
  const ref = refs.find((r) => r.key === key);
  assert(`ref_${key}_present`, Boolean(ref), key);
  if (!ref) continue;
  assert(`ref_${key}_url_exact`, ref.url === url, ref.url);
  assert(`ref_${key}_is_https`, ref.url.startsWith("https://"), ref.url);
  assert(`ref_${key}_source_tcu`, ref.source === "TCU", ref.source);
  assert(`ref_${key}_label_filled`, filled(ref.label_pt_br), ref.label_pt_br);
  assert(`ref_${key}_event_filled`, filled(ref.lifecycle_event_pt_br) && ref.lifecycle_event_pt_br.length >= 25, ref.lifecycle_event_pt_br);
  assert(`ref_${key}_justifies_items`, eq(ref.justifies_items, justifies), [ref.justifies_items, justifies]);
  assert(
    `ref_${key}_justified_items_exist`,
    ref.justifies_items.every((n) => byNumber.has(n)),
    ref.justifies_items,
  );
}
assert(
  "every_reference_is_https_and_tcu",
  refs.every((r) => typeof r.url === "string" && r.url.startsWith("https://licitacoesecontratos.tcu.gov.br/")),
  refs.map((r) => r.url),
);
assert(
  "no_http_url_anywhere_in_contract",
  allStrings.every((s) => !/http:\/\//i.test(s.value)),
  allStrings.filter((s) => /http:\/\//i.test(s.value)).map((s) => s.at),
);
// os onze urls da issue estão todos presentes, nenhum a mais
assert(
  "reference_url_set_matches_issue_340",
  eq([...refs.map((r) => r.url)].sort(), [...EXPECTED_REFS.map(([, u]) => u)].sort()),
  refs.map((r) => r.url),
);
// coerência bidirecional entre a lista de referências e a lista por item
for (const it of items) {
  const fromRefs = refs.filter((r) => r.justifies_items.includes(it.number)).map((r) => r.url);
  assert(
    `item_${it.number}_lifecycle_urls_match_reference_table`,
    eq(it.lifecycle_reference_urls, fromRefs),
    [it.lifecycle_reference_urls, fromRefs],
  );
  assert(
    `item_${it.number}_lifecycle_urls_are_https`,
    (it.lifecycle_reference_urls ?? []).every((u) => u.startsWith("https://")),
    it.lifecycle_reference_urls,
  );
  assert(
    `item_${it.number}_lifecycle_urls_are_known`,
    (it.lifecycle_reference_urls ?? []).every((u) => EXPECTED_REFS.some(([, known]) => known === u)),
    it.lifecycle_reference_urls,
  );
}

/* ------------------------------------------------------------------ */
/* 10. itens 31 e 38 alimentam corpus e outcome sem DataLake paralelo  */
/* ------------------------------------------------------------------ */

const corpus = data.corpus_rule ?? {};
assert("corpus_rule_items_are_31_and_38", eq(corpus.items, [31, 38]), corpus.items);
assert("corpus_rule_feeds_versioned_corpus", corpus.feeds_versioned_corpus === true, corpus.feeds_versioned_corpus);
assert("corpus_rule_feeds_outcome", corpus.feeds_outcome === true, corpus.feeds_outcome);
assert("corpus_rule_creates_no_parallel_datalake", corpus.creates_parallel_datalake === false, corpus.creates_parallel_datalake);
assert("corpus_rule_truth_plane_extra_cli", corpus.truth_plane_owner === "extra-cli", corpus.truth_plane_owner);
assert("corpus_rule_outcome_owner_warmbly", corpus.outcome_owner === "warmbly", corpus.outcome_owner);
assert(
  "corpus_rule_statement_says_no_parallel_datalake",
  /DataLake paralelo/i.test(corpus.statement_pt_br ?? "") && /extra-cli/.test(corpus.statement_pt_br ?? ""),
  corpus.statement_pt_br,
);
for (const it of items) {
  const expected = it.number === 31 || it.number === 38;
  assert(`item_${it.number}_feeds_versioned_corpus_flag`, it.feeds_versioned_corpus === expected, it.feeds_versioned_corpus);
}
assert(
  "exactly_two_items_feed_corpus",
  items.filter((it) => it.feeds_versioned_corpus).map((it) => it.number).join(",") === "31,38",
  items.filter((it) => it.feeds_versioned_corpus).map((it) => it.number),
);

/* ------------------------------------------------------------------ */
/* 11. regra das 100 repetições                                        */
/* ------------------------------------------------------------------ */

const rep = data.repetition_rule ?? {};
assert("repetition_rule_is_100", rep.repetitions === 100, rep.repetitions);
assert(
  "repetition_rule_targets_matrices_benchmarks_templates",
  eq(rep.must_improve_pt_br, ["matrizes", "benchmarks", "templates"]),
  rep.must_improve_pt_br,
);
assert("repetition_rule_artisanal_not_promoted", rep.artisanal_work_is_promoted === false, rep.artisanal_work_is_promoted);
assert(
  "repetition_rule_statement",
  /artesanal/i.test(rep.statement_pt_br ?? "") && /não é promovido/i.test(rep.statement_pt_br ?? ""),
  rep.statement_pt_br,
);

/* ------------------------------------------------------------------ */
/* 12. aceitação honesta                                               */
/* ------------------------------------------------------------------ */

const acceptance = data.acceptance ?? [];
const EXPECTED_ACCEPTANCE = {
  fourteen_distinct_deliverables: "MET_BY_CONTRACT",
  pages_and_examples_make_purchase_unambiguous: "NOT_STARTED",
  no_item_sells_forbidden_scope: "MET_BY_CONTRACT",
  items_27_28_39_refuse_unsafe_deadlines: "MET_BY_CONTRACT",
  items_31_38_feed_corpus_without_parallel_datalake: "MET_BY_CONTRACT",
  hundred_repetitions_improve_the_system: "MET_BY_CONTRACT",
  prices_stay_validate_until_real_evidence: "MET_BY_CONTRACT",
};
assert("acceptance_has_seven_criteria", acceptance.length === 7, acceptance.length);
assert(
  "acceptance_keys_exact",
  eq([...acceptance.map((a) => a.key)].sort(), Object.keys(EXPECTED_ACCEPTANCE).sort()),
  acceptance.map((a) => a.key),
);
for (const [key, state] of Object.entries(EXPECTED_ACCEPTANCE)) {
  const entry = acceptance.find((a) => a.key === key);
  assert(`acceptance_${key}_present`, Boolean(entry), key);
  if (!entry) continue;
  assert(`acceptance_${key}_state`, entry.state === state, entry.state);
  assert(`acceptance_${key}_criterion_filled`, filled(entry.criterion_pt_br), entry.criterion_pt_br);
  assert(
    `acceptance_${key}_evidence_empty`,
    Array.isArray(entry.evidence) && entry.evidence.length === 0,
    entry.evidence,
  );
}
assert(
  "acceptance_states_are_only_met_by_contract_or_not_started",
  acceptance.every((a) => ["MET_BY_CONTRACT", "NOT_STARTED"].includes(a.state)),
  acceptance.map((a) => a.state),
);
assert(
  "acceptance_not_started_entries_declare_the_blocker",
  acceptance.filter((a) => a.state === "NOT_STARTED").every((a) => filled(a.blocked_by_pt_br)),
  acceptance.filter((a) => a.state === "NOT_STARTED"),
);
assert(
  "acceptance_never_claims_done",
  acceptance.every((a) => !/^DONE$|^MET$|^COMPLETE$/i.test(a.state)),
  acceptance.map((a) => a.state),
);
assert(
  "no_evidence_fabricated_anywhere",
  acceptance.every((a) => (a.evidence ?? []).length === 0) &&
    (data.evidence ?? []).length === 0 &&
    (data.human_validation?.collected ?? []).length === 0,
  [data.evidence, data.human_validation?.collected],
);

/* ------------------------------------------------------------------ */
/* 13. nenhuma página, nenhum checkout, nenhuma rota apropriada        */
/* ------------------------------------------------------------------ */

assert(
  "no_pages_created",
  Array.isArray(data.pages_created_by_this_contract) && data.pages_created_by_this_contract.length === 0,
  data.pages_created_by_this_contract,
);
assert("checkout_disabled_globally", data.checkout_enabled_anywhere === false, data.checkout_enabled_anywhere);
for (const it of items) {
  assert(`item_${it.number}_page_does_not_exist`, it.page_exists === false, it.page_exists);
  assert(`item_${it.number}_checkout_disabled`, it.checkout_enabled === false, it.checkout_enabled);
  assert(`item_${it.number}_offer_container_none`, it.offer_container === "none", it.offer_container);
}
// nenhum item declara rota, slug ou href
const routeLike = walkStrings(items, "$.items", []).filter((s) => /^\/[a-z0-9-]+\//.test(s.value) || /https?:\/\/confenge/i.test(s.value));
assert("no_item_declares_a_public_route", routeLike.length === 0, routeLike.map((s) => s.at));
// a tabela de nomes confirma que nenhum destes catorze tem slug público
for (const n of NUMBERS) {
  assert(
    `naming_${n}_has_no_public_slug`,
    (namingByNumber.get(n)?.public_slug ?? null) === null,
    namingByNumber.get(n)?.public_slug,
  );
  assert(
    `naming_${n}_has_no_redirects`,
    (namingByNumber.get(n)?.redirects ?? []).length === 0,
    namingByNumber.get(n)?.redirects,
  );
}
// o hub de entregas em main não linka nenhuma página que este PR não cria
const hubPath = path.join(root, "entregas/index.html");
assert("deliverables_hub_exists_in_main", fs.existsSync(hubPath), hubPath);
const hub = fs.readFileSync(hubPath, "utf8");
assert(
  "hub_does_not_link_pages_this_pr_does_not_create",
  items.every((it) => !hub.includes(`/${it.deliverable_id.toLowerCase()}/`)),
  items.map((it) => it.deliverable_id),
);
// identidade canônica não colide com offer_id do catálogo congelado
const catalogPath = path.join(root, "data/offers/catalog.snapshot.json");
assert("catalog_snapshot_exists", fs.existsSync(catalogPath), catalogPath);
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const catalogIds = new Set((catalog.offers ?? []).map((o) => o.offer_id));
assert(
  "deliverable_ids_do_not_collide_with_offer_ids",
  items.every((it) => !catalogIds.has(it.deliverable_id)),
  items.map((it) => it.deliverable_id).filter((id) => catalogIds.has(id)),
);
assert(
  "no_catalog_price_is_reused_by_this_family",
  (catalog.offers ?? []).every((o) => !seenCents.includes(o.amount_cents)),
  (catalog.offers ?? []).map((o) => o.amount_cents).filter((c) => seenCents.includes(c)),
);

/* ------------------------------------------------------------------ */
/* 14. nomenclatura: nada proibido pela #343                           */
/* ------------------------------------------------------------------ */

const FORBIDDEN_NAME_PATTERNS = [
  ["bid_room", /bid\s*room/i],
  ["go_no_go_english", /\bgo\s*\/?\s*-?\s*no[\s\-/]*go\b/i],
  ["win_loss", /win\s*\/?\s*loss/i],
  ["post_mortem", /post-?mortem/i],
  ["quantum", /\bquantum\b/i],
  ["in_company", /\bin\s+company\b/i],
];
for (const [key, re] of FORBIDDEN_NAME_PATTERNS) {
  const hits = items
    .map((it) => [it.number, it.public_name_pt_br, it.value_line_pt_br].join(" "))
    .filter((text) => re.test(text));
  assert(`no_forbidden_name_${key}`, hits.length === 0, hits);
}
assert(
  "public_names_are_not_format_only",
  items.every((it) => !/^(relatório|apresentação)$/i.test(it.public_name_pt_br.trim())),
  items.map((it) => it.public_name_pt_br),
);
assert(
  "no_public_name_promises_victory",
  items.every((it) => !/(vitória|vencedor|garantido)/i.test(it.public_name_pt_br)),
  items.map((it) => it.public_name_pt_br),
);
assert(
  "value_lines_end_with_period",
  items.every((it) => /\.$/.test(it.value_line_pt_br)),
  items.map((it) => it.value_line_pt_br),
);
assert(
  "value_lines_unique",
  new Set(items.map((it) => it.value_line_pt_br)).size === 14,
  items.map((it) => it.value_line_pt_br),
);

/* ------------------------------------------------------------------ */
/* 15. sem travessão nem meia-risca                                    */
/* ------------------------------------------------------------------ */

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
assert("no_em_dash_in_data_file", !raw.includes(EM_DASH), raw.indexOf(EM_DASH));
assert("no_en_dash_in_data_file", !raw.includes(EN_DASH), raw.indexOf(EN_DASH));
const selfRaw = fs.readFileSync(path.join(__dirname, "test_page_contract_ciclo.mjs"), "utf8");
assert("no_em_dash_in_test_file", !selfRaw.includes(EM_DASH), selfRaw.indexOf(EM_DASH));
assert("no_en_dash_in_test_file", !selfRaw.includes(EN_DASH), selfRaw.indexOf(EN_DASH));

/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(`${NAME}: ${failed.length} check(s) failed`);
  process.exit(1);
}
