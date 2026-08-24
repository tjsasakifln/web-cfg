import assert from "assert/strict";
import {
  EXECUTE_STATE,
  PINNED_DECISION_SHA256,
  REQUIRED_SELECTION,
  authorizeInboundBacklogReplay,
  loadDecision,
  recordWithinApprovedAge,
  validateInboundBacklogDecision,
  validateInboundBacklogExecutionAuthority,
} from "./inbound_backlog_policy.mjs";

const base = loadDecision();
assert.deepEqual(validateInboundBacklogDecision(base), []);

function mustFail(mutator, fragment) {
  const decision = structuredClone(base);
  mutator(decision);
  const errors = validateInboundBacklogDecision(decision);
  assert(errors.some((error) => error.includes(fragment)), `${fragment}: ${errors.join("; ")}`);
}

mustFail((d) => { d.extra = true; }, "schema keys");
mustFail((d) => { d.inventory.by_status.MISSING = 101; }, "inventory snapshot");
mustFail((d) => { d.inventory.by_status.MISSING = "102"; }, "inventory snapshot");
mustFail((d) => { d.inventory.by_origin = { UNKNOWN: 125, OTHER: 1 }; }, "inventory snapshot");
mustFail((d) => { d.source.artifact_sha256 = "0".repeat(64); }, "source snapshot/digest");
mustFail((d) => { d.cutoff_policy.selection_all_required = []; }, "selection criteria");
mustFail((d) => { d.cutoff_policy.selection_all_required.reverse(); }, "selection criteria");
mustFail((d) => { d.cutoff_policy.approved_count = 1; }, "DEFER requires zero");
mustFail((d) => { d.cutoff_policy.approval.approved_by = "OWNER_CONFENGE"; }, "PENDING approval fields");
mustFail((d) => { d.cutoff_policy.approval.approved_at = "2026-08-24T12:00:00Z"; }, "PENDING approval fields");
mustFail((d) => { d.cutoff_policy.approval.reference = "INBOUND-268-APPROVAL-v1"; }, "PENDING approval fields");
mustFail((d) => { d.cutoff_policy.approval.policy_version = "1.0.0"; }, "schema keys");
mustFail((d) => { d.cutoff_policy.max_batch_size = 20; }, "candidate and batch");
mustFail((d) => { d.replay.automatic_messages_allowed = true; }, "cannot claim replay");
mustFail((d) => { d.replay.executed = true; d.replay.selected_count = 1; }, "cannot claim replay");
mustFail((d) => { d.disposition.DNC_OR_SUPPRESSED.delete = true; }, "disposition snapshot");
mustFail((d) => { d.disposition.DNC_OR_SUPPRESSED.action = "REQUEUE"; }, "disposition snapshot");
mustFail((d) => { d.prerequisites.issue_267_one_receipt_one_action_reconciled = true; }, "prerequisites");
mustFail((d) => { d.decision_state = EXECUTE_STATE; }, "must remain DEFER");
for (const key of ["phoneNumber", "cpfCnpj", "contactEmail", "full_name", "e-mail", "endereço", "whatsapp", "message_body", "lead_id", "receipt_id"]) {
  mustFail((d) => { d.inventory[key] = "redacted"; }, "PII key");
}
mustFail((d) => { d.rollback = "mail person@example.com"; }, "PII-like value");
mustFail((d) => { d.rollback = "telefone +55 11 99999-9999"; }, "PII-like value");
mustFail((d) => { d.rollback = "cpf 123.456.789-00"; }, "PII-like value");

assert.equal(PINNED_DECISION_SHA256, "f8e89e749ff52df862b3724b7df61d2469c71c55190ec3bfeb9e16fc1bec71b6");
assert.deepEqual(base.inventory.by_origin, { UNKNOWN: 126 });
assert.equal(authorizeInboundBacklogReplay(base, null, { limit: 1 }).reason, "backlog_execution_authority_missing");

function executionAuthority() {
  return {
    contract: "CONFENGE_INBOUND_BACKLOG_EXECUTION/1.0",
    schema_version: "1.0.0",
    issue: 268,
    decision_contract: "CONFENGE_INBOUND_BACKLOG_DECISION/1.0",
    decision_sha256: PINNED_DECISION_SHA256,
    state: EXECUTE_STATE,
    approved_subset_count: 1,
    max_batch_size: 1,
    selection_all_required: [...REQUIRED_SELECTION],
    approval: {
      state: "APPROVED",
      approved_by: "OWNER_CONFENGE",
      approved_at: "2026-08-24T12:00:00Z",
      reference: "INBOUND-268-APPROVAL-v1",
    },
    prerequisites: {
      transport_SET_SET_READY: true,
      issue_267_one_receipt_one_action_reconciled: true,
      warmbly_auto_send_proven_off: true,
      human_approval_reference_present: true,
    },
    replay: { executed: false, selected_count: 0 },
  };
}

const authority = executionAuthority();
assert.deepEqual(validateInboundBacklogExecutionAuthority(authority), []);
assert.equal(authorizeInboundBacklogReplay(base, authority, { limit: 20, approvalReference: authority.approval.reference }).reason, "single_item_limit_required");
assert.equal(authorizeInboundBacklogReplay(base, authority, { limit: 1, approvalReference: "wrong" }).reason, "versioned_human_approval_required");
assert.equal(authorizeInboundBacklogReplay(base, authority, { limit: 1, approvalReference: authority.approval.reference }).ok, true);
for (const mutate of [
  (a) => { a.decision_sha256 = "0".repeat(64); },
  (a) => { a.approved_subset_count = 2; },
  (a) => { a.max_batch_size = 2; },
  (a) => { a.selection_all_required.pop(); },
  (a) => { a.approval.reference = "ticket-raw"; },
  (a) => { a.prerequisites.issue_267_one_receipt_one_action_reconciled = false; },
]) {
  const drift = executionAuthority();
  mutate(drift);
  assert.notDeepEqual(validateInboundBacklogExecutionAuthority(drift), []);
}

assert.equal(recordWithinApprovedAge({ received_at: "2026-08-01T00:00:00Z" }, new Date("2026-08-24T00:00:00Z")), true);
assert.equal(recordWithinApprovedAge({ received_at: "2020-01-01T00:00:00Z" }, new Date("2026-08-24T00:00:00Z")), false);

console.log("INBOUND_BACKLOG_POLICY_TEST_OK", JSON.stringify({adversarial_cases: 39}));
