/**
 * Gate do protocolo de market fit (#336).
 *
 * Autossuficiente: lê o próprio JSON, cruza preço só com o que já existe em main
 * (entregas/index.html e data/offers/catalog.snapshot.json) e nunca carrega o
 * registro do catálogo ampliado, que chega em #329.
 *
 * O invariante central é fail-closed: nada é declarado validado e a promoção só
 * fica elegível quando todas as classes de evidência exigidas estão satisfeitas.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { evaluatePromotion } from "../../scripts/commercial/market_fit_promotion.mjs";
import { generateExposurePlan } from "../../scripts/commercial/market_fit_exposure_plan.mjs";
import {
  validateExposurePlan,
  validateProductDecisions,
  validateQcoAggregate,
  validateResearchAggregate,
} from "../../scripts/commercial/market_fit_evidence.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const NAME = "market-fit-protocol";

const results = [];
function assert(name, cond, detail) {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) console.error("FAIL", name, detail === undefined ? "" : JSON.stringify(detail));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const protocolPath = path.join(root, "data/commercial/market-fit-protocol.v1.json");
const rawProtocol = fs.readFileSync(protocolPath, "utf8");
const protocol = JSON.parse(rawProtocol);

/* ---------------------------------------------------------------- 1. nada validado */
assert("state_not_started", protocol.state === "NOT_STARTED", protocol.state);
assert("runs_empty", Array.isArray(protocol.runs) && protocol.runs.length === 0, protocol.runs);
assert("decisions_empty", Array.isArray(protocol.decisions) && protocol.decisions.length === 0, protocol.decisions);
assert("schema_version_pinned", protocol.schema === "confenge.market-fit-protocol/1.0" && typeof protocol.protocol_version === "string", protocol.protocol_version);
assert("issue_declared", protocol.issue === "#336", protocol.issue);
assert(
  "no_inferred_sale",
  protocol.disclosure && protocol.disclosure.inferred_sale_or_willingness_to_pay_allowed === false,
  protocol.disclosure,
);
assert(
  "human_session_machinery_exists",
  typeof protocol.reuses_human_session_machinery === "string" &&
    fs.existsSync(path.join(root, protocol.reuses_human_session_machinery)),
  protocol.reuses_human_session_machinery,
);

const phases = protocol.phases;
assert("three_phases", Array.isArray(phases) && phases.length === 3, phases && phases.length);
const p1 = phases.find((p) => p.phase === 1);
const p2 = phases.find((p) => p.phase === 2);
const p3 = phases.find((p) => p.phase === 3);
assert("all_phases_not_started", phases.every((p) => p.status === "NOT_STARTED"), phases.map((p) => p.status));

/* ---------------------------------------------------------------- 2. amostra e quotas */
assert("sample_minimum_20", p1.minimum_sample === 20, p1.minimum_sample);
const quotaSum = p1.quotas.reduce((acc, q) => acc + q.minimum, 0);
assert("quotas_sum_equals_sample", quotaSum === p1.minimum_sample, { quotaSum, sample: p1.minimum_sample });
assert("quotas_are_four", p1.quotas.length === 4, p1.quotas.length);
assert("quota_each_five", p1.quotas.every((q) => q.minimum === 5), p1.quotas.map((q) => q.minimum));
assert("quota_roles_distinct", new Set(p1.quotas.map((q) => q.role)).size === p1.quotas.length, p1.quotas.map((q) => q.role));
assert("quota_roles_nonempty", p1.quotas.every((q) => typeof q.role === "string" && q.role.trim().length > 0), p1.quotas);
const maturity = p1.maturity_requirement;
assert("maturity_minimum_14", maturity.minimum_participants === 14, maturity.minimum_participants);
assert(
  "maturity_not_above_sample",
  maturity.minimum_participants > 0 && maturity.minimum_participants <= p1.minimum_sample,
  maturity,
);
assert("maturity_of_sample_matches", maturity.of_sample === p1.minimum_sample, maturity.of_sample);
assert("maturity_lookback_12m", maturity.lookback_months === 12, maturity.lookback_months);
assert("consent_and_raw_notes", p1.consent_required === true && p1.raw_notes_required === true, p1);
assert("behavior_probes_six", Array.isArray(p1.behavior_probes) && p1.behavior_probes.length === 6, p1.behavior_probes.length);
assert("no_would_you_buy_first", /não perguntar/i.test(p1.forbidden || ""), p1.forbidden);
assert("quota_ids_unique", new Set(p1.quotas.map((quota) => quota.role_id)).size === 4, p1.quotas);
assert("quota_focus_doors", p1.quotas.every((quota) => quota.focus_doors.length === 3), p1.quotas);

