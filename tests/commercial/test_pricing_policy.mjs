/**
 * Gate da politica de preco (#341).
 *
 * Prova, cruzando o registro comercial canonico, que:
 *  - nada esta validado enquanto nao existir willingness to pay observada;
 *  - a escada publica tem as faixas da #341, ordenadas e sem sobreposicao;
 *  - toda ancora publica e ruido direcional, nunca tabela de mercado;
 *  - as proibicoes taxativas estao explicitas;
 *  - o adicional de urgencia e 50% e so vale com capacidade confirmada;
 *  - os precos publicados e as ofertas aprovadas continuam intactos;
 *  - os vaos entre faixas estao declarados como dado, nao corrigidos por invencao.
 *
 * Le apenas artefatos que ja existem em main.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ACTIVITY_KEYS,
  calculateUnitEconomics,
  evaluateUnitEconomicsPromotion,
  hashUnitEconomicsEvent,
  validateRepositoryUnitEconomicsLedger,
  validateUnitEconomicsEvent,
  validateUnitEconomicsPromotionAggregate,
} from "../../scripts/commercial/unit_economics.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const POLICY_PATH = path.join(root, "data/commercial/pricing-policy.v1.json");
const CATALOG_PATH = path.join(root, "data/offers/catalog.snapshot.json");
const ENTREGAS_PATH = path.join(root, "entregas/index.html");
const DELIVERABLES_PATH = path.join(root, "data/commercial/deliverables-registry.v1.json");

const policyRaw = fs.readFileSync(POLICY_PATH, "utf8");
const policy = JSON.parse(policyRaw);
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
const entregasHtml = fs.readFileSync(ENTREGAS_PATH, "utf8");
const deliverablesRegistry = JSON.parse(fs.readFileSync(DELIVERABLES_PATH, "utf8"));
const ledger = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/unit-economics-ledger.v1.json"), "utf8"));
const unitEconomicsTemplate = JSON.parse(fs.readFileSync(path.join(root, "docs/commercial/unit-economics-v1/event.template.json"), "utf8"));
const promotionTemplate = JSON.parse(fs.readFileSync(path.join(root, "docs/commercial/unit-economics-v1/promotion-aggregate.template.json"), "utf8"));

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

/* ------------------------------------------------------------------ */
/* 1. Nada validado: nenhuma willingness to pay observada.             */
/* ------------------------------------------------------------------ */
assert("schema_id", policy.schema === "confenge.pricing-policy/1.0", policy.schema);
assert("issue_ref", policy.issue === "#341" && policy.parent_issue === "#329", `${policy.issue}/${policy.parent_issue}`);
assert("state_not_started", policy.state === "NOT_STARTED", policy.state);
assert("records_is_array", Array.isArray(policy.records), typeof policy.records);
assert("records_empty", Array.isArray(policy.records) && policy.records.length === 0, policy.records && policy.records.length);

const wtp = policy.willingness_to_pay_test || {};
assert("wtp_state_not_started", wtp.state === "NOT_STARTED", wtp.state);
assert("wtp_no_interviews", wtp.interviews_completed === 0, wtp.interviews_completed);
assert("wtp_no_proposals", wtp.proposals_observed === 0, wtp.proposals_observed);
assert("wtp_sample_is_20", wtp.required_interviews === 20, wtp.required_interviews);
assert(
  "acceptance_sample_matches",
  Array.isArray(policy.acceptance) &&
    policy.acceptance.some((item) => item.includes(String(wtp.required_interviews)) && item.includes("#336")),
  policy.acceptance,
);
assert(
  "no_validated_claim",
  !/"?validated"?\s*:\s*true/i.test(policyRaw) && !/\bVALIDATED\b/.test(policyRaw),
  "arquivo nao pode declarar preco validado",
);
assert("stage_is_validate_not_promote", policy.decision_state && policy.decision_state.stage === "VALIDATE", policy.decision_state);
assert(
  "reprice_needs_written_hypothesis",
  wtp.reprice_requires_written_hypothesis === true &&
    wtp.reprice_after_comparable_proposals === 3 &&
    wtp.reprice_range_pct &&
    wtp.reprice_range_pct.min === 10 &&
    wtp.reprice_range_pct.max === 15,
  wtp.reprice_range_pct,
);
assert("wtp_single_predefined_alternative", wtp.max_predefined_alternatives === 1, wtp.max_predefined_alternatives);
assert(
  "wtp_decision_states",
  Array.isArray(wtp.decision_states) &&
    ["ACEITA", "NEGOCIA", "RECUSA", "ADIA"].every((s) => wtp.decision_states.includes(s)),
  wtp.decision_states,
);
assert(
  "promotion_gate_55_over_3",
  policy.promotion_gate && policy.promotion_gate.min_pct === 55 && policy.promotion_gate.min_deliveries === 3,
  policy.promotion_gate,
);

/* ------------------------------------------------------------------ */
/* 2. Escada publica da #341: faixas, ordem e ausencia de sobreposicao.*/
/* ------------------------------------------------------------------ */
const EXPECTED_LADDER = [
  { tier_id: "entrada_factual", billing: "one_time", min_cents: 59900, max_cents: 240000 },
  { tier_id: "diagnostico_delimitado", billing: "one_time", min_cents: 290000, max_cents: 590000 },
  { tier_id: "dossie_critico", billing: "one_time", min_cents: 690000, max_cents: 790000 },
  { tier_id: "oportunidade_ou_problema_complexo", billing: "one_time", min_cents: 980000, max_cents: 1980000 },
  { tier_id: "inteligencia_estrategica", billing: "one_time", min_cents: 3980000, max_cents: 3980000 },
  { tier_id: "recorrencia_gerenciada", billing: "subscription_monthly", min_cents: 490000, max_cents: 690000 },
  { tier_id: "lideranca_fracionada", billing: "subscription_monthly", min_cents: 1250000, max_cents: 2000000 },
];

