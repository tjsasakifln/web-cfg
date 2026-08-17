/**
 * Manual-first / Sandbox journey. Capacity + terms before checkout.
 * Created objects are not payment or receita. Onboarding waits confirmation.
 */
const { evaluateEligibility } = require("./eligibility.cjs");
const { acceptTerms, termsMatch } = require("./terms.cjs");
const { snapshotOffer, getOffer } = require("./registry.cjs");
const { createSandboxCheckout, applyProviderEvent, checkoutExpired } = require("./sandbox.cjs");
const { persistRecord, getRecord } = require("./persist.cjs");
const { isFinancialConfirmation, commercialEvent, TYPES } = require("./events.cjs");
const { finalizeReservation } = require("./capacity.cjs");
const { loadFlags } = require("./flags.cjs");

function publicNextStep(eligibility) {
  if (!eligibility || eligibility.status === "REJECTED") {
    return { cta: "Falar sobre enquadramento", href: "/piloto/ofertas/" };
  }
  if (eligibility.status === "WAITLIST") {
    return { cta: "Entrar na fila de capacidade", href: "/piloto/ofertas/faq/" };
  }
  return { cta: "Solicitar contratacao", href: "/piloto/ofertas/contratar/" };
}

async function submitEligibility(store, input, { inventory, now } = {}) {
  const result = evaluateEligibility({ ...input, inventory, now: now || new Date() });
  const key = `${result.cnpj || input.cnpj}|${input.offerId}`;
  const persisted = await persistRecord(store, "eligibility", key, {
    ...result,
    offer: undefined,
  });
  return { ...result, persisted: persisted.record, idempotent: persisted.idempotent };
}

async function acceptOfferTerms(store, { cnpj, offerId, actor, evidence, now } = {}) {
  const key = `${cnpj}|${offerId}`;
  const existing = await getRecord(store, "terms", key);
  if (existing && existing.acceptance) {
    return { ok: true, acceptance: existing.acceptance, idempotent: true };
  }
  const offer = getOffer(offerId);
  const acceptance = acceptTerms({
    actor,
    acceptedAt: (now || new Date()).toISOString(),
    evidence,
  });
  const persisted = await persistRecord(store, "terms", key, {
    cnpj,
    offer_id: offerId,
    acceptance,
    offer_snapshot: snapshotOffer(offer),
  });
  return { ok: true, acceptance, snapshot: persisted.record.offer_snapshot, idempotent: persisted.idempotent };
}

async function requestCheckout(store, { cnpj, offerId, inventory, env, now } = {}) {
  const flags = loadFlags(env);
  if (flags.production_checkout_enabled || flags.real_money_mutation_enabled) {
    return { ok: false, error: "production_checkout_disabled" };
  }
  const elig = await getRecord(store, "eligibility", `${cnpj}|${offerId}`);
  if (!elig || elig.status !== "APPROVED") {
    return { ok: false, error: "capacity_not_approved" };
  }
  const termsRow = await getRecord(store, "terms", `${cnpj}|${offerId}`);
  if (!termsRow || !termsMatch(termsRow.acceptance)) {
    return { ok: false, error: "terms_not_accepted" };
  }
  const created = createSandboxCheckout({
    offerId,
    eligibility: elig,
    terms: termsRow.acceptance,
    env,
    now: now || new Date(),
  });
  if (!created.ok) return created;
  created.created.hold_id = elig.hold_id || null;
  const persisted = await persistRecord(store, "checkout", created.created.id, created.created);
  return { ...created, persisted: persisted.record };
}

async function ingestEvent(store, { checkoutId, raw, seenIds, inventory, now, env } = {}) {
  const checkout = await getRecord(store, "checkout", checkoutId);
  if (!checkout) return { ok: false, error: "checkout_missing" };
  if (checkoutExpired(checkout, now || new Date())) {
    return { ok: false, error: "checkout_expired" };
  }
  const applied = applyProviderEvent({ checkout, raw, seenIds, env });
  if (!applied.ok) return applied;
  if (applied.duplicate) return applied;
  if (applied.event && applied.event.financial_confirmation && checkout.hold_id && inventory) {
    finalizeReservation({ inventory, holdId: checkout.hold_id, now: now || new Date() });
  }
  if (applied.event) {
    await persistRecord(store, "event", applied.event.event_id, applied.event);
  }
  return applied;
}

function requestOnboarding({ checkout, lastEvent }) {
  const confirmed =
    (lastEvent && lastEvent.financial_confirmation)
    || (checkout && isFinancialConfirmation(checkout.provider_raw_status));
  if (!confirmed) {
    return {
      ok: false,
      error: "onboarding_before_confirmation",
      event: commercialEvent({
        type: TYPES.COMMERCIAL_EXCEPTION,
        exception_code: "ONBOARDING_BEFORE_CONFIRMATION",
        offer_id: checkout && checkout.offer_id,
        provider_raw_status: checkout && checkout.provider_raw_status,
      }),
    };
  }
  return { ok: true, status: "ONBOARDING_ALLOWED" };
}

module.exports = {
  publicNextStep,
  submitEligibility,
  acceptOfferTerms,
  requestCheckout,
  ingestEvent,
  requestOnboarding,
};