/* ---------------------------------------------------------------- 3. exposição parcial do rol */
assert("catalogue_54", p2.catalogue_size === 54, p2.catalogue_size);
assert("cards_18", p2.cards_per_participant === 18, p2.cards_per_participant);
assert(
  "cards_positive_and_partial",
  p2.cards_per_participant > 0 && p2.cards_per_participant < p2.catalogue_size,
  { cards: p2.cards_per_participant, catalogue: p2.catalogue_size },
);
assert("min_exposures_per_item_6", p2.min_exposures_per_item === 6, p2.min_exposures_per_item);
assert("min_boundary_joint_3", p2.min_joint_exposures_per_critical_boundary === 3, p2.min_joint_exposures_per_critical_boundary);
assert(
  "coverage_arithmetically_feasible",
  p1.minimum_sample * p2.cards_per_participant >= p2.catalogue_size * p2.min_exposures_per_item,
  {
    supply: p1.minimum_sample * p2.cards_per_participant,
    demand: p2.catalogue_size * p2.min_exposures_per_item,
  },
);
assert(
  "boundary_cards_fit_in_block",
  p2.boundary_cards_per_participant > 0 && p2.boundary_cards_per_participant < p2.cards_per_participant,
  p2.boundary_cards_per_participant,
);
assert(
  "exposure_rules_state_item_coverage",
  p2.exposure_rules.some((r) => r.includes(String(p2.catalogue_size)) && r.includes(String(p2.min_exposures_per_item))),
  p2.exposure_rules,
);
assert(
  "exposure_rules_state_boundary_coverage",
  p2.exposure_rules.some((r) => /fronteir/i.test(r) && r.includes(String(p2.min_joint_exposures_per_critical_boundary))),
  p2.exposure_rules,
);
assert("matrix_frozen_before_sessions", p2.exposure_matrix_frozen_before_sessions === true, p2);
assert("cards_not_swappable", p2.cards_may_be_swapped_to_chase_result === false, p2);
assert("price_after_task_sorting", p2.price_revealed_after_task_sorting === true, p2);
assert("card_order_randomized", p2.randomize_card_order_within_block === true, p2);
assert("measures_seven", Array.isArray(p2.measures) && p2.measures.length === 7, p2.measures);
assert("measure_task_chosen", p2.measures.includes("tarefa escolhida"), p2.measures);
assert("measures_have_no_issue_refs", p2.measures.every((m) => !m.includes("#")), p2.measures);
assert("eight_current_preserved", /nunca apaga/i.test(p2.invariant || ""), p2.invariant);
assert("critical_boundaries_declared", p2.critical_boundaries.length >= 10, p2.critical_boundaries.length);
assert("critical_boundary_ids_unique", new Set(p2.critical_boundaries.map((boundary) => boundary.boundary_id)).size === p2.critical_boundaries.length, p2.critical_boundaries);
assert("critical_boundaries_are_pairs", p2.critical_boundaries.every((boundary) => boundary.deliverable_ids.length === 2 && new Set(boundary.deliverable_ids).size === 2), p2.critical_boundaries);