const ladder = Array.isArray(policy.ladder) ? policy.ladder : [];
assert("ladder_tier_count", ladder.length === EXPECTED_LADDER.length, ladder.length);

for (const expected of EXPECTED_LADDER) {
  const tier = ladder.find((t) => t.tier_id === expected.tier_id);
  assert(`ladder_tier_present_${expected.tier_id}`, Boolean(tier), expected.tier_id);
  if (!tier) continue;
  const band = tier.price_band || {};
  assert(
    `ladder_band_${expected.tier_id}`,
    band.min_cents === expected.min_cents && band.max_cents === expected.max_cents && band.currency === "BRL",
    band,
  );
  assert(`ladder_billing_${expected.tier_id}`, tier.billing === expected.billing, tier.billing);
  assert(`ladder_floor_le_ceiling_${expected.tier_id}`, band.min_cents <= band.max_cents, band);
  assert(
    `ladder_role_${expected.tier_id}`,
    typeof tier.role === "string" && tier.role.trim().length > 0,
    tier.role,
  );
}

const orders = ladder.map((t) => t.tier_order);
assert(
  "ladder_order_is_strict_sequence",
  orders.length === new Set(orders).size && orders.every((n, i) => n === i + 1),
  orders,
);

const billingModes = [...new Set(ladder.map((t) => t.billing))];
assert("ladder_billing_modes", billingModes.length === 2, billingModes);
for (const mode of billingModes) {
  const tiers = ladder.filter((t) => t.billing === mode).sort((a, b) => a.tier_order - b.tier_order);
  let sorted = true;
  let disjoint = true;
  for (let i = 1; i < tiers.length; i += 1) {
    const prev = tiers[i - 1].price_band;
    const cur = tiers[i].price_band;
    if (cur.min_cents <= prev.min_cents) sorted = false;
    if (cur.min_cents <= prev.max_cents) disjoint = false;
  }
  assert(`ladder_sorted_${mode}`, sorted, tiers.map((t) => t.price_band.min_cents));
  assert(`ladder_no_overlap_${mode}`, disjoint, tiers.map((t) => [t.price_band.min_cents, t.price_band.max_cents]));
}

const recorrencia = ladder.find((t) => t.tier_id === "recorrencia_gerenciada");
assert(
  "recorrencia_discrete_amounts",
  recorrencia &&
    Array.isArray(recorrencia.allowed_amounts_cents) &&
    recorrencia.allowed_amounts_cents.length === 2 &&
    recorrencia.allowed_amounts_cents[0] === 490000 &&
    recorrencia.allowed_amounts_cents[1] === 690000,
  recorrencia && recorrencia.allowed_amounts_cents,
);

/* ------------------------------------------------------------------ */
/* 3. Ancoras publicas: ruido direcional, nunca tabela de mercado.     */
/* ------------------------------------------------------------------ */
const anchors = Array.isArray(policy.public_anchors) ? policy.public_anchors : [];
assert("anchors_present", anchors.length >= 3, anchors.length);
const allowedAnchorFields = policy.public_anchor_allowed_fields || [];
assert(
  "anchor_allowed_fields_declared",
  Array.isArray(allowedAnchorFields) &&
    ["source", "url", "observation", "is_market_truth"].every((f) => allowedAnchorFields.includes(f)),
  allowedAnchorFields,
);
const FORBIDDEN_ANCHOR_KEY = /cents|amount|price|preco|valor|benchmark|compar|median|tabela|market_price|floor|ceiling|min|max/i;
anchors.forEach((anchor, index) => {
  const keys = Object.keys(anchor);
  assert(`anchor_${index}_not_market_truth`, anchor.is_market_truth === false, anchor.is_market_truth);
  assert(
    `anchor_${index}_fields_allowed`,
    keys.every((k) => allowedAnchorFields.includes(k)),
    keys,
  );
  assert(
    `anchor_${index}_no_price_field`,
    !keys.some((k) => FORBIDDEN_ANCHOR_KEY.test(k)),
    keys,
  );
  assert(
    `anchor_${index}_no_numeric_value`,
    Object.values(anchor).every((v) => typeof v !== "number"),
    keys,
  );
  assert(
    `anchor_${index}_has_url_and_observation`,
    typeof anchor.url === "string" && anchor.url.startsWith("https://") &&
      typeof anchor.observation === "string" && anchor.observation.length > 20,
    anchor.url,
  );
});
assert(
  "no_anchor_is_market_truth",
  anchors.every((a) => a.is_market_truth === false),
  anchors.map((a) => a.is_market_truth),
);
assert(
  "anchor_framing_refuses_market_table",
  typeof policy.public_anchors_framing === "string" &&
    /preço de mercado/i.test(policy.public_anchors_framing) &&
    /centavos/i.test(policy.public_anchors_framing) &&
    /comparativ/i.test(policy.public_anchors_framing),
  policy.public_anchors_framing,
);
// Nenhuma ancora pode virar limite de faixa da escada.
const ladderBounds = new Set(ladder.flatMap((t) => [t.price_band.min_cents, t.price_band.max_cents]));
const ANCHOR_CENTS = [140000, 170000, 500000, 2500000];
assert(
  "anchor_values_not_used_as_band_bounds",
  ANCHOR_CENTS.every((c) => !ladderBounds.has(c)),
  ANCHOR_CENTS.filter((c) => ladderBounds.has(c)),
);

