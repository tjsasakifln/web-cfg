/**
 * Persist-first eligibility. No checkout here.
 */
const crypto = require("crypto");
const { validateCnpj } = require("../conversion/cnpj.cjs");
const { getOffer, snapshotOffer } = require("./registry.cjs");
const { decideCapacity, placeHold } = require("./capacity.cjs");

function normalizeRepresentante(raw) {
  const name = String(raw || "").trim();
  return name ? name.slice(0, 120) : "";
}

function evaluateEligibility({
  cnpj,
  representante,
  offerId,
  targetContract,
  startDate,
  inventory,
  now,
} = {}) {
  const checked = validateCnpj(cnpj);
  if (!checked.ok) {
    return { ok: false, status: "REJECTED", error: checked.error };
  }
  const offer = getOffer(offerId);
  if (!offer) {
    return { ok: false, status: "REJECTED", error: "offer_unknown" };
  }
  if (offer.kill_switch || offer.status === "PAUSED" || offer.status === "RETIRED") {
    return { ok: false, status: "REJECTED", error: "offer_not_contractable" };
  }
  const person = normalizeRepresentante(representante);
  if (!person) {
    return { ok: false, status: "REJECTED", error: "representante_required" };
  }
  if (offer.capacity_required && !String(targetContract || "").trim()) {
    return { ok: false, status: "REJECTED", error: "target_contract_required" };
  }
  if (offer.capacity_required && !String(startDate || "").trim()) {
    return { ok: false, status: "REJECTED", error: "start_date_required" };
  }
  const capacity = decideCapacity({ offer, inventory, now: now || new Date() });
  const record = {
    eligibility_id: `elig_${crypto.createHash("sha256").update(`${checked.cnpj}|${offer.offer_id}`).digest("hex").slice(0, 16)}`,
    cnpj: checked.cnpj,
    representante: person,
    offer_id: offer.offer_id,
    offer_snapshot: snapshotOffer(offer),
    target_contract: String(targetContract || "").trim() || null,
    start_date: String(startDate || "").trim() || null,
    status: capacity.status,
    capacity_reason: capacity.reason,
    capacity_units: capacity.units || 0,
    hold_id: null,
    hold_expiry: null,
  };
  if (capacity.status === "APPROVED" && offer.capacity_required) {
    const held = placeHold({ inventory, offer, cnpj: checked.cnpj, now: now || new Date() });
    if (held.ok && held.hold) {
      record.hold_id = held.hold.hold_id;
      record.hold_expiry = held.hold.expires_at;
    } else if (!held.ok) {
      record.status = held.decision.status;
      record.capacity_reason = held.decision.reason;
    }
  }
  return { ok: record.status === "APPROVED", ...record, offer };
}

module.exports = {
  evaluateEligibility,
  normalizeRepresentante,
};
