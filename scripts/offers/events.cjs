/**
 * confenge.commercial_event.v1 — local contract. Not a Warmbly #47 fork.
 */
const crypto = require("crypto");

const SCHEMA = "confenge.commercial_event.v1";

const TYPES = Object.freeze({
  OFFER_VIEWED: "offer_viewed",
  OFFER_SELECTED: "offer_selected",
  ELIGIBILITY_SUBMITTED: "eligibility_submitted",
  CAPACITY_APPROVED: "capacity_approved",
  CAPACITY_REJECTED: "capacity_rejected",
  CAPACITY_WAITLISTED: "capacity_waitlisted",
  TERMS_ACCEPTED: "terms_accepted",
  CHECKOUT_CREATED: "checkout_created",
  PAYMENT_CREATED: "payment_created",
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_RECEIVED: "payment_received",
  PAYMENT_OVERDUE: "payment_overdue",
  PAYMENT_REFUNDED: "payment_refunded",
  PAYMENT_UNKNOWN: "payment_unknown",
  SUBSCRIPTION_ACTIVE: "subscription_active",
  SUBSCRIPTION_ENDED: "subscription_ended",
  ONBOARDING_STARTED: "onboarding_started",
  SERVICE_ACTIVATED: "service_activated",
  COMMERCIAL_EXCEPTION: "commercial_exception",
});

const FINANCIAL_CONFIRMED = new Set(["PAYMENT_RECEIVED", "received", "CONFIRMED", "confirmed"]);

function normalizeStatus(raw) {
  const text = String(raw || "").trim().toUpperCase();
  if (["RECEIVED", "CONFIRMED", "PAYMENT_RECEIVED", "RECEIVED_PAYMENT"].includes(text)) {
    return "PAYMENT_RECEIVED";
  }
  if (["PENDING", "AWAITING", "WAITING"].includes(text)) return "PAYMENT_PENDING";
  if (["OVERDUE", "LATE"].includes(text)) return "PAYMENT_OVERDUE";
  if (["REFUNDED", "REFUND"].includes(text)) return "PAYMENT_REFUNDED";
  if (["CREATED", "CHECKOUT_CREATED", "SUBSCRIPTION_CREATED"].includes(text)) return "CREATED";
  if (!text) return "UNKNOWN";
  return "UNKNOWN";
}

function isFinancialConfirmation(status) {
  const canonical = normalizeStatus(status);
  return canonical === "PAYMENT_RECEIVED";
}

function commercialEvent(partial = {}) {
  const providerRaw = partial.provider_raw_status;
  const canonical = partial.canonical_status || normalizeStatus(providerRaw);
  return {
    schema: SCHEMA,
    event_id: partial.event_id || `evt_${crypto.randomBytes(8).toString("hex")}`,
    type: partial.type || TYPES.COMMERCIAL_EXCEPTION,
    occurred_at: partial.occurred_at || new Date().toISOString(),
    offer_id: partial.offer_id || null,
    offer_version: partial.offer_version || null,
    terms_version: partial.terms_version || null,
    external_reference: partial.external_reference || null,
    provider_event_id: partial.provider_event_id || null,
    provider_raw_status: providerRaw == null ? null : String(providerRaw),
    canonical_status: canonical,
    amount_cents: partial.amount_cents == null ? null : Number(partial.amount_cents),
    currency: partial.currency || "BRL",
    source: "CONFENGE_WEB",
    financial_confirmation: isFinancialConfirmation(canonical),
    revenue: false,
    exception_code: partial.exception_code || null,
  };
}

module.exports = {
  SCHEMA,
  TYPES,
  FINANCIAL_CONFIRMED,
  normalizeStatus,
  isFinancialConfirmation,
  commercialEvent,
};
