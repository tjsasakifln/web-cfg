#!/usr/bin/env node

/**
 * Valida artefatos agregados do protocolo unico de market fit (#336).
 *
 * O repositorio aceita apenas contagens e hashes. Registros individuais,
 * consentimento, notas brutas e PII pertencem aos sistemas privados definidos
 * pelo protocolo. Ausencia nunca e convertida em evidencia.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { evaluatePromotion } from "./market_fit_promotion.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const isCount = (value) => Number.isInteger(value) && value >= 0;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const FORBIDDEN_KEY = /(^|_)(nome|name|email|e_mail|telefone|phone|whatsapp|cnpj|cpf|empresa|company|contato|contact|consentimento|consent_record|raw_note|nota_bruta|quote|citacao|participant_id|opportunity_id)($|_)/i;
const EMAIL_VALUE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REVIEW_ROLE = /^[a-z][a-z0-9_-]{2,60}$/i;
const DECISION_RULE = "PROMOTE exige todos os criterios numericos reconciliados com os agregados de pesquisa e Warmbly; ADJUST e HOLD nao removem nucleo nem item do catalogo.";

const RESEARCH_ROOT_KEYS = [
  "schema", "template", "protocol_version", "plan_version", "run_id", "executed_at",
  "exposure_plan_sha256", "status", "participant_counts", "completed_by_nucleus",
  "consent_attestation", "task_script_aggregate",
  "problem_evidence_aggregate", "review",
];
const QCO_ROOT_KEYS = [
  "schema", "template", "protocol_version", "run_id", "status", "source",
  "system_of_action", "window", "warmbly_export_sha256", "totals",
  "by_nucleus", "by_deliverable", "contains_individual_records", "contains_pii",
  "client_side_qco", "review",
];
const QCO_COUNT_FIELDS = [
  "eligible_qcos", "unit_recommendations", "proposals_sent",
  "plausible_proposals_at_published_price", "paid", "delivered",
  "outcomes_observed", "outcomes_unknown", "expansions",
  "deliveries_with_positive_margin", "deliveries_with_forbidden_claim",
];
const QCO_ROW_KEYS = [
  "deliverable_id", "price_version", "price_displayed_cents", ...QCO_COUNT_FIELDS,
  "decisions", "delivery_hours_deviation_pct",
];
const QCO_NUCLEUS_ROW_KEYS = [
  "nucleus_id", ...QCO_COUNT_FIELDS, "decisions", "delivery_hours_deviation_pct",
];
const DECISION_ROOT_KEYS = [
  "schema", "template", "protocol_version", "run_id", "research_run_id",
  "qco_run_id", "status", "decision_rule", "decisions", "review",
];

function exactKeys(problems, value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    problems.push(`${label}:object_required`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (!same(actual, wanted)) problems.push(`${label}:keys`);
  return same(actual, wanted);
}

function canonicalSha256(value) {
  return crypto.createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
}

function validInstant(value) {
  return ISO_INSTANT.test(value || "") && Number.isFinite(Date.parse(value));
}

function validRunId(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match || Number(match[4]) < 1) return false;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function reviewComplete(review) {
  return review &&
    REVIEW_ROLE.test(review.operator_role || "") &&
    REVIEW_ROLE.test(review.second_reviewer_role || "") &&
    review.operator_role !== review.second_reviewer_role &&
    validInstant(review.reviewed_at);
}

function exactCountMap(problems, value, ids, label, maximumById = null) {
  if (!exactKeys(problems, value, ids, label)) return;
  for (const id of ids) {
    if (!isCount(value[id])) problems.push(`${label}:count:${id}`);
    if (maximumById && isCount(value[id]) && value[id] > maximumById[id]) {
      problems.push(`${label}:above_exposure:${id}`);
    }
  }
}

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
  } else if (typeof value === "string" && EMAIL_VALUE.test(value)) {
    findings.push(`forbidden_value:${prefix}`);
  }
  return findings;
}

function duplicateValues(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function nucleusIds(protocol) {
  return protocol.sample_design.composition.map((row) => row.nucleus_id);
}

function taskIds(protocol) {
  const phase2 = protocol.phases.find((phase) => phase.phase === 2);
  return phase2.tasks.map((task) => task.id);
}

export function validateExposurePlan(plan, protocol, _taskDoors = null) {
  const problems = [];
  const phase1 = protocol.phases.find((phase) => phase.phase === 1);
  const phase2 = protocol.phases.find((phase) => phase.phase === 2);
  const slots = Array.isArray(plan.participant_slots) ? plan.participant_slots : [];
  const tasks = taskIds(protocol);

  if (plan.schema !== "confenge.market-fit-exposure-plan/1.1") problems.push("schema");
  if (plan.protocol_version !== protocol.protocol_version) problems.push("protocol_version");
  if (plan.unique_human_protocol !== true) problems.push("unique_human_protocol");
  if (plan.not_market_share !== true || plan.not_statistical_significance !== true) problems.push("qualitative_flags");
  if (!plan.frozen_before_sessions || plan.mutable_after_first_session !== false) problems.push("freeze_policy");
  if (plan.contains_participant_identity !== false) problems.push("participant_identity_policy");
  if (slots.length !== phase1.minimum_sample) problems.push("participant_slot_count");
  if (new Set(slots.map((slot) => slot.slot_id)).size !== slots.length) problems.push("duplicate_slot_id");

  for (const slot of slots) {
    if (!Array.isArray(slot.task_ids) || slot.task_ids.length !== phase2.tasks.length) problems.push(`tasks_count:${slot.slot_id}`);
    if (duplicateValues(slot.task_ids || []).length) problems.push(`duplicate_task:${slot.slot_id}`);
    if (!(slot.task_ids || []).every((taskId) => tasks.includes(taskId))) problems.push(`unknown_task:${slot.slot_id}`);
    if (!same([...(slot.task_ids || [])].sort(), [...(slot.display_order || [])].sort())) problems.push(`display_order:${slot.slot_id}`);
    if (!same(slot.repeat_change_stop, ["REPEAT", "CHANGE", "STOP"])) problems.push(`repeat_change_stop:${slot.slot_id}`);
    if (slot.b2g_presence_check !== true) problems.push(`b2g_presence:${slot.slot_id}`);
  }

  for (const quota of phase1.quotas) {
    const count = slots.filter((slot) => slot.role_id === quota.role_id).length;
    if (count !== quota.minimum) problems.push(`role_quota:${quota.role_id}:${count}`);
    const nucleusCount = slots.filter((slot) => slot.nucleus_id === quota.nucleus_id).length;
    if (nucleusCount !== quota.minimum) problems.push(`nucleus_quota:${quota.nucleus_id}:${nucleusCount}`);
  }
  if (plan.coverage?.b2g_slots !== 3) problems.push("b2g_slots");
  if (plan.coverage?.canary_slots !== 8) problems.push("canary_slots");
  problems.push(...walkKeys(plan));
  return [...new Set(problems)];
}

export function validateResearchAggregate(doc, protocol, plan) {
  const problems = walkKeys(doc);
  const phase1 = protocol.phases.find((phase) => phase.phase === 1);
  const nuclei = nucleusIds(protocol);
  const tasks = taskIds(protocol);
  exactKeys(problems, doc, RESEARCH_ROOT_KEYS, "research");
  exactKeys(problems, doc.participant_counts, ["screened", "eligible", "consented", "completed"], "participant_counts");
  exactKeys(problems, doc.completed_by_nucleus, nuclei, "completed_by_nucleus");
  exactKeys(problems, doc.consent_attestation, ["private_records_verified", "pii_in_repository", "pii_in_analytics", "raw_notes_in_repository"], "consent_attestation");
  exactKeys(problems, doc.review, ["operator_role", "second_reviewer_role", "reviewed_at"], "research_review");
  if (doc.schema !== "confenge.market-fit-research-aggregate/1.1") problems.push("schema");
  if (doc.protocol_version !== protocol.protocol_version || doc.plan_version !== plan.plan_version) problems.push("version");
  if (doc.template === true) {
    if (doc.status !== "NOT_STARTED" || doc.participant_counts?.completed !== 0) problems.push("template_claims_execution");
    if (doc.problem_evidence_aggregate !== null || doc.task_script_aggregate !== null) problems.push("template_claims_evidence");
    return [...new Set(problems)];
  }

  if (!validRunId(doc.run_id)) problems.push("run_id");
  if (!validInstant(doc.executed_at)) problems.push("executed_at");
  if (doc.status !== "COMPLETE") problems.push("status_not_complete");
  const counts = doc.participant_counts || {};
  const funnel = [counts.screened, counts.eligible, counts.consented, counts.completed];
  if (!funnel.every(isCount) || !(counts.screened >= counts.eligible && counts.eligible >= counts.consented && counts.consented >= counts.completed)) problems.push("participant_funnel");
  if (!isCount(counts.completed) || counts.completed !== phase1.minimum_sample) problems.push("sample_not_exact");
  for (const quota of phase1.quotas) {
    if (!isCount(doc.completed_by_nucleus?.[quota.nucleus_id]) || doc.completed_by_nucleus[quota.nucleus_id] !== quota.minimum) {
      problems.push(`nucleus_quota:${quota.nucleus_id}`);
    }
  }
  if (nuclei.reduce((sum, nucleusId) => sum + (doc.completed_by_nucleus?.[nucleusId] || 0), 0) !== counts.completed) {
    problems.push("nucleus_total_reconciliation");
  }
  const consent = doc.consent_attestation || {};
  if (consent.private_records_verified !== true || consent.pii_in_repository !== false || consent.pii_in_analytics !== false || consent.raw_notes_in_repository !== false) {
    problems.push("consent_or_pii_attestation");
  }
  if (doc.exposure_plan_sha256 !== canonicalSha256(plan)) problems.push("exposure_plan_sha256");
  if (!reviewComplete(doc.review)) problems.push("research_review_incomplete");
  if (exactKeys(problems, doc.problem_evidence_aggregate, ["recent_concrete_triggers_by_nucleus"], "problem_evidence")) {
    exactCountMap(
      problems,
      doc.problem_evidence_aggregate.recent_concrete_triggers_by_nucleus,
      nuclei,
      "recent_triggers",
    );
  }
  if (exactKeys(problems, doc.task_script_aggregate, ["completed_task_script_count", "repeat_change_stop_counts", "task_completion_counts_by_id"], "task_script")) {
    if (doc.task_script_aggregate.completed_task_script_count !== counts.completed) problems.push("task_script_completed_reconciliation");
    exactKeys(problems, doc.task_script_aggregate.repeat_change_stop_counts, ["REPEAT", "CHANGE", "STOP"], "repeat_change_stop");
    exactCountMap(problems, doc.task_script_aggregate.task_completion_counts_by_id, tasks, "task_completions");
  }
  return [...new Set(problems)];
}

function validateQcoRowCounts(problems, row, id) {
  if (!QCO_COUNT_FIELDS.every((field) => isCount(row[field]))) problems.push(`counts:${id}`);
  const decisionCount = Object.values(row.decisions || {}).reduce((sum, value) => sum + (isCount(value) ? value : 0), 0);
  if (!Object.values(row.decisions || {}).every(isCount) || decisionCount !== row.eligible_qcos) problems.push(`decision_reconciliation:${id}`);
  if (row.unit_recommendations !== row.eligible_qcos) problems.push(`unit_recommendation:${id}`);
  if (row.proposals_sent > row.eligible_qcos || row.paid > row.proposals_sent || row.delivered > row.paid) problems.push(`funnel_order:${id}`);
  if (row.plausible_proposals_at_published_price > row.proposals_sent) problems.push(`published_price_proposals:${id}`);
  if (row.paid > (row.decisions?.ACEITOU || 0) + (row.decisions?.NEGOCIOU || 0)) problems.push(`paid_without_positive_decision:${id}`);
  if (row.outcomes_observed + row.outcomes_unknown !== row.delivered) problems.push(`outcome_reconciliation:${id}`);
  if (row.expansions > row.delivered) problems.push(`expansion_reconciliation:${id}`);
  if (row.deliveries_with_positive_margin > row.delivered || row.deliveries_with_forbidden_claim > row.delivered) {
    problems.push(`delivery_reconciliation:${id}`);
  }
}

export function validateQcoAggregate(doc, protocol) {
  const problems = walkKeys(doc);
  const phase3 = protocol.phases.find((phase) => phase.phase === 3);
  const expectedById = new Map(phase3.measurement_scope.map((offer) => [offer.deliverable_id, offer.amount_cents]));
  const expectedIds = [...expectedById.keys()];
  const rows = Array.isArray(doc.by_deliverable) ? doc.by_deliverable : [];
  const nucleusRows = Array.isArray(doc.by_nucleus) ? doc.by_nucleus : [];
  const nuclei = nucleusIds(protocol);
  exactKeys(problems, doc, QCO_ROOT_KEYS, "qco");
  exactKeys(problems, doc.window, ["started_at", "ended_at"], "qco_window");
  exactKeys(problems, doc.totals, QCO_COUNT_FIELDS, "qco_totals");
  exactKeys(problems, doc.review, ["operator_role", "second_reviewer_role", "reviewed_at"], "qco_review");
  if (doc.schema !== "confenge.market-fit-qco-aggregate/1.1") problems.push("schema");
  if (doc.protocol_version !== protocol.protocol_version) problems.push("protocol_version");
  if (doc.source !== "CONFENGE_WEB" || doc.system_of_action !== "warmbly") problems.push("authority_boundary");
  if (doc.contains_individual_records !== false || doc.contains_pii !== false) problems.push("individual_or_pii_policy");
  if (doc.client_side_qco !== false) problems.push("client_side_qco");
  if (rows.length !== expectedById.size || duplicateValues(rows.map((row) => row.deliverable_id)).length || !same(rows.map((row) => row.deliverable_id).sort(), [...expectedIds].sort())) {
    problems.push("offer_rows");
  }
  for (const row of rows) {
    exactKeys(problems, row, QCO_ROW_KEYS, `qco_row:${row.deliverable_id || "unknown"}`);
    exactKeys(problems, row.decisions, ["ACEITOU", "NEGOCIOU", "RECUSOU", "SEM_DECISAO"], `qco_decisions:${row.deliverable_id || "unknown"}`);
    if (row.price_displayed_cents !== expectedById.get(row.deliverable_id)) problems.push(`price:${row.deliverable_id}`);
    if (row.eligible_qcos > 0 && !/^CFG-PRICE-[A-Z0-9-]+$/.test(row.price_version || "")) problems.push(`price_version:${row.deliverable_id}`);
    if (row.delivered === 0 && row.delivery_hours_deviation_pct !== null) problems.push(`delivery_deviation_without_delivery:${row.deliverable_id}`);
    if (row.delivered > 0 && !(typeof row.delivery_hours_deviation_pct === "number" && Number.isFinite(row.delivery_hours_deviation_pct))) {
      problems.push(`delivery_deviation_missing:${row.deliverable_id}`);
    }
    validateQcoRowCounts(problems, row, row.deliverable_id || "unknown");
  }
  if (nucleusRows.length !== nuclei.length || duplicateValues(nucleusRows.map((row) => row.nucleus_id)).length || !same(nucleusRows.map((row) => row.nucleus_id).sort(), [...nuclei].sort())) {
    problems.push("nucleus_rows");
  }
  for (const row of nucleusRows) {
    exactKeys(problems, row, QCO_NUCLEUS_ROW_KEYS, `qco_nucleus:${row.nucleus_id || "unknown"}`);
    exactKeys(problems, row.decisions, ["ACEITOU", "NEGOCIOU", "RECUSOU", "SEM_DECISAO"], `qco_nucleus_decisions:${row.nucleus_id || "unknown"}`);
    if (row.delivered === 0 && row.delivery_hours_deviation_pct !== null) problems.push(`delivery_deviation_without_delivery:${row.nucleus_id}`);
    if (row.delivered > 0 && !(typeof row.delivery_hours_deviation_pct === "number" && Number.isFinite(row.delivery_hours_deviation_pct))) {
      problems.push(`delivery_deviation_missing:${row.nucleus_id}`);
    }
    validateQcoRowCounts(problems, row, row.nucleus_id || "unknown");
  }
  if (doc.template === true) {
    if (doc.status !== "NOT_STARTED" || Object.values(doc.totals || {}).some((value) => value !== 0)) problems.push("template_claims_execution");
    return [...new Set(problems)];
  }
  if (doc.status !== "COMPLETE") problems.push("status_not_complete");
  if (!validRunId(doc.run_id)) problems.push("qco_run_id");
  if (!validInstant(doc.window?.started_at) || !validInstant(doc.window?.ended_at) || Date.parse(doc.window.started_at) > Date.parse(doc.window.ended_at)) problems.push("qco_window");
  if (!reviewComplete(doc.review)) problems.push("qco_review_incomplete");
  if (!/^[a-f0-9]{64}$/.test(doc.warmbly_export_sha256 || "")) problems.push("warmbly_export_sha256");
  for (const field of QCO_COUNT_FIELDS) {
    const sum = nucleusRows.reduce((total, row) => total + (row[field] || 0), 0);
    if (doc.totals?.[field] !== sum) problems.push(`total_reconciliation:${field}`);
  }
  if ((doc.totals?.unit_recommendations || 0) < phase3.minimum_qcos_with_unit_recommendation) problems.push("qco_minimum_not_met");
  return [...new Set(problems)];
}

function derivedPromotionEvidence(nucleusId, research, qco) {
  const qcoRow = qco?.by_nucleus?.find((row) => row.nucleus_id === nucleusId);
  const recent = research?.problem_evidence_aggregate?.recent_concrete_triggers_by_nucleus?.[nucleusId];
  if (!qcoRow || !isCount(recent)) return null;
  return {
    recent_concrete_triggers: recent,
    qualified_handraises: qcoRow.eligible_qcos,
    plausible_proposals_at_published_price: qcoRow.plausible_proposals_at_published_price,
    delivery_hours_deviation_pct: qcoRow.delivery_hours_deviation_pct,
    margin_positive: qcoRow.delivered > 0 && qcoRow.deliveries_with_positive_margin === qcoRow.delivered,
    no_forbidden_claim: qcoRow.delivered > 0 && qcoRow.deliveries_with_forbidden_claim === 0,
  };
}

export function validateProductDecisions(doc, protocol, research = null, qco = null) {
  const problems = walkKeys(doc);
  const expectedIds = nucleusIds(protocol);
  const criterionFields = protocol.gates.PROMOTE.criteria.map((criterion) => criterion.field);
  exactKeys(problems, doc, DECISION_ROOT_KEYS, "product_decisions");
  exactKeys(problems, doc.review, ["operator_role", "second_reviewer_role", "reviewed_at"], "decision_review");
  if (doc.schema !== "confenge.market-fit-product-decisions/1.1") problems.push("schema");
  if (doc.protocol_version !== protocol.protocol_version) problems.push("protocol_version");
  if (doc.decision_rule !== DECISION_RULE) problems.push("decision_rule");
  if (doc.template === true) {
    if (doc.status !== "NOT_STARTED" || (doc.decisions || []).length !== 0) problems.push("template_claims_decisions");
    return [...new Set(problems)];
  }
  const rows = Array.isArray(doc.decisions) ? doc.decisions : [];
  if (doc.status !== "COMPLETE" || rows.length !== expectedIds.length) problems.push("all_product_decisions_required");
  if (duplicateValues(rows.map((row) => row.nucleus_id)).length || !same(rows.map((row) => row.nucleus_id).sort(), [...expectedIds].sort())) {
    problems.push("product_decision_set");
  }
  if (!validRunId(doc.run_id) || doc.research_run_id !== research?.run_id || doc.qco_run_id !== qco?.run_id) problems.push("decision_run_binding");
  if (!reviewComplete(doc.review)) problems.push("decision_review_incomplete");
  for (const row of rows) {
    exactKeys(problems, row, ["nucleus_id", "decision", "scores", "evidence_classes", "promotion_evidence"], `decision_row:${row.nucleus_id || "unknown"}`);
    if (!expectedIds.includes(row.nucleus_id)) problems.push("nucleus_id");
    if (!["PROMOTE", "ADJUST", "HOLD"].includes(row.decision)) problems.push(`decision:${row.nucleus_id}`);
    const scores = row.scores || {};
    if (!same(Object.keys(scores).sort(), [...protocol.score_dimensions].sort())) problems.push(`score_dimensions:${row.nucleus_id}`);
    if (!Object.values(scores).every((value) => Number.isInteger(value) && value >= 0 && value <= 5)) problems.push(`score_range:${row.nucleus_id}`);
    if (!same(Object.keys(row.evidence_classes || {}).sort(), [...protocol.evidence_classes].sort())) problems.push(`evidence_classes:${row.nucleus_id}`);
    if (!Object.values(row.evidence_classes || {}).every((value) => typeof value === "boolean")) problems.push(`evidence_class_values:${row.nucleus_id}`);
    if (row.promotion_evidence !== null) exactKeys(problems, row.promotion_evidence, criterionFields, `promotion_evidence:${row.nucleus_id}`);
    const derived = derivedPromotionEvidence(row.nucleus_id, research, qco);
    if (row.promotion_evidence !== null && !same(row.promotion_evidence, derived)) problems.push(`promotion_evidence_drift:${row.nucleus_id}`);
    const promotion = evaluatePromotion(protocol.gates.PROMOTE, row.promotion_evidence);
    if (row.decision === "PROMOTE") {
      if (!promotion.eligible || !derived || !same(row.promotion_evidence, derived)) problems.push(`promote_without_evidence:${row.nucleus_id}`);
      if (!protocol.gates.PROMOTE.required_evidence_classes.every((evidenceClass) => row.evidence_classes?.[evidenceClass] === true)) {
        problems.push(`promote_without_evidence_classes:${row.nucleus_id}`);
      }
    }
  }
  return [...new Set(problems)];
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const protocol = readJson(path.join(root, "data/commercial/market-fit-protocol.v1.json"));
  const plan = readJson(path.join(root, protocol.execution_package.exposure_plan));
  const research = readJson(path.resolve(root, argument("--research-run") || protocol.execution_package.research_aggregate_template));
  const qco = readJson(path.resolve(root, argument("--qco-run") || protocol.execution_package.qco_aggregate_template));
  const decisions = readJson(path.resolve(root, argument("--decisions") || protocol.execution_package.decision_template));
  const targets = [
    ["exposure_plan", validateExposurePlan(plan, protocol)],
    ["research", validateResearchAggregate(research, protocol, plan)],
    ["qco", validateQcoAggregate(qco, protocol)],
    ["decisions", validateProductDecisions(decisions, protocol, research, qco)],
  ];
  const failed = targets.filter(([, problems]) => problems.length);
  if (failed.length) {
    console.error(JSON.stringify({ ok: false, failed: Object.fromEntries(failed) }, null, 2));
    process.exit(1);
  }
  console.log("MARKET_FIT_EVIDENCE_OK state=NOT_STARTED plan=20x12 pii=0 unique=#336");
}
