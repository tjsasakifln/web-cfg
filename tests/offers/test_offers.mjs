/**
 * Drive the shipped P1 registry / eligibility / Sandbox path.
 * Fresh consumer require() — not a reimplementation.
 */
import { createRequire } from "module";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

process.env.NODE_ENV = "test";

const registry = require(path.join(root, "scripts/offers/registry.cjs"));
const flags = require(path.join(root, "scripts/offers/flags.cjs"));
const pub = require(path.join(root, "scripts/offers/public.cjs"));
const terms = require(path.join(root, "scripts/offers/terms.cjs"));
const capacity = require(path.join(root, "scripts/offers/capacity.cjs"));
const eligibility = require(path.join(root, "scripts/offers/eligibility.cjs"));
const sandbox = require(path.join(root, "scripts/offers/sandbox.cjs"));
const events = require(path.join(root, "scripts/offers/events.cjs"));
const journey = require(path.join(root, "scripts/offers/journey.cjs"));
const structuredData = require(path.join(root, "scripts/offers/structured_data.cjs"));
const { MemoryStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));

const CNPJ = "11222333000181";
const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, detail);
}

function assert(name, cond, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

// exact cents / totals / maxPayments
const diag = registry.getOffer("CFG-DIAG-EXP-v1");
const flex = registry.getOffer("CFG-DIRB2G-FLEX-v1");
const m180 = registry.getOffer("CFG-DIRB2G-180-v1");
const m365 = registry.getOffer("CFG-DIRB2G-365-v1");
assert("diag_cents", diag.amount_cents === 800000, diag.amount_cents);
assert("flex_cents", flex.amount_cents === 2000000 && flex.notice_days === 30 && flex.max_payments == null, flex);
assert("180_cents", m180.amount_cents === 1500000 && m180.total_commitment_cents === 9000000 && m180.max_payments === 6, m180);
assert("365_cents", m365.amount_cents === 1250000 && m365.total_commitment_cents === 15000000 && m365.max_payments === 12, m365);

const diagHtml = fs.readFileSync(path.join(root, "diagnostico-b2g-expansao/index.html"), "utf8");
const diagGraphs = [...diagHtml.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => JSON.parse(match[1]));
const diagNodes = diagGraphs.flatMap((graph) => graph["@graph"] || [graph]);
const diagService = diagNodes.find((node) => node["@type"] === "Service" && node.offers);
const expectedDiagOffer = structuredData.offerStructuredData(diag, {
  url: "https://confenge.com.br/diagnostico-b2g-expansao/#pedido-diagnostico",
  sellerId: "https://confenge.com.br/#organization",
});
assert("diag_schema_offer_present", Boolean(diagService && diagService.offers), diagService);
assert("diag_schema_price", diagService.offers.price === expectedDiagOffer.price, diagService.offers);
assert("diag_schema_availability", diagService.offers.availability === expectedDiagOffer.availability, diagService.offers);
assert("diag_schema_url", diagService.offers.url === expectedDiagOffer.url, diagService.offers);
assert("diag_schema_seller", diagService.offers.seller?.["@id"] === expectedDiagOffer.seller["@id"], diagService.offers);
assert("diag_schema_no_invented_expiry", !("priceValidUntil" in diagService.offers), diagService.offers);
assert(
  "diag_kill_switch_sold_out",
  structuredData.offerAvailability({ ...diag, kill_switch: true }) === "https://schema.org/SoldOut",
  structuredData.offerAvailability({ ...diag, kill_switch: true }),
);

const catalog = pub.publicCatalog();
assert("no_public_10k", !catalog.offers.some((o) => o.amount_cents === 1000000), catalog.offers.map((o) => o.amount_cents));
assert("extra_not_listed", !JSON.stringify(catalog).toLowerCase().includes("extra-hist"), catalog);
assert("extra_flag_false", catalog.extra_serialized === false, catalog.extra_serialized);
pub.assertNoPublicTenK(catalog);
assert("assert_no_10k", true, "serializer");

const extra = pub.loadPrivateExtra();
assert("extra_private_exists", extra && extra.amount_cents === 1000000 && extra.serializable_public === false, extra);
assert("extra_not_getpublic", pub.getPublicOffer("CFG-DIRB2G-EXTRA-HIST-v1") == null, "blocked");

const defaults = flags.loadFlags({ NODE_ENV: "test" });
assert("flag_catalog_off", defaults.CONFENGE_OFFER_CATALOG_PUBLIC === false, defaults);
assert("flag_asaas_disabled", defaults.ASAAS_MODE === "disabled", defaults.ASAAS_MODE);
assert("flag_checkout_off", defaults.production_checkout_enabled === false, defaults);
assert("flag_webhook_off", defaults.production_webhook_enabled === false, defaults);
assert("flag_money_off", defaults.real_money_mutation_enabled === false, defaults);

const src = [
  "scripts/offers/registry.cjs",
  "scripts/offers/sandbox.cjs",
  "scripts/offers/journey.cjs",
].map((rel) => fs.readFileSync(path.join(root, rel), "utf8")).join("\n");
assert("no_hardcoded_asaas_url", !/https:\/\/(api|sandbox)\.asaas\.com/i.test(src), "url");
assert("no_hardcoded_secret", !/asaas.{0,12}(key|token|secret)/i.test(src), "secret");

const priceChange = registry.assertNewVersionForPriceChange(diag, { ...diag, amount_cents: 900000 });
assert("price_change_needs_version", priceChange.ok === false && priceChange.error === "price_change_requires_new_version", priceChange);

const now = new Date("2026-08-17T12:00:00Z");
const inventory = capacity.emptyInventory(now);

const paused = { ...m180, status: "PAUSED" };
const sold = eligibility.evaluateEligibility({
  cnpj: CNPJ,
  representante: "Ana Souza",
  offerId: "CFG-DIRB2G-180-v1",
  targetContract: "contrato-alvo-1",
  startDate: "2026-09-01",
  inventory: { ...inventory, reservations: Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`res_${i}`, { status: "RESERVED" }]),
  ) },
  now,
});
assert("sold_out_waitlist", sold.status === "WAITLIST", sold);

