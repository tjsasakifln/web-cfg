#!/usr/bin/env node

/**
 * Valida artefatos agregados do protocolo de market fit (#336).
 *
 * O repositório aceita apenas contagens e hashes. Registros individuais,
 * consentimento, notas brutas e PII pertencem aos sistemas privados definidos
 * pelo protocolo. Ausência nunca é convertida em evidência.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { evaluatePromotion } from "./market_fit_promotion.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const isCount = (value) => Number.isInteger(value) && value >= 0;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const FORBIDDEN_KEY = /(^|_)(nome|name|email|e_mail|telefone|phone|whatsapp|cnpj|cpf|empresa|company|contato|contact|consentimento|consent_record|raw_note|nota_bruta|quote|citacao|participant_id|opportunity_id)($|_)/i;

function walkKeys(value, prefix = "") {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...walkKeys(item, `${prefix}[${index}]`)));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const location = prefix ? `${prefix}.${key}` : key;
      if (FORBIDDEN_KEY.test(key)) findings.push(`forbidden_key:${location}`);
      findings.push(...walkKeys(item, location));
    }
  }
  return findings;
}

function duplicateValues(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

export function validateExposurePlan(plan, protocol, taskDoors) {
  const problems = [];
  const phase1 = protocol.phases.find((phase) => phase.phase === 1);
  const phase2 = protocol.phases.find((phase) => phase.phase === 2);
  const slots = Array.isArray(plan.participant_slots) ? plan.participant_slots : [];
  const allIds = Array.from({ length: phase2.catalogue_size }, (_, index) => `CFG-D${String(index + 1).padStart(2, "0")}`);
  const knownDoors = new Set(taskDoors.doors.map((door) => door.door));

  if (plan.schema !== "confenge.market-fit-exposure-plan/1.0") problems.push("schema");
  if (plan.protocol_version !== protocol.protocol_version) problems.push("protocol_version");
  if (!plan.frozen_before_sessions || plan.mutable_after_first_session !== false) problems.push("freeze_policy");
  if (plan.contains_participant_identity !== false) problems.push("participant_identity_policy");
  if (slots.length !== phase1.minimum_sample) problems.push("participant_slot_count");
  if (new Set(slots.map((slot) => slot.slot_id)).size !== slots.length) problems.push("duplicate_slot_id");

  for (const slot of slots) {
    if (!Array.isArray(slot.cards) || slot.cards.length !== phase2.cards_per_participant) problems.push(`cards_count:${slot.slot_id}`);
    if (duplicateValues(slot.cards || []).length) problems.push(`duplicate_card:${slot.slot_id}`);
    if (!(slot.cards || []).every((card) => allIds.includes(card))) problems.push(`unknown_card:${slot.slot_id}`);
    if (!same([...(slot.cards || [])].sort(), [...(slot.display_order || [])].sort())) problems.push(`display_order:${slot.slot_id}`);
    if (!Array.isArray(slot.boundary_cards) || slot.boundary_cards.length !== phase2.boundary_cards_per_participant) problems.push(`boundary_cards_count:${slot.slot_id}`);
    if (!(slot.boundary_cards || []).every((card) => slot.cards.includes(card))) problems.push(`boundary_card_outside_block:${slot.slot_id}`);
    if (!(slot.focus_doors || []).every((door) => knownDoors.has(door))) problems.push(`unknown_focus_door:${slot.slot_id}`);
  }

  for (const quota of phase1.quotas) {
    const count = slots.filter((slot) => slot.role_id === quota.role_id).length;
    if (count !== quota.minimum) problems.push(`role_quota:${quota.role_id}:${count}`);
  }
  for (const deliverableId of allIds) {
    const count = slots.filter((slot) => slot.cards.includes(deliverableId)).length;
    if (count < phase2.min_exposures_per_item) problems.push(`item_coverage:${deliverableId}:${count}`);
    if (plan.coverage?.item_exposure_counts?.[deliverableId] !== count) problems.push(`item_coverage_drift:${deliverableId}`);
  }
  for (const boundary of phase2.critical_boundaries) {
    const count = slots.filter((slot) => boundary.deliverable_ids.every((id) => slot.cards.includes(id))).length;
    if (count < phase2.min_joint_exposures_per_critical_boundary) problems.push(`boundary_coverage:${boundary.boundary_id}:${count}`);
    if (plan.coverage?.boundary_joint_counts?.[boundary.boundary_id] !== count) problems.push(`boundary_coverage_drift:${boundary.boundary_id}`);
  }
  problems.push(...walkKeys(plan));
  return [...new Set(problems)];
}

export function validateResearchAggregate(doc, protocol, plan) {
  const problems = walkKeys(doc);
  const phase1 = protocol.phases.find((phase) => phase.phase === 1);
  const phase2 = protocol.phases.find((phase) => phase.phase === 2);
  if (doc.schema !== "confenge.market-fit-research-aggregate/1.0") problems.push("schema");
  if (doc.protocol_version !== protocol.protocol_version || doc.plan_version !== plan.plan_version) problems.push("version");
  if (doc.template === true) {
    if (doc.status !== "NOT_STARTED" || doc.participant_counts?.completed !== 0) problems.push("template_claims_execution");
    if (doc.problem_evidence_aggregate !== null || doc.card_sort_aggregate !== null) problems.push("template_claims_evidence");
    return [...new Set(problems)];
  }

  if (!/^\d{4}-\d{2}-\d{2}-\d{2}$/.test(doc.run_id || "")) problems.push("run_id");
  if (doc.status !== "COMPLETE") problems.push("status_not_complete");
  const counts = doc.participant_counts || {};
  if (!isCount(counts.completed) || counts.completed < phase1.minimum_sample) problems.push("sample_below_minimum");
  if (!isCount(counts.active_public_contract_last_12_months) || counts.active_public_contract_last_12_months < phase1.maturity_requirement.minimum_participants) problems.push("maturity_below_minimum");
  for (const quota of phase1.quotas) {
    if (!isCount(doc.completed_by_role?.[quota.role_id]) || doc.completed_by_role[quota.role_id] < quota.minimum) problems.push(`role_below_quota:${quota.role_id}`);
  }
  const consent = doc.consent_attestation || {};
  if (consent.private_records_verified !== true || consent.pii_in_repository !== false || consent.pii_in_analytics !== false || consent.raw_notes_in_repository !== false) problems.push("consent_or_pii_attestation");
  if (!/^[a-f0-9]{64}$/.test(doc.exposure_plan_sha256 || "")) problems.push("exposure_plan_sha256");
  for (const [deliverableId, expected] of Object.entries(plan.coverage.item_exposure_counts)) {
    const observed = doc.exposure_counts_by_deliverable?.[deliverableId];
    if (!isCount(observed) || observed < phase2.min_exposures_per_item || observed !== expected) problems.push(`item_exposure:${deliverableId}`);
  }
  for (const [boundaryId, expected] of Object.entries(plan.coverage.boundary_joint_counts)) {
    const observed = doc.joint_counts_by_critical_boundary?.[boundaryId];
    if (!isCount(observed) || observed < phase2.min_joint_exposures_per_critical_boundary || observed !== expected) problems.push(`boundary_exposure:${boundaryId}`);
  }
  if (!doc.problem_evidence_aggregate || typeof doc.problem_evidence_aggregate !== "object") problems.push("problem_evidence_missing");
  if (!doc.card_sort_aggregate || typeof doc.card_sort_aggregate !== "object") problems.push("card_sort_missing");
  return [...new Set(problems)];
}

export function validateQcoAggregate(doc, protocol) {
  const problems = walkKeys(doc);
  const phase3 = protocol.phases.find((phase) => phase.phase === 3);
  const expectedById = new Map(phase3.founder_led_offers.map((offer) => [offer.deliverable_id, offer.amount_cents]));
  const rows = Array.isArray(doc.by_deliverable) ? doc.by_deliverable : [];
  if (doc.schema !== "confenge.market-fit-qco-aggregate/1.0") problems.push("schema");
  if (doc.protocol_version !== protocol.protocol_version) problems.push("protocol_version");
  if (doc.source !== "CONFENGE_WEB" || doc.system_of_action !== "warmbly") problems.push("authority_boundary");
  if (doc.contains_individual_records !== false || doc.contains_pii !== false) problems.push("individual_or_pii_policy");
  if (rows.length !== expectedById.size || duplicateValues(rows.map((row) => row.deliverable_id)).length) problems.push("offer_rows");
  for (const row of rows) {
    if (row.price_displayed_cents !== expectedById.get(row.deliverable_id)) problems.push(`price:${row.deliverable_id}`);
    const numeric = ["eligible_qcos", "unit_recommendations", "proposals_sent", "paid", "delivered", "outcomes_observed", "outcomes_unknown", "expansions"];
    if (!numeric.every((field) => isCount(row[field]))) problems.push(`counts:${row.deliverable_id}`);
    const decisionCount = Object.values(row.decisions || {}).reduce((sum, value) => sum + (isCount(value) ? value : 0), 0);
    if (!Object.values(row.decisions || {}).every(isCount) || decisionCount !== row.eligible_qcos) problems.push(`decision_reconciliation:${row.deliverable_id}`);
    if (row.unit_recommendations !== row.eligible_qcos) problems.push(`unit_recommendation:${row.deliverable_id}`);
    if (row.eligible_qcos > 0 && !/^CFG-PRICE-[A-Z0-9-]+$/.test(row.price_version || "")) problems.push(`price_version:${row.deliverable_id}`);
    if (row.proposals_sent > row.eligible_qcos || row.paid > row.proposals_sent || row.delivered > row.paid) problems.push(`funnel_order:${row.deliverable_id}`);
    if (row.outcomes_observed + row.outcomes_unknown > row.delivered) problems.push(`outcome_reconciliation:${row.deliverable_id}`);
  }
  if (doc.template === true) {
    if (doc.status !== "NOT_STARTED" || Object.values(doc.totals || {}).some((value) => value !== 0)) problems.push("template_claims_execution");
    return [...new Set(problems)];
  }
  if (doc.status !== "COMPLETE") problems.push("status_not_complete");
  if (!/^[a-f0-9]{64}$/.test(doc.warmbly_export_sha256 || "")) problems.push("warmbly_export_sha256");
  const totalFields = ["eligible_qcos", "unit_recommendations", "proposals_sent", "paid", "delivered", "outcomes_observed", "expansions"];
  for (const field of totalFields) {
    const sum = rows.reduce((total, row) => total + (row[field] || 0), 0);
    if (doc.totals?.[field] !== sum) problems.push(`total_reconciliation:${field}`);
  }
  if ((doc.totals?.unit_recommendations || 0) < phase3.minimum_qcos_with_unit_recommendation) problems.push("qco_minimum_not_met");
  return [...new Set(problems)];
}

export function validateProductDecisions(doc, protocol) {
  const problems = walkKeys(doc);
  if (doc.schema !== "confenge.market-fit-product-decisions/1.0") problems.push("schema");
  if (doc.protocol_version !== protocol.protocol_version) problems.push("protocol_version");
  if (doc.template === true) {
    if (doc.status !== "NOT_STARTED" || (doc.decisions || []).length !== 0) problems.push("template_claims_decisions");
    return [...new Set(problems)];
  }
  const rows = Array.isArray(doc.decisions) ? doc.decisions : [];
  if (doc.status !== "COMPLETE" || rows.length !== 54) problems.push("all_product_decisions_required");
  if (duplicateValues(rows.map((row) => row.deliverable_id)).length) problems.push("duplicate_product_decision");
  for (const row of rows) {
    if (!/^CFG-D\d{2}$/.test(row.deliverable_id || "")) problems.push("deliverable_id");
    if (!["PROMOTE", "ADJUST", "HOLD"].includes(row.decision)) problems.push(`decision:${row.deliverable_id}`);
    const scores = row.scores || {};
    if (!same(Object.keys(scores).sort(), [...protocol.score_dimensions].sort())) problems.push(`score_dimensions:${row.deliverable_id}`);
    if (!Object.values(scores).every((value) => Number.isInteger(value) && value >= 0 && value <= 5)) problems.push(`score_range:${row.deliverable_id}`);
    if (!same(Object.keys(row.evidence_classes || {}).sort(), [...protocol.evidence_classes].sort())) problems.push(`evidence_classes:${row.deliverable_id}`);
    const promotion = evaluatePromotion(protocol.gates.PROMOTE, row.promotion_evidence);
    if (row.decision === "PROMOTE" && !promotion.eligible) problems.push(`promote_without_evidence:${row.deliverable_id}`);
  }
  return [...new Set(problems)];
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const protocol = readJson(path.join(root, "data/commercial/market-fit-protocol.v1.json"));
  const taskDoors = readJson(path.join(root, "data/commercial/task-doors.v1.json"));
  const plan = readJson(path.join(root, protocol.execution_package.exposure_plan));
  const targets = [
    ["exposure_plan", validateExposurePlan(plan, protocol, taskDoors)],
    ["research", validateResearchAggregate(readJson(path.resolve(root, argument("--research-run") || protocol.execution_package.research_aggregate_template)), protocol, plan)],
    ["qco", validateQcoAggregate(readJson(path.resolve(root, argument("--qco-run") || protocol.execution_package.qco_aggregate_template)), protocol)],
    ["decisions", validateProductDecisions(readJson(path.resolve(root, argument("--decisions") || protocol.execution_package.decision_template)), protocol)],
  ];
  const failed = targets.filter(([, problems]) => problems.length);
  if (failed.length) {
    console.error(JSON.stringify({ ok: false, failed: Object.fromEntries(failed) }, null, 2));
    process.exit(1);
  }
  console.log("MARKET_FIT_EVIDENCE_OK state=NOT_STARTED plan=20x18 pii=0");
}