/* ---------------------------------------------------------------- 4. fase 3, decisão unitária */
const offers = p3.measurement_scope;
assert("offers_eight", Array.isArray(offers) && offers.length === 8, offers && offers.length);
assert("offer_ids_unique", new Set(offers.map((o) => o.deliverable_id)).size === offers.length, offers.map((o) => o.deliverable_id));
assert("offer_ids_shaped", offers.every((o) => /^CFG-D\d{2}$/.test(o.deliverable_id)), offers.map((o) => o.deliverable_id));
assert("offer_ranks_sequential", same(offers.map((o) => o.rank), [1, 2, 3, 4, 5, 6, 7, 8]), offers.map((o) => o.rank));
assert("registry_not_loaded_by_gate", p3.deliverable_registry_ref.loaded_by_this_gate === false, p3.deliverable_registry_ref);
const SELF_SOURCE = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
// Agulhas montadas em tempo de execução para o gate não casar consigo mesmo.
const REGISTRY_NEEDLES = [["deliverable", "registry"].join("-"), ["deliverables", "registry"].join("-"), ["catalogo", "ampliado"].join("-")];
assert(
  "gate_reads_no_deliverable_registry",
  REGISTRY_NEEDLES.every((needle) => !SELF_SOURCE.includes(needle)),
  "test source",
);
assert("one_primary_per_qco", p3.recommendation_rule.primary_recommendations_per_qco === 1, p3.recommendation_rule);
assert("min_eight_qcos", p3.minimum_qcos_with_unit_recommendation === 8, p3.minimum_qcos_with_unit_recommendation);
assert(
  "decision_states_exact",
  same(p3.decision_states, ["ACEITOU", "NEGOCIOU", "RECUSOU", "SEM DECISÃO"]),
  p3.decision_states,
);
assert("external_system_of_action", p3.system_of_action === "warmbly", p3.system_of_action);
assert("governance_supervision", p3.supervision_owner === "governance_control_center", p3.supervision_owner);
assert("web_role_is_select_only", /SELECT-only/.test(p3.web_cfg_role) && /não operar/.test(p3.web_cfg_role), p3.web_cfg_role);
assert("no_individual_reason_in_repo", p3.individual_decision_reason_in_repository === false, p3);
assert("record_fields_include_outcome_unknown", p3.record_fields.some((f) => /UNKNOWN/.test(f)), p3.record_fields);
assert("record_fields_five", p3.record_fields.length === 5, p3.record_fields.length);
assert("no_silent_discount", p3.pricing_discipline.silent_discount_allowed === false && p3.pricing_discipline.price_versions_must_be_explicit === true, p3.pricing_discipline);

/* ---------------------------------------------------------------- 5. preços */
const ISSUE_PRICES_CENTS = [59900, 190000, 590000, 290000, 490000, 790000, 980000, 490000];
assert("offer_prices_match_issue", same(offers.map((o) => o.amount_cents), ISSUE_PRICES_CENTS), offers.map((o) => o.amount_cents));
function labelToCents(label) {
  const digits = String(label).replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  return Math.round(Number(digits) * 100);
}
assert(
  "offer_label_matches_cents",
  offers.every((o) => labelToCents(o.price_brl_label) === o.amount_cents),
  offers.map((o) => [o.price_brl_label, o.amount_cents]),
);

const entregasHtml = fs.readFileSync(path.join(root, "entregas/index.html"), "utf8");
const publishedCents = [...entregasHtml.matchAll(/<td[^>]*><strong>R\$\s*([\d.,]+)<\/strong><\/td>/g)].map((m) => labelToCents(m[1]));
assert("entregas_publishes_eight_prices", publishedCents.length === 8, publishedCents);
assert(
  "declared_published_prices_match_page",
  same([...publishedCents].sort((a, b) => a - b), [...protocol.published_unit_prices.cents].sort((a, b) => a - b)),
  { page: publishedCents, declared: protocol.published_unit_prices.cents },
);
assert("published_count_declared", protocol.published_unit_prices.count === publishedCents.length, protocol.published_unit_prices.count);
assert("published_source_is_entregas", protocol.published_unit_prices.source === "entregas/index.html", protocol.published_unit_prices.source);
const publishedSet = new Set(publishedCents);
assert(
  "public_flag_matches_published_page",
  offers.every((o) => o.matches_published_unit_price === publishedSet.has(o.amount_cents)),
  offers.map((o) => [o.deliverable_id, o.amount_cents, o.matches_published_unit_price]),
);
assert(
  "public_offers_are_599_and_1900",
  same(offers.filter((o) => o.matches_published_unit_price).map((o) => o.amount_cents), [59900, 190000]),
  offers.filter((o) => o.matches_published_unit_price).map((o) => o.amount_cents),
);
assert(
  "published_price_change_requires_paid_evidence",
  /evidência paga/i.test(protocol.published_unit_prices.change_requires || ""),
  protocol.published_unit_prices.change_requires,
);
const snapshot = JSON.parse(fs.readFileSync(path.join(root, "data/offers/catalog.snapshot.json"), "utf8"));
const snapshotCents = new Set(snapshot.offers.map((o) => o.amount_cents));
assert(
  "pilot_prices_have_no_checkout_offer",
  offers.every((o) => !snapshotCents.has(o.amount_cents)),
  [...snapshotCents],
);

