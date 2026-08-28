#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DECISION_PATH = "data/ops/third-party-conversion-decision.v1.json";

const EXCLUDED_DIRS = new Set([
  ".git",
  ".claude",
  ".worktrees",
  "node_modules",
  "docs",
  "tests",
  "test-results",
  "_site",
  "fixtures",
]);

const RUNTIME_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".py",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const SELF_TEST_FILES = new Set([
  "scripts/site/third_party_analytics_gate.mjs",
  "seo/scripts/test_third_party_analytics_gate.mjs",
]);

const EXTERNAL_ANALYTICS_PATTERNS = Object.freeze([
  ["google_tag_manager", /googletagmanager\.com|google-analytics\.com/i],
  ["plausible", /plausible\.io\/(?:js|api\/event)|PLAUSIBLE_(?:DOMAIN|FORWARD|API_URL)/i],
  ["meta_pixel", /connect\.facebook\.net\/.+fbevents|facebook\.com\/tr/i],
  ["microsoft_clarity", /clarity\.ms\/tag|clarity\.ms\/collect/i],
  ["microsoft_ads", /bat\.bing\.com\/bat\.js/i],
  ["hotjar", /static\.hotjar\.com|script\.hotjar\.com/i],
  ["segment", /cdn\.segment\.com\/analytics\.js|api\.segment\.io/i],
  ["fathom", /cdn\.usefathom\.com\/script\.js/i],
  ["cloudflare_beacon", /static\.cloudflareinsights\.com\/beacon/i],
  ["matomo", /matomo\.js|matomo\.php|"@datapunt\/matomo-tracker-js"\s*:/i],
  ["tiktok_pixel", /analytics\.tiktok\.com\/(?:i18n\/pixel|api\/v\d\/pixel)/i],
  ["linkedin_insight", /snap\.licdn\.com\/li\.lms-analytics/i],
  ["x_ads", /static\.ads-twitter\.com\/uwt\.js/i],
  ["google_ads", /googleadservices\.com\/pagead\/conversion/i],
  ["plausible", /"plausible-tracker"\s*:/i],
  ["posthog", /"posthog-js"\s*:/i],
  ["mixpanel", /"mixpanel-browser"\s*:/i],
  ["google_tag_manager", /"react-ga(?:4)?"\s*:/i],
  ["segment", /"@segment\/analytics[^"/]*"\s*:/i],
]);

function walk(dir, accept, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, out);
    else if (entry.isFile() && accept(full)) out.push(full);
  }
  return out;
}

export function runtimeFiles(root = ROOT) {
  const files = walk(root, (full) => {
    const rel = path.relative(root, full).split(path.sep).join("/");
    const basename = path.basename(full);
    if (SELF_TEST_FILES.has(rel)) return false;
    if (/^(?:test_|.*\.(?:test|spec)\.)/.test(basename)) return false;
    if ([".env.example", "_headers", "package.json"].includes(rel)) return true;
    return RUNTIME_EXTENSIONS.has(path.extname(full));
  });
  return [...new Set(files)].sort();
}

