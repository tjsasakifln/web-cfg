/**
 * Preview eligibility intake. Flag-off. No real money. No PII in URL.
 */
const { loadFlags } = require("../../scripts/offers/flags.cjs");
const { submitEligibility, acceptOfferTerms } = require("../../scripts/offers/journey.cjs");
const { emptyInventory } = require("../../scripts/offers/capacity.cjs");
const { createStore, isProductionProfile } = require("./lib/lead-store.cjs");

exports.handler = async (event) => {
  // This endpoint backs a flag-off preview that has no production anti-abuse
  // controls. Keep direct requests fail-closed until the public form can ship
  // the same origin, consent and Turnstile contract as the canonical intake.
  if (isProductionProfile(process.env)) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: "preview_intake_disabled" }) };
  }
  const flags = loadFlags(process.env);
  if (flags.production_checkout_enabled || flags.real_money_mutation_enabled) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: "money_path_disabled" }) };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "method_not_allowed" }) };
  }
  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "invalid_json" }) };
  }
  const store = await createStore({ event, allowMemory: process.env.NODE_ENV === "test" });
  const inventory = emptyInventory(new Date());
  const elig = await submitEligibility(store, {
    cnpj: body.cnpj,
    representante: body.representante,
    offerId: body.offer_id,
    targetContract: body.target_contract,
    startDate: body.start_date,
  }, { inventory, now: new Date() });
  let terms = null;
  if (body.accept_terms && elig.status === "APPROVED") {
    terms = await acceptOfferTerms(store, {
      cnpj: elig.cnpj,
      offerId: body.offer_id,
      actor: body.representante,
    });
  }
  return {
    statusCode: elig.ok ? 200 : 422,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      ok: elig.ok,
      status: elig.status,
      hold_id: elig.hold_id || null,
      reason: elig.capacity_reason || elig.error || null,
      selected: elig.selected || null,
      qualification: elig.qualification || elig.event || null,
      capacity_event: elig.capacity_event || null,
      terms_event: terms && terms.event ? terms.event : null,
    }),
  };
};