const pausedInv = capacity.emptyInventory(now);
const pausedDec = capacity.decideCapacity({ offer: paused, inventory: pausedInv, now });
assert("paused_no_checkout", pausedDec.status === "REJECTED", pausedDec);

async function runJourney() {
  const store = new MemoryStore();
  const inv = capacity.emptyInventory(now);
  const noCap = await journey.requestCheckout(store, {
    cnpj: CNPJ,
    offerId: "CFG-DIRB2G-180-v1",
    inventory: inv,
    now,
  });
  assert("capacity_before_checkout", noCap.ok === false && noCap.error === "capacity_not_approved", noCap);

  const elig = await journey.submitEligibility(store, {
    cnpj: CNPJ,
    representante: "Ana Souza",
    offerId: "CFG-DIRB2G-180-v1",
    targetContract: "contrato-alvo-1",
    startDate: "2026-09-01",
  }, { inventory: inv, now });
  assert("elig_approved", elig.status === "APPROVED" && elig.hold_id, elig.status);

  const dup = await journey.submitEligibility(store, {
    cnpj: CNPJ,
    representante: "Ana Souza",
    offerId: "CFG-DIRB2G-180-v1",
    targetContract: "contrato-alvo-1",
    startDate: "2026-09-01",
  }, { inventory: inv, now });
  assert("duplicate_cnpj_idempotent", dup.idempotent === true, dup.idempotent);

  const noTerms = await journey.requestCheckout(store, {
    cnpj: CNPJ,
    offerId: "CFG-DIRB2G-180-v1",
    inventory: inv,
    now,
  });
  assert("terms_before_checkout", noTerms.ok === false && noTerms.error === "terms_not_accepted", noTerms);

  const accepted = await journey.acceptOfferTerms(store, {
    cnpj: CNPJ,
    offerId: "CFG-DIRB2G-180-v1",
    actor: "Ana Souza",
    now,
  });
  assert("terms_accepted", accepted.ok && accepted.acceptance.terms_hash === terms.TERMS_HASH, accepted.acceptance && accepted.acceptance.terms_version);
  const mutate = terms.mutateAcceptance(accepted.acceptance, { terms_hash: "x" });
  assert("terms_immutable", mutate.ok === false, mutate);

  const checkout = await journey.requestCheckout(store, {
    cnpj: CNPJ,
    offerId: "CFG-DIRB2G-180-v1",
    inventory: inv,
    now,
  });
  assert("sandbox_180_created", checkout.ok && checkout.created.max_payments === 6, checkout.created);
  assert("created_not_payment", checkout.payment === false && checkout.revenue === false && checkout.event.financial_confirmation === false, checkout.event);

  const onboardEarly = journey.requestOnboarding({ checkout: checkout.created, lastEvent: checkout.event });
  assert("onboarding_before_confirm_refused", onboardEarly.ok === false && onboardEarly.error === "onboarding_before_confirmation", onboardEarly);

  const seen = new Set();
  const pending = await journey.ingestEvent(store, {
    checkoutId: checkout.created.id,
    raw: { id: "evt-pending", status: "pending" },
    seenIds: seen,
    inventory: inv,
    now,
  });
  assert("fixture_pending", pending.ok && pending.event.canonical_status === "PAYMENT_PENDING", pending.event);

  const received = await journey.ingestEvent(store, {
    checkoutId: checkout.created.id,
    raw: { id: "evt-received", status: "received" },
    seenIds: seen,
    inventory: inv,
    now,
  });
  assert("fixture_received", received.ok && received.event.financial_confirmation === true, received.event);

  const dupEvt = await journey.ingestEvent(store, {
    checkoutId: checkout.created.id,
    raw: { id: "evt-received", status: "received" },
    seenIds: seen,
    inventory: inv,
    now,
  });
  assert("duplicate_event", dupEvt.ok && dupEvt.duplicate === true, dupEvt);

  const overdue = await journey.ingestEvent(store, {
    checkoutId: checkout.created.id,
    raw: { id: "evt-overdue", status: "overdue" },
    seenIds: seen,
    inventory: inv,
    now,
  });
  assert("fixture_overdue", overdue.ok && overdue.event.canonical_status === "PAYMENT_OVERDUE", overdue.event);

  const refund = await journey.ingestEvent(store, {
    checkoutId: checkout.created.id,
    raw: { id: "evt-refund", status: "refund" },
    seenIds: seen,
    inventory: inv,
    now,
  });
  assert("fixture_refund", refund.ok && refund.event.canonical_status === "PAYMENT_REFUNDED", refund.event);

  const unknown = await journey.ingestEvent(store, {
    checkoutId: checkout.created.id,
    raw: { id: "evt-weird", status: "something-new" },
    seenIds: seen,
    inventory: inv,
    now,
  });
  assert("fixture_unknown", unknown.ok === false && unknown.status === "UNKNOWN" && unknown.exception === true, unknown);

  const badSecret = await journey.ingestEvent(store, {
    checkoutId: checkout.created.id,
    raw: { id: "evt-secret", status: "received", invalid_secret: true },
    seenIds: seen,
    inventory: inv,
    now,
  });
  assert("invalid_secret", badSecret.ok === false && badSecret.error === "invalid_secret", badSecret);

  const expired = await journey.ingestEvent(store, {
    checkoutId: checkout.created.id,
    raw: { id: "evt-late", status: "received" },
    seenIds: seen,
    inventory: inv,
    now: new Date("2026-08-25T12:00:00Z"),
  });
  assert("checkout_expired", expired.ok === false && expired.error === "checkout_expired", expired);

  const store2 = new MemoryStore();
  const inv2 = capacity.emptyInventory(now);
  await journey.submitEligibility(store2, {
    cnpj: CNPJ,
    representante: "Ana Souza",
    offerId: "CFG-DIAG-EXP-v1",
  }, { inventory: inv2, now });
  await journey.acceptOfferTerms(store2, { cnpj: CNPJ, offerId: "CFG-DIAG-EXP-v1", actor: "Ana Souza", now });
  const diagCheckout = await journey.requestCheckout(store2, {
    cnpj: CNPJ,
    offerId: "CFG-DIAG-EXP-v1",
    inventory: inv2,
    now,
  });
  assert("diag_detached", diagCheckout.ok && diagCheckout.created.kind === "checkout", diagCheckout.created);

  const moneyOn = sandbox.createSandboxCheckout({
    offerId: "CFG-DIAG-EXP-v1",
    eligibility: { status: "APPROVED", eligibility_id: "x" },
    terms: { terms_hash: "h", accepted_at: now.toISOString(), terms_version: terms.TERMS_VERSION },
    env: { CONFENGE_REAL_MONEY: "1" },
    now,
  });
  assert("real_money_blocked", moneyOn.ok === false, moneyOn);
}