export function detectExternalAnalytics(entries) {
  const hits = [];
  for (const [filename, content] of entries) {
    for (const [provider, pattern] of EXTERNAL_ANALYTICS_PATTERNS) {
      if (pattern.test(content)) {
        const channel = filename.startsWith("netlify/functions/") || filename === ".env.example"
          ? "server_side_forward"
          : "browser_tag";
        hits.push({ filename, provider, channel });
      }
    }
  }
  return hits;
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isSafeRepoRef(value) {
  if (!nonEmpty(value) || path.isAbsolute(value) || value.includes("\\")) return false;
  const parts = value.split("/");
  return !parts.includes("") && !parts.includes(".") && !parts.includes("..");
}

export function validateDecision(decision, hits, options = {}) {
  const errors = [];
  const exists = options.pathExists || (() => false);
  const today = options.today || new Date().toISOString().slice(0, 10);
  if (decision.contract !== "CONFENGE_THIRD_PARTY_CONVERSION_DECISION/1.0") {
    errors.push("decision contract must be CONFENGE_THIRD_PARTY_CONVERSION_DECISION/1.0");
  }
  if (decision.schema_version !== "1.0.0") errors.push("decision schema_version must be 1.0.0");
  if (decision.issue !== "https://github.com/tjsasakifln/web-cfg/issues/247") {
    errors.push("decision must remain bound to web-cfg issue #247");
  }
  if (!nonEmpty(decision.decision_owner)) errors.push("decision owner is required");
  if (!new Set(["DEFER", "EXECUTE"]).has(decision.decision_state)) {
    errors.push("decision_state must be DEFER or EXECUTE");
  }
  if (
    typeof decision.decision?.browser_tag_authorized !== "boolean" ||
    typeof decision.decision?.server_side_forward_authorized !== "boolean" ||
    !nonEmpty(decision.decision?.reason)
  ) {
    errors.push("decision channel flags and written reason are required");
  }
  if (!isIsoDate(decision.decided_at) || !isIsoDate(decision.review_at)) {
    errors.push("decision and review dates must be valid ISO dates");
  } else if (decision.review_at < decision.decided_at) {
    errors.push("decision review_at cannot precede decided_at");
  }
  const baseline = decision.first_party_baseline || {};
  if (baseline.required !== true || baseline.collector !== "/.netlify/functions/collect") {
    errors.push("first-party collector must remain required");
  }
  if (baseline.source !== "CONFENGE_WEB" || baseline.pii_policy !== "aggregate_allowlist_empty") {
    errors.push("first-party source/PII policy drift");
  }
  if (baseline.third_party_cookie_required !== false) {
    errors.push("first-party baseline cannot require a third-party cookie");
  }

  const gate = decision.promotion_gate || {};
  if (gate.all_required !== true) errors.push("promotion gate must require every condition");
  const revisit = decision.measurable_revisit_trigger || {};
  const revisitTriggers = Array.isArray(revisit.triggers) ? revisit.triggers : [];
  const dateTrigger = revisitTriggers.find((item) => item?.type === "date");
  const conditionTrigger = revisitTriggers.find((item) => item?.type === "all_conditions");
  const expectedConditions = [
    "approved_hypothesis_ref_is_versioned",
    "approved_spend_cap_brl_is_greater_than_zero",
    "explicit_consent_contract_and_enforcement_test_are_versioned",
    "issue_87_decision_state_equals_EXECUTE",
  ];
  const actualConditions = Array.isArray(conditionTrigger?.conditions)
    ? [...conditionTrigger.conditions].sort()
    : [];
  if (
    revisit.mode !== "first_of" ||
    dateTrigger?.value !== decision.review_at ||
    JSON.stringify(actualConditions) !== JSON.stringify(expectedConditions)
  ) {
    errors.push("measurable revisit trigger must preserve the review date and readiness facts");
  }

  const hasExternalRuntime = hits.length > 0;
  const browserAuthorized = decision.decision?.browser_tag_authorized === true;
  const forwardAuthorized = decision.decision?.server_side_forward_authorized === true;
  if (decision.decision_state === "DEFER") {
    if (browserAuthorized || forwardAuthorized || decision.decision?.provider !== null) {
      errors.push("DEFER must not pre-authorize a provider, browser tag or server forwarding");
    }
    if (gate.authorization !== null) {
      errors.push("DEFER must not carry a dormant provider authorization");
    }
    if (hasExternalRuntime) {
      errors.push("external analytics runtime found while decision_state is not EXECUTE");
    }
    return errors;
  }

  if (!hasExternalRuntime) {
    errors.push("EXECUTE requires the reviewed external runtime in the same revision");
  }
  if (hits.some((hit) => hit.channel === "browser_tag") && !browserAuthorized) {
    errors.push("external browser analytics found without browser_tag_authorized");
  }
  if (hits.some((hit) => hit.channel === "server_side_forward") && !forwardAuthorized) {
    errors.push("external server analytics found without server_side_forward_authorized");
  }
  if (!browserAuthorized && !forwardAuthorized) {
    errors.push("EXECUTE must authorize at least one detected export channel");
  }
  const providers = [...new Set(hits.map((hit) => hit.provider))];
  if (providers.length !== 1) {
    errors.push("EXECUTE supports exactly one named analytics provider per canary");
  }
  const detectedProvider = providers[0];
  if (!nonEmpty(decision.decision?.provider) || decision.decision.provider !== detectedProvider) {
    errors.push("decision provider must match the detected runtime provider");
  }

  const issue87 = gate.issue_87 || {};
  if (
    issue87.required_state !== "EXECUTE" ||
    issue87.current_state !== "EXECUTE" ||
    issue87.hypothesis_approved !== true ||
    !isSafeRepoRef(issue87.hypothesis_ref) ||
    !exists(issue87.hypothesis_ref) ||
    issue87.spend_approved !== true ||
    !(Number(issue87.spend_cap_brl) > 0) ||
    !isSafeRepoRef(issue87.spend_approval_ref) ||
    !exists(issue87.spend_approval_ref)
  ) {
    errors.push("issue #87 EXECUTE plus in-repo hypothesis and spend approval are required");
  }
  const consent = gate.explicit_consent || {};
  if (
    consent.required !== true ||
    consent.current_state !== "ENFORCED" ||
    consent.default_state !== "denied" ||
    consent.opt_in_before_export !== true ||
    consent.withdrawal_supported !== true ||
    !isSafeRepoRef(consent.contract_ref) ||
    !isSafeRepoRef(consent.enforcement_test_ref) ||
    !exists(consent.contract_ref) ||
    !exists(consent.enforcement_test_ref)
  ) {
    errors.push("versioned, default-denied explicit consent and enforcement test are required");
  }
  const authorization = gate.authorization;
  if (
    !authorization ||
    authorization.provider !== detectedProvider ||
    !nonEmpty(authorization.approved_by) ||
    !isIsoDate(authorization.approved_at) ||
    !isIsoDate(authorization.expires_at)
  ) {
    errors.push("matching provider authorization owner and valid ISO window are required");
  } else if (
    authorization.approved_at < decision.decided_at ||
    authorization.expires_at < authorization.approved_at ||
    authorization.expires_at < today
  ) {
    errors.push("provider authorization window is invalid or expired");
  }
  if (
    gate.privacy?.pii_policy !== "aggregate_allowlist_empty" ||
    gate.privacy?.zero_pii_gate !== "npm run test:analytics"
  ) {
    errors.push("external analytics cannot relax the empty PII allowlist");
  }
  return errors;
}

export function runGate(root = ROOT) {
  const decisionFile = path.join(root, DECISION_PATH);
  if (!fs.existsSync(decisionFile)) return { errors: [`missing ${DECISION_PATH}`], hits: [] };
  const decision = JSON.parse(fs.readFileSync(decisionFile, "utf8"));
  const files = runtimeFiles(root);
  const entries = files.map((full) => [path.relative(root, full), fs.readFileSync(full, "utf8")]);
  const hits = detectExternalAnalytics(entries);
  const errors = validateDecision(decision, hits, {
    pathExists: (rel) => fs.existsSync(path.join(root, rel)),
  });

  const browser = fs.readFileSync(path.join(root, "js/modules/analytics.js"), "utf8");
  const collector = fs.readFileSync(path.join(root, "netlify/functions/collect.cjs"), "utf8");
  if (!browser.includes("/.netlify/functions/collect")) {
    errors.push("browser analytics no longer targets the first-party collector");
  }
  if (!collector.includes('collector: "confenge-first-party"')) {
    errors.push("first-party collector identity missing");
  }
  return { decision, errors, hits, scanned: files.length };
}

function main() {
  const result = runGate(ROOT);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`FAIL ${error}`);
    for (const hit of result.hits) console.error(`HIT ${hit.provider} ${hit.filename}`);
    process.exit(1);
  }
  console.log(
    "THIRD_PARTY_ANALYTICS_GATE_OK",
    JSON.stringify({
      decision_state: result.decision.decision_state,
      review_at: result.decision.review_at,
      scanned: result.scanned,
      external_hits: result.hits.length,
    }),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
