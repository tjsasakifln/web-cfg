"use strict";

/**
 * Read-only consumer of the canonical commercial registries (#329 family).
 *
 * The registry is the auditable source for deliverable scope, price and public
 * state. Nothing here writes, prices or promotes: promotion needs observed
 * evidence recorded under the market-fit protocol, not a code path.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data/commercial");

const REGISTRY_PATH = path.join(DATA_DIR, "deliverables-registry.v1.json");
const PROTOCOL_PATH = path.join(DATA_DIR, "market-fit-protocol.v1.json");
const FIRST_FOLD_PATH = path.join(DATA_DIR, "first-fold-contract.v1.json");
const REAL_PROOF_PATH = path.join(DATA_DIR, "real-proof-registry.v1.json");
const OFFER_SNAPSHOT_PATH = path.join(ROOT, "data/offers/catalog.snapshot.json");

const PUBLISHED_STATES = new Set(["PUBLISHED", "VALIDATE", "BLOCKED"]);
const PRICE_STATES = new Set(["PUBLISHED_FIRM", "PILOT_HYPOTHESIS", "NOT_PRICED"]);
const LIFECYCLE_STAGES = ["DISCOVER", "DECIDE", "PROTECT", "OPERATE"];
const EVIDENCE_GRADES = ["FACT", "CALCULATION", "INFERENCE", "UNKNOWN"];
const MARKET_FIT_STATES = new Set(["HOLD", "ADJUST", "PROMOTE"]);

// Fields every entry must carry. #335 requires a versioned registry, not a
// prose table, so absence of a field is a CI failure and not a default.
const REQUIRED_FIELDS = [
  "deliverable_id",
  "version",
  "catalog_number",
  "public_name",
  "decision_question",
  "lifecycle_stage",
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
const MAX_OPTIONS_WITHOUT_DISCLOSURE = 6;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadRegistry() {
  return readJson(REGISTRY_PATH);
}

function loadProtocol() {
  return readJson(PROTOCOL_PATH);
}

function loadFirstFoldContract() {
  return readJson(FIRST_FOLD_PATH);
}

function loadRealProofRegistry() {
  return readJson(REAL_PROOF_PATH);
}

function loadOfferSnapshot() {
  return readJson(OFFER_SNAPSHOT_PATH);
}

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

/** Every string reachable from a value, for lexicon scanning. */
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
 * Affirmative-claim scan.
 *
 * The same words are legitimate inside `exclusions` and inside boundary copy
 * ("prometer vitória", "sem comissão de êxito"), so those branches are skipped:
 * the gate exists to catch a promise, not a disclaimer.
 */
const FORBIDDEN_CLAIM_PATTERNS = [
  /\bpromet\w*\s+(vit[óo]ria|habilita\w*|adjudica\w*)/i,
  /\bgarant\w*\s+(vit[óo]ria|habilita\w*|recebimento|recupera\w*|afastamento)/i,
  /\bbom\s+pagador\b/i,
  /\bempresa\s+limpa\b/i,
  /\bpre[çc]o\s+vencedor\b/i,
  /\blance\s+vencedor\b/i,
  // "sem comissão de êxito" is a boundary, not an offer, so the negation is excluded.
  /(?<!sem\s)\bcomiss[ãa]o\s+de\s+[êe]xito\b/i,
];

const CLAIM_SAFE_KEYS = new Set(["exclusions", "kill_rules", "forbidden", "pricing_discipline", "principles"]);

function scanForbiddenClaims(value, rootPath) {
  const strings = collectStrings(value, rootPath || "", []);
  const findings = [];
  for (const { path: keyPath, value: text } of strings) {
    const segments = keyPath.split(/[.[]/);
    if (segments.some((segment) => CLAIM_SAFE_KEYS.has(segment.replace(/\]$/, "")))) continue;
    for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
      if (pattern.test(text)) findings.push({ path: keyPath, text, pattern: String(pattern) });
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
  if ((evidence.problem || 0) < gate.min_recent_triggers) {
    reasons.push(`problem_evidence<${gate.min_recent_triggers}`);
  }
  if ((evidence.solution || 0) < gate.min_qualified_handraises) {
    reasons.push(`solution_evidence<${gate.min_qualified_handraises}`);
  }
  if ((evidence.price || 0) < gate.min_plausible_proposals_at_published_price) {
    reasons.push(`price_evidence<${gate.min_plausible_proposals_at_published_price}`);
  }
  if ((evidence.delivery || 0) < 1) reasons.push("delivery_evidence<1");
  return { eligible: reasons.length === 0, reasons };
}

module.exports = {
  ROOT,
  REGISTRY_PATH,
  PROTOCOL_PATH,
  FIRST_FOLD_PATH,
  REAL_PROOF_PATH,
  OFFER_SNAPSHOT_PATH,
  PUBLISHED_STATES,
  PRICE_STATES,
  LIFECYCLE_STAGES,
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
  loadOfferSnapshot,
  deliverableById,
  containerById,
  entryAmountCents,
  isPriced,
  collectStrings,
  scanForbiddenClaims,
  evaluatePromotion,
};