/* ------------------------------------------------------------------ */
/* 4. Proibicoes taxativas explicitas.                                 */
/* ------------------------------------------------------------------ */
const rules = Array.isArray(policy.taxative_commercial_rules) ? policy.taxative_commercial_rules : [];
const prohibitions = Array.isArray(policy.prohibitions) ? policy.prohibitions : [];
const REQUIRED_PROHIBITIONS = ["success_fee", "silent_discount", "price_per_page", "sob_consulta_as_price"];
assert("prohibitions_count", prohibitions.length >= REQUIRED_PROHIBITIONS.length, prohibitions.length);
for (const id of REQUIRED_PROHIBITIONS) {
  const item = prohibitions.find((p) => p.id === id);
  assert(`prohibition_present_${id}`, Boolean(item), id);
  if (!item) continue;
  assert(`prohibition_is_true_${id}`, item.is_prohibited === true, item.is_prohibited);
  assert(`prohibition_has_label_${id}`, typeof item.label === "string" && item.label.trim().length > 0, item.label);
  assert(
    `prohibition_rule_is_taxative_${id}`,
    typeof item.rule === "string" && rules.includes(item.rule),
    item.rule,
  );
}
assert(
  "rule_text_success_fee",
  rules.some((r) => /comissão de êxito/i.test(r)) && rules.some((r) => /valor recuperado/i.test(r)),
  rules,
);
assert("rule_text_silent_discount", rules.some((r) => /desconto silencioso/i.test(r)), rules);
assert("rule_text_price_per_page", rules.some((r) => /preço por página/i.test(r)), rules);
assert("rule_text_sob_consulta", rules.some((r) => /sob consulta/i.test(r) && /rota/i.test(r)), rules);
assert("rule_price_frozen_after_acceptance", rules.some((r) => /nunca muda depois do aceite/i.test(r)), rules);
assert("rule_credit_no_stacking", rules.some((r) => /sem empilhar/i.test(r)), rules);
assert("rule_a_partir_de_guarded", rules.some((r) => /a partir de/i.test(r) && /unidade-base/i.test(r)), rules);

/* ------------------------------------------------------------------ */
/* 5. Urgencia: 50%, capacidade confirmada, avisada antes da cobranca. */
/* ------------------------------------------------------------------ */
const urgency = policy.urgency_surcharge || {};
assert("urgency_pct_is_50", urgency.pct === 50, urgency.pct);
assert("urgency_requires_capacity", urgency.requires_confirmed_capacity === true, urgency.requires_confirmed_capacity);
assert("urgency_requires_safety", urgency.requires_technically_safe === true, urgency.requires_technically_safe);
assert(
  "urgency_disclosed_before_charge",
  urgency.requires_disclosure_before_charge === true,
  urgency.requires_disclosure_before_charge,
);
assert(
  "urgency_rule_is_taxative",
  typeof urgency.rule === "string" && rules.includes(urgency.rule) && /50%/.test(urgency.rule),
  urgency.rule,
);

/* ------------------------------------------------------------------ */
/* 6. Precos publicados e ofertas aprovadas continuam intactos.        */
/* ------------------------------------------------------------------ */
assert(
  "policy_does_not_reprice",
  policy.repricing_effect &&
    policy.repricing_effect.changes_published_prices === false &&
    policy.repricing_effect.changes_approved_offer_amounts === false,
  policy.repricing_effect,
);

const cross = policy.catalog_cross_check || {};
assert(
  "cross_check_targets_existing_files",
  Array.isArray(cross.checked_against) &&
    cross.checked_against.includes("data/offers/catalog.snapshot.json") &&
    cross.checked_against.includes("entregas/index.html") &&
    cross.checked_against.every((rel) => fs.existsSync(path.join(root, rel))),
  cross.checked_against,
);

const EXPECTED_PUBLISHED = ["599", "690", "890", "1.200", "1.450", "1.900", "2.400", "3.750"];
const htmlPrices = [...entregasHtml.matchAll(/<td[^>]*><strong>R\$\s*([\d.]+)<\/strong><\/td>/g)].map((m) => m[1]);
assert("entregas_has_eight_prices", htmlPrices.length === 8, htmlPrices);
assert(
  "entregas_prices_unchanged",
  JSON.stringify(htmlPrices) === JSON.stringify(EXPECTED_PUBLISHED),
  htmlPrices,
);
const htmlCents = htmlPrices.map((p) => Math.round(Number(p.replace(/\./g, "")) * 100));
assert(
  "policy_mirrors_published_prices",
  JSON.stringify(cross.published_unit_prices_cents) === JSON.stringify(htmlCents),
  { policy: cross.published_unit_prices_cents, html: htmlCents },
);
assert(
  "policy_display_matches_published",
  Array.isArray(cross.published_unit_prices_display) &&
    cross.published_unit_prices_display.length === 8 &&
    cross.published_unit_prices_display.every((d, i) => d === `R$ ${EXPECTED_PUBLISHED[i]}`),
  cross.published_unit_prices_display,
);
assert(
  "published_prices_visible_in_page",
  EXPECTED_PUBLISHED.every((p) => entregasHtml.includes(`R$ ${p}`)),
  EXPECTED_PUBLISHED,
);

const oneTimeTiers = ladder.filter((t) => t.billing === "one_time");
const inSomeOneTimeTier = (cents) =>
  oneTimeTiers.some((t) => cents >= t.price_band.min_cents && cents <= t.price_band.max_cents);
assert(
  "published_prices_covered_by_ladder",
  htmlCents.every((c) => inSomeOneTimeTier(c)),
  htmlCents.filter((c) => !inSomeOneTimeTier(c)),
);

const snapshotOffers = catalog.offers || [];
assert("snapshot_offer_count", snapshotOffers.length === 4, snapshotOffers.length);
const declaredOffers = cross.approved_offers || [];
assert("cross_covers_all_offers", declaredOffers.length === snapshotOffers.length, declaredOffers.length);
for (const offer of snapshotOffers) {
  const declared = declaredOffers.find((d) => d.offer_id === offer.offer_id);
  assert(`offer_declared_${offer.offer_id}`, Boolean(declared), offer.offer_id);
  if (!declared) continue;
  assert(
    `offer_amount_unchanged_${offer.offer_id}`,
    declared.amount_cents === offer.amount_cents,
    { policy: declared.amount_cents, snapshot: offer.amount_cents },
  );
  assert(
    `offer_billing_unchanged_${offer.offer_id}`,
    declared.billing_mode === offer.billing_mode,
    { policy: declared.billing_mode, snapshot: offer.billing_mode },
  );
  assert(`offer_status_approved_${offer.offer_id}`, offer.status === "APPROVED", offer.status);
}
// Nenhum offer_id pode receber preco fora do bloco de conferencia.
const withoutCross = { ...policy };
delete withoutCross.catalog_cross_check;
assert(
  "no_offer_price_outside_cross_check",
  !/CFG-(DIAG|DIRB2G)/.test(JSON.stringify(withoutCross)),
  "offer_id so pode aparecer em catalog_cross_check",
);

