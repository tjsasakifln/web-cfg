"use strict";

/**
 * Read-only consumer of the canonical commercial registries (#329 family).
 *
 * The registry is the auditable source for deliverable scope, price, name and
 * public state. Nothing here writes, prices or promotes: promotion needs
 * observed evidence recorded under the market-fit protocol, not a code path.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data/commercial");

const REGISTRY_PATH = path.join(DATA_DIR, "deliverables-registry.v1.json");
const PROTOCOL_PATH = path.join(DATA_DIR, "market-fit-protocol.v1.json");
const FIRST_FOLD_PATH = path.join(DATA_DIR, "first-fold-contract.v1.json");
const REAL_PROOF_PATH = path.join(DATA_DIR, "real-proof-registry.v1.json");
const NAMING_PATH = path.join(DATA_DIR, "offer-naming.v1.json");
const PRICING_PATH = path.join(DATA_DIR, "pricing-policy.v1.json");
const COPY_PATH = path.join(DATA_DIR, "copy-contract.v1.json");
const OFFER_SNAPSHOT_PATH = path.join(ROOT, "data/offers/catalog.snapshot.json");

const PUBLIC_STATES = new Set(["PUBLISHED", "VALIDATE", "BLOCKED"]);
const PRICE_STATES = new Set(["PUBLISHED_FIRM", "PILOT_HYPOTHESIS", "NOT_PRICED"]);
const NAME_STATES = new Set(["CANONICAL", "RENAME_PENDING"]);
const EVIDENCE_GRADES = ["FACT", "CALCULATION", "INFERENCE", "UNKNOWN"];
const MARKET_FIT_STATES = new Set(["HOLD", "ADJUST", "PROMOTE"]);

// #335 organises the catalogue by task, in seven doors, each item exactly once.
const TASK_DOORS = ["GROW", "QUALIFY", "PROPOSE", "START", "PROTECT", "CLOSE", "CAPABILITY"];

const REQUIRED_FIELDS = [
  "deliverable_id",
  "version",
  "catalog_number",
  "public_name",
  "public_name_pt_br",
  "name_aliases",
  "name_state",
  "decision_question",
  "task_door",
  "trigger",
  "price",
  "price_state",
  "sla",
  "scope",
  "required_inputs",
  "included_outputs",
  "exclusions",
  "data_contract",
  "offer_container",
  "credit_rule",
  "capacity_required",
  "public_state",
  "checkout_enabled",
  "blocking_issue",
  "route",
  "lead_destination",
  "analytics",
  "source_issue",
  "market_fit",
];

// Prices frozen by the founder decision of 2026-08-24. #331 forbids changing
// them without paid evidence, so the expected values live in code and any drift
// in the registry fails closed instead of shipping a silent reprice.
const FROZEN_PUBLISHED_PRICES_CENTS = {
  "CFG-D01": 59900,
  "CFG-D02": 69000,
  "CFG-D03": 89000,
  "CFG-D04": 120000,
  "CFG-D05": 145000,
  "CFG-D06": 190000,
  "CFG-D07": 240000,
  "CFG-D08": 375000,
};

const PACKAGE_MEMBERS = ["CFG-D02", "CFG-D03", "CFG-D04", "CFG-D05", "CFG-D06", "CFG-D07", "CFG-D08"];
const PACKAGE_UNBUNDLED_SUM_CENTS = 1228000;
const PACKAGE_AMOUNT_CENTS = 800000;
const MAX_CREDIT_WINDOW_DAYS = 60;
// #335: no more than six options on one screen before subgroup or filter.
const MAX_OPTIONS_WITHOUT_DISCLOSURE = 6;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const loadRegistry = () => readJson(REGISTRY_PATH);
const loadProtocol = () => readJson(PROTOCOL_PATH);
const loadFirstFoldContract = () => readJson(FIRST_FOLD_PATH);
const loadRealProofRegistry = () => readJson(REAL_PROOF_PATH);
const loadNaming = () => readJson(NAMING_PATH);
const loadPricingPolicy = () => readJson(PRICING_PATH);
const loadCopyContract = () => readJson(COPY_PATH);
const loadOfferSnapshot = () => readJson(OFFER_SNAPSHOT_PATH);

function deliverableById(registry, id) {
  return registry.deliverables.find((entry) => entry.deliverable_id === id) || null;
}

function containerById(registry, id) {
  return registry.containers.find((entry) => entry.container_id === id) || null;
}

/** Cents for a single-price entry; tiered entries return the lowest tier. */
function entryAmountCents(entry) {
  if (!entry || !entry.price) return null;
  if (typeof entry.price.amount_cents === "number") return entry.price.amount_cents;
  if (Array.isArray(entry.price.tiers) && entry.price.tiers.length) {
    return Math.min(...entry.price.tiers.map((tier) => tier.amount_cents));
  }
  return null;
}

function isPriced(entry) {
  return entryAmountCents(entry) !== null;
}

