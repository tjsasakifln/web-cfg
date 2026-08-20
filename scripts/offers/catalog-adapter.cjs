/**
 * Server-side offer catalog adapter. Consumes the frozen #88 snapshot plus
 * founder-fillable provider mapping. No scattered Asaas URLs or IDs.
 */
const fs = require("fs");
const path = require("path");
const registry = require("./registry.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SNAPSHOT_PATH = path.join(ROOT, "data", "offers", "catalog.snapshot.json");
const MAPPING_PATH = path.join(ROOT, "data", "offers", "provider-mapping.json");

const EMPTY_MAPPING = Object.freeze({
  asaas_product_id: null,
  asaas_checkout_url: null,
  asaas_subscription_template_id: null,
});

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadCatalogSnapshot() {
  return loadJson(SNAPSHOT_PATH);
}

function loadProviderMapping() {
  return loadJson(MAPPING_PATH);
}

function snapshotRow(offerId) {
  const doc = loadCatalogSnapshot();
  return (doc.offers || []).find((row) => row.offer_id === offerId) || null;
}

function mappingFor(offerId) {
  const doc = loadProviderMapping();
  const row = (doc.offers || {})[offerId];
  if (!row) return { ...EMPTY_MAPPING };
  return {
    asaas_product_id: row.asaas_product_id || null,
    asaas_checkout_url: row.asaas_checkout_url || null,
    asaas_subscription_template_id: row.asaas_subscription_template_id || null,
  };
}

function resolveOffer(offerId, { offer_version, includePaused = false } = {}) {
  if (!offerId) return { ok: false, error: "offer_unknown" };
  const live = registry.getOffer(offerId);
  if (!live) return { ok: false, error: "offer_unknown" };
  const frozen = snapshotRow(offerId);
  if (!frozen) return { ok: false, error: "offer_missing_from_snapshot" };
  if (offer_version && live.offer_version !== offer_version) {
    return { ok: false, error: "unknown_offer_version" };
  }
  if (frozen.amount_cents !== live.amount_cents || frozen.terms_version !== live.terms_version) {
    return { ok: false, error: "catalog_snapshot_drift" };
  }
  if (!includePaused && (live.kill_switch || live.status === "PAUSED" || live.status === "RETIRED" || live.status === "DRAFT")) {
    return { ok: false, error: "offer_not_contractable", offer: registry.snapshotOffer(live) };
  }
  const mapping = mappingFor(offerId);
  return {
    ok: true,
    offer: {
      ...registry.snapshotOffer(live),
      status: live.status,
      kill_switch: live.kill_switch,
      capacity_required: live.capacity_required,
      capacity_units: live.capacity_units,
      billing_mode: live.billing_mode,
      provider_mapping: mapping,
      catalog_version: registry.AUTHORITY.authority_version,
    },
  };
}

function listResolvedOffers({ includePaused = false } = {}) {
  return registry.PUBLIC_OFFER_IDS.map((id) => resolveOffer(id, { includePaused }))
    .filter((row) => row.ok)
    .map((row) => row.offer);
}

function assertNoScatteredAsaasUrls(sourceText) {
  if (/https:\/\/(api|sandbox|www)\.asaas\.com/i.test(sourceText || "")) {
    return { ok: false, error: "scattered_asaas_url" };
  }
  return { ok: true };
}

module.exports = {
  SNAPSHOT_PATH,
  MAPPING_PATH,
  loadCatalogSnapshot,
  loadProviderMapping,
  resolveOffer,
  listResolvedOffers,
  mappingFor,
  assertNoScatteredAsaasUrls,
};