for (const declared of declaredOffers) {
  if (declared.ladder_status !== "IN_TIER") continue;
  const tier = ladder.find((t) => t.tier_id === declared.ladder_tier_id);
  assert(`offer_tier_exists_${declared.offer_id}`, Boolean(tier), declared.ladder_tier_id);
  if (!tier) continue;
  assert(
    `offer_inside_tier_${declared.offer_id}`,
    declared.amount_cents >= tier.price_band.min_cents && declared.amount_cents <= tier.price_band.max_cents,
    { amount: declared.amount_cents, band: tier.price_band },
  );
}

/* ------------------------------------------------------------------ */
/* 7. Vaos entre faixas declarados como dado, nao corrigidos.          */
/* ------------------------------------------------------------------ */
const computedGaps = [];
for (const mode of billingModes) {
  const tiers = ladder.filter((t) => t.billing === mode).sort((a, b) => a.price_band.min_cents - b.price_band.min_cents);
  for (let i = 1; i < tiers.length; i += 1) {
    const prev = tiers[i - 1];
    const cur = tiers[i];
    if (cur.price_band.min_cents > prev.price_band.max_cents + 1) {
      computedGaps.push({
        billing: mode,
        below_tier_id: prev.tier_id,
        above_tier_id: cur.tier_id,
        gap_above_cents: prev.price_band.max_cents,
        gap_below_cents: cur.price_band.min_cents,
      });
    }
  }
}
const declaredGaps = Array.isArray(policy.declared_band_gaps) ? policy.declared_band_gaps : [];
const normalize = (list) =>
  list
    .map((g) => `${g.billing}|${g.below_tier_id}|${g.above_tier_id}|${g.gap_above_cents}|${g.gap_below_cents}`)
    .sort();
assert("gaps_exist", computedGaps.length > 0, computedGaps.length);
assert(
  "every_gap_is_declared",
  JSON.stringify(normalize(declaredGaps)) === JSON.stringify(normalize(computedGaps)),
  { declared: normalize(declaredGaps), computed: normalize(computedGaps) },
);
assert(
  "declared_gaps_have_display",
  declaredGaps.every((g) => typeof g.display === "string" && g.display.includes("R$")),
  declaredGaps.map((g) => g.display),
);
assert(
  "gap_note_refuses_invention",
  typeof policy.band_gaps_note === "string" &&
    /vão|vãos/i.test(policy.band_gaps_note) &&
    /invenção/i.test(policy.band_gaps_note) &&
    /fundador/i.test(policy.band_gaps_note),
  policy.band_gaps_note,
);

const diag = declaredOffers.find((d) => d.offer_id === "CFG-DIAG-EXP-v1");
assert("diag_declared", Boolean(diag), "CFG-DIAG-EXP-v1");
if (diag) {
  assert("diag_is_8000", diag.amount_cents === 800000, diag.amount_cents);
  assert("diag_between_tiers", diag.ladder_status === "BETWEEN_TIERS", diag.ladder_status);
  assert("diag_has_no_invented_tier", diag.ladder_tier_id === null, diag.ladder_tier_id);
  assert(
    "diag_not_inside_any_tier",
    !ladder.some(
      (t) =>
        t.billing === "one_time" &&
        diag.amount_cents >= t.price_band.min_cents &&
        diag.amount_cents <= t.price_band.max_cents,
    ),
    diag.amount_cents,
  );
  const hostGap = declaredGaps.find(
    (g) => diag.amount_cents > g.gap_above_cents && diag.amount_cents < g.gap_below_cents,
  );
  assert("diag_sits_in_declared_gap", Boolean(hostGap), hostGap || declaredGaps);
  assert(
    "diag_gap_is_7900_to_9800",
    hostGap && hostGap.gap_above_cents === 790000 && hostGap.gap_below_cents === 980000,
    hostGap,
  );
  assert(
    "diag_note_states_the_gap",
    typeof diag.note === "string" && diag.note.includes("8.000") && diag.note.includes("7.900") && diag.note.includes("9.800"),
    diag.note,
  );
}

const gapExceptions = Array.isArray(policy.pilot_gap_exceptions) ? policy.pilot_gap_exceptions : [];
assert("only_declared_pilot_gap_exception", gapExceptions.length === 1, gapExceptions);
const gapExceptionKeys = new Set(
  gapExceptions.map((entry) => `${entry.deliverable_id}|${entry.price_tier}|${entry.amount_cents}|${entry.billing}`),
);
const unclassifiedPrices = [];
for (const deliverable of deliverablesRegistry.deliverables) {
  const prices = deliverable.price.tiers
    ? deliverable.price.tiers.map((tier) => ({ tier: tier.tier, amount: tier.amount_cents }))
    : [{ tier: "base", amount: deliverable.price.amount_cents }];
  for (const additional of deliverable.price.additional_units || []) {
    prices.push({ tier: additional.label, amount: additional.amount_cents });
  }
  for (const price of prices) {
    const inLadder = ladder.some((tier) =>
      tier.billing === deliverable.price.billing &&
      (Array.isArray(tier.allowed_amounts_cents)
        ? tier.allowed_amounts_cents.includes(price.amount)
        : price.amount >= tier.price_band.min_cents && price.amount <= tier.price_band.max_cents),
    );
    const exceptionKey = `${deliverable.deliverable_id}|${price.tier}|${price.amount}|${deliverable.price.billing}`;
    if (!inLadder && !gapExceptionKeys.has(exceptionKey)) unclassifiedPrices.push(exceptionKey);
  }
}
assert("every_catalog_price_is_in_ladder_or_named_exception", unclassifiedPrices.length === 0, unclassifiedPrices);
const d49 = deliverablesRegistry.deliverables.find((entry) => entry.deliverable_id === "CFG-D49");
const d49Exception = gapExceptions[0];
assert(
  "d49_extenso_exception_is_authoritative_and_unpromoted",
  d49Exception?.deliverable_id === "CFG-D49" &&
    d49Exception?.price_tier === "extenso" &&
    d49Exception?.amount_cents === 2480000 &&
    d49Exception?.source_issue === d49?.source_issue &&
    d49Exception?.state === d49?.price_state &&
    d49?.price.tiers?.some((tier) => tier.tier === "extenso" && tier.amount_cents === d49Exception.amount_cents),
  { exception: d49Exception, deliverable: d49 },
);
assert(
  "d49_exception_sits_in_declared_gap",
  declaredGaps.some((gap) =>
    gap.billing === d49Exception?.billing &&
    d49Exception.amount_cents > gap.gap_above_cents &&
    d49Exception.amount_cents < gap.gap_below_cents),
  d49Exception,
);

