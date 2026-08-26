#!/usr/bin/env node

/**
 * Cálculo e validação de unit economics por entrega (#341).
 *
 * O módulo não persiste dados. Eventos reais e taxas internas ficam no store
 * financeiro privado; o repositório contém somente contrato e templates.
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const termsAuthorityPath = path.join(root, "data/offers/governance-authority-pin.json");
const TERMS_VERSION = JSON.parse(fs.readFileSync(termsAuthorityPath, "utf8")).terms_version;
const ACTIVITY_KEYS = [
  "acquisition_cleaning_data",
  "analysis",
  "technical_review_qa",
  "management_meetings_revisions",
  "rework",
  "urgency_capacity",
  "idle_capacity",
];
const ALTERNATIVES = new Set(["escopo_menor", "prazo_normal", "step_up"]);
const FORBIDDEN_KEY = /(^|_)(nome|name|email|e_mail|telefone|phone|whatsapp|cnpj|cpf|empresa|company|contato|contact|client_id|lead_id)($|_)/i;
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DOCUMENT_VALUE = /\b(?:\d{11}|\d{14}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/;
const PHONE_VALUE = /(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]\d{4}/;
const EVENT_KEYS = [
  "schema", "template", "state", "event_id", "deliverable_id", "scope_version", "price_version",
  "terms_version", "source", "source_record_hash", "delivered_at", "pricing", "hours_by_seniority", "activity_hours",
  "direct_costs", "calculated", "delivery_quality", "reusable_asset", "outcome",
];
const PRICING_KEYS = [
  "currency", "price_tier", "list_price_cents", "displayed_price_cents", "accepted_price_cents",
  "recognized_revenue_cents", "accepted_at", "payment_state", "paid_at", "urgency", "predefined_alternative",
];
const URGENCY_KEYS = ["applied", "capacity_confirmed", "technically_safe", "disclosed_before_charge"];
const ALTERNATIVE_KEYS = ["kind", "version", "defined_at", "reason", "price_cents"];
const HOUR_KEYS = ["role", "estimated_hours", "actual_hours", "direct_hour_cost_cents"];
const ACTIVITY_ROW_KEYS = ["estimated_hours", "actual_hours"];
const DIRECT_COST_KEYS = [
  "data_sources_and_cleaning_cents", "attributable_commercial_acquisition_cents", "other_direct_cents",
];
const CALCULATED_KEYS = [
  "estimated_hours_total", "actual_hours_total", "labor_cost_cents", "non_labor_direct_cost_cents",
  "direct_cost_total_cents", "contribution_cents", "contribution_margin_pct", "days_to_cash",
];
const PROMOTION_KEYS = [
  "schema", "template", "state", "run_id", "deliverable_id", "scope_version", "price_version",
  "terms_version", "price_tier", "observed_deliveries", "deliveries_at_or_above_margin",
  "minimum_margin_pct", "minimum_deliveries", "governance_override", "governance_decision_id", "eligible",
  "comparable", "invalid_events", "generated_at", "source_event_hashes",
];
const LEDGER_KEYS = [
  "schema", "ledger_version", "issue", "state", "storage_authority", "repository_role",
  "public_surface", "contains_sensitive_values", "source", "records", "rollups", "governance_decisions", "records_note",
];

const roundMoney = (value) => Math.round(Number(value));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const nonNegative = (value) => finite(value) && value >= 0;

function walkKeys(value, prefix = "") {
  const findings = [];
  if (Array.isArray(value)) value.forEach((item, index) => findings.push(...walkKeys(item, `${prefix}[${index}]`)));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const location = prefix ? `${prefix}.${key}` : key;
      if (FORBIDDEN_KEY.test(key)) findings.push(`forbidden_key:${location}`);
      findings.push(...walkKeys(item, location));
    }
  }
  return findings;
}

function walkSensitiveValues(value, prefix = "") {
  const findings = [];
  if (Array.isArray(value)) value.forEach((item, index) => findings.push(...walkSensitiveValues(item, `${prefix}[${index}]`)));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) findings.push(...walkSensitiveValues(item, prefix ? `${prefix}.${key}` : key));
  } else if (typeof value === "string" && (EMAIL_VALUE.test(value) || DOCUMENT_VALUE.test(value) || PHONE_VALUE.test(value))) {
    findings.push(`forbidden_value:${prefix}`);
  }
  return findings;
}

function exactKeys(value, expected, location, problems) {
  const actual = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : [];
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) problems.push(`keys:${location}`);
}

function validateShape(event, problems) {
  exactKeys(event, EVENT_KEYS, "event", problems);
  exactKeys(event.pricing, PRICING_KEYS, "pricing", problems);
  exactKeys(event.pricing?.urgency, URGENCY_KEYS, "pricing.urgency", problems);
  if (event.pricing?.predefined_alternative !== null) exactKeys(event.pricing?.predefined_alternative, ALTERNATIVE_KEYS, "pricing.predefined_alternative", problems);
  (event.hours_by_seniority || []).forEach((row, index) => exactKeys(row, HOUR_KEYS, `hours_by_seniority[${index}]`, problems));
  exactKeys(event.activity_hours, ACTIVITY_KEYS, "activity_hours", problems);
  for (const key of ACTIVITY_KEYS) exactKeys(event.activity_hours?.[key], ACTIVITY_ROW_KEYS, `activity_hours.${key}`, problems);
  exactKeys(event.direct_costs, DIRECT_COST_KEYS, "direct_costs", problems);
  exactKeys(event.calculated, CALCULATED_KEYS, "calculated", problems);
  exactKeys(event.delivery_quality, ["rework_hours", "qa_state"], "delivery_quality", problems);
  exactKeys(event.reusable_asset, ["kind", "observed_reuse_count", "observed_hours_saved"], "reusable_asset", problems);
  exactKeys(event.outcome, ["state", "category", "observed_at"], "outcome", problems);
}

const money = (value) => Number.isInteger(value) && value >= 0;
const positiveMoney = (value) => Number.isInteger(value) && value > 0;
const isoDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function hashUnitEconomicsEvent(event) {
  const payload = structuredClone(event);
  delete payload.source_record_hash;
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex")}`;
}

function daysBetween(start, end) {
  if (!isoDate(start) || !isoDate(end)) return null;
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return Math.round((to - from) / 86400000);
}

export function calculateUnitEconomics(event) {
  const laborCostCents = roundMoney((event.hours_by_seniority || []).reduce(
    (total, row) => total + Number(row.actual_hours) * Number(row.direct_hour_cost_cents),
    0,
  ));
  const nonLaborDirectCostCents = roundMoney(
    Number(event.direct_costs?.data_sources_and_cleaning_cents || 0) +
    Number(event.direct_costs?.attributable_commercial_acquisition_cents || 0) +
    Number(event.direct_costs?.other_direct_cents || 0),
  );
  const directCostTotalCents = laborCostCents + nonLaborDirectCostCents;
  const revenueCents = Number(event.pricing?.recognized_revenue_cents);
  const contributionCents = roundMoney(revenueCents - directCostTotalCents);
  const contributionMarginPct = revenueCents > 0
    ? Math.round((contributionCents / revenueCents) * 10000) / 100
    : null;
  const estimatedHours = (event.hours_by_seniority || []).reduce((total, row) => total + Number(row.estimated_hours), 0);
  const actualHours = (event.hours_by_seniority || []).reduce((total, row) => total + Number(row.actual_hours), 0);
  return {
    estimated_hours_total: Math.round(estimatedHours * 100) / 100,
    actual_hours_total: Math.round(actualHours * 100) / 100,
    labor_cost_cents: laborCostCents,
    non_labor_direct_cost_cents: nonLaborDirectCostCents,
    direct_cost_total_cents: directCostTotalCents,
    contribution_cents: contributionCents,
    contribution_margin_pct: contributionMarginPct,
    days_to_cash: daysBetween(event.pricing?.accepted_at, event.pricing?.paid_at),
  };
}

function allowedBasePrices(deliverable) {
  const values = new Map();
  if (finite(deliverable.price?.amount_cents)) values.set("base", deliverable.price.amount_cents);
  (deliverable.price?.tiers || []).forEach((tier) => values.set(tier.tier, tier.amount_cents));
  return values;
}

export function validateUnitEconomicsEvent(event, policy, registry) {
  const problems = [...walkKeys(event), ...walkSensitiveValues(event)];
  validateShape(event, problems);
  if (event.schema !== "confenge.unit-economics-event/1.0") problems.push("schema");
  if (event.template === true) {
    const templatePricing = event.pricing || {};
    const templateHasMeasurement = [
      event.event_id, event.deliverable_id, event.scope_version, event.price_version, event.terms_version, event.source_record_hash,
      event.delivered_at, templatePricing.currency, templatePricing.price_tier, templatePricing.list_price_cents,
      templatePricing.displayed_price_cents, templatePricing.accepted_price_cents,
      templatePricing.recognized_revenue_cents, templatePricing.accepted_at, templatePricing.payment_state, templatePricing.paid_at,
      templatePricing.predefined_alternative,
      ...Object.values(event.direct_costs || {}), ...Object.values(event.calculated || {}),
      event.delivery_quality?.rework_hours, event.delivery_quality?.qa_state, event.reusable_asset?.kind,
      event.reusable_asset?.observed_reuse_count, event.reusable_asset?.observed_hours_saved, event.outcome?.observed_at,
    ].some((value) => value !== null);
    const activityHasMeasurement = Object.values(event.activity_hours || {}).some((row) => Object.values(row || {}).some((value) => value !== null));
    if (event.state !== "NOT_STARTED" || event.source !== "CONFENGE_WEB" || (event.hours_by_seniority || []).length !== 0 ||
      templateHasMeasurement || activityHasMeasurement || event.outcome?.state !== "UNKNOWN" || event.outcome?.category !== "UNKNOWN" ||
      Object.values(templatePricing.urgency || {}).some(Boolean)) problems.push("template_claims_execution");
    return [...new Set(problems)];
  }

  const deliverable = registry.deliverables.find((entry) => entry.deliverable_id === event.deliverable_id);
  if (!deliverable) problems.push("unknown_deliverable");
  if (!/^UE-[A-Z0-9-]+$/.test(event.event_id || "")) problems.push("event_id");
  if (!deliverable || event.scope_version !== deliverable.version) problems.push("scope_version");
  if (event.price_version !== policy.policy_version) problems.push("price_version");
  if (event.terms_version !== TERMS_VERSION) problems.push("terms_version");
  if (event.source !== "CONFENGE_WEB") problems.push("source");
  if (!/^sha256:[a-f0-9]{64}$/.test(event.source_record_hash || "") || event.source_record_hash !== hashUnitEconomicsEvent(event)) problems.push("source_record_hash");
  if (event.state !== "DELIVERED") problems.push("state_not_delivered");
  if (!isoDate(event.delivered_at)) problems.push("delivered_at");

  const pricing = event.pricing || {};
  const basePrices = deliverable ? allowedBasePrices(deliverable) : new Map();
  if (pricing.currency !== "BRL") problems.push("currency");
  if (!basePrices.has(pricing.price_tier) || basePrices.get(pricing.price_tier) !== pricing.list_price_cents) problems.push("list_price_not_in_registry");
  if (![pricing.list_price_cents, pricing.displayed_price_cents, pricing.accepted_price_cents].every(positiveMoney) || !money(pricing.recognized_revenue_cents)) problems.push("pricing_money");
  const expectedDisplayed = pricing.urgency?.applied
    ? roundMoney(pricing.list_price_cents * (1 + policy.urgency_surcharge.pct / 100))
    : pricing.list_price_cents;
  if (pricing.displayed_price_cents !== expectedDisplayed) problems.push("displayed_price");
  if (pricing.urgency?.applied && (pricing.urgency.capacity_confirmed !== true || pricing.urgency.technically_safe !== true || pricing.urgency.disclosed_before_charge !== true)) problems.push("unsafe_or_hidden_urgency");
  if (!pricing.urgency?.applied && [pricing.urgency?.capacity_confirmed, pricing.urgency?.technically_safe, pricing.urgency?.disclosed_before_charge].some(Boolean)) problems.push("inactive_urgency_flags");
  if (pricing.accepted_price_cents !== pricing.displayed_price_cents) {
    const alternative = pricing.predefined_alternative;
    const validAlternative = alternative && ALTERNATIVES.has(alternative.kind) && /^ALT-[A-Z0-9-]+-v\d+$/.test(alternative.version || "") &&
      typeof alternative.reason === "string" && alternative.reason.trim().length >= 12 &&
      isoDate(alternative.defined_at) && isoDate(pricing.accepted_at) && Date.parse(alternative.defined_at) <= Date.parse(pricing.accepted_at) &&
      positiveMoney(alternative.price_cents) && alternative.price_cents === pricing.accepted_price_cents &&
      ((alternative.kind === "escopo_menor" && alternative.price_cents < pricing.displayed_price_cents) ||
        (alternative.kind === "prazo_normal" && pricing.urgency.applied && alternative.price_cents === pricing.list_price_cents) ||
        (alternative.kind === "step_up" && alternative.price_cents > pricing.displayed_price_cents));
    if (!validAlternative) problems.push("silent_discount_or_unversioned_alternative");
  } else if (pricing.predefined_alternative !== null) problems.push("unused_predefined_alternative");
  if (!isoDate(pricing.accepted_at) || !["PAID", "UNPAID"].includes(pricing.payment_state)) problems.push("payment_state");
  if (pricing.payment_state === "PAID" && (pricing.recognized_revenue_cents !== pricing.accepted_price_cents || daysBetween(pricing.accepted_at, pricing.paid_at) === null)) problems.push("paid_revenue_or_cash_dates");
  if (pricing.payment_state === "UNPAID" && (pricing.recognized_revenue_cents !== 0 || pricing.paid_at !== null)) problems.push("unpaid_revenue_or_cash_dates");
  if (isoDate(event.delivered_at) && isoDate(pricing.accepted_at) && Date.parse(event.delivered_at) < Date.parse(pricing.accepted_at)) problems.push("delivery_before_acceptance");

  const seniority = event.hours_by_seniority || [];
  if (!seniority.length || seniority.some((row) => !/^[a-z][a-z0-9_]+$/.test(row.role || "") || !nonNegative(row.estimated_hours) || !nonNegative(row.actual_hours) || !money(row.direct_hour_cost_cents))) problems.push("hours_by_seniority");
  if (new Set(seniority.map((row) => row.role)).size !== seniority.length) problems.push("duplicate_seniority");
  const activityKeys = Object.keys(event.activity_hours || {}).sort();
  if (JSON.stringify(activityKeys) !== JSON.stringify([...ACTIVITY_KEYS].sort())) problems.push("activity_keys");
  if (Object.values(event.activity_hours || {}).some((row) => !nonNegative(row.estimated_hours) || !nonNegative(row.actual_hours))) problems.push("activity_hours");

  const calculated = calculateUnitEconomics(event);
  const activityEstimated = Object.values(event.activity_hours || {}).reduce((total, row) => total + Number(row.estimated_hours), 0);
  const activityActual = Object.values(event.activity_hours || {}).reduce((total, row) => total + Number(row.actual_hours), 0);
  if (Math.abs(activityEstimated - calculated.estimated_hours_total) > 0.01) problems.push("activity_estimated_hours_do_not_reconcile");
  if (Math.abs(activityActual - calculated.actual_hours_total) > 0.01) problems.push("activity_hours_do_not_reconcile");
  if (!(calculated.actual_hours_total > 0)) problems.push("actual_hours_empty");
  for (const [field, value] of Object.entries(calculated)) {
    if (event.calculated?.[field] !== value) problems.push(`calculated_drift:${field}`);
  }
  if (!Object.values(event.direct_costs || {}).every(money)) problems.push("direct_costs");
  if (!event.reusable_asset || !/^[a-z][a-z0-9_]{2,63}$/.test(event.reusable_asset.kind || "") || !Number.isInteger(event.reusable_asset.observed_reuse_count) || !nonNegative(event.reusable_asset.observed_hours_saved)) problems.push("reusable_asset");
  if (!event.delivery_quality || !nonNegative(event.delivery_quality.rework_hours) || !["PASS", "PASS_WITH_NOTES", "FAIL"].includes(event.delivery_quality.qa_state)) problems.push("delivery_quality");
  if (event.delivery_quality?.rework_hours !== event.activity_hours?.rework?.actual_hours) problems.push("rework_hours_do_not_reconcile");
  if (!event.outcome || !["OBSERVED", "UNKNOWN"].includes(event.outcome.state)) problems.push("outcome");
  if (event.outcome?.state === "OBSERVED" &&
    (!["POSITIVE", "NEUTRAL", "NEGATIVE", "NOT_APPLICABLE"].includes(event.outcome.category) || !isoDate(event.outcome.observed_at) || Date.parse(event.outcome.observed_at) < Date.parse(event.delivered_at))) problems.push("outcome_observed_at");
  if (event.outcome?.state === "UNKNOWN" && (event.outcome.category !== "UNKNOWN" || event.outcome.observed_at !== null)) problems.push("unknown_outcome_has_measurement");
  return [...new Set(problems)];
}

export function evaluateUnitEconomicsPromotion(events, policy, registry, governanceDecision = null) {
  const candidates = (events || []).filter((event) => event.template !== true);
  const duplicateEventIds = candidates.map((event) => event.event_id).filter((id, index, ids) => ids.indexOf(id) !== index);
  const duplicateSourceHashes = candidates.map((event) => event.source_record_hash).filter((hash, index, hashes) => hashes.indexOf(hash) !== index);
  const valid = candidates.filter((event) => validateUnitEconomicsEvent(event, policy, registry).length === 0);
  const comparisonKeys = new Set(valid.map((event) => [event.deliverable_id, event.scope_version, event.price_version, event.terms_version, event.pricing.price_tier].join("|")));
  const comparable = duplicateEventIds.length === 0 && duplicateSourceHashes.length === 0 && comparisonKeys.size <= 1;
  const delivered = comparable ? valid : [];
  const qualifying = delivered.filter((event) =>
    ["PASS", "PASS_WITH_NOTES"].includes(event.delivery_quality.qa_state) &&
    event.pricing.payment_state === "PAID" && event.outcome.state === "OBSERVED" &&
    finite(event.calculated?.contribution_margin_pct) &&
    event.calculated.contribution_margin_pct >= policy.promotion_gate.min_pct);
  const target = governanceDecision || {};
  const targetDeliverable = registry.deliverables.find((entry) => entry.deliverable_id === target.deliverable_id);
  const governanceKeys = ["explicit", "decision_id", "decided_by_role", "deliverable_id", "scope_version", "price_version", "terms_version", "price_tier", "subject", "action", "rationale", "decided_at"];
  const governanceShapeValid = !governanceDecision || JSON.stringify(Object.keys(governanceDecision).sort()) === JSON.stringify(governanceKeys.sort());
  const governanceOverride = governanceDecision && governanceShapeValid && governanceDecision.explicit === true &&
    /^GOV-[A-Z0-9-]+$/.test(governanceDecision.decision_id || "") &&
    governanceDecision.decided_by_role === "GOVERNANCE_APPROVER" &&
    ["PRICE", "SCOPE"].includes(governanceDecision.subject) &&
    ["KEEP", "RAISE_PRICE", "LOWER_PRICE", "CHANGE_SCOPE", "PAUSE"].includes(governanceDecision.action) &&
    targetDeliverable && governanceDecision.scope_version === targetDeliverable.version &&
    governanceDecision.price_version === policy.policy_version &&
    governanceDecision.terms_version === TERMS_VERSION &&
    allowedBasePrices(targetDeliverable).has(governanceDecision.price_tier) &&
    typeof governanceDecision.rationale === "string" && governanceDecision.rationale.trim().length >= 20 &&
    isoDate(governanceDecision.decided_at) && walkKeys(governanceDecision).length === 0 && walkSensitiveValues(governanceDecision).length === 0;
  return {
    eligible: (comparable && qualifying.length >= policy.promotion_gate.min_deliveries) || Boolean(governanceOverride),
    observed_deliveries: delivered.length,
    deliveries_at_or_above_margin: qualifying.length,
    minimum_margin_pct: policy.promotion_gate.min_pct,
    minimum_deliveries: policy.promotion_gate.min_deliveries,
    governance_override: Boolean(governanceOverride),
    comparable,
    comparison_key: comparisonKeys.size === 1 ? [...comparisonKeys][0] : null,
    invalid_events: candidates.length - valid.length,
    duplicate_event_ids: [...new Set(duplicateEventIds)],
    duplicate_source_hashes: [...new Set(duplicateSourceHashes)],
  };
}

export function validateUnitEconomicsPromotionAggregate(aggregate, events, policy, registry, governanceDecision = null) {
  const problems = [...walkKeys(aggregate), ...walkSensitiveValues(aggregate)];
  exactKeys(aggregate, PROMOTION_KEYS, "promotion", problems);
  if (aggregate.schema !== "confenge.unit-economics-promotion-aggregate/1.0") problems.push("promotion_schema");
  if (aggregate.template === true) {
    const nullable = [
      aggregate.run_id, aggregate.deliverable_id, aggregate.scope_version, aggregate.price_version,
      aggregate.terms_version, aggregate.price_tier, aggregate.governance_decision_id, aggregate.generated_at,
    ];
    if (aggregate.state !== "NOT_STARTED" || nullable.some((value) => value !== null) ||
      aggregate.observed_deliveries !== 0 || aggregate.deliveries_at_or_above_margin !== 0 ||
      aggregate.governance_override !== false || aggregate.eligible !== false || aggregate.comparable !== false ||
      aggregate.invalid_events !== 0 || (aggregate.source_event_hashes || []).length !== 0 ||
      aggregate.minimum_margin_pct !== policy.promotion_gate.min_pct || aggregate.minimum_deliveries !== policy.promotion_gate.min_deliveries) {
      problems.push("promotion_template_claims_execution");
    }
    return [...new Set(problems)];
  }

  const deliverable = registry.deliverables.find((entry) => entry.deliverable_id === aggregate.deliverable_id);
  if (!/^UEP-[A-Z0-9-]+$/.test(aggregate.run_id || "")) problems.push("promotion_run_id");
  if (aggregate.state !== "MEASURED") problems.push("promotion_state");
  if (!deliverable || aggregate.scope_version !== deliverable.version) problems.push("promotion_scope");
  if (aggregate.price_version !== policy.policy_version) problems.push("promotion_price_version");
  if (aggregate.terms_version !== TERMS_VERSION) problems.push("promotion_terms_version");
  if (!deliverable || !allowedBasePrices(deliverable).has(aggregate.price_tier)) problems.push("promotion_price_tier");
  if (!isoDate(aggregate.generated_at)) problems.push("promotion_generated_at");

  const evaluation = evaluateUnitEconomicsPromotion(events, policy, registry, governanceDecision);
  const expectedHashes = (events || []).map((event) => event.source_record_hash).sort();
  const recordedHashes = Array.isArray(aggregate.source_event_hashes) ? [...aggregate.source_event_hashes].sort() : [];
  if (expectedHashes.length !== new Set(expectedHashes).size || JSON.stringify(expectedHashes) !== JSON.stringify(recordedHashes)) problems.push("promotion_source_event_hashes");
  if ((events || []).some((event) =>
    event.deliverable_id !== aggregate.deliverable_id || event.scope_version !== aggregate.scope_version ||
    event.price_version !== aggregate.price_version || event.terms_version !== aggregate.terms_version ||
    event.pricing?.price_tier !== aggregate.price_tier)) problems.push("promotion_event_scope");
  if (evaluation.invalid_events !== 0 || !evaluation.comparable) problems.push("promotion_invalid_or_incomparable_events");
  for (const key of ["observed_deliveries", "deliveries_at_or_above_margin", "minimum_margin_pct", "minimum_deliveries", "governance_override", "eligible", "comparable", "invalid_events"]) {
    if (aggregate[key] !== evaluation[key]) problems.push(`promotion_drift:${key}`);
  }
  const expectedGovernanceId = evaluation.governance_override ? governanceDecision.decision_id : null;
  if (aggregate.governance_decision_id !== expectedGovernanceId) problems.push("promotion_governance_decision_id");
  if (evaluation.governance_override && (governanceDecision.deliverable_id !== aggregate.deliverable_id ||
    governanceDecision.scope_version !== aggregate.scope_version || governanceDecision.price_version !== aggregate.price_version ||
    governanceDecision.terms_version !== aggregate.terms_version || governanceDecision.price_tier !== aggregate.price_tier)) problems.push("promotion_governance_scope");
  return [...new Set(problems)];
}

export function validateRepositoryUnitEconomicsLedger(ledger) {
  const problems = [...walkKeys(ledger), ...walkSensitiveValues(ledger)];
  exactKeys(ledger, LEDGER_KEYS, "ledger", problems);
  if (ledger.schema !== "confenge.unit-economics-ledger/1.0") problems.push("ledger_schema");
  if (!/^CFG-UNIT-ECONOMICS-\d{4}-\d{2}-\d{2}-v\d+$/.test(ledger.ledger_version || "")) problems.push("ledger_version");
  if (ledger.issue !== "#341" || ledger.state !== "NOT_STARTED" || ledger.storage_authority !== "private_finance_store" ||
    ledger.repository_role !== "schema_templates_and_aggregate_hashes_only" || ledger.public_surface !== false ||
    ledger.contains_sensitive_values !== false || ledger.source !== "CONFENGE_WEB") problems.push("ledger_authority");
  if (!Array.isArray(ledger.records) || ledger.records.length !== 0 || !Array.isArray(ledger.rollups) || ledger.rollups.length !== 0 ||
    !Array.isArray(ledger.governance_decisions) || ledger.governance_decisions.length !== 0) problems.push("ledger_contains_observations");
  if (typeof ledger.records_note !== "string" || ledger.records_note.length < 40) problems.push("ledger_records_note");
  return [...new Set(problems)];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/pricing-policy.v1.json"), "utf8"));
  const registry = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/deliverables-registry.v1.json"), "utf8"));
  const inputIndex = process.argv.indexOf("--event");
  const eventPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : policy.unit_economics_implementation.event_template;
  const event = JSON.parse(fs.readFileSync(path.resolve(root, eventPath), "utf8"));
  const problems = validateUnitEconomicsEvent(event, policy, registry);
  const ledger = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/unit-economics-ledger.v1.json"), "utf8"));
  problems.push(...validateRepositoryUnitEconomicsLedger(ledger));
  if (problems.length) {
    console.error(JSON.stringify({ ok: false, problems }, null, 2));
    process.exit(1);
  }
  console.log(`UNIT_ECONOMICS_OK state=${event.state} sensitive_values=${event.template ? 0 : "private"}`);
}

export { ACTIVITY_KEYS };
