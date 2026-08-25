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
import { fileURLToPath } from "url";
import { evaluatePromotion } from "../../scripts/commercial/market_fit_promotion.mjs";

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

/* ---------------------------------------------------------------- 4. fase 3, decisão unitária */
const offers = p3.founder_led_offers;
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
assert("verbatim_reason_required", p3.decision_reason_verbatim_required === true, p3);
assert("record_fields_include_verbatim_reason", p3.record_fields.includes("motivo literal"), p3.record_fields);
assert("record_fields_include_outcome_unknown", p3.record_fields.some((f) => /UNKNOWN/.test(f)), p3.record_fields);
assert("record_fields_nine", p3.record_fields.length === 9, p3.record_fields.length);
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
const publishedCents = [...entregasHtml.matchAll(/<td><strong>R\$\s*([\d.,]+)<\/strong><\/td>/g)].map((m) => labelToCents(m[1]));
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

/* ---------------------------------------------------------------- 9. sem travessão */
const moduleSource = fs.readFileSync(path.join(root, "scripts/commercial/market_fit_promotion.mjs"), "utf8");
const EM_DASH = String.fromCharCode(0x2014);
assert("protocol_has_no_em_dash", !rawProtocol.includes(EM_DASH), "data");
assert("module_has_no_em_dash", !moduleSource.includes(EM_DASH), "module");
assert("test_has_no_em_dash", !SELF_SOURCE.includes(EM_DASH), "test");

const failed = results.filter((r) => !r.ok);
console.log(`${NAME}: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ ok: false, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(1);
}
