#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DECISION_PATH = "data/ops/third-party-conversion-decision.v1.json";

const CONTRACT = "CONFENGE_THIRD_PARTY_CONVERSION_DECISION/1.1";
const PROVIDER = "google_analytics_4";
const MEASUREMENT_ID = "G-MT2G5L4KBR";
const PROPERTY_ID = "494051528";
const STREAM_ID = "11376849383";
const CONSENT_KEY = "confenge_google_analytics_consent";
const CONSENT_SETTER = "confengeSetGoogleAnalyticsConsent";
const QUEUE_NAME = "confengeGaQueue";
const AUTHORIZED_RUNTIME_FILES = Object.freeze([
  "js/modules/analytics.js",
  "script.js",
]);

const ALLOWED_EVENTS = Object.freeze([
  "content_to_service", "cta_click", "editorial_page_view", "email_click",
  "lead_form_error", "lead_form_start", "lead_form_submit", "lead_form_success", "offer_view",
  "page_view", "scroll_depth", "service_page_view", "whatsapp_click",
]);
const ALLOWED_PROPERTIES = Object.freeze([
  "page_location", "page_referrer", "page_title",
]);
const FORBIDDEN_EXPORTS = Object.freeze([
  "pii", "raw_url", "query", "fragment", "raw_referrer", "lead_id", "receipt_id",
  "correlation_id", "event_id", "session_id", "cta_id", "asset_id", "destination_service_id",
]);
const CONTRACT_VIOLATIONS = Object.freeze([
  "consent_default_changes_from_denied",
  "withdrawal_stops_working",
  "retroactive_export_is_enabled",
  "provider_or_measurement_id_changes",
  "pii_raw_url_or_internal_identifier_is_exported",
  "advertising_or_server_side_export_is_enabled",
]);

