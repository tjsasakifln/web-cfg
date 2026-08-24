import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DECISION_PATH = "data/revops/inbound-backlog-decision.v1.json";

const require = createRequire(import.meta.url);
const policy = require("../../netlify/functions/lib/inbound-backlog-policy.cjs");

export const {
  DEFER_STATE,
  EXECUTE_STATE,
  DECISION_VERSION,
  EXECUTION_VERSION,
  MAX_RECORD_AGE_DAYS,
  MAX_APPROVAL_WINDOW_MS,
  REQUIRED_SELECTION,
  PINNED_INVENTORY,
  PINNED_DECISION_SHA256,
  loadInboundBacklogDecision,
  loadInboundBacklogExecutionAuthority,
  validateInboundBacklogDecision,
  validateInboundBacklogExecutionAuthority,
  authorizeInboundBacklogReplay,
  authorizeInboundBacklogDrain,
  recordWithinApprovedAge,
  candidateBinding,
} = policy;

export function loadDecision() {
  return loadInboundBacklogDecision();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const decision = loadDecision();
  const errors = validateInboundBacklogDecision(decision);
  if (errors.length) {
    errors.forEach((error) => console.error("FAIL", error));
    process.exit(1);
  }
  console.log("INBOUND_BACKLOG_POLICY_OK", JSON.stringify({
    total: decision.inventory.total,
    origin: decision.inventory.by_origin,
    candidate: decision.cutoff_policy.candidate_count,
    approved: decision.cutoff_policy.approved_count,
    replayed: decision.replay.selected_count,
    state: decision.decision_state,
  }));
}
