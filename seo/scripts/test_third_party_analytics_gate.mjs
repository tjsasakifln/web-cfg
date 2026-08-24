import assert from "node:assert/strict";
import {
  detectExternalAnalytics,
  runGate,
  validateDecision,
} from "../../scripts/site/third_party_analytics_gate.mjs";

const repo = runGate();
assert.deepEqual(repo.errors, [], `repository gate failed: ${repo.errors.join("; ")}`);
assert.equal(repo.hits.length, 0, "DEFER repository must ship zero external analytics runtime");

const base = structuredClone(repo.decision);
const injected = detectExternalAnalytics([
  ["index.html", '<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>'],
]);
assert.equal(injected.length, 1, "known browser tag must be detected");
let errors = validateDecision(base, injected, { pathExists: () => false });
assert(errors.some((error) => error.includes("not EXECUTE")), "DEFER must reject an injected tag");

const missingConsent = structuredClone(base);
missingConsent.decision_state = "EXECUTE";
missingConsent.decision.browser_tag_authorized = true;
missingConsent.promotion_gate.issue_87 = {
  required_state: "EXECUTE",
  current_state: "EXECUTE",
  hypothesis_approved: true,
  hypothesis_ref: "docs/experiments/paid-search.md",
  spend_approved: true,
  spend_cap_brl: 100,
  spend_approval_ref: "docs/experiments/spend-approval.md"
};
missingConsent.promotion_gate.authorization = {
  provider: "example-provider",
  approved_by: "human-owner",
  approved_at: "2026-09-20",
  expires_at: "2026-10-20"
};
errors = validateDecision(missingConsent, injected, { pathExists: () => false });
assert(errors.some((error) => error.includes("explicit consent")), "authorization without consent must fail");

const authorized = structuredClone(missingConsent);
authorized.promotion_gate.explicit_consent = {
  required: true,
  current_state: "ENFORCED",
  default_state: "denied",
  opt_in_before_export: true,
  withdrawal_supported: true,
  contract_ref: "docs/contracts/analytics-consent.v1.json",
  enforcement_test_ref: "tests/analytics/test_consent.mjs"
};
errors = validateDecision(authorized, injected, { pathExists: () => true });
assert.deepEqual(errors, [], "fully versioned future authorization should pass the policy gate");

const serverForward = detectExternalAnalytics([
  ["netlify/functions/collect.cjs", 'fetch("https://plausible.io/api/event")'],
]);
assert.equal(serverForward.length, 1, "server-side analytics export must be detected");
errors = validateDecision(authorized, serverForward, { pathExists: () => true });
assert(
  errors.some((error) => error.includes("server_side_forward_authorized")),
  "browser authorization must not authorize a server-side exporter",
);

console.log(
  "THIRD_PARTY_ANALYTICS_POLICY_TEST_OK",
  JSON.stringify({ current_state: repo.decision.decision_state, injected_cases: 3 }),
);
