/**
 * Versioned authority for historical inbound backlog replay.
 *
 * This module is deliberately shared by the runtime and the repository gate.
 * The committed decision is aggregate-only; authorization references are
 * versioned operational controls, never lead/contact identifiers.
 */
const { isDeepStrictEqual } = require("util");
const { createHash } = require("crypto");

const PINNED_SOURCE = Object.freeze({
  workflow_run: 32685188116,
  url: "https://github.com/tjsasakifln/web-cfg/actions/runs/32685188116",
  git_sha: "09c676c85a7a0b901ff8bf5a25306193c738a9bc",
  artifact_sha256: "98ab2bae579a350ee07624a1bac835162253f580014c6bfcd7f69b79428da1ac",
  captured_at: "2026-08-24T03:05:22.262Z",
  scope: "authenticated aggregate-only read plus dry-run; no identifiers, replay or drain",
});

const PINNED_INVENTORY = Object.freeze({
  total: 126,
  by_status: Object.freeze({ SKIPPED: 24, MISSING: 102 }),
  by_record_kind: Object.freeze({ synthetic: 67, qa: 12, MISSING: 45, real: 2 }),
  by_consent_state: Object.freeze({ EXPLICIT_TRUE: 126 }),
  by_created_at_window: Object.freeze({ "2026-08": 126 }),
  by_origin: Object.freeze({ UNKNOWN: 126 }),
  by_commercial_eligibility: Object.freeze({
    DNC_OR_SUPPRESSED: 79,
    OTHER_BLOCKER: 46,
    ELIGIBLE_REAL_NOT_CONFIGURED: 1,
  }),
});

const REQUIRED_SELECTION = Object.freeze([
  "record_kind_real",
  "explicit_consent_true",
  "commercial_eligibility_ELIGIBLE_REAL_NOT_CONFIGURED",
  "created_at_within_30_days_at_execution",
  "issue_267_single_case_reconciled",
  "warmbly_auto_send_proven_off",
  "human_approval_reference_present",
]);

const REQUIRED_NON_CLAIMS = Object.freeze([
  "the original 124 count is superseded by the dated 126-record inventory",
  "EXPLICIT_TRUE aggregate does not authorize replay by itself",
  "the one eligible candidate is not an approved replay subset",
  "no replay, drain, deletion or automatic message occurred",
]);

const DEFER_STATE = "DEFER_REPLAY_UNTIL_267_RECONCILED";
const EXECUTE_STATE = "EXECUTE_APPROVED_SINGLE_REPLAY";
const DECISION_CONTRACT = "CONFENGE_INBOUND_BACKLOG_DECISION/1.0";
const EXECUTION_CONTRACT = "CONFENGE_INBOUND_BACKLOG_EXECUTION/1.0";
const REQUEUE_MARKER_CONTRACT = "CONFENGE_INBOUND_BACKLOG_REQUEUE/1.0";
const CANDIDATE_BINDING_CONTRACT = "CONFENGE_INBOUND_BACKLOG_CANDIDATE/1.0";
const DECISION_VERSION = "1.0.0";
const EXECUTION_VERSION = "1.0.0";
const PINNED_DECISION_SHA256 = "f8e89e749ff52df862b3724b7df61d2469c71c55190ec3bfeb9e16fc1bec71b6";
const MAX_RECORD_AGE_DAYS = 30;
const MAX_APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

