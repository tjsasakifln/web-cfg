#!/usr/bin/env node

/**
 * Cálculo e validação de unit economics por entrega (#341).
 *
 * O módulo não persiste dados. Eventos reais e taxas internas ficam no store
 * financeiro privado; o repositório contém somente contrato e templates.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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

function daysBetween(start, end) {
  const from = Date.parse(start);
  const to = Date.parse(end);
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
  const values = [];
  if (finite(deliverable.price?.amount_cents)) values.push(deliverable.price.amount_cents);
  (deliverable.price?.tiers || []).forEach((tier) => values.push(tier.amount_cents));
  (deliverable.price?.additional_units || []).forEach((additional) => values.push(additional.amount_cents));
  return new Set(values);
}

export function validateUnitEconomicsEvent(event, policy, registry) {
  const problems = walkKeys(event);
  if (event.schema !== "confenge.unit-economics-event/1.0") problems.push("schema");
  if (event.template === true) {
    if (event.state !== "NOT_STARTED" || event.event_id !== null || (event.hours_by_seniority || []).length !== 0) problems.push("template_claims_execution");
    return [...new Set(problems)];
  }

  const deliverable = registry.deliverables.find((entry) => entry.deliverable_id === event.deliverable_id);
  if (!deliverable) problems.push("unknown_deliverable");
  if (!/^UE-[A-Z0-9-]+$/.test(event.event_id || "")) problems.push("event_id");
  if (!/^v\d+$/.test(event.scope_version || "")) problems.push("scope_version");
  if (!/^CFG-PRICE-[A-Z0-9-]+$/.test(event.price_version || "")) problems.push("price_version");
  if (!/^CFG-TERMS-[A-Z0-9-]+$/.test(event.terms_version || "")) problems.push("terms_version");
  if (event.state !== "DELIVERED") problems.push("state_not_delivered");

  const pricing = event.pricing || {};
  const basePrices = deliverable ? allowedBasePrices(deliverable) : new Set();
  if (!basePrices.has(pricing.list_price_cents)) problems.push("list_price_not_in_registry");
  const expectedDisplayed = pricing.urgency?.applied
    ? roundMoney(pricing.list_price_cents * (1 + policy.urgency_surcharge.pct / 100))
    : pricing.list_price_cents;
  if (pricing.displayed_price_cents !== expectedDisplayed) problems.push("displayed_price");
  if (pricing.urgency?.applied && (pricing.urgency.capacity_confirmed !== true || pricing.urgency.technically_safe !== true || pricing.urgency.disclosed_before_charge !== true)) problems.push("unsafe_or_hidden_urgency");
  if (pricing.accepted_price_cents !== pricing.displayed_price_cents) {
    const alternative = pricing.predefined_alternative;
    if (!alternative || !ALTERNATIVES.has(alternative.kind) || !/^ALT-[A-Z0-9-]+$/.test(alternative.version || "") || typeof alternative.reason !== "string" || alternative.reason.trim().length < 12) problems.push("silent_discount_or_unversioned_alternative");
  }
  if (pricing.recognized_revenue_cents !== pricing.accepted_price_cents) problems.push("price_changed_after_acceptance");
  if (daysBetween(pricing.accepted_at, pricing.paid_at) === null) problems.push("cash_dates");

  const seniority = event.hours_by_seniority || [];
  if (!seniority.length || seniority.some((row) => !/^[a-z][a-z0-9_]+$/.test(row.role || "") || !nonNegative(row.estimated_hours) || !nonNegative(row.actual_hours) || !nonNegative(row.direct_hour_cost_cents))) problems.push("hours_by_seniority");
  if (new Set(seniority.map((row) => row.role)).size !== seniority.length) problems.push("duplicate_seniority");
  const activityKeys = Object.keys(event.activity_hours || {}).sort();
  if (JSON.stringify(activityKeys) !== JSON.stringify([...ACTIVITY_KEYS].sort())) problems.push("activity_keys");
  if (Object.values(event.activity_hours || {}).some((row) => !nonNegative(row.estimated_hours) || !nonNegative(row.actual_hours))) problems.push("activity_hours");

  const calculated = calculateUnitEconomics(event);
  const activityActual = Object.values(event.activity_hours || {}).reduce((total, row) => total + Number(row.actual_hours), 0);
  if (Math.abs(activityActual - calculated.actual_hours_total) > 0.01) problems.push("activity_hours_do_not_reconcile");
  for (const [field, value] of Object.entries(calculated)) {
    if (event.calculated?.[field] !== value) problems.push(`calculated_drift:${field}`);
  }
  if (!nonNegative(event.direct_costs?.data_sources_and_cleaning_cents) || !nonNegative(event.direct_costs?.attributable_commercial_acquisition_cents) || !nonNegative(event.direct_costs?.other_direct_cents)) problems.push("direct_costs");
  if (!event.reusable_asset || typeof event.reusable_asset.kind !== "string" || !nonNegative(event.reusable_asset.observed_reuse_count) || !nonNegative(event.reusable_asset.observed_hours_saved)) problems.push("reusable_asset");
  if (!event.delivery_quality || !nonNegative(event.delivery_quality.rework_hours) || !["PASS", "PASS_WITH_NOTES", "FAIL"].includes(event.delivery_quality.qa_state)) problems.push("delivery_quality");
  if (!event.outcome || !["OBSERVED", "UNKNOWN"].includes(event.outcome.state)) problems.push("outcome");
  return [...new Set(problems)];
}

export function evaluateUnitEconomicsPromotion(events, policy, founderDecision = null) {
  const delivered = (events || []).filter((event) => event.template !== true && event.state === "DELIVERED");
  const qualifying = delivered.filter((event) => finite(event.calculated?.contribution_margin_pct) && event.calculated.contribution_margin_pct >= policy.promotion_gate.min_pct);
  const founderOverride = founderDecision && founderDecision.explicit === true &&
    ["PRICE", "SCOPE"].includes(founderDecision.subject) &&
    typeof founderDecision.rationale === "string" && founderDecision.rationale.trim().length >= 20 &&
    /^\d{4}-\d{2}-\d{2}$/.test(founderDecision.decided_at || "");
  return {
    eligible: qualifying.length >= policy.promotion_gate.min_deliveries || Boolean(founderOverride),
    observed_deliveries: delivered.length,
    deliveries_at_or_above_margin: qualifying.length,
    minimum_margin_pct: policy.promotion_gate.min_pct,
    minimum_deliveries: policy.promotion_gate.min_deliveries,
    founder_override: Boolean(founderOverride),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/pricing-policy.v1.json"), "utf8"));
  const registry = JSON.parse(fs.readFileSync(path.join(root, "data/commercial/deliverables-registry.v1.json"), "utf8"));
  const inputIndex = process.argv.indexOf("--event");
  const eventPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : policy.unit_economics_implementation.event_template;
  const event = JSON.parse(fs.readFileSync(path.resolve(root, eventPath), "utf8"));
  const problems = validateUnitEconomicsEvent(event, policy, registry);
  if (problems.length) {
    console.error(JSON.stringify({ ok: false, problems }, null, 2));
    process.exit(1);
  }
  console.log(`UNIT_ECONOMICS_OK state=${event.state} sensitive_values=${event.template ? 0 : "private"}`);
}

export { ACTIVITY_KEYS };
