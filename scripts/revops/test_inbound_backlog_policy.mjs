import assert from "assert/strict";
import { loadDecision, validateInboundBacklogDecision } from "./inbound_backlog_policy.mjs";

const base = loadDecision();
assert.deepEqual(validateInboundBacklogDecision(base), []);

function mustFail(mutator, fragment) {
  const decision = structuredClone(base);
  mutator(decision);
  const errors = validateInboundBacklogDecision(decision);
  assert(errors.some((error) => error.includes(fragment)), `${fragment}: ${errors.join("; ")}`);
}

mustFail((d) => { d.inventory.by_status.MISSING = 101; }, "by_status");
mustFail((d) => { d.inventory.sample = { email: "person@example.com" }; }, "PII key");
mustFail((d) => { d.cutoff_policy.approved_count = 1; }, "no subset");
mustFail((d) => { d.cutoff_policy.max_batch_size = 20; }, "bounded to one");
mustFail((d) => { d.replay.automatic_messages_allowed = true; }, "cannot replay");
mustFail((d) => { d.replay.executed = true; d.replay.selected_count = 1; }, "cannot replay");
mustFail((d) => { d.disposition.DNC_OR_SUPPRESSED.delete = true; }, "preserve records");
mustFail((d) => { d.prerequisites.issue_267_one_receipt_one_action_reconciled = true; }, "external prerequisites");
mustFail((d) => { d.prerequisites.transport_SET_SET_READY = false; }, "transport evidence");

console.log("INBOUND_BACKLOG_POLICY_TEST_OK", JSON.stringify({adversarial_cases: 9}));
