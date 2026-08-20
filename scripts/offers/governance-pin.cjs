/**
 * Read-only pin of Governance PR #9. Not a second writable catalog.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const PIN_PATH = path.join(ROOT, "data", "offers", "governance-authority-pin.json");
const SNAPSHOT_PATH = path.join(ROOT, "data", "offers", "catalog.snapshot.json");
const MAPPING_PATH = path.join(ROOT, "data", "offers", "provider-mapping.json");
const COPIED_CATALOG = path.join(ROOT, "data", "offers", "catalog.v1.json");

function loadPin() {
  return JSON.parse(fs.readFileSync(PIN_PATH, "utf8"));
}

function validatePin(pin = loadPin()) {
  const fails = [];
  if (!/^[0-9a-f]{40}$/.test(String(pin.git_sha || ""))) fails.push("git_sha");
  const hash = String(pin.authority_hash || "");
  if (!/^sha256:[0-9a-f]{64}$/.test(hash)) fails.push("authority_hash");
  if (pin.writable_catalog_copied !== false) fails.push("writable_catalog_copied");
  if (pin.production_checkout_enabled !== false) fails.push("production_checkout_enabled");
  if (pin.production_webhook_enabled !== false) fails.push("production_webhook_enabled");
  if (pin.real_money_mutation_approved !== false) fails.push("real_money_mutation_approved");
  if (pin.mapping_ids !== null) fails.push("mapping_ids");
  if (fs.existsSync(COPIED_CATALOG)) fails.push("copied_catalog.v1.json");
  if (Number(pin.governance_pr) !== 9) fails.push("governance_pr");
  return { ok: fails.length === 0, fails, pin };
}

function validateDrift(pin = loadPin()) {
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8"));
  const fails = [];
  const expected = pin.offer_amount_cents || {};
  for (const [id, cents] of Object.entries(expected)) {
    const row = (snapshot.offers || []).find((o) => o.offer_id === id);
    if (!row || row.amount_cents !== cents) fails.push(`amount_drift_${id}`);
    const map = (mapping.offers || {})[id];
    if (
      !map ||
      map.asaas_product_id != null ||
      map.asaas_checkout_url != null ||
      map.asaas_subscription_template_id != null
    ) {
      fails.push(`mapping_not_null_${id}`);
    }
  }
  return { ok: fails.length === 0, fails };
}

module.exports = {
  PIN_PATH,
  loadPin,
  validatePin,
  validateDrift,
};
