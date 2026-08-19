/**
 * CONTRACT_PROVEN suite for the shipped Asaas production adapter.
 * Injected HTTP only. Never PRODUCTION_PROVEN. Never a real charge.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);

const checkoutFn = require(path.join(root, "netlify/functions/offer-checkout.cjs"));
const webhookFn = require(path.join(root, "netlify/functions/asaas-webhook.cjs"));
const acceptFn = require(path.join(root, "netlify/functions/offer-terms-accept.cjs"));
const sandboxCheckoutFn = require(path.join(root, "netlify/functions/offer-checkout-sandbox.cjs"));
const prodConfig = require(path.join(root, "scripts/offers/providers/config-production.cjs"));
const sandboxConfig = require(path.join(root, "scripts/offers/providers/config.cjs"));
const { MemoryOfferStore } = require(path.join(root, "scripts/offers/stores/sandbox-store.cjs"));
const events = require(path.join(root, "scripts/offers/events.cjs"));
const { REQUIRED_DECLARATIONS } = require(path.join(root, "scripts/offers/acceptance.cjs"));

const PIN = prodConfig.PINNED_LEGAL_HASH;
const CNPJ = "52407089000109";

const PROD_ENV = {
  NODE_ENV: "test",
  ASAAS_MODE: "production",
  CONFENGE_PRODUCTION_CHECKOUT: "true",
  CONFENGE_PRODUCTION_WEBHOOK: "true",
  CONFENGE_REAL_MONEY: "true",
  CONFENGE_DIAG_CHECKOUT_ENABLED: "true",
  CONFENGE_OFFER_CATALOG_PUBLIC: "true",
  CONFENGE_LEGAL_AUTHORITY_HASH: PIN,
  ASAAS_PRODUCTION_API_KEY: "FAKESECRET_a4b5c6d7e8f9g0h1i2j3",
  ASAAS_PRODUCTION_WEBHOOK_TOKEN: "prod-webhook-token-contract",
  CONFENGE_WEBHOOK_APPLY: "true",
};

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail: detail == null ? "" : String(detail).slice(0, 180) });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail: detail == null ? "" : String(detail).slice(0, 400) });
  console.error("FAIL", name, detail);
}
function assert(name, cond, detail) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}
function parse(res) {
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

function createHttp(impl) {
  const calls = [];
  return {
    calls,
    async request(opts) {
      calls.push({
        method: opts.method,
        url: opts.url,
        hasToken: Boolean(opts.headers && opts.headers.access_token),
        tokenPrefix: String((opts.headers && opts.headers.access_token) || "").slice(0, 11),
        body: opts.body || null,
      });
      return impl(opts, calls);
    },
  };
}

function prodHttp() {
  return createHttp(async (opts) => {
    if (String(opts.url).includes("/customers") && opts.method === "GET") {
      return { status: 200, body: { data: [] } };
    }
    if (String(opts.url).includes("/customers") && opts.method === "POST") {
      return { status: 200, body: { id: "cus_prod_diag_1" } };
    }
    if (String(opts.url).includes("/checkouts") && opts.method === "POST") {
      return {
        status: 200,
        body: { id: "chk_prod_diag_1", status: "ACTIVE", link: "https://asaas.com/checkoutSession/show?id=chk_prod_diag_1" },
      };
    }
    return { status: 404, body: { error: "unexpected" } };
  });
}

async function seedAcceptance(store) {
  const accept = acceptFn.createHandler({
    env: PROD_ENV,
    store,
    clock: { now: () => new Date("2026-08-18T15:00:00Z") },
    otp: "654321",
    exposeOtp: true,
  });
  const requested = parse(await accept({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({
      cnpj: CNPJ,
      representative_name: "Ana Souza",
      representative_role: "Diretora",
      email: "ana@empresa.com.br",
      offer_id: "CFG-DIAG-EXP-v1",
      declarations: Object.fromEntries(Object.keys(REQUIRED_DECLARATIONS).map((k) => [k, true])),
    }),
  }));
  const confirmed = parse(await accept({
    httpMethod: "POST",
    headers: { "user-agent": "contract-test" },
    body: JSON.stringify({ action: "confirm", pending_id: requested.body.pending_id, otp: "654321" }),
  }));
  return { requested, confirmed };
}

// --- fail-closed defaults ---
{
  const off = parse(await checkoutFn.createHandler({ env: { NODE_ENV: "test" }, store: new MemoryOfferStore() })({
    httpMethod: "POST",
    body: "{}",
  }));
  assert("default_env_fail_closed", off.statusCode >= 400 && off.body.ok === false, off);
  assert("default_not_success", off.statusCode !== 200 && off.statusCode !== 201, off);
}

{
  const sandboxKey = parse(await checkoutFn.createHandler({
    env: { ...PROD_ENV, ASAAS_PRODUCTION_API_KEY: "FAKESECRET_e1f2g3h4i5j6k7l8m9n0" },
    store: new MemoryOfferStore(),
  })({ httpMethod: "POST", body: "{}" }));
  assert("sandbox_key_rejected_in_production", sandboxKey.statusCode >= 400, sandboxKey);
}

{
  const cfg = sandboxConfig.resolveConfig({
    ASAAS_MODE: "production",
    ASAAS_SANDBOX_API_KEY: "FAKESECRET_a4b5c6d7e8f9g0h1i2j3",
  });
  assert("production_mode_blocked_in_sandbox_config", cfg.ok === false, cfg);
}

{
  const missingHash = parse(await checkoutFn.createHandler({
    env: { ...PROD_ENV, CONFENGE_LEGAL_AUTHORITY_HASH: "" },
    store: new MemoryOfferStore(),
  })({ httpMethod: "POST", body: "{}" }));
  assert("legal_hash_missing_rejected", missingHash.body.error === "legal_hash_missing" || missingHash.statusCode >= 400, missingHash);

  const badHash = parse(await checkoutFn.createHandler({
    env: { ...PROD_ENV, CONFENGE_LEGAL_AUTHORITY_HASH: "sha256:deadbeef" },
    store: new MemoryOfferStore(),
  })({ httpMethod: "POST", body: "{}" }));
  assert("legal_hash_mismatch_rejected", badHash.body.error === "legal_hash_mismatch" || badHash.statusCode >= 400, badHash);
}

{
  const store = new MemoryOfferStore();
  const http = prodHttp();
  const missingAcc = parse(await checkoutFn.createHandler({ env: PROD_ENV, store, http })({
    httpMethod: "POST",
    body: JSON.stringify({ offer_id: "CFG-DIAG-EXP-v1", acceptance_id: "acc_missing" }),
  }));
  assert("acceptance_missing_rejected", missingAcc.body.error === "acceptance_missing", missingAcc);
}

{
  const store = new MemoryOfferStore();
  const { confirmed } = await seedAcceptance(store);
  assert("acceptance_created", confirmed.statusCode === 201 && Boolean(confirmed.body.acceptance_id), confirmed);
  const http = prodHttp();
  const tamper = parse(await checkoutFn.createHandler({ env: PROD_ENV, store, http })({
    httpMethod: "POST",
    body: JSON.stringify({
      offer_id: "CFG-DIAG-EXP-v1",
      acceptance_id: confirmed.body.acceptance_id,
      amount_cents: 1,
      cnpj: CNPJ,
    }),
  }));
  assert("client_price_tamper_rejected", tamper.body.error === "price_tamper", tamper);

  const rec = parse(await checkoutFn.createHandler({ env: PROD_ENV, store, http })({
    httpMethod: "POST",
    body: JSON.stringify({
      offer_id: "CFG-DIAG-EXP-v1",
      acceptance_id: confirmed.body.acceptance_id,
      chargeTypes: ["RECURRENT"],
      cnpj: CNPJ,
    }),
  }));
  assert("recurring_rejected", rec.body.error === "recurring_blocked", rec);

  const inst = parse(await checkoutFn.createHandler({ env: PROD_ENV, store, http })({
    httpMethod: "POST",
    body: JSON.stringify({
      offer_id: "CFG-DIAG-EXP-v1",
      acceptance_id: confirmed.body.acceptance_id,
      chargeTypes: ["INSTALLMENT"],
      cnpj: CNPJ,
    }),
  }));
  assert("installment_rejected", inst.body.error === "recurring_blocked", inst);

  const other = parse(await checkoutFn.createHandler({ env: PROD_ENV, store, http })({
    httpMethod: "POST",
    body: JSON.stringify({
      offer_id: "CFG-DIRB2G-180-v1",
      acceptance_id: confirmed.body.acceptance_id,
      cnpj: CNPJ,
    }),
  }));
  assert("non_diag_offer_rejected", other.body.error === "offer_not_approved", other);
}

{
  const store = new MemoryOfferStore();
  const { confirmed } = await seedAcceptance(store);
  const http = prodHttp();
  const created = parse(await checkoutFn.createHandler({ env: PROD_ENV, store, http })({
    httpMethod: "POST",
    body: JSON.stringify({
      offer_id: "CFG-DIAG-EXP-v1",
      acceptance_id: confirmed.body.acceptance_id,
      cnpj: CNPJ,
    }),
  }));
  assert("detached_checkout_created", created.statusCode === 201 && created.body.ok === true, created);
  assert("checkout_not_payment", created.body.payment === false && created.body.revenue === false, created);
  const post = http.calls.find((c) => c.method === "POST" && String(c.url).includes("/checkouts"));
  assert("official_host", post && String(post.url).startsWith("https://api.asaas.com/v3"), post && post.url);
  assert("access_token_header", Boolean(post && post.hasToken), "header_present");
  assert("charge_types_detached", post && JSON.stringify(post.body.chargeTypes) === JSON.stringify(["DETACHED"]), post);
  assert("amount_from_registry", post && post.body.items[0].value === 8000, post);
  assert("no_boleto", post && !post.body.billingTypes.includes("BOLETO"), post);
  assert("minimized_response", created.body.created && created.body.created.id && created.body.created.link && !created.body.created.customerData, created.body.created);
  assert("no_card_fields", !JSON.stringify(created.body).includes("cvv") && !JSON.stringify(created.body).includes("cardNumber"), created.body);
}

{
  const store = new MemoryOfferStore();
  const wh = webhookFn.createHandler({ env: PROD_ENV, store });
  const badTok = parse(await wh({
    httpMethod: "POST",
    headers: { "asaas-access-token": "wrong" },
    body: JSON.stringify({ id: "evt_1", event: "PAYMENT_RECEIVED" }),
  }));
  assert("webhook_bad_token", badTok.statusCode === 401, badTok);

  const missingId = parse(await wh({
    httpMethod: "POST",
    headers: { "asaas-access-token": PROD_ENV.ASAAS_PRODUCTION_WEBHOOK_TOKEN },
    body: JSON.stringify({ event: "PAYMENT_RECEIVED" }),
  }));
  assert("webhook_missing_event_id", missingId.statusCode === 400, missingId);

  const confirmed = parse(await wh({
    httpMethod: "POST",
    headers: { "asaas-access-token": PROD_ENV.ASAAS_PRODUCTION_WEBHOOK_TOKEN },
    body: JSON.stringify({
      id: "evt_confirmed_1",
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_1", value: 8000, externalReference: "cfg:abc" },
    }),
  }));
  assert("confirmed_not_received_revenue", confirmed.body.received_revenue === false && confirmed.body.financial_confirmation === true, confirmed);
  assert("confirmed_type", confirmed.body.type === "payment_confirmed", confirmed);
  assert("nfse_queue_on_confirmed", confirmed.body.nfse_manual_queue === true, confirmed);

  const received = parse(await wh({
    httpMethod: "POST",
    headers: { "asaas-access-token": PROD_ENV.ASAAS_PRODUCTION_WEBHOOK_TOKEN },
    body: JSON.stringify({
      id: "evt_received_1",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1", value: 8000, externalReference: "cfg:abc" },
    }),
  }));
  assert("received_is_cash", received.body.received_revenue === true && received.body.financial_confirmation === true, received);
  assert("counsel_trigger", received.body.counsel_review_trigger === true, received);
  assert("revenue_field_stays_false", received.body.revenue === false, received);

  const replay = parse(await wh({
    httpMethod: "POST",
    headers: { "asaas-access-token": PROD_ENV.ASAAS_PRODUCTION_WEBHOOK_TOKEN },
    body: JSON.stringify({
      id: "evt_received_1",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1", value: 8000 },
    }),
  }));
  assert("replay_noop", replay.statusCode === 200 && replay.body.duplicate === true, replay);

  const unknown = parse(await wh({
    httpMethod: "POST",
    headers: { "asaas-access-token": PROD_ENV.ASAAS_PRODUCTION_WEBHOOK_TOKEN },
    body: JSON.stringify({ id: "evt_unk_1", event: "SOME_FUTURE_EVENT" }),
  }));
  assert("unknown_event_preserved", unknown.statusCode === 200 && (unknown.body.type === "payment_unknown" || unknown.body.ok === true), unknown);

  const refund = parse(await wh({
    httpMethod: "POST",
    headers: { "asaas-access-token": PROD_ENV.ASAAS_PRODUCTION_WEBHOOK_TOKEN },
    body: JSON.stringify({ id: "evt_ref_1", event: "PAYMENT_REFUNDED", payment: { id: "pay_1" } }),
  }));
  assert("refund_not_auto_won", refund.body.revenue !== true && refund.body.type === "payment_refunded", refund);

  const cb = parse(await wh({
    httpMethod: "POST",
    headers: { "asaas-access-token": PROD_ENV.ASAAS_PRODUCTION_WEBHOOK_TOKEN },
    body: JSON.stringify({ id: "evt_cb_1", event: "PAYMENT_CHARGEBACK_REQUESTED", payment: { id: "pay_1" } }),
  }));
  assert("chargeback_exception", cb.body.exception === true, cb);
}

{
  assert("normalize_splits_confirmed", events.normalizeStatus("CONFIRMED") === "PAYMENT_CONFIRMED", events.normalizeStatus("CONFIRMED"));
  assert("normalize_splits_received", events.normalizeStatus("RECEIVED") === "PAYMENT_RECEIVED", events.normalizeStatus("RECEIVED"));
  assert("confirmed_is_financial_not_cash", events.isFinancialConfirmation("PAYMENT_CONFIRMED") && !events.isReceivedRevenue("PAYMENT_CONFIRMED"), true);
}

{
  const page = fs.readFileSync(path.join(root, "diagnostico-b2g-expansao/index.html"), "utf8");
  assert("public_page_has_brand", page.includes("CONFENGE") && page.includes("52.407.089/0001-09"), "identity");
  assert("public_page_price", page.includes("R$ 8.000") && page.includes("pagamento único"), "price");
  assert("public_page_not_legal_service", page.includes("Não é serviço jurídico") || page.includes("não é serviço jurídico"), "legal");
  assert("public_page_no_static_asaas", !/https:\/\/(www\.)?asaas\.com\//i.test(page), "no static asaas");
  assert("public_page_no_extra", !page.includes("HISTORICAL_LIGHTHOUSE") && !page.includes("R$ 10 mil"), "extra");
  assert("public_page_no_encarregado", !/encarregado|\bDPO\b/.test(page), "privacy channel");
  assert("public_page_indexable", /index,follow|index,\s*follow/i.test(page) || !page.includes("noindex"), "robots");
}

{
  const kill = parse(await checkoutFn.createHandler({
    env: { ...PROD_ENV, CONFENGE_DIAG_CHECKOUT_ENABLED: "false" },
    store: new MemoryOfferStore(),
  })({ httpMethod: "POST", body: "{}" }));
  assert("diag_kill_switch", kill.statusCode >= 400, kill);
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({
  classification: "CONTRACT_PROVEN",
  passed: results.filter((r) => r.ok).length,
  failed: failed.length,
  results,
}, null, 2));
if (failed.length) process.exit(1);
