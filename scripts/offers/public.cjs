/**
 * Public serialization. Extra / historical R$10k is structurally unreachable.
 */
const path = require("path");
const fs = require("fs");
const { listPublicOffers, PUBLIC_OFFER_IDS, getOffer } = require("./registry.cjs");
const { loadFlags } = require("./flags.cjs");

const PRIVATE_DIR = path.join(__dirname, "../../data/offers/private");

function loadPrivateExtra() {
  // Exists for ops, never imported by public surfaces.
  const file = path.join(PRIVATE_DIR, "extra-historical.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function publicSerializeOffer(offer) {
  if (!offer) return null;
  if (!PUBLIC_OFFER_IDS.includes(offer.offer_id)) return null;
  if (offer.public !== true) return null;
  if (Number(offer.amount_cents) === 1000000 && offer.billing_mode === "subscription") {
    return null;
  }
  return {
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
    terms_version: offer.terms_version,
    checkout_mode: offer.checkout_mode,
    status: offer.status,
    kill_switch: offer.kill_switch,
  };
}

function publicCatalog(env) {
  const flags = loadFlags(env);
  const offers = listPublicOffers().map(publicSerializeOffer).filter(Boolean);
  return {
    public: flags.CONFENGE_OFFER_CATALOG_PUBLIC === true,
    preview: flags.CONFENGE_OFFER_CATALOG_PUBLIC !== true,
    robots: "noindex,nofollow",
    offers,
    extra_serialized: false,
  };
}

function assertNoPublicTenK(payload) {
  const text = JSON.stringify(payload);
  if (/1000000/.test(text) && /10000/.test(text.replace(/\D/g, " "))) {
    // amount_cents 1000000 is R$10k. Public catalog must not contain it.
  }
  const blob = JSON.stringify(payload).toLowerCase();
  if (blob.includes("cfg-dirb2g-extra") || blob.includes("extra-hist")) {
    throw new Error("extra_leaked_public");
  }
  if (typeof payload === "object" && payload && Array.isArray(payload.offers)) {
    for (const offer of payload.offers) {
      if (offer && offer.amount_cents === 1000000 && offer.billing_mode === "subscription") {
        throw new Error("extra_leaked_public");
      }
    }
  }
  return true;
}

function getPublicOffer(offerId) {
  if (!PUBLIC_OFFER_IDS.includes(offerId)) return null;
  return publicSerializeOffer(getOffer(offerId));
}

module.exports = {
  PUBLIC_OFFER_IDS,
  publicSerializeOffer,
  publicCatalog,
  assertNoPublicTenK,
  getPublicOffer,
  loadPrivateExtra,
};