/* ---------------------------------------------------------------- 6. instrumentação */
const inst = protocol.instrumentation;
assert(
  "funnel_exact",
  same(inst.funnel, ["view", "detail", "example", "handraise", "qco", "proposal", "paid", "delivered", "outcome", "expansion"]),
  inst.funnel,
);
assert(
  "attributes_exact",
  same(inst.attributes, ["route_family", "deliverable_id", "price_version", "trigger", "deadline", "decision_state"]),
  inst.attributes,
);
assert("no_pii_in_analytics", inst.pii_in_analytics === false, inst);
assert(
  "attributes_carry_no_pii",
  inst.attributes.every((a) => !/e-?mail|cnpj|cpf|phone|telefone|whatsapp|nome|razao_social/i.test(a)),
  inst.attributes,
);
assert("web_cfg_is_not_crm", inst.web_cfg_is_crm === false, inst);
assert("action_outcome_owner_warmbly", inst.action_and_outcome_owner === "warmbly", inst.action_and_outcome_owner);

/* ---------------------------------------------------------------- 7. portões */
const gates = protocol.gates;
assert("three_gates", same(Object.keys(gates).sort(), ["ADJUST", "HOLD", "PROMOTE"]), Object.keys(gates));
assert("score_dimensions_ten", protocol.score_dimensions.length === 10, protocol.score_dimensions.length);
assert("score_range_0_5", protocol.score_range.min === 0 && protocol.score_range.max === 5, protocol.score_range);
assert(
  "evidence_classes_five",
  same(protocol.evidence_classes, ["problem", "solution", "price", "delivery", "outcome"]),
  protocol.evidence_classes,
);
const promote = gates.PROMOTE;
assert(
  "promote_requires_four_classes",
  same(promote.required_evidence_classes, ["problem", "solution", "price", "delivery"]),
  promote.required_evidence_classes,
);
assert(
  "promote_classes_are_known",
  promote.required_evidence_classes.every((c) => protocol.evidence_classes.includes(c)),
  promote.required_evidence_classes,
);
assert("promote_six_criteria", promote.criteria.length === 6, promote.criteria.length);
assert(
  "promote_every_required_class_has_criterion",
  promote.required_evidence_classes.every((c) => promote.criteria.some((cr) => cr.evidence_class === c)),
  promote.criteria.map((c) => c.evidence_class),
);
assert(
  "promote_thresholds_numeric",
  promote.criteria.every((c) =>
    (c.kind === "min_count" && Number.isFinite(c.min)) ||
    (c.kind === "max_abs_pct" && Number.isFinite(c.max_abs)) ||
    c.kind === "must_be_true"),
  promote.criteria,
);
const byId = Object.fromEntries(promote.criteria.map((c) => [c.id, c]));
assert("promote_triggers_min_3", byId.recent_concrete_triggers.min === 3, byId.recent_concrete_triggers);
assert("promote_handraises_min_2", byId.qualified_handraises.min === 2, byId.qualified_handraises);
assert("promote_proposals_min_1", byId.plausible_proposals.min === 1, byId.plausible_proposals);
assert("promote_hours_tolerance_25", byId.scope_hours_tolerance.max_abs === 25, byId.scope_hours_tolerance);
assert("promote_margin_and_claim", byId.positive_margin.kind === "must_be_true" && byId.no_forbidden_claim.kind === "must_be_true", promote.criteria);
assert("adjust_signals_four", gates.ADJUST.signals.length === 4, gates.ADJUST.signals.length);
assert("adjust_threshold_numeric", Number.isFinite(gates.ADJUST.min_signals_observed) && gates.ADJUST.min_signals_observed >= 1, gates.ADJUST);
assert("hold_signals_four", gates.HOLD.signals.length === 4, gates.HOLD.signals.length);
assert(
  "hold_zero_proposal_threshold",
  gates.HOLD.eligible_qcos_before_zero_proposal_hold === 5 && gates.HOLD.max_plausible_proposals_for_zero_proposal_hold === 0,
  gates.HOLD,
);
assert("hold_threshold_numeric", Number.isFinite(gates.HOLD.min_signals_observed) && gates.HOLD.min_signals_observed >= 1, gates.HOLD);
assert("hold_keeps_item_in_catalogue", gates.HOLD.effect.removes_from_catalogue === false, gates.HOLD.effect);
assert(
  "hold_blocks_promotion_checkout_automation",
  gates.HOLD.effect.blocks_promotion === true && gates.HOLD.effect.blocks_checkout === true && gates.HOLD.effect.blocks_automation === true,
  gates.HOLD.effect,
);