/** Every string reachable from a value, with its JSON path. */
function collectStrings(value, keyPath, out) {
  if (typeof value === "string") {
    out.push({ path: keyPath, value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${keyPath}[${index}]`, out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectStrings(item, keyPath ? `${keyPath}.${key}` : key, out);
    }
  }
  return out;
}

/**
 * Fields where a forbidden word is a boundary or a historical name rather than
 * a claim. Documented as gate_exceptions GX-01, GX-02 and GX-04 in the copy
 * contract, so narrowing the scanner stays auditable instead of hidden here.
 */
const CLAIM_SAFE_KEYS = new Set([
  "exclusions",
  "name_aliases",
  "kill_rules",
  "forbidden",
  "pricing_discipline",
  "principles",
  "taxative_commercial_rules",
  "forbidden_name_patterns",
]);

function inSafeBranch(keyPath) {
  return keyPath
    .split(/[.[]/)
    .some((segment) => CLAIM_SAFE_KEYS.has(segment.replace(/\]$/, "")));
}

/**
 * Affirmative-claim scan. The gate exists to catch a promise, not a disclaimer,
 * so "sem comissão de êxito" and "prometer vitória" inside a boundary pass.
 */
const FORBIDDEN_CLAIM_PATTERNS = [
  /\bpromet\w*\s+(vit[óo]ria|habilita\w*|adjudica\w*)/i,
  /\bgarant\w*\s+(vit[óo]ria|habilita\w*|recebimento|recupera\w*|afastamento)/i,
  /\bbom\s+pagador\b/i,
  /\bempresa\s+limpa\b/i,
  /\bpre[çc]o\s+vencedor\b/i,
  /\blance\s+vencedor\b/i,
  // GX-03: only the promise form; the contractual instrument stays describable.
  /\bgarantimos\b/i,
  /(?<!sem\s)\bcomiss[ãa]o\s+de\s+[êe]xito\b/i,
];

function scanForbiddenClaims(value, rootPath) {
  const findings = [];
  for (const { path: keyPath, value: text } of collectStrings(value, rootPath || "", [])) {
    if (inSafeBranch(keyPath)) continue;
    for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
      if (pattern.test(text)) findings.push({ path: keyPath, text, pattern: String(pattern) });
    }
  }
  return findings;
}

function foldAccents(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * #338 marketing-language scan. Only entries the contract marks machine
 * checkable are enforced; the rest are review-only by design.
 */
function scanCopyLanguage(value, copyContract, rootPath) {
  const terms = copyContract.forbidden_language_without_immediate_proof
    .filter((item) => item.machine_checkable && typeof item.term === "string")
    .map((item) => ({ id: item.id, needle: foldAccents(item.term) }));
  const findings = [];
  for (const { path: keyPath, value: text } of collectStrings(value, rootPath || "", [])) {
    if (inSafeBranch(keyPath)) continue;
    const folded = foldAccents(text);
    for (const { id, needle } of terms) {
      // GX-03: "garantia" only reproves as a promise, never as the instrument.
      if (needle === "garantia" && !/garantia\s+de\s+(vit[óo]ria|resultado|recebimento|recupera)/i.test(text)) continue;
      if (folded.includes(needle)) findings.push({ path: keyPath, id, term: needle, text });
    }
  }
  return findings;
}

/**
 * #336 PROMOTE gate. A deliverable may only be promoted with observed evidence
 * in every class the protocol names; anything short of that stays HOLD.
 */
function evaluatePromotion(entry, protocol) {
  const gate = protocol.gates.PROMOTE;
  const evidence = (entry.market_fit && entry.market_fit.evidence) || {};
  const reasons = [];
  if ((evidence.problem || 0) < gate.min_recent_triggers) reasons.push(`problem<${gate.min_recent_triggers}`);
  if ((evidence.solution || 0) < gate.min_qualified_handraises) reasons.push(`solution<${gate.min_qualified_handraises}`);
  if ((evidence.price || 0) < gate.min_plausible_proposals_at_published_price) {
    reasons.push(`price<${gate.min_plausible_proposals_at_published_price}`);
  }
  if ((evidence.delivery || 0) < 1) reasons.push("delivery<1");
  return { eligible: reasons.length === 0, reasons };
}

module.exports = {
  ROOT,
  REGISTRY_PATH,
  PROTOCOL_PATH,
  FIRST_FOLD_PATH,
  REAL_PROOF_PATH,
  NAMING_PATH,
  PRICING_PATH,
  COPY_PATH,
  OFFER_SNAPSHOT_PATH,
  PUBLIC_STATES,
  PRICE_STATES,
  NAME_STATES,
  TASK_DOORS,
  EVIDENCE_GRADES,
  MARKET_FIT_STATES,
  REQUIRED_FIELDS,
  FROZEN_PUBLISHED_PRICES_CENTS,
  PACKAGE_MEMBERS,
  PACKAGE_UNBUNDLED_SUM_CENTS,
  PACKAGE_AMOUNT_CENTS,
  MAX_CREDIT_WINDOW_DAYS,
  MAX_OPTIONS_WITHOUT_DISCLOSURE,
  loadRegistry,
  loadProtocol,
  loadFirstFoldContract,
  loadRealProofRegistry,
  loadNaming,
  loadPricingPolicy,
  loadCopyContract,
  loadOfferSnapshot,
  deliverableById,
  containerById,
  entryAmountCents,
  isPriced,
  collectStrings,
  scanForbiddenClaims,
  scanCopyLanguage,
  evaluatePromotion,
};