let EMBEDDED_DECISION = null;
try {
  // Static require keeps the authority file in the Netlify function bundle.
  EMBEDDED_DECISION = require("../../../data/revops/inbound-backlog-decision.v1.json");
} catch {
  EMBEDDED_DECISION = null;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function loadInboundBacklogDecision() {
  return clone(EMBEDDED_DECISION);
}

// No execution authority is shipped while the decision is DEFER. A future
// version must add a separate, reviewed artifact and explicitly wire its load.
function loadInboundBacklogExecutionAuthority() {
  return null;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sameJson(left, right) {
  return isDeepStrictEqual(left, right);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function canonicalDigest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex");
}

function candidateBinding(record) {
  const leadId = String(record?.lead_id || "").trim();
  const receiptId = String(record?.receipt_id || record?.lead_id || "").trim();
  if (!leadId || !receiptId) return null;
  return createHash("sha256")
    .update(`${CANDIDATE_BINDING_CONTRACT}\n${leadId}\n${receiptId}`, "utf8")
    .digest("hex");
}

function sumAxis(axis) {
  return Object.values(axis || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function assertKeys(value, expected, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (!sameJson(actual, wanted)) errors.push(`${path} schema keys mismatch`);
}

const PII_KEY_TOKENS = Object.freeze([
  "email", "phone", "telefone", "celular", "mobile", "whatsapp",
  "leadid", "receiptid", "document", "address", "endereco", "contact", "contato",
  "fullname", "firstname", "lastname", "cpf", "cnpj", "ipaddress", "telnumber",
  "messagebody",
]);
const PII_KEY_EXACT = new Set(["tel", "ip", "name", "nome", "cpf", "cnpj"]);
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_VALUE = /(?:\+?55[\s().-]*)?(?:\(?\d{2}\)?[\s.-]*)9?\d{4}[\s.-]?\d{4}/;
const TAX_ID_VALUE = /\b(?:\d{3}[.-]){2}\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;

function scanPii(value, path = "$", errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPii(item, `${path}[${index}]`, errors));
    return errors;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (PII_KEY_EXACT.has(normalizedKey) || PII_KEY_TOKENS.some((token) => normalizedKey.includes(token))) {
        errors.push(`PII key forbidden at ${path}.${key}`);
      }
      scanPii(child, `${path}.${key}`, errors);
    }
    return errors;
  }
  if (typeof value === "string") {
    const exactSafe = path === "$.source.url" || path === "$.source.git_sha" ||
      path === "$.source.artifact_sha256" || path === "$.source.captured_at" ||
      path === "$execution.candidate_binding_sha256";
    if (!exactSafe && (EMAIL_VALUE.test(value) || PHONE_VALUE.test(value) || TAX_ID_VALUE.test(value))) {
      errors.push(`PII-like value forbidden at ${path}`);
    }
  }
  return errors;
}

function validateInboundBacklogDecision(decision) {
  const errors = [];
  if (!isPlainObject(decision)) return ["decision must be an object"];
  assertKeys(decision, [
    "contract", "schema_version", "issue", "depends_on_issue", "decision_state",
    "executive_front", "leverage", "owner", "decided_at", "time_to_evidence",
    "source", "inventory", "cutoff_policy", "disposition", "replay",
    "prerequisites", "analytics", "rollback", "affected_adr", "non_claims",
  ], "$", errors);
  scanPii(decision, "$", errors);

  if (decision.contract !== DECISION_CONTRACT) errors.push("contract mismatch");
  if (decision.schema_version !== DECISION_VERSION) errors.push("schema version mismatch");
  if (decision.issue !== 268 || decision.depends_on_issue !== 267) errors.push("issue dependency mismatch");
  if (decision.decision_state !== DEFER_STATE) errors.push("decision v1 must remain DEFER");
  if (decision.executive_front !== "REVENUE NOW" || !sameJson(decision.leverage, ["revenue", "trust"])) {
    errors.push("market-capture metadata mismatch");
  }
  if (decision.owner !== "CONFENGE" || decision.decided_at !== "2026-08-24") errors.push("decision ownership mismatch");
  if (decision.time_to_evidence !== "1 day after issue #267 reconciles exactly one real record") {
    errors.push("time to evidence mismatch");
  }

  assertKeys(decision.source, Object.keys(PINNED_SOURCE), "$.source", errors);
  if (!sameJson(decision.source, PINNED_SOURCE)) errors.push("source snapshot/digest mismatch");
  assertKeys(decision.inventory, Object.keys(PINNED_INVENTORY), "$.inventory", errors);
  if (!sameJson(decision.inventory, PINNED_INVENTORY)) errors.push("inventory snapshot mismatch");
  for (const axis of [
    "by_status", "by_record_kind", "by_consent_state", "by_created_at_window",
    "by_origin", "by_commercial_eligibility",
  ]) {
    if (sumAxis(decision.inventory?.[axis]) !== PINNED_INVENTORY.total) errors.push(`${axis} does not sum to total`);
  }

  const cutoff = decision.cutoff_policy;
  assertKeys(cutoff, [
    "candidate_count", "approved_count", "max_batch_size", "one_at_a_time",
    "selection_all_required", "approval",
  ], "$.cutoff_policy", errors);
  if (cutoff?.candidate_count !== 1 || cutoff?.max_batch_size !== 1 || cutoff?.one_at_a_time !== true) {
    errors.push("candidate and batch must remain exactly one");
  }
  if (!sameJson(cutoff?.selection_all_required, REQUIRED_SELECTION)) errors.push("selection criteria mismatch");
  assertKeys(cutoff?.approval, ["state", "approved_by", "approved_at", "reference"], "$.cutoff_policy.approval", errors);

  assertKeys(decision.disposition, ["DNC_OR_SUPPRESSED", "OTHER_BLOCKER", "ELIGIBLE_REAL_NOT_CONFIGURED"], "$.disposition", errors);
  const requiredDisposition = {
    DNC_OR_SUPPRESSED: { count: 79, action: "NEVER_REQUEUE", delete: false },
    OTHER_BLOCKER: { count: 46, action: "NO_REPLAY_KEEP_REASON", delete: false },
    ELIGIBLE_REAL_NOT_CONFIGURED: { count: 1, action: "HOLD_FOR_267_AND_APPROVAL", delete: false },
  };
  for (const key of Object.keys(requiredDisposition)) {
    assertKeys(decision.disposition?.[key], ["count", "action", "delete"], `$.disposition.${key}`, errors);
  }
  if (!sameJson(decision.disposition, requiredDisposition)) errors.push("disposition snapshot mismatch");

  assertKeys(decision.replay, ["executed", "selected_count", "automatic_messages_allowed", "mass_replay_allowed", "delete_unselected_allowed"], "$.replay", errors);
  if (
    decision.replay?.executed !== false || decision.replay?.selected_count !== 0 ||
    decision.replay?.automatic_messages_allowed !== false || decision.replay?.mass_replay_allowed !== false ||
    decision.replay?.delete_unselected_allowed !== false
  ) errors.push("decision file cannot claim replay, message or deletion");

  assertKeys(decision.prerequisites, [
    "transport_SET_SET_READY", "issue_267_one_receipt_one_action_reconciled",
    "warmbly_auto_send_proven_off", "human_approval_reference_present",
  ], "$.prerequisites", errors);
  const approval = cutoff?.approval || {};
  if (cutoff?.approved_count !== 0 || approval.state !== "PENDING_HUMAN") errors.push("DEFER requires zero approved and pending human approval");
  if (approval.approved_by !== null || approval.approved_at !== null || approval.reference !== null) {
    errors.push("PENDING approval fields must remain null");
  }
  if (
    decision.prerequisites?.transport_SET_SET_READY !== true ||
    decision.prerequisites?.issue_267_one_receipt_one_action_reconciled !== false ||
    decision.prerequisites?.warmbly_auto_send_proven_off !== false ||
    decision.prerequisites?.human_approval_reference_present !== false
  ) errors.push("DEFER prerequisites must remain pinned fail-closed");

  assertKeys(decision.analytics, ["source", "pii_policy", "north_star", "current_outcome"], "$.analytics", errors);
  if (!sameJson(decision.analytics, {
    source: "CONFENGE_WEB",
    pii_policy: "aggregate_only_empty_allowlist",
    north_star: "qualified_commercial_opportunities",
    current_outcome: "UNKNOWN",
  })) errors.push("analytics contract mismatch");
  if (decision.rollback !== "Stop after the current single item, preserve every record and reason, and revert the approval/policy PR; never compensate with a batch replay.") errors.push("rollback mismatch");
  if (decision.affected_adr !== "ADR-STRAT-002 (no boundary change)") errors.push("affected ADR mismatch");
  if (!sameJson(decision.non_claims, REQUIRED_NON_CLAIMS)) errors.push("non-claims mismatch");
  if (canonicalDigest(decision) !== PINNED_DECISION_SHA256) errors.push("decision canonical digest mismatch");
  return [...new Set(errors)];
}

function validateInboundBacklogExecutionAuthority(authority) {
  const errors = [];
  if (!isPlainObject(authority)) return ["execution authority must be a separate object"];
  assertKeys(authority, [
    "contract", "schema_version", "issue", "decision_contract", "decision_sha256",
    "state", "approved_subset_count", "max_batch_size", "candidate_binding_sha256",
    "selection_all_required",
    "approval", "prerequisites", "replay",
  ], "$execution", errors);
  scanPii(authority, "$execution", errors);
  if (authority.contract !== EXECUTION_CONTRACT || authority.schema_version !== EXECUTION_VERSION) {
    errors.push("execution authority contract/version mismatch");
  }
  if (
    authority.issue !== 268 || authority.decision_contract !== DECISION_CONTRACT ||
    authority.decision_sha256 !== PINNED_DECISION_SHA256
  ) errors.push("execution authority must reference the pinned DEFER snapshot");
  if (authority.state !== EXECUTE_STATE) errors.push("execution authority state mismatch");
  if (authority.approved_subset_count !== 1 || authority.max_batch_size !== 1) {
    errors.push("execution authority must approve exactly one case");
  }
  if (!/^[a-f0-9]{64}$/.test(authority.candidate_binding_sha256 || "")) {
    errors.push("execution authority requires one non-reversible candidate binding");
  }
  if (!sameJson(authority.selection_all_required, REQUIRED_SELECTION)) errors.push("execution selection criteria mismatch");
  assertKeys(authority.approval, ["state", "approved_by", "approved_at", "expires_at", "reference"], "$execution.approval", errors);
  if (authority.approval?.state !== "APPROVED" || authority.approval?.approved_by !== "OWNER_CONFENGE") {
    errors.push("execution authority requires the owner role approval");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(authority.approval?.approved_at || "")) {
    errors.push("execution approved_at must be UTC ISO-8601");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(authority.approval?.expires_at || "")) {
    errors.push("execution expires_at must be UTC ISO-8601");
  }
  const approvedMs = Date.parse(authority.approval?.approved_at || "");
  const expiresMs = Date.parse(authority.approval?.expires_at || "");
  if (
    !Number.isFinite(approvedMs) || !Number.isFinite(expiresMs) ||
    expiresMs <= approvedMs || expiresMs - approvedMs > MAX_APPROVAL_WINDOW_MS
  ) errors.push("execution approval window must be positive and at most 24 hours");
  if (!/^INBOUND-268-APPROVAL-v[1-9]\d*$/.test(authority.approval?.reference || "")) {
    errors.push("execution approval reference must be versioned");
  }
  assertKeys(authority.prerequisites, [
    "transport_SET_SET_READY", "issue_267_one_receipt_one_action_reconciled",
    "warmbly_auto_send_proven_off", "human_approval_reference_present",
  ], "$execution.prerequisites", errors);
  if (
    authority.prerequisites?.transport_SET_SET_READY !== true ||
    authority.prerequisites?.issue_267_one_receipt_one_action_reconciled !== true ||
    authority.prerequisites?.warmbly_auto_send_proven_off !== true ||
    authority.prerequisites?.human_approval_reference_present !== true
  ) errors.push("execution authority requires all prerequisites true");
  assertKeys(authority.replay, ["executed", "selected_count"], "$execution.replay", errors);
  if (authority.replay?.executed !== false || authority.replay?.selected_count !== 0) {
    errors.push("execution authority must precede replay");
  }
  return [...new Set(errors)];
}

function authorizeInboundBacklogReplay(
  decision,
  executionAuthority,
  { approvalReference = "", limit = 1, now = new Date() } = {}
) {
  const decisionErrors = validateInboundBacklogDecision(decision);
  if (decisionErrors.length) return { ok: false, reason: "backlog_policy_invalid", errors: decisionErrors };
  if (!executionAuthority) return { ok: false, reason: "backlog_execution_authority_missing" };
  const authorityErrors = validateInboundBacklogExecutionAuthority(executionAuthority);
  if (authorityErrors.length) return { ok: false, reason: "backlog_execution_authority_invalid", errors: authorityErrors };
  if (limit !== 1) return { ok: false, reason: "single_item_limit_required" };
  if (approvalReference !== executionAuthority.approval.reference) {
    return { ok: false, reason: "versioned_human_approval_required" };
  }
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now || "");
  const approvedMs = Date.parse(executionAuthority.approval.approved_at);
  const expiresMs = Date.parse(executionAuthority.approval.expires_at);
  if (!Number.isFinite(nowMs) || nowMs < approvedMs || nowMs > expiresMs) {
    return { ok: false, reason: "execution_approval_outside_validity_window" };
  }
  return {
    ok: true,
    decision_state: executionAuthority.state,
    policy_version: `${decision.schema_version}+execution-${executionAuthority.schema_version}`,
    approval_reference: executionAuthority.approval.reference,
    candidate_binding_sha256: executionAuthority.candidate_binding_sha256,
    max_record_age_days: MAX_RECORD_AGE_DAYS,
    max_batch_size: 1,
  };
}