/* ---------------------------------------------------------------- 8. avaliação fail-closed */
function thresholdEvidence() {
  const ev = {};
  for (const c of promote.criteria) {
    if (c.kind === "min_count") ev[c.field] = c.min;
    else if (c.kind === "max_abs_pct") ev[c.field] = c.max_abs;
    else if (c.kind === "must_be_true") ev[c.field] = true;
  }
  return ev;
}

const empty = evaluatePromotion(promote, {});
assert("promotion_zero_evidence_rejected", empty.eligible === false, empty);
assert(
  "promotion_zero_evidence_flags_every_criterion",
  empty.unmet.length === promote.criteria.length,
  empty.unmet,
);
assert(
  "promotion_zero_evidence_reason_is_absence",
  empty.unmet.every((u) => u.reason === "evidencia_ausente"),
  empty.unmet,
);

const atThreshold = evaluatePromotion(promote, thresholdEvidence());
assert("promotion_at_threshold_eligible", atThreshold.eligible === true, atThreshold);
assert("promotion_at_threshold_no_unmet", atThreshold.unmet.length === 0, atThreshold.unmet);
assert("promotion_at_threshold_satisfies_all", atThreshold.satisfied.length === promote.criteria.length, atThreshold.satisfied.length);

for (const c of promote.criteria) {
  const ev = thresholdEvidence();
  if (c.kind === "min_count") ev[c.field] = c.min - 1;
  else if (c.kind === "max_abs_pct") ev[c.field] = c.max_abs + 1;
  else if (c.kind === "must_be_true") ev[c.field] = false;
  const out = evaluatePromotion(promote, ev);
  assert(`promotion_below_threshold_rejected_${c.id}`, out.eligible === false, out);
  assert(`promotion_below_threshold_names_${c.id}`, out.unmet.some((u) => u.id === c.id), out.unmet);
  assert(`promotion_below_threshold_isolates_${c.id}`, out.unmet.length === 1, out.unmet);
}

for (const c of promote.criteria) {
  const ev = thresholdEvidence();
  delete ev[c.field];
  const out = evaluatePromotion(promote, ev);
  assert(`promotion_missing_field_rejected_${c.id}`, out.eligible === false && out.unmet.some((u) => u.reason === "evidencia_ausente"), out.unmet);
}

const wrongTypes = evaluatePromotion(promote, Object.fromEntries(promote.criteria.map((c) => [c.field, "3"])));
assert("promotion_string_evidence_rejected", wrongTypes.eligible === false, wrongTypes);
const negative = evaluatePromotion(promote, { ...thresholdEvidence(), delivery_hours_deviation_pct: -(byId.scope_hours_tolerance.max_abs + 1) });
assert("promotion_negative_hours_deviation_rejected", negative.eligible === false, negative);
const negativeInside = evaluatePromotion(promote, { ...thresholdEvidence(), delivery_hours_deviation_pct: -byId.scope_hours_tolerance.max_abs });
assert("promotion_negative_within_tolerance_accepted", negativeInside.eligible === true, negativeInside);

const unknownKindGate = {
  required_evidence_classes: ["problem"],
  criteria: [{ id: "x", evidence_class: "problem", kind: "vibes", field: "recent_concrete_triggers" }],
};
assert(
  "promotion_unknown_criterion_kind_rejected",
  evaluatePromotion(unknownKindGate, { recent_concrete_triggers: 99 }).eligible === false,
  "unknown kind",
);
assert("promotion_empty_gate_rejected", evaluatePromotion({}, thresholdEvidence()).eligible === false, "empty gate");
assert("promotion_null_gate_rejected", evaluatePromotion(null, thresholdEvidence()).eligible === false, "null gate");
assert("promotion_null_evidence_rejected", evaluatePromotion(promote, null).eligible === false, "null evidence");
const classWithoutCriterion = {
  required_evidence_classes: ["problem", "outcome"],
  criteria: promote.criteria.filter((c) => c.evidence_class === "problem"),
};
const orphan = evaluatePromotion(classWithoutCriterion, thresholdEvidence());
assert(
  "promotion_class_without_criterion_rejected",
  orphan.eligible === false && orphan.missing_classes.includes("outcome"),
  orphan,
);
assert(
  "promotion_outcome_not_required_today",
  promote.outcome_evidence_required_for_promotion === false && !promote.required_evidence_classes.includes("outcome"),
  promote,
);