/* ------------------------------------------------------------------ */
/* 8. Ledger operacional sem fabricar entrega ou custo real.           */
/* ------------------------------------------------------------------ */
const implementation = policy.unit_economics_implementation || {};
assert(
  "unit_economics_artifacts_declared",
  implementation.ledger === "data/commercial/unit-economics-ledger.v1.json" &&
    implementation.calculator === "scripts/commercial/unit_economics.mjs" &&
    implementation.event_template === "docs/commercial/unit-economics-v1/event.template.json" &&
    implementation.promotion_template === "docs/commercial/unit-economics-v1/promotion-aggregate.template.json" &&
    implementation.terms_authority === "data/offers/governance-authority-pin.json#terms_version",
  implementation,
);
assert(
  "unit_economics_stays_private",
  implementation.storage_authority === "private_finance_store" &&
    implementation.commercial_decision_owner === "warmbly" &&
    implementation.source === "CONFENGE_WEB" &&
    implementation.public_surface === false &&
    implementation.sensitive_values_in_repository === false &&
    implementation.promotion_automation === false,
  implementation,
);
assert(
  "ledger_has_no_fabricated_records",
  ledger.schema === "confenge.unit-economics-ledger/1.0" &&
    ledger.state === "NOT_STARTED" &&
    ledger.contains_sensitive_values === false &&
    Array.isArray(ledger.records) && ledger.records.length === 0 &&
    Array.isArray(ledger.rollups) && ledger.rollups.length === 0 &&
    Array.isArray(ledger.governance_decisions) && ledger.governance_decisions.length === 0,
  ledger,
);
assert(
  "repository_ledger_contract_is_strict",
  validateRepositoryUnitEconomicsLedger(ledger).length === 0,
  validateRepositoryUnitEconomicsLedger(ledger),
);
const ledgerWithPii = structuredClone(ledger);
ledgerWithPii.records_note = "Contato proibido@example.invalid não pode entrar no artefato versionado.";
assert(
  "repository_ledger_rejects_pii_values",
  validateRepositoryUnitEconomicsLedger(ledgerWithPii).some((problem) => problem.startsWith("forbidden_value:")),
  validateRepositoryUnitEconomicsLedger(ledgerWithPii),
);
assert(
  "event_template_is_safe_and_valid",
  validateUnitEconomicsEvent(unitEconomicsTemplate, policy, deliverablesRegistry).length === 0,
  validateUnitEconomicsEvent(unitEconomicsTemplate, policy, deliverablesRegistry),
);
assert(
  "promotion_template_is_safe_and_valid",
  validateUnitEconomicsPromotionAggregate(promotionTemplate, [], policy, deliverablesRegistry).length === 0,
  validateUnitEconomicsPromotionAggregate(promotionTemplate, [], policy, deliverablesRegistry),
);
assert(
  "activity_contract_is_complete",
  JSON.stringify(Object.keys(unitEconomicsTemplate.activity_hours).sort()) === JSON.stringify([...ACTIVITY_KEYS].sort()),
  Object.keys(unitEconomicsTemplate.activity_hours),
);

function fixtureEvent(id = "UE-CFG-D01-001") {
  const activityHours = Object.fromEntries(ACTIVITY_KEYS.map((key) => [key, { estimated_hours: 0, actual_hours: 0 }]));
  activityHours.analysis = { estimated_hours: 3, actual_hours: 2 };
  activityHours.technical_review_qa = { estimated_hours: 1, actual_hours: 1 };
  const event = {
    schema: "confenge.unit-economics-event/1.0",
    template: false,
    state: "DELIVERED",
    event_id: id,
    deliverable_id: "CFG-D01",
    scope_version: "v1",
    price_version: policy.policy_version,
    terms_version: "CFG-TERMS-B2B-2026-08-17-v1",
    source: "CONFENGE_WEB",
    source_record_hash: null,
    delivered_at: "2026-08-08",
    pricing: {
      currency: "BRL",
      price_tier: "base",
      list_price_cents: 59900,
      displayed_price_cents: 59900,
      accepted_price_cents: 59900,
      recognized_revenue_cents: 59900,
      accepted_at: "2026-08-01",
      payment_state: "PAID",
      paid_at: "2026-08-10",
      urgency: {
        applied: false,
        capacity_confirmed: false,
        technically_safe: false,
        disclosed_before_charge: false,
      },
      predefined_alternative: null,
    },
    hours_by_seniority: [
      { role: "analista_senior", estimated_hours: 3, actual_hours: 2, direct_hour_cost_cents: 6000 },
      { role: "revisor_tecnico", estimated_hours: 1, actual_hours: 1, direct_hour_cost_cents: 8000 },
    ],
    activity_hours: activityHours,
    direct_costs: {
      data_sources_and_cleaning_cents: 1000,
      attributable_commercial_acquisition_cents: 500,
      other_direct_cents: 0,
    },
    calculated: null,
    delivery_quality: { rework_hours: 0, qa_state: "PASS" },
    reusable_asset: { kind: "modelo_priorizacao", observed_reuse_count: 0, observed_hours_saved: 0 },
    outcome: { state: "UNKNOWN", category: "UNKNOWN", observed_at: null },
  };
  event.calculated = calculateUnitEconomics(event);
  event.source_record_hash = hashUnitEconomicsEvent(event);
  return event;
}

