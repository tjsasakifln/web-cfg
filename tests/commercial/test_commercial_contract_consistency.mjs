/**
 * Gate transversal dos contratos comerciais introduzidos pelas issues #329-#344.
 *
 * Cada contrato continua tendo seu teste de origem. Este gate cobre a fronteira
 * entre eles: identidade, nome, rota, preço, prazo e estado não podem divergir
 * do registro canônico quando os branches forem integrados em outra ordem.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const load = (name) => JSON.parse(fs.readFileSync(path.join(root, "data/commercial", name), "utf8"));
const registry = load("deliverables-registry.v1.json");
const naming = load("offer-naming.v1.json");
const eight = load("page-contract-eight.v1.json");
const licitacao = load("page-contract-licitacao.v1.json");
const contratos = load("page-contract-contratos.v1.json");
const execucao = load("page-contract-execucao.v1.json");
const doors = load("task-doors.v1.json");
const marketFit = load("market-fit-protocol.v1.json");
const pricing = load("pricing-policy.v1.json");
const copy = load("copy-contract.v1.json");

const results = [];
function assert(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error("FAIL", name, JSON.stringify(detail));
}
const eq = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = (values) => [...values].sort();
const expectedIds = Array.from({ length: 54 }, (_, index) => `CFG-D${String(index + 1).padStart(2, "0")}`);
const byId = new Map((registry.deliverables || []).map((item) => [item.deliverable_id, item]));

assert("registry_has_exact_canonical_ids", eq(sorted(byId.keys()), sorted(expectedIds)), sorted(byId.keys()));
assert("registry_ids_are_unique", byId.size === registry.deliverables.length, byId.size);

/* A tabela de nomes referencia o registro; não cria outra identidade ou pergunta. */
assert("naming_has_54_deliverables", naming.names.length === 54, naming.names.length);
for (const item of naming.names) {
  const canonical = byId.get(item.deliverable_id);
  assert(`naming_${item.deliverable_id}_exists`, Boolean(canonical), item.deliverable_id);
  if (!canonical) continue;
  assert(`naming_${item.deliverable_id}_number`, item.catalog_number === canonical.catalog_number, [item.catalog_number, canonical.catalog_number]);
  assert(`naming_${item.deliverable_id}_name`, item.public_name_pt_br === canonical.public_name_pt_br, [item.public_name_pt_br, canonical.public_name_pt_br]);
  assert(`naming_${item.deliverable_id}_aliases`, eq(item.aliases, canonical.name_aliases), [item.aliases, canonical.name_aliases]);
  assert(`naming_${item.deliverable_id}_does_not_duplicate_question`, !("decision_question" in item), item);
}
assert("naming_question_joins_registry", /deliverables-registry/.test(naming.field_mapping?.decision_question || ""), naming.field_mapping?.decision_question);

function assertCommon(prefix, local, canonical, name, route) {
  assert(`${prefix}_canonical_id`, Boolean(canonical), local.deliverable_id);
  if (!canonical) return false;
  assert(`${prefix}_name`, name === canonical.public_name_pt_br, [name, canonical.public_name_pt_br]);
  assert(`${prefix}_route`, route === canonical.route, [route, canonical.route]);
  return true;
}

/* O contrato legado dos oito preserva o nome publicado e explicita a renomeação. */
for (const item of eight.deliverables) {
  const canonical = byId.get(item.deliverable_id);
  const prefix = `eight_${item.deliverable_id}`;
  if (!assertCommon(prefix, item, canonical, item.issue_331_name, item.route)) continue;
  assert(`${prefix}_legacy_name`, item.published_name_pt_br === canonical.public_name, [item.published_name_pt_br, canonical.public_name]);
  assert(`${prefix}_price`, item.price_cents === canonical.price.amount_cents, [item.price_cents, canonical.price]);
  assert(`${prefix}_sla`, item.sla.business_days === canonical.sla.business_days_max, [item.sla, canonical.sla]);
}