/* ---------------------------------------------------------------- 9. pacote executavel sem PII */
const execution = protocol.execution_package || {};
assert("execution_instrument_ready", execution.status === "INSTRUMENT_READY_HUMAN_EVIDENCE_PENDING", execution.status);
assert("execution_keeps_data_authorities", execution.commercial_action_owner === "warmbly" && execution.repository_accepts_individual_records === false && execution.analytics_accepts_pii === false, execution);
for (const field of ["root", "runbook", "exposure_plan", "exposure_plan_generator", "evidence_validator", "research_aggregate_template", "qco_aggregate_template", "decision_template"]) {
  assert(`execution_artifact_${field}`, typeof execution[field] === "string" && fs.existsSync(path.join(root, execution[field])), execution[field]);
}

const taskDoors = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/task-doors.v1.json"), "utf8"));
const exposurePlan = JSON.parse(fs.readFileSync(path.join(root, execution.exposure_plan), "utf8"));
assert("exposure_plan_is_reproducible", same(generateExposurePlan(protocol, taskDoors), exposurePlan), exposurePlan.plan_version);
assert("exposure_plan_valid", validateExposurePlan(exposurePlan, protocol, taskDoors).length === 0, validateExposurePlan(exposurePlan, protocol, taskDoors));
assert("exposure_plan_20_slots", exposurePlan.participant_slots.length === 20, exposurePlan.participant_slots.length);
assert("exposure_plan_18_each", exposurePlan.participant_slots.every((slot) => slot.cards.length === 18 && slot.display_order.length === 18), "slots");
assert("exposure_plan_four_boundary_cards_each", exposurePlan.participant_slots.every((slot) => slot.boundary_cards.length === 4), "slots");
assert("exposure_plan_role_quotas", p1.quotas.every((quota) => exposurePlan.participant_slots.filter((slot) => slot.role_id === quota.role_id).length === 5), "roles");
assert("exposure_plan_covers_54", Object.keys(exposurePlan.coverage.item_exposure_counts).length === 54, exposurePlan.coverage);
assert("exposure_plan_min_six", exposurePlan.coverage.minimum_item_exposures_observed >= 6, exposurePlan.coverage.minimum_item_exposures_observed);
assert("exposure_plan_boundaries_min_three", exposurePlan.coverage.minimum_joint_boundary_exposures_observed >= 3, exposurePlan.coverage.minimum_joint_boundary_exposures_observed);
assert("exposure_plan_has_no_identity", exposurePlan.contains_participant_identity === false, exposurePlan.contains_participant_identity);

const researchTemplate = JSON.parse(fs.readFileSync(path.join(root, execution.research_aggregate_template), "utf8"));
const qcoTemplate = JSON.parse(fs.readFileSync(path.join(root, execution.qco_aggregate_template), "utf8"));
const decisionTemplate = JSON.parse(fs.readFileSync(path.join(root, execution.decision_template), "utf8"));
assert("research_template_valid", validateResearchAggregate(researchTemplate, protocol, exposurePlan).length === 0, validateResearchAggregate(researchTemplate, protocol, exposurePlan));
assert("qco_template_valid", validateQcoAggregate(qcoTemplate, protocol).length === 0, validateQcoAggregate(qcoTemplate, protocol));
assert("decision_template_valid", validateProductDecisions(decisionTemplate, protocol).length === 0, validateProductDecisions(decisionTemplate, protocol));

