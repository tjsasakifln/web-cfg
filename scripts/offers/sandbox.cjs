/**
 * Sandbox / contract fixtures. No network. No stored key. No production Asaas.
 */
const crypto = require("crypto");
const { getOffer } = require("./registry.cjs");
const { buildExternalReference } = require("./external-reference.cjs");
const { commercialEvent, TYPES, normalizeStatus } = require("./events.cjs");
const { loadFlags } = require("./flags.cjs");

/** Policy `cfg:{offer_id}:{correlation_id}`; empty rather than a broken shape. */
function defaultExternalReference(offerId, correlationId) {
  const built = buildExternalReference(offerId, correlationId);
  return built.ok ? built.external_reference : "";
}

const SANDBOX_OFFERS = new Set(["CFG-DIAG-EXP-v1", "CFG-DIRB2G-180-v1"]);

function refuseRealMoney(env) {
  const flags = loadFlags(env);
  if (flags.real_money_mutation_enabled || flags.production_checkout_enabled) {
    return { ok: false, error: "real_money_blocked" };
  }
  if (flags.ASAAS_MODE !== "disabled" && flags.ASAAS_MODE !== "sandbox") {
    return { ok: false, error: "asaas_mode_blocked" };
  }
  return { ok: true };
}

function createSandboxCheckout({ offerId, externalReference, eligibility, terms, env, now } = {}) {
  const blocked = refuseRealMoney(env);
  if (!blocked.ok) return blocked;
  if (!eligibility || eligibility.status !== "APPROVED") {
    return { ok: false, error: "capacity_not_approved" };
  }
  if (!terms || !terms.terms_hash || !terms.accepted_at) {
    return { ok: false, error: "terms_not_accepted" };
  }
  const offer = getOffer(offerId);
  if (!offer) return { ok: false, error: "offer_unknown" };
  if (!SANDBOX_OFFERS.has(offer.offer_id)) {
    return { ok: false, error: "sandbox_offer_not_in_canary" };
  }
  const createdAt = (now || new Date()).toISOString();
  const objectId = `sbx_${crypto.randomBytes(6).toString("hex")}`;
  const created = {
    kind: offer.checkout_mode === "detached" ? "checkout" : "subscription",
    id: objectId,
    offer_id: offer.offer_id,
    amount_cents: offer.amount_cents,
    max_payments: offer.max_payments,
    cycle: offer.cycle,
    external_reference: externalReference || defaultExternalReference(offer.offer_id, eligibility.eligibility_id),
    provider_raw_status: "CREATED",
    created_at: createdAt,
    expires_at: new Date((now || new Date()).getTime() + 48 * 3600 * 1000).toISOString(),
  };
  const event = commercialEvent({
    type: TYPES.CHECKOUT_CREATED,
    offer_id: offer.offer_id,
    offer_version: offer.offer_version,
    terms_version: terms.terms_version,
    external_reference: created.external_reference,
    provider_event_id: created.id,
    provider_raw_status: created.provider_raw_status,
    amount_cents: offer.amount_cents,
  });
  return {
    ok: true,
    created,
    event,
    payment: false,
    revenue: false,
  };
}

function applyProviderEvent({ checkout, raw, seenIds, env } = {}) {
  const blocked = refuseRealMoney(env);
  if (!blocked.ok) return blocked;
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_event", status: "UNKNOWN" };
  }
  if (raw.secret === "invalid" || raw.invalid_secret === true) {
    return { ok: false, error: "invalid_secret", status: "UNKNOWN" };
  }
  const eventId = raw.id || raw.event_id;
  if (!eventId) {
    return { ok: false, error: "event_id_missing", status: "UNKNOWN" };
  }
  seenIds = seenIds || new Set();
  if (seenIds.has(eventId)) {
    return { ok: true, duplicate: true, event: null };
  }
  seenIds.add(eventId);
  const rawStatus = raw.status || raw.provider_raw_status || raw.event;
  const canonical = normalizeStatus(rawStatus);
  if (canonical === "UNKNOWN" && !["pending", "received", "overdue", "refund", "created"].includes(String(rawStatus || "").toLowerCase())) {
    return {
      ok: false,
      error: "unknown_provider_status",
      status: "UNKNOWN",
      exception: true,
      event: commercialEvent({
        type: TYPES.COMMERCIAL_EXCEPTION,
        exception_code: "UNKNOWN_PROVIDER_STATUS",
        offer_id: checkout && checkout.offer_id,
        provider_event_id: eventId,
        provider_raw_status: rawStatus,
        external_reference: checkout && checkout.external_reference,
      }),
    };
  }
  const event = commercialEvent({
    event_id: eventId,
    type:
      canonical === "PAYMENT_RECEIVED"
        ? TYPES.PAYMENT_RECEIVED
        : canonical === "PAYMENT_OVERDUE"
          ? TYPES.PAYMENT_OVERDUE
          : canonical === "PAYMENT_REFUNDED"
            ? TYPES.PAYMENT_REFUNDED
            : canonical === "PAYMENT_PENDING"
              ? TYPES.PAYMENT_PENDING
              : TYPES.PAYMENT_CREATED,
    offer_id: checkout && checkout.offer_id,
    external_reference: (checkout && checkout.external_reference) || raw.externalReference,
    provider_event_id: eventId,
    provider_raw_status: rawStatus,
    canonical_status: canonical,
    amount_cents: checkout && checkout.amount_cents,
    occurred_at: raw.occurred_at,
  });
  return { ok: true, duplicate: false, event, checkout };
}

function checkoutExpired(checkout, now) {
  if (!checkout || !checkout.expires_at) return false;
  return new Date(checkout.expires_at).getTime() <= (now || new Date()).getTime();
}

module.exports = {
  SANDBOX_OFFERS,
  createSandboxCheckout,
  applyProviderEvent,
  checkoutExpired,
  refuseRealMoney,
};
