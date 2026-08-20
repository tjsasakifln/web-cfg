/**
 * Versioned CONFENGE offer registry. Frozen #88 / Governance#1 values.
 * Server-side and testable. No provider IDs, URLs or secrets.
 */
const AUTHORITY = {
  authority_source: "web-cfg#88/Governance#1-fixture-local",
  authority_version: "CFG-OFFER-REGISTRY-2026-08-17-v1",
  terms_version: "CFG-TERMS-B2B-2026-08-17-v1",
  scope_version: "CFG-SCOPE-B2B-2026-08-17-v1",
  frozen_at: "2026-08-17",
  canonical_hash_configurable: true,
  note: "Local freeze of Governance #1 / web-cfg #88. Future canonical hash is configurable, not a merge prerequisite.",
};

const PUBLIC_OFFER_IDS = Object.freeze([
  "CFG-DIAG-EXP-v1",
  "CFG-DIRB2G-FLEX-v1",
  "CFG-DIRB2G-180-v1",
  "CFG-DIRB2G-365-v1",
]);

const STATUSES = Object.freeze(["DRAFT", "APPROVED", "ACTIVE", "PAUSED", "RETIRED"]);

function baseOffer(partial) {
  return {
    currency: "BRL",
    scope_version: AUTHORITY.scope_version,
    terms_version: AUTHORITY.terms_version,
    capacity_units: partial.billing_mode === "one_time" ? 0 : 1,
    capacity_required: partial.billing_mode !== "one_time",
    checkout_mode: partial.billing_mode === "one_time" ? "detached" : "subscription",
    provider_mapping: {},
    status: "APPROVED",
    kill_switch: false,
    effective_from: "2026-08-17",
    effective_to: null,
    approved_by: "OWNER_CONFENGE",
    change_reason: "Freeze approved public catalog v1",
    public: true,
    ...partial,
  };
}

const OFFERS = Object.freeze({
  "CFG-DIAG-EXP-v1": baseOffer({
    offer_id: "CFG-DIAG-EXP-v1",
    offer_version: "v1",
    public_name: "CONFENGE - Diagnóstico B2G de Expansão",
    internal_code: "CFG-DIAG-EXP",
    amount_cents: 800000,
    billing_mode: "one_time",
    cycle: null,
    commitment_months: 0,
    max_payments: 1,
    total_commitment_cents: 800000,
    notice_days: 0,
    checkout_mode: "detached",
    capacity_required: false,
    capacity_units: 0,
    sla_business_days: "10-15",
    credit_on_upgrade_cents: 200000,
    credit_window_days: 60,
  }),
  "CFG-DIRB2G-FLEX-v1": baseOffer({
    offer_id: "CFG-DIRB2G-FLEX-v1",
    offer_version: "v1",
    public_name: "CONFENGE - Diretoria B2G Fracionada - Flex",
    internal_code: "CFG-DIRB2G-FLEX",
    amount_cents: 2000000,
    billing_mode: "subscription",
    cycle: "MONTHLY",
    commitment_months: 0,
    max_payments: null,
    total_commitment_cents: null,
    notice_days: 30,
    checkout_mode: "subscription",
    capacity_required: true,
    capacity_units: 1,
  }),
  "CFG-DIRB2G-180-v1": baseOffer({
    offer_id: "CFG-DIRB2G-180-v1",
    offer_version: "v1",
    public_name: "CONFENGE - Diretoria B2G Fracionada - 180",
    internal_code: "CFG-DIRB2G-180",
    amount_cents: 1500000,
    billing_mode: "subscription",
    cycle: "MONTHLY",
    commitment_months: 6,
    max_payments: 6,
    total_commitment_cents: 9000000,
    notice_days: 30,
    checkout_mode: "subscription",
    capacity_required: true,
    capacity_units: 1,
  }),
  "CFG-DIRB2G-365-v1": baseOffer({
    offer_id: "CFG-DIRB2G-365-v1",
    offer_version: "v1",
    public_name: "CONFENGE - Diretoria B2G Fracionada - 365",
    internal_code: "CFG-DIRB2G-365",
    amount_cents: 1250000,
    billing_mode: "subscription",
    cycle: "MONTHLY",
    commitment_months: 12,
    max_payments: 12,
    total_commitment_cents: 15000000,
    notice_days: 30,
    checkout_mode: "subscription",
    capacity_required: true,
    capacity_units: 1,
  }),
});

const TEST_OVERRIDES = Object.create(null);

function setOfferOverrideForTests(offerId, patch) {
  if (!offerId) return;
  if (patch == null) {
    delete TEST_OVERRIDES[offerId];
    return;
  }
  TEST_OVERRIDES[offerId] = { ...patch };
}

function getOffer(offerId) {
  const offer = OFFERS[offerId];
  if (!offer) return null;
  const overlay = TEST_OVERRIDES[offerId];
  return {
    ...offer,
    ...(overlay || {}),
    provider_mapping: { ...(overlay && overlay.provider_mapping) || offer.provider_mapping || {} },
  };
}

function listPublicOffers({ includePaused = false } = {}) {
  return PUBLIC_OFFER_IDS.map((id) => getOffer(id)).filter((offer) => {
    if (!offer || offer.public !== true) return false;
    if (offer.kill_switch) return false;
    if (!includePaused && (offer.status === "PAUSED" || offer.status === "RETIRED" || offer.status === "DRAFT")) {
      return false;
    }
    return offer.status === "APPROVED" || offer.status === "ACTIVE" || includePaused;
  });
}

function assertNewVersionForPriceChange(current, next) {
  if (!current || !next) return { ok: false, error: "offer_missing" };
  if (current.amount_cents !== next.amount_cents || current.total_commitment_cents !== next.total_commitment_cents) {
    if (current.offer_version === next.offer_version && current.offer_id === next.offer_id) {
      return { ok: false, error: "price_change_requires_new_version" };
    }
  }
  return { ok: true };
}

function snapshotOffer(offer) {
  if (!offer) return null;
  return JSON.parse(JSON.stringify({
    offer_id: offer.offer_id,
    offer_version: offer.offer_version,
    public_name: offer.public_name,
    amount_cents: offer.amount_cents,
    currency: offer.currency,
    billing_mode: offer.billing_mode,
    cycle: offer.cycle,
    commitment_months: offer.commitment_months,
    max_payments: offer.max_payments,
    total_commitment_cents: offer.total_commitment_cents,
    notice_days: offer.notice_days,
    scope_version: offer.scope_version,
    terms_version: offer.terms_version,
    checkout_mode: offer.checkout_mode,
  }));
}

module.exports = {
  AUTHORITY,
  PUBLIC_OFFER_IDS,
  STATUSES,
  OFFERS,
  getOffer,
  setOfferOverrideForTests,
  listPublicOffers,
  assertNewVersionForPriceChange,
  snapshotOffer,
};