const validResearch = structuredClone(researchTemplate);
validResearch.template = false;
validResearch.run_id = "2026-09-24-01";
validResearch.executed_at = "2026-09-24T18:00:00Z";
validResearch.status = "COMPLETE";
validResearch.exposure_plan_sha256 = crypto.createHash("sha256").update(`${JSON.stringify(exposurePlan, null, 2)}\n`).digest("hex");
validResearch.participant_counts = { screened: 24, eligible: 20, consented: 20, completed: 20, active_public_contract_last_12_months: 14 };
validResearch.completed_by_role = { direcao: 5, licitacoes_comercial: 5, engenharia_proposta: 5, contratos_obra_financeiro: 5 };
validResearch.consent_attestation = { private_records_verified: true, pii_in_repository: false, pii_in_analytics: false, raw_notes_in_repository: false };
validResearch.exposure_counts_by_deliverable = exposurePlan.coverage.item_exposure_counts;
validResearch.joint_counts_by_critical_boundary = exposurePlan.coverage.boundary_joint_counts;
const zeroByDeliverable = Object.fromEntries(Object.keys(exposurePlan.coverage.item_exposure_counts).map((id) => [id, 0]));
validResearch.problem_evidence_aggregate = { recent_concrete_triggers_by_deliverable: { ...zeroByDeliverable, "CFG-D01": 3 } };
validResearch.card_sort_aggregate = {
  completed_sort_count: 20,
  relevance_selections_by_deliverable: structuredClone(zeroByDeliverable),
  confusion_mentions_by_deliverable: structuredClone(zeroByDeliverable),
};
validResearch.review = { operator_role: "research_operator", second_reviewer_role: "research_reviewer", reviewed_at: "2026-09-25T12:00:00Z" };
assert("valid_research_fixture_passes", validateResearchAggregate(validResearch, protocol, exposurePlan).length === 0, validateResearchAggregate(validResearch, protocol, exposurePlan));
const shortResearch = structuredClone(validResearch);
shortResearch.participant_counts.completed = 19;
assert("research_below_20_fails", validateResearchAggregate(shortResearch, protocol, exposurePlan).includes("sample_not_exact"), validateResearchAggregate(shortResearch, protocol, exposurePlan));
const fakePlanHash = structuredClone(validResearch);
fakePlanHash.exposure_plan_sha256 = "a".repeat(64);
assert("research_fake_plan_hash_fails", validateResearchAggregate(fakePlanHash, protocol, exposurePlan).includes("exposure_plan_sha256"), validateResearchAggregate(fakePlanHash, protocol, exposurePlan));
const researchWithPii = structuredClone(validResearch);
researchWithPii.email = "proibido@example.invalid";
assert("research_pii_key_fails", validateResearchAggregate(researchWithPii, protocol, exposurePlan).some((problem) => problem.startsWith("forbidden_key:")), validateResearchAggregate(researchWithPii, protocol, exposurePlan));
const researchWithPiiValue = structuredClone(validResearch);
researchWithPiiValue.note = "pessoa@example.invalid";
assert("research_pii_value_fails", validateResearchAggregate(researchWithPiiValue, protocol, exposurePlan).some((problem) => problem.startsWith("forbidden_value:")), validateResearchAggregate(researchWithPiiValue, protocol, exposurePlan));

const validQco = structuredClone(qcoTemplate);
validQco.template = false;
validQco.run_id = "2026-09-24-01";
validQco.status = "COMPLETE";
validQco.window = { started_at: "2026-09-01T00:00:00Z", ended_at: "2026-09-24T23:59:59Z" };
validQco.warmbly_export_sha256 = "b".repeat(64);
validQco.review = { operator_role: "commercial_operator", second_reviewer_role: "commercial_reviewer", reviewed_at: "2026-09-25T13:00:00Z" };
for (const row of validQco.by_deliverable) {
  row.price_version = "CFG-PRICE-PILOT-V1";
  row.eligible_qcos = 1;
  row.unit_recommendations = 1;
  row.decisions.SEM_DECISAO = 1;
}
const promotedQco = validQco.by_deliverable.find((row) => row.deliverable_id === "CFG-D01");
promotedQco.eligible_qcos = 2;
promotedQco.unit_recommendations = 2;
promotedQco.proposals_sent = 1;
promotedQco.plausible_proposals_at_published_price = 1;
promotedQco.decisions.ACEITOU = 1;
promotedQco.paid = 1;
promotedQco.delivered = 1;
promotedQco.outcomes_unknown = 1;
promotedQco.deliveries_with_positive_margin = 1;
promotedQco.delivery_hours_deviation_pct = 0;
validQco.totals.eligible_qcos = 9;
validQco.totals.unit_recommendations = 9;
validQco.totals.proposals_sent = 1;
validQco.totals.plausible_proposals_at_published_price = 1;
validQco.totals.paid = 1;
validQco.totals.delivered = 1;
validQco.totals.outcomes_unknown = 1;
validQco.totals.deliveries_with_positive_margin = 1;
assert("valid_qco_fixture_passes", validateQcoAggregate(validQco, protocol).length === 0, validateQcoAggregate(validQco, protocol));
const ambiguousQco = structuredClone(validQco);
ambiguousQco.by_deliverable[0].unit_recommendations = 0;
assert("qco_without_unit_recommendation_fails", validateQcoAggregate(ambiguousQco, protocol).some((problem) => problem.startsWith("unit_recommendation:")), validateQcoAggregate(ambiguousQco, protocol));
const qcoWithPii = structuredClone(validQco);
qcoWithPii.by_deliverable[0].company_name = "proibido";
assert("qco_pii_key_fails", validateQcoAggregate(qcoWithPii, protocol).some((problem) => problem.startsWith("forbidden_key:")), validateQcoAggregate(qcoWithPii, protocol));
const unreconciledOutcome = structuredClone(validQco);
unreconciledOutcome.by_deliverable[0].outcomes_unknown = 0;
assert("qco_requires_every_delivery_outcome", validateQcoAggregate(unreconciledOutcome, protocol).some((problem) => problem.startsWith("outcome_reconciliation:")), validateQcoAggregate(unreconciledOutcome, protocol));

