/**
 * Single source of the Asaas `externalReference` policy.
 *
 * Policy: `cfg:{offer_id}:{correlation_id}`.
 *
 * Every provider write and every reconciliation read goes through here. A
 * two-segment or empty reference is a defect: without the offer id and the
 * correlation id a received payment cannot be matched to what must be produced.
 */

const MAX_LENGTH = 200;
const SHAPE = /^cfg:[A-Za-z0-9._-]{1,120}:[A-Za-z0-9._-]{1,60}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function clean(raw, max) {
  if (raw == null) return "";
  return String(raw).replace(CONTROL_CHARS, "").trim().slice(0, max);
}

function buildExternalReference(offerId, correlationId) {
  const offer = clean(offerId, 120);
  const correlation = clean(correlationId, 60);
  if (!offer || !correlation) {
    return { ok: false, error: "external_reference_incomplete" };
  }
  const value = `cfg:${offer}:${correlation}`;
  if (value.length > MAX_LENGTH) {
    return { ok: false, error: "external_reference_too_long" };
  }
  if (!SHAPE.test(value)) {
    return { ok: false, error: "external_reference_shape" };
  }
  return { ok: true, external_reference: value, offer_id: offer, correlation_id: correlation };
}

function parseExternalReference(raw) {
  const value = clean(raw, MAX_LENGTH);
  if (!SHAPE.test(value)) {
    return { ok: false, error: "external_reference_shape" };
  }
  const parts = value.split(":");
  return { ok: true, offer_id: parts[1], correlation_id: parts[2] };
}

function isPolicyCompliant(raw) {
  return parseExternalReference(raw).ok;
}

module.exports = {
  EXTERNAL_REFERENCE_MAX: MAX_LENGTH,
  EXTERNAL_REFERENCE_SHAPE: SHAPE,
  buildExternalReference,
  parseExternalReference,
  isPolicyCompliant,
};