const validEvent = fixtureEvent();
assert(
  "real_event_calculation_is_reconciled",
  validateUnitEconomicsEvent(validEvent, policy, deliverablesRegistry).length === 0 &&
    validEvent.calculated.direct_cost_total_cents === 21500 &&
    validEvent.calculated.contribution_cents === 38400 &&
    validEvent.calculated.contribution_margin_pct === 64.11 &&
    validEvent.calculated.days_to_cash === 9,
  validEvent.calculated,
);
const activityDrift = structuredClone(validEvent);
activityDrift.activity_hours.analysis.actual_hours = 1;
assert(
  "activity_drift_fails_closed",
  validateUnitEconomicsEvent(activityDrift, policy, deliverablesRegistry).includes("activity_hours_do_not_reconcile"),
  validateUnitEconomicsEvent(activityDrift, policy, deliverablesRegistry),
);
const silentDiscount = structuredClone(validEvent);
silentDiscount.pricing.accepted_price_cents = 50000;
silentDiscount.pricing.recognized_revenue_cents = 50000;
silentDiscount.calculated = calculateUnitEconomics(silentDiscount);
assert(
  "silent_discount_fails_closed",
  validateUnitEconomicsEvent(silentDiscount, policy, deliverablesRegistry).includes("silent_discount_or_unversioned_alternative"),
  validateUnitEconomicsEvent(silentDiscount, policy, deliverablesRegistry),
);
const unsafeUrgency = structuredClone(validEvent);
unsafeUrgency.pricing.urgency.applied = true;
unsafeUrgency.pricing.displayed_price_cents = 89850;
unsafeUrgency.pricing.accepted_price_cents = 89850;
unsafeUrgency.pricing.recognized_revenue_cents = 89850;
unsafeUrgency.calculated = calculateUnitEconomics(unsafeUrgency);
assert(
  "unsafe_urgency_fails_closed",
  validateUnitEconomicsEvent(unsafeUrgency, policy, deliverablesRegistry).includes("unsafe_or_hidden_urgency"),
  validateUnitEconomicsEvent(unsafeUrgency, policy, deliverablesRegistry),
);
const withPii = structuredClone(validEvent);
withPii.contact_email = "proibido@example.invalid";
assert(
  "pii_key_fails_closed",
  validateUnitEconomicsEvent(withPii, policy, deliverablesRegistry).some((problem) => problem.startsWith("forbidden_key:")),
  validateUnitEconomicsEvent(withPii, policy, deliverablesRegistry),
);
const calculationDrift = structuredClone(validEvent);
calculationDrift.calculated.direct_cost_total_cents += 1;
assert(
  "calculation_drift_fails_closed",
  validateUnitEconomicsEvent(calculationDrift, policy, deliverablesRegistry).includes("calculated_drift:direct_cost_total_cents"),
  validateUnitEconomicsEvent(calculationDrift, policy, deliverablesRegistry),
);
const unknownField = structuredClone(validEvent);
unknownField.notes = "campo não contratado";
assert(
  "unknown_event_field_fails_closed",
  validateUnitEconomicsEvent(unknownField, policy, deliverablesRegistry).includes("keys:event"),
  validateUnitEconomicsEvent(unknownField, policy, deliverablesRegistry),
);
const piiInAllowedValue = structuredClone(validEvent);
piiInAllowedValue.reusable_asset.kind = "modelo_proibido@example.invalid";
assert(
  "pii_value_fails_closed",
  validateUnitEconomicsEvent(piiInAllowedValue, policy, deliverablesRegistry).some((problem) => problem.startsWith("forbidden_value:")),
  validateUnitEconomicsEvent(piiInAllowedValue, policy, deliverablesRegistry),
);
const fabricatedTemplate = structuredClone(unitEconomicsTemplate);
fabricatedTemplate.direct_costs.other_direct_cents = 0;
assert(
  "template_cannot_hide_measurements",
  validateUnitEconomicsEvent(fabricatedTemplate, policy, deliverablesRegistry).includes("template_claims_execution"),
  validateUnitEconomicsEvent(fabricatedTemplate, policy, deliverablesRegistry),
);
const scopeDrift = structuredClone(validEvent);
scopeDrift.scope_version = "v999";
assert(
  "scope_version_must_match_registry",
  validateUnitEconomicsEvent(scopeDrift, policy, deliverablesRegistry).includes("scope_version"),
  validateUnitEconomicsEvent(scopeDrift, policy, deliverablesRegistry),
);
const priceVersionDrift = structuredClone(validEvent);
priceVersionDrift.price_version = "CFG-PRICING-INVENTED-v1";
assert(
  "price_version_must_match_policy",
  validateUnitEconomicsEvent(priceVersionDrift, policy, deliverablesRegistry).includes("price_version"),
  validateUnitEconomicsEvent(priceVersionDrift, policy, deliverablesRegistry),
);
const impossibleDate = structuredClone(validEvent);
impossibleDate.pricing.accepted_at = "2026-02-31";
assert(
  "calendar_dates_fail_closed",
  validateUnitEconomicsEvent(impossibleDate, policy, deliverablesRegistry).includes("payment_state"),
  validateUnitEconomicsEvent(impossibleDate, policy, deliverablesRegistry),
);
const estimatedDrift = structuredClone(validEvent);
estimatedDrift.activity_hours.analysis.estimated_hours = 2;
assert(
  "estimated_activity_hours_must_reconcile",
  validateUnitEconomicsEvent(estimatedDrift, policy, deliverablesRegistry).includes("activity_estimated_hours_do_not_reconcile"),
  validateUnitEconomicsEvent(estimatedDrift, policy, deliverablesRegistry),
);
const reworkDrift = structuredClone(validEvent);
reworkDrift.delivery_quality.rework_hours = 1;
assert(
  "rework_hours_must_reconcile",
  validateUnitEconomicsEvent(reworkDrift, policy, deliverablesRegistry).includes("rework_hours_do_not_reconcile"),
  validateUnitEconomicsEvent(reworkDrift, policy, deliverablesRegistry),
);
const unpaidEvent = structuredClone(validEvent);
unpaidEvent.pricing.payment_state = "UNPAID";
unpaidEvent.pricing.recognized_revenue_cents = 0;
unpaidEvent.pricing.paid_at = null;
unpaidEvent.calculated = calculateUnitEconomics(unpaidEvent);
unpaidEvent.source_record_hash = hashUnitEconomicsEvent(unpaidEvent);
assert(
  "delivered_unpaid_event_is_recorded_honestly",
  validateUnitEconomicsEvent(unpaidEvent, policy, deliverablesRegistry).length === 0 && unpaidEvent.calculated.days_to_cash === null,
  validateUnitEconomicsEvent(unpaidEvent, policy, deliverablesRegistry),
);
const additionalUnitAsBase = structuredClone(validEvent);
additionalUnitAsBase.event_id = "UE-CFG-D40-001";
additionalUnitAsBase.deliverable_id = "CFG-D40";
additionalUnitAsBase.pricing.list_price_cents = 490000;
additionalUnitAsBase.pricing.displayed_price_cents = 490000;
additionalUnitAsBase.pricing.accepted_price_cents = 490000;
additionalUnitAsBase.pricing.recognized_revenue_cents = 490000;
additionalUnitAsBase.calculated = calculateUnitEconomics(additionalUnitAsBase);
assert(
  "additional_unit_cannot_masquerade_as_base_price",
  validateUnitEconomicsEvent(additionalUnitAsBase, policy, deliverablesRegistry).includes("list_price_not_in_registry"),
  validateUnitEconomicsEvent(additionalUnitAsBase, policy, deliverablesRegistry),
);

