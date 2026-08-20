/**
 * Campaign checkout prepare-only: catalog adapter, campaign jobs, callback ≠
 * payment, unknown version, terms drift, paused/sold-out, no PII, flags off.
 * Fresh require() of shipped modules.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

process.env.NODE_ENV = "test";

const adapter = require(path.join(root, "scripts/offers/catalog-adapter.cjs"));
const registry = require(path.join(root, "scripts/offers/registry.cjs"));
const events = require(path.join(root, "scripts/offers/events.cjs"));
const journey = require(path.join(root, "scripts/offers/journey.cjs"));
const flags = require(path.join(root, "scripts/offers/flags.cjs"));
const terms = require(path.join(root, "scripts/offers/terms.cjs"));
const capacity = require(path.join(root, "scripts/offers/capacity.cjs"));
const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));

function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exitCode = 1;
  throw new Error(`FAIL: ${name}`);
}
function pass(name) {
  console.log("PASS", name);
}
function assert(name, cond, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

const CNPJ = "11222333000181";
const now = new Date("2026-08-17T12:00:00Z");

const defaults = flags.loadFlags({ NODE_ENV: "test" });
assert("flag_catalog_off", defaults.CONFENGE_OFFER_CATALOG_PUBLIC === false, defaults);
assert("flag_checkout_off", defaults.production_checkout_enabled === false, defaults);
assert("flag_webhook_off", defaults.production_webhook_enabled === false, defaults);
assert("flag_money_off", defaults.real_money_mutation_enabled === false, defaults);
assert("flag_asaas_not_prod", defaults.ASAAS_MODE !== "production", defaults.ASAAS_MODE);

const snapshot = adapter.loadCatalogSnapshot();
const mapping = adapter.loadProviderMapping();
assert("snapshot_four_offers", snapshot.offers.length === 4, snapshot.offers.map((o) => o.offer_id));
for (const offer of snapshot.offers) {
  const live = registry.getOffer(offer.offer_id);
  assert(`snapshot_matches_registry_${offer.offer_id}`, live && live.amount_cents === offer.amount_cents, live);
  const map = mapping.offers[offer.offer_id];
  assert(`mapping_empty_${offer.offer_id}`, map && map.asaas_product_id == null && map.asaas_checkout_url == null, map);
}

const diag = adapter.resolveOffer("CFG-DIAG-EXP-v1");
assert("resolve_diag", diag.ok && diag.offer.checkout_mode === "detached" && diag.offer.capacity_required === false, diag);
assert("provider_mapping_null", diag.offer.provider_mapping.asaas_checkout_url == null, diag.offer.provider_mapping);

const unknownOffer = adapter.resolveOffer("CFG-DOES-NOT-EXIST");
assert("unknown_offer", unknownOffer.ok === false && unknownOffer.error === "offer_unknown", unknownOffer);

const badVersion = adapter.resolveOffer("CFG-DIAG-EXP-v1", { offer_version: "v9" });
assert("unknown_offer_version", badVersion.ok === false && badVersion.error === "unknown_offer_version", badVersion);

const paused = adapter.resolveOffer("CFG-DIRB2G-180-v1");
assert("180_resolves", paused.ok, paused);

for (const job of Object.keys(events.CAMPAIGN_JOBS)) {
  const resolved = events.resolveCampaignJob(job);
  assert(`campaign_job_${job}`, resolved.ok && resolved.canonical && resolved.layer, resolved);
}
assert("layers_uncollapsed", events.LAYER_SEPARATION.lead[0] !== events.LAYER_SEPARATION.pipeline[0], events.LAYER_SEPARATION);
assert("checkout_not_revenue_layer", events.LAYER_SEPARATION.checkout_object[0] !== events.LAYER_SEPARATION.pipeline[0], events.LAYER_SEPARATION);

const store = new MemoryStore();
const inv = capacity.emptyInventory(now);

const noCheckout = await journey.requestCheckout(store, {
  cnpj: CNPJ,
  offerId: "CFG-DIAG-EXP-v1",
  inventory: inv,
  now,
});
assert("one_off_still_needs_eligibility", noCheckout.ok === false && noCheckout.error === "capacity_not_approved", noCheckout);

const elig = await journey.submitEligibility(store, {
  cnpj: CNPJ,
  representante: "Ana Souza",
  offerId: "CFG-DIAG-EXP-v1",
}, { inventory: inv, now });
assert("one_off_elig", elig.status === "APPROVED" && elig.event.type === events.TYPES.CAPACITY_DECISION, elig.event);

const noTerms = await journey.requestCheckout(store, {
  cnpj: CNPJ,
  offerId: "CFG-DIAG-EXP-v1",
  inventory: inv,
  now,
});
assert("one_off_needs_terms", noTerms.ok === false && noTerms.error === "terms_not_accepted", noTerms);

const accepted = await journey.acceptOfferTerms(store, {
  cnpj: CNPJ,
  offerId: "CFG-DIAG-EXP-v1",
  actor: "Ana Souza",
  now,
});
assert("terms_ok", accepted.ok && accepted.acceptance.terms_version === terms.TERMS_VERSION, accepted.acceptance);

const drifted = await journey.requestCheckout(store, {
  cnpj: CNPJ,
  offerId: "CFG-DIAG-EXP-v1",
  offer_version: "v9",
  inventory: inv,
  now,
});
assert("checkout_unknown_version", drifted.ok === false && drifted.error === "unknown_offer_version", drifted);

const checkout = await journey.requestCheckout(store, {
  cnpj: CNPJ,
  offerId: "CFG-DIAG-EXP-v1",
  inventory: inv,
  now,
});
assert("one_off_checkout", checkout.ok && checkout.payment === false && checkout.revenue === false, checkout);
assert("checkout_event", checkout.event.type === events.TYPES.CHECKOUT_CREATED && checkout.event.financial_confirmation === false, checkout.event);
assert("external_reference", Boolean(checkout.created.external_reference), checkout.created);

const callback = journey.observeCheckoutCallback({
  checkout: checkout.created,
  query: { status: "success", checkout_id: checkout.created.id },
});
assert("callback_not_payment", callback.ok && callback.financial_confirmation === false && callback.payment === false, callback);
assert("callback_job", callback.event.type === events.TYPES.PAYMENT_STATE_OBSERVED, callback.event);

const piiCb = journey.observeCheckoutCallback({
  checkout: checkout.created,
  query: { email: "ana@example.com" },
});
assert("callback_pii_blocked", piiCb.ok === false && piiCb.error === "pii_in_callback_url", piiCb);

const seen = new Set();
const webhookOnly = await journey.ingestEvent(store, {
  checkoutId: checkout.created.id,
  raw: { id: "evt-received-only", status: "received" },
  seenIds: seen,
  inventory: inv,
  now,
});
assert("webhook_without_callback", webhookOnly.ok && webhookOnly.event.financial_confirmation === true, webhookOnly.event);
assert("observation_job", webhookOnly.observation && webhookOnly.observation.type === events.TYPES.PAYMENT_STATE_OBSERVED, webhookOnly.observation);
assert("observation_not_revenue", webhookOnly.observation.revenue === false, webhookOnly.observation);

const onboard = journey.requestOnboarding({ checkout: checkout.created, lastEvent: webhookOnly.event });
assert("onboarding_after_reconcile", onboard.ok && onboard.event.type === events.TYPES.ONBOARDING_ELIGIBLE, onboard);

const store2 = new MemoryStore();
const inv2 = capacity.emptyInventory(now);
await journey.submitEligibility(store2, {
  cnpj: CNPJ,
  representante: "Ana Souza",
  offerId: "CFG-DIAG-EXP-v1",
}, { inventory: inv2, now });
await journey.acceptOfferTerms(store2, { cnpj: CNPJ, offerId: "CFG-DIAG-EXP-v1", actor: "Ana Souza", now });
const checkout2 = await journey.requestCheckout(store2, {
  cnpj: CNPJ,
  offerId: "CFG-DIAG-EXP-v1",
  inventory: inv2,
  now,
});
const cbOnly = journey.observeCheckoutCallback({ checkout: checkout2.created, query: { status: "success" } });
const early = journey.requestOnboarding({ checkout: checkout2.created, lastEvent: cbOnly.event });
assert("callback_without_webhook_not_onboarding", early.ok === false && early.error === "onboarding_before_confirmation", early);

const recStore = new MemoryStore();
const recInv = capacity.emptyInventory(now);
const recNoCap = await journey.requestCheckout(recStore, {
  cnpj: CNPJ,
  offerId: "CFG-DIRB2G-180-v1",
  inventory: recInv,
  now,
});
assert("recurring_blocked_without_capacity", recNoCap.error === "capacity_not_approved", recNoCap);

const sold = await journey.submitEligibility(recStore, {
  cnpj: CNPJ,
  representante: "Ana Souza",
  offerId: "CFG-DIRB2G-180-v1",
  targetContract: "contrato-alvo-1",
  startDate: "2026-09-01",
}, {
  inventory: {
    ...recInv,
    reservations: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`res_${i}`, { status: "RESERVED" }])),
  },
  now,
});
assert("sold_out_no_checkout", sold.status === "WAITLIST", sold);
const soldCheckout = await journey.requestCheckout(recStore, {
  cnpj: CNPJ,
  offerId: "CFG-DIRB2G-180-v1",
  inventory: recInv,
  now,
});
assert("sold_out_checkout_blocked", soldCheckout.ok === false, soldCheckout);

const src = [
  "scripts/offers/catalog-adapter.cjs",
  "scripts/offers/registry.cjs",
  "scripts/offers/journey.cjs",
  "netlify/functions/offer-checkout.cjs",
].map((rel) => fs.readFileSync(path.join(root, rel), "utf8")).join("\n");
assert("no_scattered_asaas_url", adapter.assertNoScatteredAsaasUrls(src).ok, "url");
assert("no_prod_key_literal", !/\$aact_prod_/.test(src), "prod_key");

if (process.exitCode) process.exit(1);
console.log("campaign_checkout_prepare passed");
