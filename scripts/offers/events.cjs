/**
 * confenge.commercial_event.v1 — local contract. Not a Warmbly #47 fork.
 */
const crypto = require("crypto");

const SCHEMA = "confenge.commercial_event.v1";

const TYPES = Object.freeze({
  OFFER_VIEWED: "offer_viewed",
  OFFER_SELECTED: "offer_selected",
  ELIGIBILITY_SUBMITTED: "eligibility_submitted",
  QUALIFICATION_SUBMITTED: "qualification_submitted",
  CAPACITY_APPROVED: "capacity_approved",
  CAPACITY_REJECTED: "capacity_rejected",
  CAPACITY_WAITLISTED: "capacity_waitlisted",
  CAPACITY_DECISION: "capacity_decision",
  TERMS_ACCEPTED: "terms_accepted",
  CHECKOUT_CREATED: "checkout_created",
  PAYMENT_CREATED: "payment_created",
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_CONFIRMED: "payment_confirmed",
  PAYMENT_RECEIVED: "payment_received",
  PAYMENT_OVERDUE: "payment_overdue",
  PAYMENT_REFUNDED: "payment_refunded",
  PAYMENT_UNKNOWN: "payment_unknown",
  PAYMENT_STATE_OBSERVED: "payment_state_observed",
  SUBSCRIPTION_ACTIVE: "subscription_active",
  SUBSCRIPTION_ENDED: "subscription_ended",
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_ELIGIBLE: "onboarding_eligible",
  SERVICE_ACTIVATED: "service_activated",
  COMMERCIAL_EXCEPTION: "commercial_exception",
});

const CAMPAIGN_JOBS = Object.freeze({
  service_view: { dictionary: "event-registry", canonical: "service_page_view", layer: "page_view" },
  service_cta: { dictionary: "event-registry", canonical: "cta_click", layer: "engagement" },
  offer_view: { dictionary: "event-registry", canonical: "offer_view", layer: "page_view" },
  offer_selected: { dictionary: "commercial_event.v1", canonical: "offer_selected", layer: "commercial" },
  qualification_submitted: { dictionary: "commercial_event.v1", canonical: "eligibility_submitted", layer: "commercial" },
  capacity_decision: { dictionary: "commercial_event.v1", canonical: "capacity_decision", layer: "commercial" },
  terms_accepted: { dictionary: "commercial_event.v1", canonical: "terms_accepted", layer: "commercial" },
  checkout_created: { dictionary: "commercial_event.v1", canonical: "checkout_created", layer: "commercial" },
  payment_state_observed: { dictionary: "commercial_event.v1", canonical: "payment_state_observed", layer: "commercial" },
  onboarding_eligible: { dictionary: "commercial_event.v1", canonical: "onboarding_eligible", layer: "commercial" },
});

const LAYER_SEPARATION = Object.freeze({
  impression_click: ["page_view", "engagement"],
  lead: ["lead"],
  checkout_object: ["commercial"],
  payment_received: ["commercial"],
  contracted_revenue: ["commercial"],
  pipeline: ["pipeline"],
});

function resolveCampaignJob(name) {
  const job = CAMPAIGN_JOBS[name];
  if (!job) return { ok: false, error: "unknown_campaign_job" };
  return { ok: true, name, ...job };
}

const FINANCIAL_CONFIRMED = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "confirmed", "received"]);

function normalizeStatus(raw) {
  const text = String(raw || "").trim().toUpperCase();
  if (["RECEIVED", "PAYMENT_RECEIVED", "RECEIVED_PAYMENT"].includes(text)) {
    return "PAYMENT_RECEIVED";
  }
  if (["CONFIRMED", "PAYMENT_CONFIRMED"].includes(text)) {
    return "PAYMENT_CONFIRMED";
  }
  if (["PENDING", "AWAITING", "WAITING"].includes(text)) return "PAYMENT_PENDING";
  if (["OVERDUE", "LATE"].includes(text)) return "PAYMENT_OVERDUE";
  if (["REFUNDED", "REFUND", "CHARGEBACK"].includes(text)) return "PAYMENT_REFUNDED";
  if (["CREATED", "CHECKOUT_CREATED", "SUBSCRIPTION_CREATED"].includes(text)) return "CREATED";
  if (!text) return "UNKNOWN";
  return "UNKNOWN";
}

function isFinancialConfirmation(status) {
  const canonical = typeof status === "string" && status.startsWith("PAYMENT_")
    ? status
    : normalizeStatus(status);
  return canonical === "PAYMENT_CONFIRMED" || canonical === "PAYMENT_RECEIVED";
}

function isReceivedRevenue(status) {
  const canonical = typeof status === "string" && status.startsWith("PAYMENT_")
    ? status
    : normalizeStatus(status);
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
    received_revenue: isReceivedRevenue(canonical),
    revenue: false,
    exception_code: partial.exception_code || null,
  };
}

module.exports = {
  SCHEMA,
  TYPES,
  CAMPAIGN_JOBS,
  LAYER_SEPARATION,
  FINANCIAL_CONFIRMED,
  normalizeStatus,
  isFinancialConfirmation,
  isReceivedRevenue,
  commercialEvent,
  resolveCampaignJob,
};