const EXCLUDED_DIRS = new Set([
  ".git", ".claude", ".worktrees", "node_modules", "docs", "tests",
  "test-results", "_site", "fixtures",
]);
const RUNTIME_EXTENSIONS = new Set([
  ".cjs", ".css", ".html", ".js", ".jsx", ".mjs", ".py", ".sh",
  ".toml", ".ts", ".tsx", ".yaml", ".yml",
]);
const SELF_TEST_FILES = new Set([
  "scripts/site/third_party_analytics_gate.mjs",
  "seo/scripts/test_third_party_analytics_gate.mjs",
]);
const EXTERNAL_ANALYTICS_PATTERNS = Object.freeze([
  ["google_analytics_4", /googletagmanager\.com\/gtag\/js|google-analytics\.com\/g\/collect|"react-ga4"\s*:/i],
  ["google_tag_manager", /googletagmanager\.com\/(?:gtm\.js|ns\.html)|\bGTM-[A-Z0-9-]+\b/i],
  ["plausible", /plausible\.io\/(?:js|api\/event)|PLAUSIBLE_(?:DOMAIN|FORWARD|API_URL)|"plausible-tracker"\s*:/i],
  ["meta_pixel", /connect\.facebook\.net\/.+fbevents|facebook\.com\/tr/i],
  ["microsoft_clarity", /clarity\.ms\/tag|clarity\.ms\/collect/i],
  ["microsoft_ads", /bat\.bing\.com\/bat\.js/i],
  ["hotjar", /static\.hotjar\.com|script\.hotjar\.com/i],
  ["segment", /cdn\.segment\.com\/analytics\.js|api\.segment\.io|"@segment\/analytics[^"/]*"\s*:/i],
  ["fathom", /cdn\.usefathom\.com\/script\.js/i],
  ["cloudflare_beacon", /static\.cloudflareinsights\.com\/beacon/i],
  ["matomo", /matomo\.js|matomo\.php|"@datapunt\/matomo-tracker-js"\s*:/i],
  ["tiktok_pixel", /analytics\.tiktok\.com\/(?:i18n\/pixel|api\/v\d\/pixel)/i],
  ["linkedin_insight", /snap\.licdn\.com\/li\.lms-analytics/i],
  ["x_ads", /static\.ads-twitter\.com\/uwt\.js/i],
  ["google_ads", /googleadservices\.com\/pagead\/conversion|\bAW-\d{6,}\b/i],
  ["posthog", /"posthog-js"\s*:/i],
  ["mixpanel", /"mixpanel-browser"\s*:/i],
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
  for (const [rawFilename, content] of entries) {
    const filename = String(rawFilename).replaceAll("\\", "/");
    const measurementIds = [...new Set(String(content).match(/\bG-[A-Z0-9]{10}\b/g) || [])].sort();
    for (const [provider, pattern] of EXTERNAL_ANALYTICS_PATTERNS) {
      if (!pattern.test(content)) continue;
      // Only the two reviewed consent-gated assets are browser exporters. Treat
      // every other occurrence as forbidden forwarding instead of guessing from
      // its extension or directory name.
      const channel = AUTHORIZED_RUNTIME_FILES.includes(filename)
        ? "browser_tag"
        : "server_side_forward";
      hits.push({ filename, provider, channel, measurement_ids: measurementIds });
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

function sameSet(actual, expected) {
  return Array.isArray(actual) &&
    JSON.stringify([...new Set(actual)].sort()) === JSON.stringify([...expected].sort());
}

export function hasExactGaEventAllowlist(source) {
  for (const match of String(source).matchAll(/new Set\(\[([^\]]*)\]\)/g)) {
    const values = [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
    if (sameSet(values, ALLOWED_EVENTS)) return true;
  }
  return false;
}

export function generatedHtmlErrors(root, required = false) {
  const artifactRoot = path.join(root, "_site");
  if (!fs.existsSync(artifactRoot)) {
    return required ? ["generated public artifact _site is required for the external analytics census"] : [];
  }
  const artifactHtml = walk(artifactRoot, (full) => path.extname(full) === ".html")
    .map((full) => [path.relative(root, full).split(path.sep).join("/"), fs.readFileSync(full, "utf8")]);
  const artifactHits = detectExternalAnalytics(artifactHtml);
  return artifactHits.length
    ? [`generated HTML must not directly bootstrap external analytics: ${artifactHits.map((hit) => hit.filename).join(", ")}`]
    : [];
}

export function validateDecision(decision, hits, options = {}) {
  const errors = [];
  const exists = options.pathExists || (() => false);
  if (decision.contract !== CONTRACT || decision.schema_version !== "1.1.0") {
    errors.push("decision contract/schema must be CONFENGE_THIRD_PARTY_CONVERSION_DECISION/1.1");
  }
  if (decision.issue !== "https://github.com/tjsasakifln/web-cfg/issues/247") {
    errors.push("decision must remain bound to web-cfg issue #247");
  }
  if (decision.decision_state !== "EXECUTE" || !nonEmpty(decision.decision_owner)) {
    errors.push("the confirmed measurement decision must remain owned and EXECUTE");
  }
  if (!isIsoDate(decision.decided_at) || !isIsoDate(decision.review_at) || decision.review_at < decision.decided_at) {
    errors.push("decision and review dates must be ordered valid ISO dates");
  }

  const declared = decision.decision || {};
  if (
    declared.browser_tag_authorized !== true ||
    declared.server_side_forward_authorized !== false ||
    declared.provider !== PROVIDER ||
    declared.purpose !== "optional_site_measurement" ||
    declared.advertising_authorized !== false ||
    !nonEmpty(declared.reason)
  ) {
    errors.push("only consented GA4 browser measurement is authorized");
  }

  const browser = decision.browser_contract || {};
  const consent = browser.consent || {};
  if (
    browser.provider !== PROVIDER || browser.measurement_id !== MEASUREMENT_ID ||
    browser.property_id !== PROPERTY_ID || browser.web_stream_id !== STREAM_ID ||
    browser.hostname !== "confenge.com.br" || browser.loader_origin !== "https://www.googletagmanager.com"
  ) {
    errors.push("GA4 provider/property/stream/measurement configuration drift");
  }
  if (
    consent.storage_key !== CONSENT_KEY || !sameSet(consent.allowed_values, ["denied", "granted"]) ||
    consent.default_state !== "denied" || consent.google_consent_type !== "analytics_storage" ||
    consent.setter !== CONSENT_SETTER || consent.queue !== QUEUE_NAME ||
    consent.first_party_master_opt_out_precedence !== true || consent.withdrawal_supported !== true ||
    consent.retroactive_event_replay !== false
  ) {
    errors.push("GA4 consent contract must be default-denied, revocable and non-retroactive");
  }

  const exportPolicy = decision.event_export_policy || {};
  if (
    !sameSet(exportPolicy.allowlisted_events, ALLOWED_EVENTS) ||
    !sameSet(exportPolicy.allowlisted_properties, ALLOWED_PROPERTIES) ||
    !sameSet(exportPolicy.forbidden, FORBIDDEN_EXPORTS) ||
    exportPolicy.page_location_policy !== "canonical_origin_plus_safe_path_without_query_or_fragment" ||
    exportPolicy.page_referrer_policy !== "empty_string" ||
    exportPolicy.page_title_policy !== "constant_CONFENGE" ||
    exportPolicy.allowlisted_properties_scope !== "explicit_app_parameters_only" ||
    exportPolicy.provider_added_protocol_fields_acknowledged !== true ||
    exportPolicy.custom_event_properties !== false ||
    exportPolicy.google_signals !== false || exportPolicy.advertising_features !== false
  ) {
    errors.push("GA4 event/property allowlist or privacy exclusions drift");
  }

  const baseline = decision.first_party_baseline || {};
  if (
    baseline.required !== true || baseline.collector !== "/api/web/collect" ||
    baseline.source !== "CONFENGE_WEB" || baseline.pii_policy !== "aggregate_allowlist_empty" ||
    baseline.third_party_cookie_required !== false || baseline.independent_of_google_analytics !== true
  ) {
    errors.push("first-party collector must remain required, independent and PII-empty");
  }

  const providers = [...new Set(hits.map((hit) => hit.provider))];
  const channels = [...new Set(hits.map((hit) => hit.channel))];
  const runtimeIds = [...new Set(hits.flatMap((hit) => hit.measurement_ids || []))];
  const unauthorizedRuntimeFiles = hits
    .map((hit) => hit.filename)
    .filter((filename) => !AUTHORIZED_RUNTIME_FILES.includes(filename));
  if (!hits.length) errors.push("EXECUTE requires the reviewed GA4 runtime in the same revision");
  if (unauthorizedRuntimeFiles.length) {
    errors.push(`GA4 loader/export is present in an unauthorized runtime file: ${[...new Set(unauthorizedRuntimeFiles)].join(", ")}`);
  }
  if (providers.length !== 1 || providers[0] !== PROVIDER) {
    errors.push("runtime must contain exactly the authorized GA4 provider");
  }
  if (channels.length !== 1 || channels[0] !== "browser_tag") {
    errors.push("server-side analytics forwarding remains forbidden");
  }
  if (runtimeIds.length !== 1 || runtimeIds[0] !== MEASUREMENT_ID) {
    errors.push("runtime must contain exactly the confirmed GA4 measurement ID");
  }

  const gate = decision.promotion_gate || {};
  const measurement = gate.measurement_authorization || {};
  if (
    gate.all_required !== true || measurement.confirmed !== true ||
    measurement.scope !== "confenge.com.br_optional_measurement_only" ||
    measurement.property_id !== PROPERTY_ID || measurement.web_stream_id !== STREAM_ID ||
    measurement.measurement_id !== MEASUREMENT_ID
  ) {
    errors.push("confirmed measurement authorization must match the browser contract");
  }
  const explicit = gate.explicit_consent || {};
  if (
    explicit.required !== true || explicit.current_state !== "ENFORCED" ||
    explicit.default_state !== "denied" || explicit.opt_in_before_export !== true ||
    explicit.withdrawal_supported !== true || explicit.retroactive_export !== false ||
    !isSafeRepoRef(explicit.contract_ref) || !exists(explicit.contract_ref) ||
    !isSafeRepoRef(explicit.enforcement_test_ref) || !exists(explicit.enforcement_test_ref)
  ) {
    errors.push("versioned default-denied consent and enforcement test are required");
  }
  const paid = gate.paid_advertising_gate || {};
  if (
    paid.issue !== "https://github.com/tjsasakifln/web-cfg/issues/87" ||
    paid.current_state !== "VALIDATE" || paid.google_ads_authorized !== false ||
    paid.marketing_personalization_authorized !== false || paid.spend_approved !== false ||
    paid.spend_cap_brl !== null || paid.spend_approval_ref !== null ||
    paid.independent_of_measurement_authorization !== true
  ) {
    errors.push("issue #87 advertising, marketing and spend must remain unapproved");
  }
  const privacy = gate.privacy || {};
  if (
    privacy.pii_policy !== "aggregate_allowlist_empty" || privacy.raw_url_export !== false ||
    privacy.internal_identifier_export !== false || privacy.privacy_notice_ref !== "privacidade/index.html" ||
    !exists(privacy.privacy_notice_ref) || privacy.zero_pii_gate !== "npm run test:analytics"
  ) {
    errors.push("external measurement cannot relax PII, raw URL or internal-ID policy");
  }
  const authorization = gate.authorization || {};
  if (
    authorization.provider !== PROVIDER || authorization.scope !== "optional_site_measurement" ||
    !nonEmpty(authorization.approved_by) || !isIsoDate(authorization.approved_at) ||
    authorization.approved_at !== decision.decided_at
  ) {
    errors.push("provider authorization owner, scope and decision date are required");
  }

  const revisit = decision.measurable_revisit_trigger || {};
  if (
    revisit.mode !== "review_on_date_or_contract_violation" || revisit.review_on !== decision.review_at ||
    !sameSet(revisit.contract_violations, CONTRACT_VIOLATIONS)
  ) {
    errors.push("measurement review date and fail-closed contract triggers must remain complete");
  }
  return errors;
}

export function runGate(root = ROOT, options = {}) {
  const decisionFile = path.join(root, DECISION_PATH);
  if (!fs.existsSync(decisionFile)) return { errors: [`missing ${DECISION_PATH}`], hits: [] };
  const decision = JSON.parse(fs.readFileSync(decisionFile, "utf8"));
  const files = runtimeFiles(root);
  const entries = files.map((full) => [path.relative(root, full).split(path.sep).join("/"), fs.readFileSync(full, "utf8")]);
  const hits = detectExternalAnalytics(entries);
  const errors = validateDecision(decision, hits, {
    pathExists: (rel) => fs.existsSync(path.join(root, rel)),
  });
  const detectedRuntimeFiles = [...new Set(hits.map((hit) => hit.filename))];
  if (!sameSet(detectedRuntimeFiles, AUTHORIZED_RUNTIME_FILES)) {
    errors.push("GA4 runtime must exist only in the reviewed analytics module and shipped bundle");
  }

  const artifactRequired = options.publicArtifactRequired ?? process.env.PUBLIC_ARTIFACT_REQUIRED === "1";
  errors.push(...generatedHtmlErrors(root, artifactRequired));

  const browser = fs.readFileSync(path.join(root, "js/modules/analytics.js"), "utf8");
  const shipped = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const collector = fs.readFileSync(path.join(root, "netlify/functions/collect.cjs"), "utf8");
  if (!browser.includes("/api/web/collect") || !shipped.includes("/api/web/collect")) {
    errors.push("browser analytics no longer targets the first-party collector");
  }
  if (!collector.includes('collector: "confenge-first-party"')) {
    errors.push("first-party collector identity missing");
  }
  for (const [label, source] of [["module", browser], ["shipped bundle", shipped]]) {
    if (!hasExactGaEventAllowlist(source)) {
      errors.push(`${label} must contain the exact GA4 event allowlist from the decision contract`);
    }
    for (const literal of [
      MEASUREMENT_ID, CONSENT_KEY, CONSENT_SETTER, QUEUE_NAME, "analytics_storage",
      "ad_storage", "ad_user_data", "ad_personalization", "allow_google_signals",
      "send_page_view", "page_location", "page_referrer", "page_title",
    ]) {
      if (!source.includes(literal)) errors.push(`${label} missing GA4 consent contract literal ${literal}`);
    }
    if (!source.includes("googletagmanager.com/gtag/js")) {
      errors.push(`${label} missing the reviewed GA4 loader`);
    }
    if (!source.includes("gtag/js?id=") || !source.includes("&l=")) {
      errors.push(`${label} must bind the reviewed measurement and custom queue in the GA4 loader URL`);
    }
    if (!source.includes("referrerPolicy") || !source.includes("no-referrer")) {
      errors.push(`${label} GA4 loader must suppress the request referrer`);
    }
    for (const key of ["ad_storage", "ad_user_data", "ad_personalization"]) {
      if (!new RegExp(`${key}\\s*:\\s*["']denied["']`).test(source)) {
        errors.push(`${label} must keep ${key}=denied`);
      }
    }
    for (const key of ["allow_google_signals", "send_page_view"]) {
      if (!new RegExp(`${key}\\s*:\\s*(?:false|!1)`).test(source)) {
        errors.push(`${label} must keep ${key}=false`);
      }
    }
    if (!/page_title\s*:\s*["']CONFENGE["']/.test(source)) {
      errors.push(`${label} must keep page_title as the constant CONFENGE label`);
    }
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
  console.log("THIRD_PARTY_ANALYTICS_GATE_OK", JSON.stringify({
    decision_state: result.decision.decision_state,
    provider: result.decision.decision.provider,
    review_at: result.decision.review_at,
    scanned: result.scanned,
    external_hits: result.hits.length,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