const qualifyingEvents = [fixtureEvent("UE-CFG-D01-001"), fixtureEvent("UE-CFG-D01-002"), fixtureEvent("UE-CFG-D01-003")];
qualifyingEvents.forEach((event) => {
  event.outcome = { state: "OBSERVED", category: "POSITIVE", observed_at: "2026-08-20" };
  event.source_record_hash = hashUnitEconomicsEvent(event);
});
assert(
  "promotion_needs_three_observed_deliveries",
  evaluateUnitEconomicsPromotion(qualifyingEvents.slice(0, 2), policy, deliverablesRegistry).eligible === false &&
    evaluateUnitEconomicsPromotion(qualifyingEvents, policy, deliverablesRegistry).eligible === true,
  evaluateUnitEconomicsPromotion(qualifyingEvents, policy, deliverablesRegistry),
);
const promotionEvaluation = evaluateUnitEconomicsPromotion(qualifyingEvents, policy, deliverablesRegistry);
const promotionAggregate = {
  schema: "confenge.unit-economics-promotion-aggregate/1.0",
  template: false,
  state: "MEASURED",
  run_id: "UEP-CFG-D01-001",
  deliverable_id: "CFG-D01",
  scope_version: "v1",
  price_version: policy.policy_version,
  terms_version: "CFG-TERMS-B2B-2026-08-17-v1",
  price_tier: "base",
  observed_deliveries: promotionEvaluation.observed_deliveries,
  deliveries_at_or_above_margin: promotionEvaluation.deliveries_at_or_above_margin,
  minimum_margin_pct: promotionEvaluation.minimum_margin_pct,
  minimum_deliveries: promotionEvaluation.minimum_deliveries,
  governance_override: promotionEvaluation.governance_override,
  governance_decision_id: null,
  eligible: promotionEvaluation.eligible,
  comparable: promotionEvaluation.comparable,
  invalid_events: promotionEvaluation.invalid_events,
  generated_at: "2026-08-25",
  source_event_hashes: qualifyingEvents.map((event) => event.source_record_hash),
};
assert(
  "promotion_aggregate_reconciles_source_events",
  validateUnitEconomicsPromotionAggregate(promotionAggregate, qualifyingEvents, policy, deliverablesRegistry).length === 0,
  validateUnitEconomicsPromotionAggregate(promotionAggregate, qualifyingEvents, policy, deliverablesRegistry),
);
const inventedPromotionHash = structuredClone(promotionAggregate);
inventedPromotionHash.source_event_hashes[0] = `sha256:${"0".repeat(64)}`;
assert(
  "promotion_aggregate_rejects_invented_hash",
  validateUnitEconomicsPromotionAggregate(inventedPromotionHash, qualifyingEvents, policy, deliverablesRegistry).includes("promotion_source_event_hashes"),
  validateUnitEconomicsPromotionAggregate(inventedPromotionHash, qualifyingEvents, policy, deliverablesRegistry),
);
assert(
  "duplicate_event_ids_do_not_count_as_three_deliveries",
  evaluateUnitEconomicsPromotion([qualifyingEvents[0], qualifyingEvents[0], qualifyingEvents[0]], policy, deliverablesRegistry).eligible === false,
  evaluateUnitEconomicsPromotion([qualifyingEvents[0], qualifyingEvents[0], qualifyingEvents[0]], policy, deliverablesRegistry),
);
const otherDeliverable = structuredClone(qualifyingEvents[2]);
otherDeliverable.event_id = "UE-CFG-D02-001";
otherDeliverable.deliverable_id = "CFG-D02";
otherDeliverable.pricing.list_price_cents = 69000;
otherDeliverable.pricing.displayed_price_cents = 69000;
otherDeliverable.pricing.accepted_price_cents = 69000;
otherDeliverable.pricing.recognized_revenue_cents = 69000;
otherDeliverable.calculated = calculateUnitEconomics(otherDeliverable);
otherDeliverable.source_record_hash = hashUnitEconomicsEvent(otherDeliverable);
const mixedPromotion = evaluateUnitEconomicsPromotion([qualifyingEvents[0], qualifyingEvents[1], otherDeliverable], policy, deliverablesRegistry);
assert(
  "different_deliverables_are_not_comparable",
  mixedPromotion.eligible === false && mixedPromotion.comparable === false,
  mixedPromotion,
);
const forgedMarginEvents = qualifyingEvents.map((event, index) => {
  const forged = structuredClone(event);
  forged.event_id = `UE-CFG-D01-FORGED-${index + 1}`;
  forged.calculated.contribution_margin_pct = 99;
  return forged;
});
const forgedPromotion = evaluateUnitEconomicsPromotion(forgedMarginEvents, policy, deliverablesRegistry);
assert(
  "promotion_revalidates_source_events",
  forgedPromotion.eligible === false && forgedPromotion.invalid_events === 3,
  forgedPromotion,
);
const unknownOutcomeEvents = [fixtureEvent("UE-CFG-D01-U01"), fixtureEvent("UE-CFG-D01-U02"), fixtureEvent("UE-CFG-D01-U03")];
assert(
  "unknown_outcomes_do_not_promote",
  evaluateUnitEconomicsPromotion(unknownOutcomeEvents, policy, deliverablesRegistry).eligible === false,
  evaluateUnitEconomicsPromotion(unknownOutcomeEvents, policy, deliverablesRegistry),
);
const governanceDecision = {
  explicit: true,
  decision_id: "GOV-CFG-D01-001",
  decided_by_role: "GOVERNANCE_APPROVER",
  deliverable_id: "CFG-D01",
  scope_version: "v1",
  price_version: policy.policy_version,
  terms_version: "CFG-TERMS-B2B-2026-08-17-v1",
  price_tier: "base",
  subject: "SCOPE",
  action: "CHANGE_SCOPE",
  rationale: "Reduzir escopo para preservar a capacidade e a qualidade técnica.",
  decided_at: "2026-08-25",
};
const governanceEvaluation = evaluateUnitEconomicsPromotion([], policy, deliverablesRegistry, governanceDecision);
assert("explicit_governance_decision_can_override", governanceEvaluation.eligible === true, governanceEvaluation);
const governanceAggregate = {
  ...promotionAggregate,
  run_id: "UEP-CFG-D01-GOVERNANCE-001",
  observed_deliveries: 0,
  deliveries_at_or_above_margin: 0,
  governance_override: true,
  governance_decision_id: governanceDecision.decision_id,
  eligible: true,
  comparable: true,
  invalid_events: 0,
  source_event_hashes: [],
};
assert(
  "governance_aggregate_is_bound_to_decision_scope",
  validateUnitEconomicsPromotionAggregate(governanceAggregate, [], policy, deliverablesRegistry, governanceDecision).length === 0,
  validateUnitEconomicsPromotionAggregate(governanceAggregate, [], policy, deliverablesRegistry, governanceDecision),
);
const governanceScopeDrift = { ...governanceAggregate, deliverable_id: "CFG-D02" };
assert(
  "governance_scope_drift_fails_closed",
  validateUnitEconomicsPromotionAggregate(governanceScopeDrift, [], policy, deliverablesRegistry, governanceDecision).includes("promotion_governance_scope"),
  validateUnitEconomicsPromotionAggregate(governanceScopeDrift, [], policy, deliverablesRegistry, governanceDecision),
);
assert(
  "weak_governance_note_does_not_override",
  evaluateUnitEconomicsPromotion([], policy, deliverablesRegistry, {
    explicit: true,
    decision_id: "GOV-CFG-D01-002",
    decided_by_role: "GOVERNANCE_APPROVER",
    deliverable_id: "CFG-D01",
    scope_version: "v1",
    price_version: policy.policy_version,
    terms_version: "CFG-TERMS-B2B-2026-08-17-v1",
    price_tier: "base",
    subject: "PRICE",
    action: "KEEP",
    rationale: "ajustar",
    decided_at: "2026-08-25",
  }).eligible === false,
  "short rationale",
);