function recordWithinApprovedAge(record, now = new Date()) {
  const raw = record && (record.received_at || record.created_at);
  const createdMs = Date.parse(raw || "");
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now || "");
  if (!Number.isFinite(createdMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - createdMs;
  return ageMs >= 0 && ageMs <= MAX_RECORD_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function backlogRequeueMarker(authorization, record) {
  if (!authorization?.ok) return null;
  const binding = candidateBinding(record);
  if (!binding || binding !== authorization.candidate_binding_sha256) return null;
  return {
    contract: REQUEUE_MARKER_CONTRACT,
    policy_version: authorization.policy_version,
    approval_reference: authorization.approval_reference,
    candidate_binding_sha256: binding,
  };
}

function authorizeInboundBacklogDrain(
  decision,
  executionAuthority,
  record,
  { safetyGate = null, now = new Date() } = {}
) {
  const marker = record?.handoff?.requeue_policy;
  const approvalReference = marker?.approval_reference || "";
  const authorization = authorizeInboundBacklogReplay(
    decision,
    executionAuthority,
    { approvalReference, limit: 1, now }
  );
  if (!authorization.ok) return authorization;
  if (
    marker?.contract !== REQUEUE_MARKER_CONTRACT ||
    marker?.policy_version !== authorization.policy_version ||
    marker?.candidate_binding_sha256 !== authorization.candidate_binding_sha256 ||
    marker?.candidate_binding_sha256 !== candidateBinding(record)
  ) return { ok: false, reason: "requeue_marker_invalid" };
  if (!recordWithinApprovedAge(record, now)) return { ok: false, reason: "approved_candidate_outside_age_cutoff" };
  if (
    !safetyGate || safetyGate.ok !== true || safetyGate.auto_send_off !== true ||
    safetyGate.contract !== "READY"
  ) return { ok: false, reason: "backlog_destination_safety_gate_required" };
  return authorization;
}

module.exports = {
  PINNED_SOURCE,
  PINNED_INVENTORY,
  PINNED_DECISION_SHA256,
  REQUIRED_SELECTION,
  REQUIRED_NON_CLAIMS,
  DEFER_STATE,
  EXECUTE_STATE,
  DECISION_CONTRACT,
  EXECUTION_CONTRACT,
  REQUEUE_MARKER_CONTRACT,
  CANDIDATE_BINDING_CONTRACT,
  DECISION_VERSION,
  EXECUTION_VERSION,
  MAX_RECORD_AGE_DAYS,
  MAX_APPROVAL_WINDOW_MS,
  loadInboundBacklogDecision,
  loadInboundBacklogExecutionAuthority,
  validateInboundBacklogDecision,
  validateInboundBacklogExecutionAuthority,
  authorizeInboundBacklogReplay,
  authorizeInboundBacklogDrain,
  recordWithinApprovedAge,
  candidateBinding,
  backlogRequeueMarker,
};