/* Licitação: preço, faixa de SLA e prazo-gate têm uma única fonte. */
for (const item of licitacao.items) {
  const canonical = byId.get(item.deliverable_id);
  const prefix = `licitacao_${item.deliverable_id}`;
  if (!assertCommon(prefix, item, canonical, item.public_name_pt_br, item.route)) continue;
  const localPrices = item.price.tiers
    ? item.price.tiers.map((tier) => tier.amount_cents)
    : [item.price.amount_cents];
  const canonicalPrices = canonical.price.tiers
    ? canonical.price.tiers.map((tier) => tier.amount_cents)
    : [canonical.price.amount_cents];
  assert(`${prefix}_prices`, eq(localPrices, canonicalPrices), [localPrices, canonicalPrices]);
  assert(`${prefix}_sla`, item.sla_business_days.min === canonical.sla.business_days_min && item.sla_business_days.max === canonical.sla.business_days_max, [item.sla_business_days, canonical.sla]);
  assert(`${prefix}_deadline`, item.safe_deadline_business_days === canonical.sla.safe_deadline_business_days, [item.safe_deadline_business_days, canonical.sla.safe_deadline_business_days]);
}

/* Contratos: o item 23 expressa o prazo canônico dentro de um objeto editorial. */
for (const item of contratos.items) {
  const canonical = byId.get(item.deliverable_id);
  const prefix = `contratos_${item.deliverable_id}`;
  if (!assertCommon(prefix, item, canonical, item.public_name_pt_br, item.route)) continue;
  assert(`${prefix}_price`, item.pilot_price_cents === canonical.price.amount_cents, [item.pilot_price_cents, canonical.price]);
  assert(`${prefix}_sla`, item.sla_business_days === canonical.sla.business_days_max, [item.sla_business_days, canonical.sla]);
  const localDeadline = item.safe_deadline_gate?.min_business_days_remaining_to_respond ?? null;
  assert(`${prefix}_deadline`, localDeadline === canonical.sla.safe_deadline_business_days, [localDeadline, canonical.sla.safe_deadline_business_days]);
}

/* Execução: tiers, adicionais e duas formas editoriais de prazo são normalizados. */
for (const item of execucao.items) {
  const canonical = byId.get(item.deliverable_id);
  const prefix = `execucao_${item.deliverable_id}`;
  if (!assertCommon(prefix, item, canonical, item.public_name_pt_br, item.route)) continue;
  const localPrices = item.pricing.tiers.map((tier) => tier.price_cents);
  const canonicalPrices = canonical.price.tiers
    ? canonical.price.tiers.map((tier) => tier.amount_cents)
    : [canonical.price.amount_cents];
  assert(`${prefix}_prices`, eq(localPrices, canonicalPrices), [localPrices, canonicalPrices]);
  const localAdditions = (item.pricing.additional_charges || []).map((charge) => charge.price_cents);
  const canonicalAdditions = (canonical.price.additional_units || []).map((charge) => charge.amount_cents);
  assert(`${prefix}_additions`, eq(localAdditions, canonicalAdditions), [localAdditions, canonicalAdditions]);
  const tierSlas = item.pricing.tiers.map((tier) => tier.sla_business_days).filter((value) => value !== null);
  const localMin = tierSlas.length ? Math.min(...tierSlas) : null;
  const localMax = tierSlas.length ? Math.max(...tierSlas) : null;
  assert(`${prefix}_sla`, localMin === canonical.sla.business_days_min && localMax === canonical.sla.business_days_max, [[localMin, localMax], canonical.sla]);
  const localDeadline = item.safe_deadline_gate?.min_business_days_remaining
    ?? item.safe_deadline_gate?.min_business_days_before_session
    ?? null;
  assert(`${prefix}_deadline`, localDeadline === canonical.sla.safe_deadline_business_days, [localDeadline, canonical.sla.safe_deadline_business_days]);
}

/* As sete portas são uma projeção exata da arquitetura guardada no registro. */
assert("door_count_matches_registry", doors.doors.length === registry.task_doors.length, [doors.doors.length, registry.task_doors.length]);
for (const local of doors.doors) {
  const canonical = registry.task_doors.find((door) => door.door === local.door);
  const prefix = `door_${local.door.toLowerCase()}`;
  assert(`${prefix}_exists`, Boolean(canonical), local.door);
  if (!canonical) continue;
  assert(`${prefix}_order`, local.order === canonical.order, [local.order, canonical.order]);
  assert(`${prefix}_label`, local.public_label_pt_br === canonical.public_label, [local.public_label_pt_br, canonical.public_label]);
  assert(`${prefix}_question`, local.decision_question_pt_br === canonical.decision_question, [local.decision_question_pt_br, canonical.decision_question]);
  assert(`${prefix}_members`, eq(local.members.map((member) => member.deliverable_id), canonical.members), [local.members, canonical.members]);
  assert(`${prefix}_disclosure`, local.progressive_disclosure.required === canonical.requires_progressive_disclosure, [local.progressive_disclosure.required, canonical.requires_progressive_disclosure]);
}

