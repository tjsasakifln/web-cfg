import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  detectExternalAnalytics,
  generatedHtmlErrors,
  hasExactGaEventAllowlist,
  runtimeFiles,
  runGate,
  validateDecision,
} from "../../scripts/site/third_party_analytics_gate.mjs";

const expectedGaEvents = repoSafeGaEvents();

function repoSafeGaEvents() {
  const decision = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ops/third-party-conversion-decision.v1.json"), "utf8"));
  return decision.event_export_policy.allowlisted_events;
}

assert.deepEqual(
  generatedHtmlErrors(path.join(ROOT, "does-not-exist-for-artifact-gate"), true),
  ["generated public artifact _site is required for the external analytics census"],
  "post-build mode must fail closed when the public artifact is absent",
);

const repo = runGate();
assert.deepEqual(repo.errors, [], `repository gate failed: ${repo.errors.join("; ")}`);
assert(repo.hits.length >= 2, "reviewed GA4 runtime must exist in module and shipped bundle");
assert(
  repo.hits.every((hit) => hit.provider === "google_analytics_4" && hit.channel === "browser_tag"),
  "only the authorized GA4 browser provider may be detected",
);
assert.deepEqual(
  [...new Set(repo.hits.flatMap((hit) => hit.measurement_ids))],
  ["G-MT2G5L4KBR"],
  "runtime must contain only the confirmed measurement ID",
);

const scanned = runtimeFiles().map((file) => file.replaceAll("\\", "/"));
assert(
  scanned.some((file) => file.endsWith("scripts/pseo/build_site.py")) &&
    scanned.some((file) => file.endsWith(".github/workflows/site-ci.yml")) &&
    scanned.some((file) => file.endsWith("netlify/functions/collect.cjs")),
  "gate must scan build scripts, workflows and server runtime",
);
assert(
  scanned.every((file) => !file.endsWith("third_party_analytics_gate.mjs")),
  "detector and its injected fixtures must not self-match",
);

const base = structuredClone(repo.decision);
const refExists = (value) => fs.existsSync(path.join(ROOT, value));
const gaRuntime = detectExternalAnalytics([
  ["js/modules/analytics.js", `
    const id = "G-MT2G5L4KBR";
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
  `],
]);
assert.equal(gaRuntime.length, 1, "reviewed GA4 loader must be detected");
assert.deepEqual(gaRuntime[0].measurement_ids, ["G-MT2G5L4KBR"]);
assert.deepEqual(validateDecision(base, gaRuntime, { pathExists: refExists }), []);

assert.equal(base.decision.purpose, "optional_site_measurement");
assert.equal(base.decision.advertising_authorized, false);
assert.equal(base.decision.server_side_forward_authorized, false);
assert.equal(base.browser_contract.measurement_id, "G-MT2G5L4KBR");
assert.equal(base.browser_contract.property_id, "494051528");
assert.equal(base.browser_contract.web_stream_id, "11376849383");
assert.deepEqual(base.browser_contract.consent.allowed_values, ["denied", "granted"]);
assert.equal(base.browser_contract.consent.default_state, "denied");
assert.equal(base.browser_contract.consent.retroactive_event_replay, false);
assert.equal(base.first_party_baseline.independent_of_google_analytics, true);
const exactSetFixture = `const allowed = new Set(${JSON.stringify(expectedGaEvents)});`;
assert.equal(hasExactGaEventAllowlist(exactSetFixture), true);
assert.equal(
  hasExactGaEventAllowlist(`const allowed = new Set(${JSON.stringify([...expectedGaEvents, "lead_persisted"])});`),
  false,
  "a first-party-only event must not silently enter the GA4 allowlist",
);
assert(base.event_export_policy.allowlisted_events.includes("lead_form_success"));
assert.deepEqual(base.event_export_policy.allowlisted_properties, ["page_location", "page_referrer", "page_title"]);
assert.equal(base.event_export_policy.page_location_policy, "canonical_origin_plus_safe_path_without_query_or_fragment");
assert.equal(base.event_export_policy.page_referrer_policy, "empty_string");
assert.equal(base.event_export_policy.page_title_policy, "constant_CONFENGE");
assert.equal(base.event_export_policy.allowlisted_properties_scope, "explicit_app_parameters_only");
assert.equal(base.event_export_policy.provider_added_protocol_fields_acknowledged, true);
assert.equal(base.event_export_policy.custom_event_properties, false);

function expectFailure(mutator, fragment, hits = gaRuntime, pathExists = refExists) {
  const candidate = structuredClone(base);
  mutator(candidate);
  const errors = validateDecision(candidate, hits, { pathExists });
  assert(
    errors.some((error) => error.includes(fragment)),
    `expected ${JSON.stringify(fragment)} in ${JSON.stringify(errors)}`,
  );
}

