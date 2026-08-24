import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DECISION_PATH = "data/revops/inbound-backlog-decision.v1.json";
const PII_KEYS = new Set([
  "email", "phone", "telefone", "name", "nome", "lead_id", "receipt_id",
  "cpf", "cnpj", "address", "endereco"
]);

function sumAxis(axis) {
  return Object.values(axis || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function walk(value, path = "", errors = []) {
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`, errors));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (PII_KEYS.has(key.toLowerCase())) errors.push(`PII key forbidden at ${path || "$"}.${key}`);
      walk(child, path ? `${path}.${key}` : key, errors);
    }
  } else if (typeof value === "string" && /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) {
    errors.push(`email-like value forbidden at ${path}`);
  }
  return errors;
}

export function validateInboundBacklogDecision(decision) {
  const errors = walk(decision);
  if (decision.contract !== "CONFENGE_INBOUND_BACKLOG_DECISION/1.0") errors.push("contract mismatch");
  if (decision.issue !== 268 || decision.depends_on_issue !== 267) errors.push("issue dependency mismatch");
  if (decision.decision_state !== "DEFER_REPLAY_UNTIL_267_RECONCILED") errors.push("decision must remain DEFER");
  const total = Number(decision.inventory?.total);
  for (const axis of ["by_status", "by_record_kind", "by_consent_state", "by_created_at_window", "by_commercial_eligibility"]) {
    if (sumAxis(decision.inventory?.[axis]) !== total) errors.push(`${axis} does not sum to total`);
  }
  const eligible = Number(decision.inventory?.by_commercial_eligibility?.ELIGIBLE_REAL_NOT_CONFIGURED);
  if (eligible !== 1 || decision.cutoff_policy?.candidate_count !== eligible) errors.push("candidate count must equal the one eligible aggregate");
  const dispositions = Object.values(decision.disposition || {}).reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (dispositions !== total) errors.push("dispositions do not cover the inventory");
  if (Object.values(decision.disposition || {}).some((item) => item.delete !== false)) errors.push("every disposition must preserve records");
  const cutoff = decision.cutoff_policy || {};
  if (cutoff.max_batch_size !== 1 || cutoff.one_at_a_time !== true) errors.push("replay must be bounded to one item at a time");
  if (cutoff.approved_count !== 0 || cutoff.approval?.state !== "PENDING_HUMAN") errors.push("no subset may be approved before prerequisites");
  const prerequisites = decision.prerequisites || {};
  if (
    prerequisites.transport_SET_SET_READY !== true ||
    prerequisites.issue_267_one_receipt_one_action_reconciled !== false ||
    prerequisites.warmbly_auto_send_proven_off !== false ||
    prerequisites.human_approval_reference_present !== false
  ) errors.push("transport evidence and external prerequisites must remain fail-closed");
  const replay = decision.replay || {};
  if (
    replay.executed !== false || replay.selected_count !== 0 ||
    replay.automatic_messages_allowed !== false || replay.mass_replay_allowed !== false ||
    replay.delete_unselected_allowed !== false
  ) errors.push("prepare-only decision cannot replay, message or delete");
  if (decision.analytics?.source !== "CONFENGE_WEB" || decision.analytics?.current_outcome !== "UNKNOWN") errors.push("analytics attribution/outcome drift");
  if (!/^[a-f0-9]{64}$/.test(decision.source?.artifact_sha256 || "")) errors.push("artifact SHA-256 required");
  return errors;
}

export function loadDecision(root = ROOT) {
  return JSON.parse(readFileSync(resolve(root, DECISION_PATH), "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const decision = loadDecision();
  const errors = validateInboundBacklogDecision(decision);
  if (errors.length) {
    errors.forEach((error) => console.error("FAIL", error));
    process.exit(1);
  }
  console.log("INBOUND_BACKLOG_POLICY_OK", JSON.stringify({total: decision.inventory.total, candidate: 1, approved: 0, replayed: 0}));
}
