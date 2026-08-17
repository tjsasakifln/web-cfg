/**
 * CONTRACT_PROVEN suite for the shipped Asaas Sandbox adapter and functions.
 * Injected HTTP only. Never SANDBOX_LIVE_PROVEN. Never PRODUCTION_PROVEN.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);

const checkoutFn = require(path.join(root, "netlify/functions/offer-checkout-sandbox.cjs"));
const webhookFn = require(path.join(root, "netlify/functions/asaas-webhook-sandbox.cjs"));
const providerMod = require(path.join(root, "scripts/offers/providers/asaas-sandbox.cjs"));
const configMod = require(path.join(root, "scripts/offers/providers/config.cjs"));
const { MemoryOfferStore } = require(path.join(root, "scripts/offers/stores/sandbox-store.cjs"));
const flags = require(path.join(root, "scripts/offers/flags.cjs"));
const events = require(path.join(root, "scripts/offers/events.cjs"));
const { AUTHORITY } = require(path.join(root, "scripts/offers/registry.cjs"));

const FIX = path.join(root, "data/offers/fixtures/asaas-sandbox");
const checkoutFixture = JSON.parse(fs.readFileSync(path.join(FIX, "checkout-detached-response.json"), "utf8"));
const subFixture = JSON.parse(fs.readFileSync(path.join(FIX, "subscription-180-response.json"), "utf8"));
const customerFixture = JSON.parse(fs.readFileSync(path.join(FIX, "customer-response.json"), "utf8"));
const whCreated = JSON.parse(fs.readFileSync(path.join(FIX, "webhook-payment-created.json"), "utf8"));
const whReceived = JSON.parse(fs.readFileSync(path.join(FIX, "webhook-payment-received.json"), "utf8"));
const whConfirmed = JSON.parse(fs.readFileSync(path.join(FIX, "webhook-payment-confirmed.json"), "utf8"));
const whOverdue = JSON.parse(fs.readFileSync(path.join(FIX, "webhook-payment-overdue.json"), "utf8"));
const whRefunded = JSON.parse(fs.readFileSync(path.join(FIX, "webhook-payment-refunded.json"), "utf8"));
const whDeleted = JSON.parse(fs.readFileSync(path.join(FIX, "webhook-payment-deleted.json"), "utf8"));
const whCheckout = JSON.parse(fs.readFileSync(path.join(FIX, "webhook-checkout-created.json"), "utf8"));
const whUnknown = JSON.parse(fs.readFileSync(path.join(FIX, "webhook-unknown.json"), "utf8"));

const SANDBOX_ENV = {
  NODE_ENV: "test",
  ASAAS_MODE: "sandbox",
  CONFENGE_OFFER_SANDBOX_ENABLED: "true",
  ASAAS_SANDBOX_API_KEY: "$aact_hmlg_test_contract_only_not_a_real_key",
  ASAAS_SANDBOX_WEBHOOK_TOKEN: "sbx-webhook-token-contract",
  CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN: "sbx-admin-token-contract",
  ASAAS_SANDBOX_BASE_URL: "https://api-sandbox.asaas.com/v3",
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
        token: opts.headers && opts.headers.access_token,
      });
      return impl(opts, calls);
    },
  };
}

function sandboxHttp(overrides = {}) {
  let creates = 0;
  return createHttp(async (opts) => {
    if (overrides.redirectToProduction) {
      return { status: 302, headers: { location: "https://api.asaas.com/v3/checkouts" }, body: null };
    }
    if (overrides.timeoutBefore) {
      const err = new Error("timeout");
      err.code = "ETIMEDOUT";
      throw err;
    }
    if (overrides.timeoutAfter && opts.method === "POST" && /checkouts$/.test(opts.url) && creates === 0) {
      creates += 1;
      overrides._created = true;
      const err = new Error("timeout");
      err.code = "ETIMEDOUT";
      throw err;
    }
    if (opts.method === "GET" && /customers/.test(opts.url)) {
      return { status: 200, headers: {}, body: { data: overrides.existingCustomer ? [customerFixture] : [] } };
    }
    if (opts.method === "POST" && /customers$/.test(opts.url)) {
      return { status: 200, headers: {}, body: customerFixture };
    }
    if (opts.method === "GET" && /subscriptions/.test(opts.url) && overrides._created) {
      return { status: 200, headers: {}, body: { data: [checkoutFixture] } };
    }
    if (opts.method === "POST" && /checkouts$/.test(opts.url)) {
      creates += 1;
      overrides.creates = creates;
      if (overrides.productionLink) {
        return { status: 200, headers: {}, body: { ...checkoutFixture, link: "https://www.asaas.com/checkoutSession/show/x" } };
      }
      return { status: 200, headers: {}, body: { ...checkoutFixture, id: overrides.checkoutId || checkoutFixture.id } };
    }
    if (opts.method === "POST" && /subscriptions$/.test(opts.url)) {
      creates += 1;
      overrides.creates = creates;
      return { status: 200, headers: {}, body: subFixture };
    }
    return { status: 404, headers: {}, body: { errors: [{ code: "not_found" }] } };
  });
}

function checkoutEvent(env, { http, store, body, headers, inventory } = {}) {
  const handler = checkoutFn.createHandler({
    env,
    http,
    store: store === undefined ? new MemoryOfferStore() : store,
    clock: { now: () => new Date("2026-08-17T12:00:00Z") },
    inventory,
    sleep: async () => {},
  });
  return handler({
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      "x-confenge-sandbox-admin-token": env.CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN || "",
      ...(headers || {}),
    },
    body: JSON.stringify(body || {
      offer_id: "CFG-DIAG-EXP-v1",
      sandbox_test: true,
      fixture_id: "sbx-diag-001",
      cnpj: "11222333000181",
      email: "sandbox.diag@example.invalid",
      phone: "4738010919",
    }),
  });
}

function webhookEvent(env, { store, body, headers, raw } = {}) {
  const handler = webhookFn.createHandler({
    env,
    store: store === undefined ? new MemoryOfferStore() : store,
    clock: { now: () => new Date("2026-08-17T12:00:00Z") },
  });
  return handler({
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      "asaas-access-token": env.ASAAS_SANDBOX_WEBHOOK_TOKEN || "",
      ...(headers || {}),
    },
    body: raw != null ? raw : JSON.stringify(body || whReceived),
  });
}

const defaults = flags.loadFlags({ NODE_ENV: "test" });
assert("default_catalog_public_false", defaults.CONFENGE_OFFER_CATALOG_PUBLIC === false, defaults);
assert("default_asaas_disabled", defaults.ASAAS_MODE === "disabled", defaults.ASAAS_MODE);
assert("default_checkout_off", defaults.production_checkout_enabled === false, defaults);
assert("default_webhook_off", defaults.production_webhook_enabled === false, defaults);
assert("default_money_off", defaults.real_money_mutation_enabled === false, defaults);

const disabled = parse(await checkoutFn.createHandler({
  env: { NODE_ENV: "test" },
  store: new MemoryOfferStore(),
})({
  httpMethod: "POST",
  headers: {},
  body: JSON.stringify({ offer_id: "CFG-DIAG-EXP-v1", sandbox_test: true }),
}));
assert("disabled_404", disabled.statusCode === 404 && disabled.body.error === "feature_disabled", disabled);

const getOnly = parse(await checkoutFn.createHandler({ env: SANDBOX_ENV, store: new MemoryOfferStore() })({
  httpMethod: "GET",
  headers: {},
  body: "",
}));
assert("checkout_post_only", getOnly.statusCode === 405, getOnly);

const noFlag = parse(await checkoutEvent({ ...SANDBOX_ENV, CONFENGE_OFFER_SANDBOX_ENABLED: "false" }, { http: sandboxHttp() }));
assert("missing_sandbox_flag", noFlag.statusCode === 403 && noFlag.body.error === "sandbox_flag_required", noFlag);

const noAdmin = parse(await checkoutFn.createHandler({
  env: SANDBOX_ENV,
  store: new MemoryOfferStore(),
  http: sandboxHttp(),
})({
  httpMethod: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ offer_id: "CFG-DIAG-EXP-v1", sandbox_test: true, fixture_id: "sbx-diag-001" }),
}));
assert("missing_admin_token", noAdmin.statusCode === 401, noAdmin);

const badAdmin = parse(await checkoutEvent(SANDBOX_ENV, {
  http: sandboxHttp(),
  headers: { "x-confenge-sandbox-admin-token": "wrong-token" },
}));
assert("wrong_admin_token", badAdmin.statusCode === 401 && badAdmin.body.error === "admin_token_invalid", badAdmin);

const prodBase = parse(await checkoutEvent({
  ...SANDBOX_ENV,
  ASAAS_SANDBOX_BASE_URL: "https://api.asaas.com/v3",
}, { http: sandboxHttp() }));
assert("production_base_url_blocked", prodBase.statusCode === 403 && prodBase.body.error === "production_base_url_blocked", prodBase);

const redirectHttp = sandboxHttp({ redirectToProduction: true });
const redirected = parse(await checkoutEvent(SANDBOX_ENV, { http: redirectHttp }));
assert("production_redirect_blocked", redirected.body.error === "production_redirect_blocked", redirected);
assert("redirect_no_follow_prod", redirectHttp.calls.every((c) => /api-sandbox\.asaas\.com/.test(c.url)), redirectHttp.calls);

const noSecret = parse(await checkoutEvent({ ...SANDBOX_ENV, ASAAS_SANDBOX_API_KEY: "" }, { http: sandboxHttp() }));
assert("missing_secret", noSecret.statusCode === 503 && noSecret.body.error === "sandbox_secret_missing", noSecret);

const prodKey = parse(await checkoutEvent({
  ...SANDBOX_ENV,
  ASAAS_SANDBOX_API_KEY: "$aact_prod_should_never_be_used",
}, { http: sandboxHttp() }));
assert("production_key_blocked", prodKey.statusCode === 403, prodKey);

const badOffer = parse(await checkoutEvent(SANDBOX_ENV, {
  http: sandboxHttp(),
  body: { offer_id: "CFG-DOES-NOT-EXIST", sandbox_test: true, fixture_id: "sbx-diag-001" },
}));
assert("invalid_offer_id", badOffer.statusCode === 422 && badOffer.body.error === "offer_unknown", badOffer);

const flex = parse(await checkoutEvent(SANDBOX_ENV, {
  http: sandboxHttp(),
  body: {
    offer_id: "CFG-DIRB2G-FLEX-v1",
    sandbox_test: true,
    fixture_id: "sbx-diag-001",
    cnpj: "11222333000181",
    email: "sandbox.diag@example.invalid",
    phone: "4738010919",
  },
}));
assert("unsupported_billing_shape", flex.statusCode === 422 && flex.body.error === "UNSUPPORTED_OFFER_BILLING_SHAPE", flex);

const badPii = parse(await checkoutEvent(SANDBOX_ENV, {
  http: sandboxHttp(),
  body: {
    offer_id: "CFG-DIAG-EXP-v1",
    sandbox_test: true,
    cnpj: "19131243000197",
    email: "real.person@company.com.br",
    phone: "11999999999",
  },
}));
assert("non_allowlisted_pii", badPii.statusCode === 422 && badPii.body.error === "pii_not_allowlisted", badPii);

const mixedPii = parse(await checkoutEvent(SANDBOX_ENV, {
  http: sandboxHttp(),
  body: {
    offer_id: "CFG-DIAG-EXP-v1",
    sandbox_test: true,
    fixture_id: "sbx-diag-001",
    cnpj: "11222333000181",
    email: "not-in-allowlist@example.com",
    phone: "4738010919",
  },
}));
assert("mixed_pii_rejected", mixedPii.statusCode === 422 && mixedPii.body.error === "pii_not_allowlisted", mixedPii);

const validHttp = sandboxHttp();
const valid = parse(await checkoutEvent(SANDBOX_ENV, { http: validHttp }));
assert("valid_checkout_201", valid.statusCode === 201 && valid.body.ok === true, valid);
assert("valid_checkout_id", valid.body.created && valid.body.created.id === checkoutFixture.id, valid.body.created);
assert("valid_checkout_link_sandbox", valid.body.created && /sandbox\.asaas\.com/.test(valid.body.created.link), valid.body.created);
assert("checkout_created_event", valid.body.event && valid.body.event.type === "checkout_created", valid.body.event);
assert("checkout_not_payment", valid.body.payment === false && valid.body.revenue === false && valid.body.financial_confirmation === false, valid.body);
assert("event_not_revenue", valid.body.event.financial_confirmation === false && valid.body.event.revenue === false, valid.body.event);
assert("event_schema", valid.body.event.schema === events.SCHEMA, valid.body.event);
assert("outbound_sandbox_only", validHttp.calls.length > 0 && validHttp.calls.every((c) => /^https:\/\/api-sandbox\.asaas\.com\//.test(c.url)), validHttp.calls);
assert("no_production_call", validHttp.calls.every((c) => !/api\.asaas\.com|www\.asaas\.com/.test(c.url)), validHttp.calls);

const storeRetry = new MemoryOfferStore();
const httpRetry = sandboxHttp({ checkoutId: checkoutFixture.id });
const first = parse(await checkoutEvent(SANDBOX_ENV, { http: httpRetry, store: storeRetry }));
const second = parse(await checkoutEvent(SANDBOX_ENV, { http: httpRetry, store: storeRetry }));
assert("idempotent_retry_same_id", first.body.created.id === second.body.created.id, { first: first.body.created, second: second.body.created });
assert("idempotent_no_second_charge", httpRetry.calls.filter((c) => c.method === "POST" && /checkouts$/.test(c.url)).length === 1, httpRetry.calls);
assert("idempotent_flag", second.body.idempotent === true, second.body);

const timeoutBeforeHttp = sandboxHttp({ timeoutBefore: true });
const timeoutBefore = parse(await checkoutEvent(SANDBOX_ENV, { http: timeoutBeforeHttp, store: new MemoryOfferStore() }));
assert("timeout_before_response", timeoutBefore.body.error === "timeout" || timeoutBefore.statusCode === 504, timeoutBefore);

const timeoutAfterState = { timeoutAfter: true };
const timeoutAfterHttp = sandboxHttp(timeoutAfterState);
const storeTimeout = new MemoryOfferStore();
const timeoutAfter = parse(await checkoutEvent(SANDBOX_ENV, { http: timeoutAfterHttp, store: storeTimeout }));
const timeoutRetry = parse(await checkoutEvent(SANDBOX_ENV, { http: timeoutAfterHttp, store: storeTimeout }));
const postCreates = timeoutAfterHttp.calls.filter((c) => c.method === "POST" && /checkouts$/.test(c.url)).length;
assert("timeout_after_no_second_post", postCreates <= 1, { postCreates, calls: timeoutAfterHttp.calls });
assert("timeout_after_reconcile_or_pending", timeoutAfter.body.ok === true || timeoutAfter.body.error === "timeout" || timeoutRetry.body.ok === true, {
  timeoutAfter, timeoutRetry,
});

const concStore = new MemoryOfferStore();
const concState = {};
const concBase = sandboxHttp(concState);
const concHttp = {
  calls: concBase.calls,
  async request(opts) {
    await new Promise((resolve) => setImmediate(resolve));
    return concBase.request(opts);
  },
};
const concHandler = checkoutFn.createHandler({
  env: SANDBOX_ENV,
  http: concHttp,
  store: concStore,
  clock: { now: () => new Date("2026-08-17T12:00:00Z") },
  sleep: async () => {},
});
const payload = JSON.stringify({
  offer_id: "CFG-DIAG-EXP-v1",
  sandbox_test: true,
  fixture_id: "sbx-diag-001",
  cnpj: "11222333000181",
  email: "sandbox.diag@example.invalid",
  phone: "4738010919",
});
const headers = {
  "content-type": "application/json",
  "x-confenge-sandbox-admin-token": SANDBOX_ENV.CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN,
};
const [c1, c2] = await Promise.all([
  concHandler({ httpMethod: "POST", headers, body: payload }),
  concHandler({ httpMethod: "POST", headers, body: payload }),
]);
const concPosts = concHttp.calls.filter((c) => c.method === "POST" && /checkouts$/.test(c.url)).length;
assert("concurrent_single_create", concPosts === 1, { concPosts, c1: parse(c1), c2: parse(c2) });

const storeDown = parse(await checkoutEvent(SANDBOX_ENV, { http: sandboxHttp(), store: null }));
assert("store_unavailable", storeDown.statusCode === 503 && storeDown.body.error === "store_unavailable", storeDown);

const whGet = parse(await webhookFn.createHandler({ env: SANDBOX_ENV, store: new MemoryOfferStore() })({
  httpMethod: "GET",
  headers: {},
  body: "",
}));
assert("webhook_post_only", whGet.statusCode === 405, whGet);

const whNoFlag = parse(await webhookEvent({ ...SANDBOX_ENV, CONFENGE_OFFER_SANDBOX_ENABLED: "false" }, {}));
assert("webhook_missing_flag", whNoFlag.statusCode === 403, whNoFlag);

const whBadToken = parse(await webhookEvent(SANDBOX_ENV, { headers: { "asaas-access-token": "nope" } }));
assert("webhook_invalid_token", whBadToken.statusCode === 401 && whBadToken.body.error === "invalid_webhook_token", whBadToken);

const whStore = new MemoryOfferStore();
const wh1 = parse(await webhookEvent(SANDBOX_ENV, { store: whStore, body: whReceived }));
const wh2 = parse(await webhookEvent(SANDBOX_ENV, { store: whStore, body: whReceived }));
assert("webhook_known_received", wh1.statusCode === 200 && wh1.body.type === "payment_received", wh1);
assert("webhook_replay_deduped", wh2.body.duplicate === true && wh2.statusCode === 200, wh2);
assert("received_not_revenue", wh1.body.revenue === false, wh1.body);

const missingId = parse(await webhookEvent(SANDBOX_ENV, { body: { event: "PAYMENT_RECEIVED", payment: { status: "RECEIVED" } } }));
assert("missing_provider_event_id", missingId.statusCode === 400 && missingId.body.error === "event_id_missing", missingId);

const pending = parse(await webhookEvent(SANDBOX_ENV, { store: new MemoryOfferStore(), body: whCreated }));
assert("pending_stays_pending", pending.body.type === "payment_created" && pending.body.financial_confirmation === false, pending);
assert("pending_not_paid", pending.body.type !== "payment_received", pending);

const confirmed = parse(await webhookEvent(SANDBOX_ENV, { store: new MemoryOfferStore(), body: whConfirmed }));
assert("confirmed_maps_received", confirmed.body.type === "payment_received", confirmed);
assert("confirmed_revenue_false", confirmed.body.revenue === false, confirmed);

const checkoutCreated = parse(await webhookEvent(SANDBOX_ENV, { store: new MemoryOfferStore(), body: whCheckout }));
assert("checkout_created_not_revenue", checkoutCreated.body.type === "checkout_created" && checkoutCreated.body.financial_confirmation === false && checkoutCreated.body.revenue === false, checkoutCreated);

const unknown = parse(await webhookEvent(SANDBOX_ENV, { store: new MemoryOfferStore(), body: whUnknown }));
assert("unknown_exception", unknown.body.exception === true && (unknown.body.status === "UNKNOWN" || unknown.body.type === "commercial_exception"), unknown);

const overdue = parse(await webhookEvent(SANDBOX_ENV, { store: new MemoryOfferStore(), body: whOverdue }));
assert("overdue_mapped", overdue.body.type === "payment_overdue", overdue);

const refunded = parse(await webhookEvent(SANDBOX_ENV, { store: new MemoryOfferStore(), body: whRefunded }));
assert("refund_mapped", refunded.body.type === "payment_refunded", refunded);

const deleted = parse(await webhookEvent(SANDBOX_ENV, { store: new MemoryOfferStore(), body: whDeleted }));
assert("cancel_deleted_mapped", deleted.body.type === "commercial_exception" || deleted.body.exception === true, deleted);

const oversized = parse(await webhookEvent(SANDBOX_ENV, { raw: `{"id":"x","event":"PAYMENT_RECEIVED","pad":"${"a".repeat(70 * 1024)}"}` }));
assert("body_oversized", oversized.statusCode === 413 && oversized.body.error === "body_too_large", oversized);

const badJson = parse(await webhookEvent(SANDBOX_ENV, { raw: "{not-json" }));
assert("invalid_json", badJson.statusCode === 400 && badJson.body.error === "invalid_json", badJson);

const redactionSample = providerMod.redactProviderPayload({
  access_token: SANDBOX_ENV.ASAAS_SANDBOX_API_KEY,
  "asaas-access-token": SANDBOX_ENV.ASAAS_SANDBOX_WEBHOOK_TOKEN,
  admin_token: SANDBOX_ENV.CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN,
  email: "sandbox.diag@example.invalid",
  cpfCnpj: "11222333000181",
  phone: "4738010919",
  offer_id: "CFG-DIAG-EXP-v1",
});
const redactionBlob = JSON.stringify(redactionSample);
assert("redact_api_key", !redactionBlob.includes(SANDBOX_ENV.ASAAS_SANDBOX_API_KEY), redactionSample);
assert("redact_webhook_token", !redactionBlob.includes(SANDBOX_ENV.ASAAS_SANDBOX_WEBHOOK_TOKEN), redactionSample);
assert("redact_admin_token", !redactionBlob.includes(SANDBOX_ENV.CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN), redactionSample);
assert("redact_email", !redactionBlob.includes("sandbox.diag@example.invalid"), redactionSample);
assert("redact_doc", !redactionBlob.includes("11222333000181"), redactionSample);
assert("response_no_secret", !valid.body || !JSON.stringify(valid.body).includes(SANDBOX_ENV.ASAAS_SANDBOX_API_KEY), "response");
assert("response_no_admin", !JSON.stringify(valid.body).includes(SANDBOX_ENV.CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN), "response");

const mapped = providerMod.mapProviderEventToCanonicalEvent(whReceived, { offer_id: "CFG-DIAG-EXP-v1" });
assert("canonical_schema", mapped.event.schema === "confenge.commercial_event.v1", mapped.event);
assert("canonical_source", mapped.event.source === "CONFENGE_WEB", mapped.event);
assert("canonical_types_exist", events.TYPES.CHECKOUT_CREATED === "checkout_created" && events.TYPES.PAYMENT_RECEIVED === "payment_received", events.TYPES);

const modeBlocked = configMod.resolveConfig({ ...SANDBOX_ENV, ASAAS_MODE: "production" });
assert("mode_production_fails", modeBlocked.ok === false && modeBlocked.error === "asaas_mode_blocked", modeBlocked);

const key = providerMod.computeProviderIdempotencyKey({
  correlation_id: "corr_test",
  offer_id: "CFG-DIAG-EXP-v1",
  catalog_version: AUTHORITY.authority_version,
});
assert("idempotency_no_pii", !/11222333000181|sandbox\.diag|4738010919/.test(key), key);

const subHttp = sandboxHttp();
const subStore = new MemoryOfferStore();
const subRes = parse(await checkoutEvent(SANDBOX_ENV, {
  http: subHttp,
  store: subStore,
  body: {
    offer_id: "CFG-DIRB2G-180-v1",
    sandbox_test: true,
    fixture_id: "sbx-180-001",
    cnpj: "11222333000181",
    email: "sandbox.180@example.invalid",
    phone: "4738010919",
    target_contract: "contrato-sandbox-1",
    start_date: "2026-09-01",
  },
}));
assert("subscription_180_created", subRes.body.ok === true && subRes.body.created && subRes.body.created.id === subFixture.id, subRes);
assert("subscription_max_payments", subRes.body.created && subRes.body.created.max_payments === 6, subRes.body.created);
assert("subscription_not_revenue", subRes.body.payment === false && subRes.body.revenue === false, subRes.body);
const subPosts = subHttp.calls.filter((c) => c.method === "POST" && /subscriptions$/.test(c.url));
assert("subscription_uses_official_path", subPosts.length === 1, subHttp.calls);
assert("subscription_no_checkout_recurrent", subHttp.calls.every((c) => !/checkouts$/.test(c.url) || c.method !== "POST"), subHttp.calls);

const shipped = [
  "scripts/offers/providers/asaas-sandbox.cjs",
  "scripts/offers/providers/config.cjs",
  "scripts/offers/stores/sandbox-store.cjs",
  "netlify/functions/offer-checkout-sandbox.cjs",
  "netlify/functions/asaas-webhook-sandbox.cjs",
];
for (const rel of shipped) {
  assert(`artifact_${rel}`, fs.existsSync(path.join(root, rel)), rel);
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  classification: "CONTRACT_PROVEN",
  passed: results.length - failed.length,
  failed: failed.length,
  results,
}, null, 2));
if (failed.length) process.exit(1);