assert(
  validateDecision(base, [], { pathExists: refExists })
    .some((error) => error.includes("same revision")),
  "EXECUTE cannot become a policy-only no-op without the GA runtime",
);
expectFailure((d) => { d.browser_contract.measurement_id = "G-AAAAAAAAAA"; }, "configuration drift");
expectFailure((d) => { d.browser_contract.consent.default_state = "granted"; }, "default-denied");
expectFailure((d) => { d.browser_contract.consent.withdrawal_supported = false; }, "default-denied");
expectFailure((d) => { d.browser_contract.consent.retroactive_event_replay = true; }, "non-retroactive");
expectFailure((d) => { d.browser_contract.consent.first_party_master_opt_out_precedence = false; }, "consent contract");
expectFailure((d) => { d.event_export_policy.allowlisted_properties.push("cta_id"); }, "allowlist");
expectFailure((d) => { d.event_export_policy.allowlisted_events.push("purchase"); }, "allowlist");
expectFailure((d) => { d.event_export_policy.page_location_policy = "raw_url"; }, "allowlist");
expectFailure((d) => { d.event_export_policy.page_referrer_policy = "document_referrer"; }, "allowlist");
expectFailure((d) => { d.event_export_policy.page_title_policy = "document_title"; }, "allowlist");
expectFailure((d) => { d.event_export_policy.allowlisted_properties_scope = "entire_provider_payload"; }, "allowlist");
expectFailure((d) => { d.event_export_policy.provider_added_protocol_fields_acknowledged = false; }, "allowlist");
expectFailure((d) => { d.event_export_policy.custom_event_properties = true; }, "allowlist");
expectFailure((d) => { d.event_export_policy.forbidden = d.event_export_policy.forbidden.filter((v) => v !== "lead_id"); }, "privacy exclusions");
expectFailure((d) => { d.first_party_baseline.required = false; }, "first-party collector");
expectFailure((d) => { d.promotion_gate.explicit_consent.retroactive_export = true; }, "default-denied consent");
expectFailure((d) => { d.promotion_gate.paid_advertising_gate.google_ads_authorized = true; }, "issue #87");
expectFailure((d) => { d.promotion_gate.paid_advertising_gate.spend_approved = true; }, "issue #87");
expectFailure((d) => { d.promotion_gate.privacy.raw_url_export = true; }, "raw URL");
expectFailure((d) => { d.review_at = "2026-99-99"; }, "valid ISO dates");
expectFailure(
  (d) => { d.promotion_gate.explicit_consent.contract_ref = "../../outside.json"; },
  "enforcement test",
  gaRuntime,
  () => true,
);

const wrongIdRuntime = detectExternalAnalytics([
  ["script.js", '<script src="https://www.googletagmanager.com/gtag/js?id=G-AAAAAAAAAA"></script>'],
]);
assert(
  validateDecision(base, wrongIdRuntime, { pathExists: refExists })
    .some((error) => error.includes("confirmed GA4 measurement ID")),
  "an unconfirmed GA4 property must fail closed",
);

const directHtmlBootstrap = detectExternalAnalytics([
  ["index.html", '<script src="https://www.googletagmanager.com/gtag/js?id=G-MT2G5L4KBR"></script>'],
]);
assert(
  validateDecision(base, [...gaRuntime, ...directHtmlBootstrap], { pathExists: refExists })
    .some((error) => error.includes("unauthorized runtime file")),
  "the confirmed ID must not be bootstrapped directly by HTML before consent",
);

const serverForward = detectExternalAnalytics([
  ["netlify/functions/collect.cjs", 'fetch("https://www.google-analytics.com/g/collect") // G-MT2G5L4KBR'],
]);
assert.equal(serverForward[0].channel, "server_side_forward");
assert(
  validateDecision(base, serverForward, { pathExists: refExists })
    .some((error) => error.includes("server-side")),
  "browser consent must not authorize server forwarding",
);

const productionRuntimeForward = detectExternalAnalytics([
  ["runtime/server.mjs", 'fetch("https://www.google-analytics.com/g/collect") // G-MT2G5L4KBR'],
]);
assert.equal(productionRuntimeForward[0].channel, "server_side_forward");
assert(
  validateDecision(base, productionRuntimeForward, { pathExists: refExists })
    .some((error) => error.includes("server-side")),
  "production runtime forwarding must never be misclassified as a browser tag",
);

const mixedProviders = [
  ...gaRuntime,
  ...detectExternalAnalytics([["index.html", '<script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>']]),
];
assert(
  validateDecision(base, mixedProviders, { pathExists: refExists })
    .some((error) => error.includes("exactly the authorized")),
  "GA4 authorization must not authorize another provider",
);

const adRuntime = detectExternalAnalytics([
  ["script.js", 'const conversion = "AW-123456789"; // G-MT2G5L4KBR'],
]);
assert.equal(adRuntime[0].provider, "google_ads");
assert(
  validateDecision(base, [...gaRuntime, ...adRuntime], { pathExists: refExists })
    .some((error) => error.includes("exactly the authorized")),
  "measurement authorization must not imply Google Ads authorization or spend",
);

const privacy = fs.readFileSync(path.join(ROOT, "privacidade/index.html"), "utf8");
const privacyLower = privacy.toLocaleLowerCase("pt-BR");
for (const phrase of [
  "google analytics 4",
  "opcional",
  "consentimento",
  "revogar",
  "dispositivo",
  "localização aproximada",
  "coletor de primeira parte",
]) {
  assert(privacyLower.includes(phrase), `privacy notice missing ${JSON.stringify(phrase)}`);
}
assert(!privacy.includes("G-MT2G5L4KBR"), "technical measurement ID must not leak into visitor UX");
assert(!/Google Analytics[^<]{0,180}(?:an[oô]nim|anonimiz)/i.test(privacy), "policy must not claim absolute GA anonymity");

console.log("THIRD_PARTY_ANALYTICS_POLICY_TEST_OK", JSON.stringify({
  current_state: repo.decision.decision_state,
  provider: repo.decision.decision.provider,
  adversarial_cases: 28,
}));