/* ------------------------------------------------------------------ */
/* 9. Higiene: sem travessao, sem dependencia de arquivo ausente.      */
/* ------------------------------------------------------------------ */
const selfRaw = fs.readFileSync(path.join(__dirname, "test_pricing_policy.mjs"), "utf8");
const unitEconomicsRaw = fs.readFileSync(path.join(root, "scripts/commercial/unit_economics.mjs"), "utf8");
// Travessao e meia-risca montados por codigo, para que o proprio teste nao os contenha.
const DASH_RE = new RegExp("[" + String.fromCharCode(8212, 8211) + "]");
assert("policy_has_no_em_dash", !DASH_RE.test(policyRaw), "travessao proibido no JSON");
assert("test_has_no_em_dash", !DASH_RE.test(selfRaw), "travessao proibido no teste");
assert("unit_economics_has_no_em_dash", !DASH_RE.test(unitEconomicsRaw), "travessao proibido no modulo");
const referencedPaths = [...policyRaw.matchAll(/"((?:data|docs|tests|entregas|scripts)\/[A-Za-z0-9._\/-]+)"/g)].map((m) => m[1]);
const missing = referencedPaths.filter((rel) => !fs.existsSync(path.join(root, rel)));
assert("no_missing_referenced_file", missing.length === 0, missing);

const failed = results.filter((r) => !r.ok);
console.log(`pricing-policy: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error(JSON.stringify({ ok: false, failed: failed.map((f) => f.name) }, null, 2));
  process.exit(1);
}
