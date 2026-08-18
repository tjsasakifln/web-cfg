/**
 * Sandbox payment object transitions. Arrival order is not authority.
 * Unknown events are retained and never become payment or revenue.
 */

const FORWARD = Object.freeze({
  CREATED: Object.freeze(["CREATED", "PAYMENT_PENDING", "PAYMENT_OVERDUE", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED"]),
  PAYMENT_PENDING: Object.freeze(["PAYMENT_PENDING", "PAYMENT_OVERDUE", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED"]),
  PAYMENT_OVERDUE: Object.freeze(["PAYMENT_OVERDUE", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED"]),
  PAYMENT_RECEIVED: Object.freeze(["PAYMENT_RECEIVED", "PAYMENT_REFUNDED"]),
  PAYMENT_REFUNDED: Object.freeze(["PAYMENT_REFUNDED"]),
});

function objectIdFromPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.payment && raw.payment.id) return String(raw.payment.id);
  if (raw.checkout && raw.checkout.id) return String(raw.checkout.id);
  return null;
}

function decideCanonicalTransition(currentStatus, mapped) {
  const event = mapped && mapped.event;
  const incoming = event && event.canonical_status ? String(event.canonical_status) : null;
  const type = event && event.type;

  if (!mapped || mapped.error === "unknown_provider_status") {
    return {
      action: "retained",
      apply: false,
      next: currentStatus || null,
      reason: "unknown_event",
    };
  }

  if (mapped.error === "event_id_missing" || mapped.error === "invalid_event") {
    return {
      action: "retained",
      apply: false,
      next: currentStatus || null,
      reason: mapped.error,
    };
  }

  if (type === "payment_unknown") {
    return {
      action: "retained",
      apply: false,
      next: currentStatus || null,
      reason: "unknown_event",
    };
  }

  if (type === "commercial_exception" && incoming === "UNKNOWN") {
    if (currentStatus === "PAYMENT_RECEIVED" || currentStatus === "PAYMENT_REFUNDED") {
      return {
        action: "retained",
        apply: false,
        next: currentStatus,
        reason: "terminal_money_preserved",
      };
    }
    return {
      action: "applied",
      apply: true,
      next: "UNKNOWN",
      reason: "cancelled",
    };
  }

  if (!incoming || incoming === "UNKNOWN") {
    return {
      action: "retained",
      apply: false,
      next: currentStatus || null,
      reason: "non_payment_status",
    };
  }

  if (!currentStatus) {
    return {
      action: "applied",
      apply: true,
      next: incoming,
      reason: "initialize",
    };
  }

  if (currentStatus === incoming) {
    return {
      action: "idempotent",
      apply: false,
      next: currentStatus,
      reason: "same_status",
    };
  }

  const allowed = FORWARD[currentStatus];
  if (allowed && allowed.includes(incoming)) {
    return {
      action: "applied",
      apply: true,
      next: incoming,
      reason: "forward",
    };
  }

  return {
    action: "blocked",
    apply: false,
    next: currentStatus,
    reason: "regressive_or_impossible",
  };
}

module.exports = {
  FORWARD,
  objectIdFromPayload,
  decideCanonicalTransition,
};
