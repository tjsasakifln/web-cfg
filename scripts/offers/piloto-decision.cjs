/**
 * Versioned authority for the /piloto/ checkout decision.
 * Invalid, missing, DEFER and SUNSET decisions all fail closed for production.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DECISION_PATH = path.join(__dirname, "../../data/offers/piloto-checkout-decision.v1.json");
const SCHEMA = "confenge.piloto-checkout-decision/1.0";
const DECISION_ID = "CFG-PILOTO-CHECKOUT-2026-08-24";
const DECIDED_ON = "2026-08-24";
const REVIEW_ON = "2026-09-20";
const OWNER = "tiago-jun-sasaki";
const ISSUE_URL = "https://github.com/tjsasakifln/web-cfg/issues/251";
const ISSUE_DECISION_COMMENT = `${ISSUE_URL}#issuecomment-5389755464`;
const DECISION_DOC = "docs/ops/offers/PILOTO-CHECKOUT-DECISION.md";
const DEFER_FLAGS_SHA256 = "afa4be12f2b9ceb0693cee5e36253aca161b92df40d93678b019d7ee4e629b08";
const REASON = "The 24 /piloto/ pages and production checkout code are prepared assets, but the parent offer decision remains VALIDATE, provider mappings are empty, production flags are off and no versioned evidence authorizes a real-money canary. Preserve the reversible asset while qualified demand from the Warmbly aggregate and external approvals are proved.";
const SUNSET_RULE = "If the review does not justify another DEFER or EXECUTE decision, publish a versioned URL-by-URL MIGRATE/REDIRECT/RETIRE plan for all 24 pages. A blanket redirect to the home page is forbidden.";
const ROLLBACK = "Keep catalog, checkout, webhook and real-money flags false; keep ASAAS_MODE disabled in production. This DEFER schema cannot authorize checkout or rollback receive-only. A later EXECUTE needs a separate reviewed schema and implementation with production_evidence=true, durable cumulative limits and individual authority for every real charge, refund and cancellation. Revert to the last known-good deploy.";

const EXPECTED_URLS = Object.freeze([
  "/piloto/",
  "/piloto/concorrencia/edificacoes-publicas-rs/",
  "/piloto/concorrencia/pavimentacao-infraestrutura-viaria-pr/",
  "/piloto/concorrencia/pavimentacao-infraestrutura-viaria-rs/",
  "/piloto/concorrencia/pavimentacao-infraestrutura-viaria-sc/",
  "/piloto/concorrencia/pavimentacao-infraestrutura-viaria-sp/",
  "/piloto/conversao-xray/",
  "/piloto/mercados/edificacoes-publicas-rs/",
  "/piloto/mercados/pavimentacao-infraestrutura-viaria-pr/",
  "/piloto/mercados/pavimentacao-infraestrutura-viaria-rs/",
  "/piloto/mercados/pavimentacao-infraestrutura-viaria-sc/",
  "/piloto/mercados/pavimentacao-infraestrutura-viaria-sp/",
  "/piloto/ofertas/",
  "/piloto/ofertas/contratar/",
  "/piloto/ofertas/diagnostico-expansao/",
  "/piloto/ofertas/diretoria-180/",
  "/piloto/ofertas/diretoria-365/",
  "/piloto/ofertas/diretoria-flex/",
  "/piloto/ofertas/faq/",
  "/piloto/orgaos/base-administrativa-do-curado-pe-pe/engenharia/",
  "/piloto/orgaos/base-aerea-de-anapolis-go/engenharia/",
  "/piloto/orgaos/eem-euclides-pinheiro-de-andrade-ce/engenharia/",
  "/piloto/orgaos/esp-prestacao-de-servicos-fde-see-sp/engenharia/",
  "/piloto/orgaos/superintendencia-reg-pol-rodv-federal-go-go/engenharia/",
]);

const CRITERIA = Object.freeze([
  Object.freeze({
    id: "parent-88-execute",
    measure: "Issue #88 has a versioned EXECUTE decision naming the canary offer and approved spend",
    threshold: "EXECUTE with one named offer and spend ceiling",
  }),
  Object.freeze({
    id: "qualified-demand",
    measure: "A versioned Warmbly aggregate records qualified willingness to buy the named offer at approved terms, with Governance review",
    threshold: ">= 1 qualified commercial opportunity; aggregate record only, no PII in this contract",
  }),
  Object.freeze({
    id: "external-approvals",
    measure: "Legal, fiscal/NFS-e, delivery-capacity and security approvals are versioned",
    threshold: "4/4 approval references present",
  }),
  Object.freeze({
    id: "canary-readiness",
    measure: "The named offer has provider mapping plus sandbox, negative-path and rollback evidence",
    threshold: "Provider mapping complete for one offer and all required gates green",
  }),
]);

const TOP_KEYS = Object.freeze([
  "schema", "decision_id", "issue", "parent_issue", "decision_evidence",
  "decision_state", "activation_authorized", "decided_on", "review_on", "owner",
  "executive_front", "time_to_evidence_days", "leverage", "reason", "scope",
  "reopening_gate", "analytics", "sunset_rule", "rollback",
]);
const SCOPE_KEYS = Object.freeze([
  "namespace", "expected_html_pages", "robots_rule", "defer_flags_sha256", "url_decisions",
]);
const URL_ROW_KEYS = Object.freeze(["url", "decision"]);
const REOPENING_KEYS = Object.freeze(["mode", "criteria"]);
const CRITERION_KEYS = Object.freeze(["id", "measure", "threshold", "status", "evidence_ref"]);
const ANALYTICS_KEYS = Object.freeze(["source", "aggregate_only", "pii_allowlist", "new_runtime_while_deferred"]);

function loadDecision() {
  try {
    return JSON.parse(fs.readFileSync(DECISION_PATH, "utf8"));
  } catch {
    return null;
  }
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function hasExactKeys(value, expected) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function validateDecision(decision) {
  const errors = [];
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    return { ok: false, errors: ["decision_missing"] };
  }
  if (!hasExactKeys(decision, TOP_KEYS)) errors.push("decision_schema_not_closed");
  if (decision.schema !== SCHEMA) errors.push("schema_invalid");
  if (decision.decision_id !== DECISION_ID) errors.push("decision_id_invalid");
  if (decision.issue !== 251 || decision.parent_issue !== 88) errors.push("issue_scope_invalid");
  if (JSON.stringify(decision.decision_evidence) !== JSON.stringify([ISSUE_URL, ISSUE_DECISION_COMMENT, DECISION_DOC])) {
    errors.push("decision_evidence_invalid");
  }
  if (decision.decision_state !== "DEFER") errors.push("decision_state_not_defer");
  if (decision.activation_authorized !== false) errors.push("activation_authorized_must_be_false");
  if (!isDate(decision.decided_on) || !isDate(decision.review_on)) errors.push("decision_dates_invalid");
  if (decision.decided_on !== DECIDED_ON || decision.review_on !== REVIEW_ON) errors.push("decision_calendar_drift");
  if (isDate(decision.decided_on) && isDate(decision.review_on)) {
    const inclusiveDays = Math.floor(
      (Date.parse(`${decision.review_on}T00:00:00.000Z`) - Date.parse(`${decision.decided_on}T00:00:00.000Z`))
      / 86_400_000,
    ) + 1;
    if (inclusiveDays !== decision.time_to_evidence_days) errors.push("time_to_evidence_mismatch");
  }
  if (decision.owner !== OWNER) errors.push("owner_not_authorized");
  if (decision.executive_front !== "SCALE/SUNSET") errors.push("executive_front_invalid");
  if (decision.time_to_evidence_days !== 28) errors.push("time_to_evidence_invalid");
  if (JSON.stringify(decision.leverage) !== JSON.stringify(["revenue", "trust", "automation"])) {
    errors.push("leverage_invalid");
  }
  if (decision.reason !== REASON) errors.push("decision_reason_drift");
  if (decision.sunset_rule !== SUNSET_RULE) errors.push("sunset_rule_drift");
  if (decision.rollback !== ROLLBACK) errors.push("rollback_drift");

  const scope = decision.scope || {};
  if (!hasExactKeys(scope, SCOPE_KEYS)) errors.push("scope_schema_not_closed");
  const rows = Array.isArray(scope.url_decisions) ? scope.url_decisions : [];
  if (
    scope.namespace !== "/piloto/"
    || scope.expected_html_pages !== EXPECTED_URLS.length
    || scope.robots_rule !== "Disallow: /piloto/"
    || scope.defer_flags_sha256 !== DEFER_FLAGS_SHA256
    || rows.length !== EXPECTED_URLS.length
  ) {
    errors.push("scope_invalid");
  }
  for (let index = 0; index < EXPECTED_URLS.length; index += 1) {
    const row = rows[index];
    if (!hasExactKeys(row, URL_ROW_KEYS)) errors.push(`url_decision_schema_invalid:${index}`);
    if (row?.url !== EXPECTED_URLS[index] || row?.decision !== "DEFER") {
      errors.push(`url_decision_drift:${index}`);
    }
  }

  const gate = decision.reopening_gate || {};
  if (!hasExactKeys(gate, REOPENING_KEYS)) errors.push("reopening_gate_schema_not_closed");
  const criteria = Array.isArray(gate.criteria) ? gate.criteria : [];
  if (gate.mode !== "ALL" || criteria.length !== CRITERIA.length) errors.push("reopening_gate_invalid");
  for (let index = 0; index < CRITERIA.length; index += 1) {
    const row = criteria[index];
    const expected = CRITERIA[index];
    if (!hasExactKeys(row, CRITERION_KEYS)) errors.push(`reopening_criterion_schema_invalid:${index}`);
    if (
      row?.id !== expected.id
      || row?.measure !== expected.measure
      || row?.threshold !== expected.threshold
      || row?.status !== "WAITING"
      || row?.evidence_ref !== null
    ) errors.push(`reopening_criterion_drift:${expected.id}`);
  }

  const analytics = decision.analytics || {};
  if (!hasExactKeys(analytics, ANALYTICS_KEYS)) errors.push("analytics_schema_not_closed");
  if (analytics.source !== "CONFENGE_WEB" || analytics.aggregate_only !== true
      || !Array.isArray(analytics.pii_allowlist) || analytics.pii_allowlist.length !== 0
      || analytics.new_runtime_while_deferred !== false) {
    errors.push("analytics_contract_invalid");
  }

  if (decision.decision_state === "EXECUTE") {
    // #251 records DEFER only. A later EXECUTE needs a new schema and code review
    // that implements durable cumulative limits and individual charge authority.
    errors.push("execute_requires_separate_authority_schema");
  }

  return { ok: errors.length === 0, errors };
}

function productionAuthorized() {
  // This schema intentionally has no executable authority. Environment flags,
  // evidence-looking JSON and a state edit cannot activate real-money runtime.
  return false;
}

function applyDecisionGuard(flags) {
  const sandbox = String(flags && flags.ASAAS_MODE || "").trim() === "sandbox";
  const activationRequested = String(flags && flags.ASAAS_MODE || "").trim() === "production"
    || Boolean(String(flags && flags.legal_authority_hash || "").trim())
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
    CONFENGE_OFFER_CATALOG_PUBLIC: false,
    ASAAS_MODE: sandbox ? "sandbox" : "disabled",
    production_checkout_enabled: false,
    production_webhook_enabled: false,
    real_money_mutation_enabled: false,
    diag_checkout_enabled: false,
    webhook_apply_enabled: false,
    onboarding_enabled: false,
    legal_authority_hash: "",
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

function htmlAttribute(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? match[2] : null;
}

function validateRepository(root, decision = loadDecision(), options = {}) {
  const validation = validateDecision(decision);
  const errors = [...validation.errors];
  if (!validation.ok) return { ok: false, errors };

  const today = String(options.today || new Date().toISOString().slice(0, 10));
  if (!isDate(today)) errors.push("validation_date_invalid");
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
    const robotsMeta = (html.match(/<meta\b[^>]*>/gi) || [])
      .find((tag) => String(htmlAttribute(tag, "name") || "").toLowerCase() === "robots");
    const directives = String(robotsMeta ? htmlAttribute(robotsMeta, "content") : "")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (!directives.includes("noindex")) {
      errors.push(`piloto_noindex_missing:${file}`);
    }
  }

  const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  if (!/^Disallow:\s*\/piloto\/\s*$/m.test(robots)) errors.push("robots_disallow_missing");
  const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
  const offerBlock = headers.match(/(?:^|\n)\/piloto\/ofertas\/\*\r?\n((?:[ \t]+[^\r\n]*(?:\r?\n|$))+)/);
  if (!offerBlock || !/^\s*X-Robots-Tag:\s*noindex,\s*nofollow\s*$/im.test(offerBlock[1])) {
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
