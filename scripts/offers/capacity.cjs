/**
 * Recurring Full capacity: hard cap 50, one slot, 72h hold, final after payment.
 */
const crypto = require("crypto");
const { getOffer } = require("./registry.cjs");

const CAP_MAX = 50;
const HOLD_HOURS = 72;

function emptyInventory(now = new Date()) {
  return {
    cap: CAP_MAX,
    used: 0,
    holds: {},
    reservations: {},
    as_of: now.toISOString(),
  };
}

function activeHolds(inventory, now) {
  const ts = now.getTime();
  const live = [];
  for (const hold of Object.values(inventory.holds || {})) {
    if (hold.status === "HELD" && new Date(hold.expires_at).getTime() > ts) {
      live.push(hold);
    }
  }
  return live;
}

function usedUnits(inventory, now) {
  const reserved = Object.values(inventory.reservations || {}).filter((item) => item.status === "RESERVED");
  return reserved.length + activeHolds(inventory, now).length;
}

function coerceOffer(offer) {
  if (!offer) return null;
  if (typeof offer === "string") return getOffer(offer);
  if (offer.offer_id && offer.status) return offer;
  return getOffer(offer.offer_id) || offer;
}

function decideCapacity({ offer, inventory, now }) {
  const rec = coerceOffer(offer);
  if (!rec) return { status: "REJECTED", reason: "offer_unknown" };
  if (rec.kill_switch || rec.status === "PAUSED" || rec.status === "RETIRED" || rec.status === "DRAFT") {
    return { status: "REJECTED", reason: "offer_not_contractable" };
  }
  if (!rec.capacity_required) {
    return { status: "APPROVED", reason: "one_off_no_slot", units: 0 };
  }
  const used = usedUnits(inventory, now);
  if (used >= CAP_MAX) {
    return { status: "WAITLIST", reason: "sold_out", units: rec.capacity_units };
  }
  return { status: "APPROVED", reason: "slot_available", units: rec.capacity_units };
}

function placeHold({ inventory, offer, cnpj, now }) {
  const decision = decideCapacity({ offer, inventory, now });
  if (decision.status !== "APPROVED") {
    return { ok: false, decision };
  }
  if (!offer.capacity_required) {
    return { ok: true, decision, hold: null };
  }
  const holdId = `hold_${crypto.randomBytes(8).toString("hex")}`;
  const expires = new Date(now.getTime() + HOLD_HOURS * 3600 * 1000);
  const hold = {
    hold_id: holdId,
    cnpj,
    offer_id: offer.offer_id,
    units: offer.capacity_units || 1,
    status: "HELD",
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
  inventory.holds[holdId] = hold;
  return { ok: true, decision, hold };
}

function expireHolds(inventory, now) {
  const ts = now.getTime();
  for (const hold of Object.values(inventory.holds || {})) {
    if (hold.status === "HELD" && new Date(hold.expires_at).getTime() <= ts) {
      hold.status = "EXPIRED";
    }
  }
  return inventory;
}

function finalizeReservation({ inventory, holdId, now }) {
  const hold = inventory.holds[holdId];
  if (!hold || hold.status !== "HELD") {
    return { ok: false, error: "hold_missing_or_expired" };
  }
  if (new Date(hold.expires_at).getTime() <= now.getTime()) {
    hold.status = "EXPIRED";
    return { ok: false, error: "hold_expired" };
  }
  const reservation = {
    reservation_id: `res_${hold.hold_id}`,
    hold_id: hold.hold_id,
    cnpj: hold.cnpj,
    offer_id: hold.offer_id,
    units: hold.units,
    status: "RESERVED",
    reserved_at: now.toISOString(),
  };
  hold.status = "CONVERTED";
  inventory.reservations[reservation.reservation_id] = reservation;
  return { ok: true, reservation };
}

module.exports = {
  CAP_MAX,
  HOLD_HOURS,
  emptyInventory,
  usedUnits,
  decideCapacity,
  placeHold,
  expireHolds,
  finalizeReservation,
};
