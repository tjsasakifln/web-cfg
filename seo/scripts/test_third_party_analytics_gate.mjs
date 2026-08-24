import assert from "node:assert/strict";
import {
  detectExternalAnalytics,
  runtimeFiles,
  runGate,
  validateDecision,
} from "../../scripts/site/third_party_analytics_gate.mjs";

const repo = runGate();
assert.deepEqual(repo.errors, [], `repository gate failed: ${repo.errors.join("; ")}`);
assert.equal(repo.hits.length, 0, "DEFER repository must ship zero external analytics runtime");
const scanned = runtimeFiles();
assert(
  scanned.some((file) => file.endsWith("scripts/pseo/build_site.py")) &&
    scanned.some((file) => file.endsWith(".github/workflows/site-ci.yml")) &&
    scanned.some((file) => file.endsWith("netlify/functions/collect.cjs")),
  "gate must scan build scripts, workflows and server runtime, not only current HTML",
);
assert(
  scanned.every((file) => !file.endsWith("third_party_analytics_gate.mjs")),
  "detector and its injected fixtures must not self-match",
);

const base = structuredClone(repo.decision);
const injected = detectExternalAnalytics([
  ["index.html", '<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>'],
]);
assert.equal(injected.length, 1, "known browser tag must be detected");
let errors = validateDecision(base, injected, { pathExists: () => false });
assert(errors.some((error) => error.includes("not EXECUTE")), "DEFER must reject an injected tag");

const preauthorizedDefer = structuredClone(base);
preauthorizedDefer.decision.browser_tag_authorized = true;
preauthorizedDefer.decision.provider = "google_tag_manager";
errors = validateDecision(preauthorizedDefer, [], { pathExists: () => false });
assert(
  errors.some((error) => error.includes("must not pre-authorize")),
  "DEFER must reject dormant provider authorization",
);

const invalidDate = structuredClone(base);
invalidDate.review_at = "2026-99-99";
errors = validateDecision(invalidDate, [], { pathExists: () => false });
assert(errors.some((error) => error.includes("valid ISO dates")), "invalid review date must fail");

const weakenedRevisit = structuredClone(base);
weakenedRevisit.measurable_revisit_trigger.triggers[1].conditions.pop();
errors = validateDecision(weakenedRevisit, [], { pathExists: () => false });
assert(
  errors.some((error) => error.includes("revisit trigger")),
  "the dated decision cannot lose a readiness trigger",
);

const refs = new Set([
  "docs/experiments/paid-search.md",
  "docs/experiments/spend-approval.md",
  "docs/contracts/analytics-consent.v1.json",
  "tests/analytics/test_consent.mjs",
]);
const refExists = (value) => refs.has(value);

function authorizedDecision(provider, { browser = false, server = false } = {}) {
  const decision = structuredClone(base);
  decision.decision_state = "EXECUTE";
  decision.decision.browser_tag_authorized = browser;
  decision.decision.server_side_forward_authorized = server;
  decision.decision.provider = provider;
  decision.promotion_gate.issue_87 = {
    required_state: "EXECUTE",
    current_state: "EXECUTE",
    hypothesis_approved: true,
    hypothesis_ref: "docs/experiments/paid-search.md",
    spend_approved: true,
    spend_cap_brl: 100,
    spend_approval_ref: "docs/experiments/spend-approval.md",
  };
  decision.promotion_gate.explicit_consent = {
    required: true,
    current_state: "ENFORCED",
    default_state: "denied",
    opt_in_before_export: true,
    withdrawal_supported: true,
    contract_ref: "docs/contracts/analytics-consent.v1.json",
    enforcement_test_ref: "tests/analytics/test_consent.mjs",
  };
  decision.promotion_gate.authorization = {
    provider,
    approved_by: "human-owner",
    approved_at: "2026-09-20",
    expires_at: "2026-10-20",
  };
  return decision;
}

const noRuntime = authorizedDecision("google_tag_manager", { browser: true });
errors = validateDecision(noRuntime, [], { pathExists: refExists, today: "2026-09-20" });
assert(
  errors.some((error) => error.includes("same revision")),
  "EXECUTE must not be staged without its reviewed runtime",
);

const missingConsent = authorizedDecision("google_tag_manager", { browser: true });
missingConsent.promotion_gate.explicit_consent.current_state = "MISSING";
errors = validateDecision(missingConsent, injected, {
  pathExists: refExists,
  today: "2026-09-20",
});
assert(errors.some((error) => error.includes("explicit consent")), "authorization without consent must fail");

const authorized = authorizedDecision("google_tag_manager", { browser: true });
errors = validateDecision(authorized, injected, {
  pathExists: refExists,
  today: "2026-09-20",
});
assert.deepEqual(errors, [], "fully versioned future authorization should pass the policy gate");

const wrongProvider = structuredClone(authorized);
wrongProvider.decision.provider = "plausible";
errors = validateDecision(wrongProvider, injected, {
  pathExists: refExists,
  today: "2026-09-20",
});
assert(
  errors.some((error) => error.includes("must match the detected")),
  "provider declaration must match runtime evidence",
);

const escapedRef = structuredClone(authorized);
escapedRef.promotion_gate.issue_87.hypothesis_ref = "../../outside-repository.md";
errors = validateDecision(escapedRef, injected, {
  pathExists: () => true,
  today: "2026-09-20",
});
assert(
  errors.some((error) => error.includes("in-repo hypothesis")),
  "authorization references cannot escape the repository",
);

const expired = structuredClone(authorized);
errors = validateDecision(expired, injected, {
  pathExists: refExists,
  today: "2026-10-21",
});
assert(
  errors.some((error) => error.includes("invalid or expired")),
  "expired provider authorization must fail closed",
);

const serverForward = detectExternalAnalytics([
  ["netlify/functions/collect.cjs", 'fetch("https://plausible.io/api/event")'],
]);
assert.equal(serverForward.length, 1, "server-side analytics export must be detected");
errors = validateDecision(authorized, serverForward, {
  pathExists: refExists,
  today: "2026-09-20",
});
assert(
  errors.some((error) => error.includes("server_side_forward_authorized")) &&
    errors.some((error) => error.includes("must match the detected")),
  "browser/provider authorization must not authorize a different server exporter",
);

const serverAuthorized = authorizedDecision("plausible", { server: true });
errors = validateDecision(serverAuthorized, serverForward, {
  pathExists: refExists,
  today: "2026-09-20",
});
assert.deepEqual(errors, [], "matching server-side authorization should pass");

const mixedProviders = [...injected, ...serverForward];
const mixed = authorizedDecision("google_tag_manager", { browser: true, server: true });
errors = validateDecision(mixed, mixedProviders, {
  pathExists: refExists,
  today: "2026-09-20",
});
assert(
  errors.some((error) => error.includes("exactly one named")),
  "one canary cannot silently export to multiple providers",
);

const addedProviders = detectExternalAnalytics([
  ["index.html", '<script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>'],
  ["package.json", '{"dependencies":{"posthog-js":"1.0.0"}}'],
]);
assert.deepEqual(
  addedProviders.map((hit) => hit.provider).sort(),
  ["posthog", "tiktok_pixel"],
  "additional common analytics runtimes must be detected by provider",
);

console.log(
  "THIRD_PARTY_ANALYTICS_POLICY_TEST_OK",
  JSON.stringify({ current_state: repo.decision.decision_state, injected_cases: 14 }),
);
