#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DECISION_PATH = "data/ops/third-party-conversion-decision.v1.json";

const EXCLUDED_DIRS = new Set([
  ".git",
  ".worktrees",
  "node_modules",
  "docs",
  "tests",
  "test-results",
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
  ["analytics_package", /"(?:plausible-tracker|posthog-js|mixpanel-browser|react-ga|@segment\/analytics[^"/]*)"\s*:/i],
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
  const files = walk(root, (full) => full.endsWith(".html"));
  for (const rel of [
    "script.js",
    "js",
    "assets/js",
    "netlify/functions",
    ".env.example",
    "_headers",
    "netlify.toml",
    "package.json",
  ]) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) {
      walk(full, (candidate) => /\.(?:c?js|mjs)$/.test(candidate), files);
    } else {
      files.push(full);
    }
  }
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

export function validateDecision(decision, hits, options = {}) {
  const errors = [];
  const exists = options.pathExists || (() => false);
  if (decision.contract !== "CONFENGE_THIRD_PARTY_CONVERSION_DECISION/1.0") {
    errors.push("decision contract must be CONFENGE_THIRD_PARTY_CONVERSION_DECISION/1.0");
  }
  if (decision.schema_version !== "1.0.0") errors.push("decision schema_version must be 1.0.0");
  if (!nonEmpty(decision.issue) || !nonEmpty(decision.decision_owner)) {
    errors.push("decision issue and owner are required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(decision.review_at || "")) {
    errors.push("decision review_at must be a versioned ISO date");
  }
  const baseline = decision.first_party_baseline || {};
  if (baseline.required !== true || baseline.collector !== "/.netlify/functions/collect") {
    errors.push("first-party collector must remain required");
  }
  if (baseline.source !== "CONFENGE_WEB" || baseline.pii_policy !== "aggregate_allowlist_empty") {
    errors.push("first-party source/PII policy drift");
  }

  const hasExternalRuntime = hits.length > 0;
  const browserAuthorized = decision.decision?.browser_tag_authorized === true;
  const forwardAuthorized = decision.decision?.server_side_forward_authorized === true;
  if (!hasExternalRuntime) {
    if (decision.decision_state === "DEFER" && (browserAuthorized || forwardAuthorized)) {
      errors.push("DEFER must not authorize browser tags or server-side forwarding");
    }
    return errors;
  }

  if (decision.decision_state !== "EXECUTE") {
    errors.push("external analytics runtime found while decision_state is not EXECUTE");
  }
  if (hits.some((hit) => hit.channel === "browser_tag") && !browserAuthorized) {
    errors.push("external browser analytics found without browser_tag_authorized");
  }
  if (hits.some((hit) => hit.channel === "server_side_forward") && !forwardAuthorized) {
    errors.push("external server analytics found without server_side_forward_authorized");
  }
  const gate = decision.promotion_gate || {};
  const issue87 = gate.issue_87 || {};
  if (
    issue87.current_state !== "EXECUTE" ||
    issue87.hypothesis_approved !== true ||
    !nonEmpty(issue87.hypothesis_ref) ||
    issue87.spend_approved !== true ||
    !(Number(issue87.spend_cap_brl) > 0) ||
    !nonEmpty(issue87.spend_approval_ref)
  ) {
    errors.push("issue #87 EXECUTE, hypothesis and positive approved spend cap are required");
  }
  const consent = gate.explicit_consent || {};
  if (
    consent.required !== true ||
    consent.current_state !== "ENFORCED" ||
    consent.default_state !== "denied" ||
    consent.opt_in_before_export !== true ||
    consent.withdrawal_supported !== true ||
    !nonEmpty(consent.contract_ref) ||
    !nonEmpty(consent.enforcement_test_ref) ||
    !exists(consent.contract_ref) ||
    !exists(consent.enforcement_test_ref)
  ) {
    errors.push("versioned, default-denied explicit consent and enforcement test are required");
  }
  const authorization = gate.authorization;
  if (
    !authorization ||
    !nonEmpty(authorization.provider) ||
    !nonEmpty(authorization.approved_by) ||
    !nonEmpty(authorization.approved_at) ||
    !nonEmpty(authorization.expires_at)
  ) {
    errors.push("provider authorization owner and validity window are required");
  }
  if (gate.privacy?.pii_policy !== "aggregate_allowlist_empty") {
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