await runJourney();

execSync("node scripts/offers/render.cjs", { cwd: root, stdio: "pipe" });
const pages = [
  "piloto/ofertas/index.html",
  "piloto/ofertas/diagnostico-expansao/index.html",
  "piloto/ofertas/diretoria-flex/index.html",
  "piloto/ofertas/diretoria-180/index.html",
  "piloto/ofertas/diretoria-365/index.html",
  "piloto/ofertas/faq/index.html",
  "piloto/ofertas/contratar/index.html",
];
for (const rel of pages) {
  const html = fs.readFileSync(path.join(root, rel), "utf8");
  assert(`noindex_${rel}`, html.includes('content="noindex,nofollow"'), rel);
  assert(`no_10k_copy_${rel}`, !html.includes("10.000") && !html.includes("R$ 10.000"), rel);
  assert(`a11y_${rel}`, html.includes('skip-link') && html.includes("<h1"), rel);
  assert(`no_pii_url_${rel}`, !/cnpj=\d/i.test(html), rel);
}
const compare = fs.readFileSync(path.join(root, "piloto/ofertas/index.html"), "utf8");
assert("prices_visible", compare.includes("8.000") && compare.includes("20.000") && compare.includes("15.000") && compare.includes("12.500"), "prices");
assert("no_generic_pay_link", !/asaas\.com|pay\.asaas/i.test(compare), compare.slice(0, 80));
assert("cta_contextual", compare.includes("Verificar capacidade") || compare.includes("Solicitar contratacao"), "cta");

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exit(1);