const validDecisions = structuredClone(decisionTemplate);
validDecisions.template = false;
validDecisions.run_id = "2026-09-25-01";
validDecisions.research_run_id = validResearch.run_id;
validDecisions.qco_run_id = validQco.run_id;
validDecisions.status = "COMPLETE";
validDecisions.review = { operator_role: "portfolio_owner", second_reviewer_role: "portfolio_reviewer", reviewed_at: "2026-09-25T14:00:00Z" };
validDecisions.decisions = Array.from({ length: 54 }, (_, index) => ({
  deliverable_id: `CFG-D${String(index + 1).padStart(2, "0")}`,
  decision: "HOLD",
  scores: Object.fromEntries(protocol.score_dimensions.map((dimension) => [dimension, 0])),
  evidence_classes: Object.fromEntries(protocol.evidence_classes.map((evidenceClass) => [evidenceClass, false])),
  promotion_evidence: null,
}));
const promotedDecision = validDecisions.decisions[0];
promotedDecision.decision = "PROMOTE";
for (const evidenceClass of protocol.gates.PROMOTE.required_evidence_classes) promotedDecision.evidence_classes[evidenceClass] = true;
promotedDecision.promotion_evidence = {
  recent_concrete_triggers: 3,
  qualified_handraises: 2,
  plausible_proposals_at_published_price: 1,
  delivery_hours_deviation_pct: 0,
  margin_positive: true,
  no_forbidden_claim: true,
};
assert("valid_decision_fixture_passes", validateProductDecisions(validDecisions, protocol, validResearch, validQco).length === 0, validateProductDecisions(validDecisions, protocol, validResearch, validQco));
const inventedPromotion = structuredClone(validDecisions);
inventedPromotion.decisions[0].promotion_evidence.qualified_handraises = 99;
assert("decision_invented_promotion_evidence_fails", validateProductDecisions(inventedPromotion, protocol, validResearch, validQco).some((problem) => problem.startsWith("promotion_evidence_drift:")), validateProductDecisions(inventedPromotion, protocol, validResearch, validQco));
const wrongDecisionSet = structuredClone(validDecisions);
wrongDecisionSet.decisions[53].deliverable_id = "CFG-D99";
assert("decision_requires_exact_01_54_set", validateProductDecisions(wrongDecisionSet, protocol, validResearch, validQco).includes("product_decision_set"), validateProductDecisions(wrongDecisionSet, protocol, validResearch, validQco));

/* ---------------------------------------------------------------- 10. sem travessão */
const moduleSource = fs.readFileSync(path.join(root, "scripts/commercial/market_fit_promotion.mjs"), "utf8");
const evidenceSource = fs.readFileSync(path.join(root, "scripts/commercial/market_fit_evidence.mjs"), "utf8");
const exposureSource = fs.readFileSync(path.join(root, "scripts/commercial/market_fit_exposure_plan.mjs"), "utf8");
const EM_DASH = String.fromCharCode(0x2014);
assert("protocol_has_no_em_dash", !rawProtocol.includes(EM_DASH), "data");
assert("module_has_no_em_dash", !moduleSource.includes(EM_DASH), "module");
assert("evidence_module_has_no_em_dash", !evidenceSource.includes(EM_DASH), "evidence module");
assert("exposure_module_has_no_em_dash", !exposureSource.includes(EM_DASH), "exposure module");
assert("test_has_no_em_dash", !SELF_SOURCE.includes(EM_DASH), "test");

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ ok: false, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(1);
}