/* O protocolo P0 aponta ofertas reais e o preço-base atual do registro. */
const pricePhase = marketFit.phases.find((phase) => phase.measurement_scope);
assert("market_fit_price_phase_exists", Boolean(pricePhase), marketFit.phases.map((phase) => phase.phase));
for (const offer of pricePhase?.measurement_scope || []) {
  const canonical = byId.get(offer.deliverable_id);
  const canonicalBase = canonical?.price.tiers?.[0]?.amount_cents ?? canonical?.price.amount_cents;
  assert(`market_fit_${offer.deliverable_id}_exists`, Boolean(canonical), offer);
  assert(`market_fit_${offer.deliverable_id}_base_price`, offer.amount_cents === canonicalBase, [offer.amount_cents, canonicalBase]);
}
assert("market_fit_remains_not_started", marketFit.state === "NOT_STARTED" && marketFit.decisions.length === 0, [marketFit.state, marketFit.decisions]);

/* A exceção do tier extenso deve continuar presa ao preço da D49. */
const d49 = byId.get("CFG-D49");
const d49Extenso = d49.price.tiers.find((tier) => tier.tier === "extenso");
const d49Exception = pricing.pilot_gap_exceptions.find((item) => item.deliverable_id === "CFG-D49" && item.price_tier === "extenso");
assert("pricing_d49_exception_exists", Boolean(d49Exception), pricing.pilot_gap_exceptions);
assert("pricing_d49_exception_matches_registry", d49Exception?.amount_cents === d49Extenso.amount_cents, [d49Exception, d49Extenso]);

/* Nenhum contrato de página pode reintroduzir um segundo formato de identidade. */
const scopedDocs = [eight.deliverables, licitacao.items, contratos.items, execucao.items].flat();
assert("page_contract_ids_use_only_cfg_d", scopedDocs.every((item) => /^CFG-D\d{2}$/.test(item.deliverable_id)), scopedDocs.map((item) => item.deliverable_id));
const commercialText = [registry, naming, eight, licitacao, contratos, execucao, doors, marketFit]
  .map((doc) => JSON.stringify(doc)).join("\n");
assert("no_obsolete_lic_or_dlv_identity", !/CFG-(?:LIC|DLV)-/.test(commercialText), commercialText.match(/CFG-(?:LIC|DLV)-[^\" ]*/g));

/* O contrato editorial é um gate pendente, não evidência fabricada. */
assert("copy_names_issue_343_as_authority", /#343/.test(copy.naming_authority || ""), copy.naming_authority);
assert("copy_target_matches_registry", copy.differentiation_test.target_count === registry.deliverables.length && copy.differentiation_test.count_discrepancy.state === "RESOLVED_BY_CANONICAL_REGISTRY", copy.differentiation_test);
assert("copy_stays_not_started", copy.state === "NOT_STARTED", copy.state);
assert("copy_human_acceptance_stays_not_started", ["AC-02", "AC-03", "AC-04", "AC-06", "AC-07"].every((id) => copy.acceptance.find((criterion) => criterion.id === id)?.state === "NOT_STARTED"), copy.acceptance);
assert("copy_machine_acceptance_has_evidence", ["AC-01", "AC-08", "AC-09"].every((id) => {
  const criterion = copy.acceptance.find((item) => item.id === id);
  return criterion?.state === "MEASURED_PASS" && typeof criterion.evidence === "string";
}), copy.acceptance);
assert("copy_has_no_review_evidence", copy.reviews.length === 0 && copy.human_protocol.results.length === 0, [copy.reviews, copy.human_protocol.results]);

const failed = results.filter((result) => !result.ok);
console.log(`commercial-contract-consistency: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
