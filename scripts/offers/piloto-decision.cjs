/**
 * Versioned authority for the /piloto/ checkout decision.
 * Invalid, missing, DEFER and SUNSET decisions all fail closed for production.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DECISION_PATH = path.join(__dirname, "../../data/offers/piloto-checkout-decision.v1.json");
const SCHEMA = "confenge.piloto-checkout-decision/1.0";
const STATES = new Set(["EXECUTE", "DEFER", "SUNSET"]);
const CRITERIA = new Set([
  "parent-88-execute",
  "qualified-demand",
  "external-approvals",
  "canary-readiness",
]);

function loadDecision() {
  try {
    return JSON.parse(fs.readFileSync(DECISION_PATH, "utf8"));
  } catch {
    return null;
  }
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validateDecision(decision) {
  const errors = [];
  if (!decision || typeof decision !== "object") return { ok: false, errors: ["decision_missing"] };
  if (decision.schema !== SCHEMA) errors.push("schema_invalid");
  if (decision.issue !== 251 || decision.parent_issue !== 88) errors.push("issue_scope_invalid");
  if (!STATES.has(decision.decision_state)) errors.push("decision_state_invalid");
  if (!isDate(decision.decided_on) || !isDate(decision.review_on)) errors.push("decision_dates_invalid");
  if (isDate(decision.decided_on) && isDate(decision.review_on) && decision.review_on < decision.decided_on) {
    errors.push("review_before_decision");
  }
  if (!String(decision.owner || "").trim()) errors.push("owner_missing");

  const scope = decision.scope || {};
  const rows = Array.isArray(scope.url_decisions) ? scope.url_decisions : [];
  if (scope.namespace !== "/piloto/" || scope.expected_html_pages !== 24 || rows.length !== 24) {
    errors.push("scope_invalid");
  }
  const urls = rows.map((row) => row && row.url);
  if (new Set(urls).size !== rows.length || urls.some((url) => !/^\/piloto\/(?:.*\/)?$/.test(String(url || "")))) {
    errors.push("url_scope_invalid");
  }
  const dispositions = new Set(["DEFER", "EXECUTE", "MIGRATE", "REDIRECT", "RETIRE"]);
  if (rows.some((row) => !row || !dispositions.has(row.decision))) errors.push("url_decision_invalid");
  if (decision.decision_state === "DEFER" && rows.some((row) => row.decision !== "DEFER")) {
    errors.push("defer_url_decision_invalid");
  }
  if (decision.decision_state === "EXECUTE" && !rows.some((row) => row.decision === "EXECUTE")) {
    errors.push("execute_url_decision_missing");
  }
  if (decision.decision_state === "SUNSET") {
    if (rows.some((row) => !["MIGRATE", "REDIRECT", "RETIRE"].includes(row.decision))) {
      errors.push("sunset_url_decision_invalid");
    }
    if (rows.some((row) => row.decision === "REDIRECT"
      && (!String(row.destination || "").startsWith("/") || row.destination === "/"))) {
      errors.push("sunset_redirect_invalid");
    }
  }

  const gate = decision.reopening_gate || {};
  const criteria = Array.isArray(gate.criteria) ? gate.criteria : [];
  if (gate.mode !== "ALL" || criteria.length !== CRITERIA.size) errors.push("reopening_gate_invalid");
  const ids = new Set(criteria.map((row) => row && row.id));
  if (ids.size !== CRITERIA.size || [...CRITERIA].some((id) => !ids.has(id))) errors.push("reopening_criteria_invalid");
  if (criteria.some((row) => !row || !String(row.measure || "").trim() || !String(row.threshold || "").trim())) {
    errors.push("reopening_measure_invalid");
  }

  const analytics = decision.analytics || {};
  if (analytics.source !== "CONFENGE_WEB" || analytics.aggregate_only !== true
      || !Array.isArray(analytics.pii_allowlist) || analytics.pii_allowlist.length !== 0) {
    errors.push("analytics_contract_invalid");
  }

  if (decision.decision_state !== "EXECUTE" && decision.activation_authorized !== false) {
    errors.push("non_execute_activation_forbidden");
  }
  if (decision.decision_state === "EXECUTE") {
    if (decision.activation_authorized !== true) errors.push("execute_authorization_missing");
    if (criteria.some((row) => row.status !== "PASS" || !String(row.evidence_ref || "").trim())) {
      errors.push("execute_evidence_incomplete");
    }
  }

  return { ok: errors.length === 0, errors };
}

function productionAuthorized(decision = loadDecision()) {
  const validation = validateDecision(decision);
  return validation.ok
    && decision.decision_state === "EXECUTE"
    && decision.activation_authorized === true;
}

function applyDecisionGuard(flags, decision = loadDecision()) {
  if (productionAuthorized(decision)) return { ...flags };
  const sandbox = String(flags && flags.ASAAS_MODE || "").trim() === "sandbox";
  const activationRequested = String(flags && flags.ASAAS_MODE || "").trim() === "production"
    || [
      "CONFENGE_OFFER_CATALOG_PUBLIC",
      "production_checkout_enabled",
      "production_webhook_enabled",
      "real_money_mutation_enabled",
      "diag_checkout_enabled",
      "webhook_apply_enabled",
      "onboarding_enabled",
    ].some((name) => flags && flags[name] === true);
  const guarded = {
    ...flags,
    CONFENGE_OFFER_CATALOG_PUBLIC: false,
    ASAAS_MODE: sandbox ? "sandbox" : "disabled",
    production_checkout_enabled: false,
    production_webhook_enabled: false,
    real_money_mutation_enabled: false,
    diag_checkout_enabled: false,
    webhook_apply_enabled: false,
    onboarding_enabled: false,
  };
  Object.defineProperty(guarded, "decision_blocked_activation", {
    value: activationRequested,
    enumerable: false,
  });
  return guarded;
}

function walkHtml(directory, root = directory) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walkHtml(absolute, root));
    else if (entry.isFile() && entry.name.endsWith(".html")) found.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return found;
}

function urlToHtml(url) {
  if (url === "/piloto/") return "index.html";
  return `${url.slice("/piloto/".length)}index.html`;
}

function validateRepository(root, decision = loadDecision(), options = {}) {
  const validation = validateDecision(decision);
  const errors = [...validation.errors];
  if (!validation.ok) return { ok: false, errors };

  const today = String(options.today || new Date().toISOString().slice(0, 10));
  if (decision.decision_state === "DEFER" && today > decision.review_on) errors.push("defer_review_overdue");

  const actualFiles = walkHtml(path.join(root, "piloto"));
  const expectedFiles = decision.scope.url_decisions.map((row) => urlToHtml(row.url));
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedFiles);
  if (actualFiles.length !== decision.scope.expected_html_pages
      || expectedFiles.some((file) => !actualSet.has(file))
      || actualFiles.some((file) => !expectedSet.has(file))) {
    errors.push("piloto_html_inventory_drift");
  }

  for (const file of actualFiles) {
    const html = fs.readFileSync(path.join(root, "piloto", file), "utf8");
    const robotsMeta = (html.match(/<meta\b[^>]*>/gi) || []).find((tag) => /name=["']robots["']/i.test(tag));
    if (!robotsMeta || !/content=["'][^"']*noindex/i.test(robotsMeta)) {
      errors.push(`piloto_noindex_missing:${file}`);
    }
  }

  const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  if (!/^Disallow:\s*\/piloto\/\s*$/m.test(robots)) errors.push("robots_disallow_missing");
  const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
  if (!/\/piloto\/ofertas\/\*[\s\S]*?X-Robots-Tag:\s*noindex,\s*nofollow/i.test(headers)) {
    errors.push("offer_headers_noindex_missing");
  }

  for (const sitemap of fs.readdirSync(root).filter((name) => /^sitemap.*\.(?:xml|txt)$/i.test(name))) {
    const body = fs.readFileSync(path.join(root, sitemap), "utf8");
    if (/https:\/\/confenge\.com\.br\/piloto\//i.test(body)) errors.push(`piloto_in_sitemap:${sitemap}`);
  }

  if (decision.decision_state !== "EXECUTE") {
    const flagsRaw = fs.readFileSync(path.join(root, "data/offers/flags.json"));
    const digest = crypto.createHash("sha256").update(flagsRaw).digest("hex");
    if (digest !== decision.scope.defer_flags_sha256) errors.push("defer_flags_changed");
    let mapping = null;
    try {
      mapping = JSON.parse(fs.readFileSync(path.join(root, "data/offers/provider-mapping.json"), "utf8"));
    } catch {
      errors.push("provider_mapping_invalid");
    }
    if (mapping && (mapping.environment !== "unassigned"
      || Object.values(mapping.offers || {}).some((row) => Object.values(row || {}).some((value) => value != null)))) {
      errors.push("provider_mapping_present_while_deferred");
    }
  }

  return { ok: errors.length === 0, errors };
}

if (require.main === module) {
  const root = path.resolve(__dirname, "../..");
  const result = validateRepository(root);
  if (!result.ok) {
    console.error(`piloto decision gate failed: ${result.errors.join(", ")}`);
    process.exit(1);
  }
  console.log("piloto decision gate passed");
}

module.exports = {
  DECISION_PATH,
  SCHEMA,
  loadDecision,
  validateDecision,
  productionAuthorized,
  applyDecisionGuard,
  validateRepository,
};
