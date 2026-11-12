'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { createCommerceHttp } = require('../../runtime/tools-commerce/http.cjs');
const { createMercadoPago } = require('../../runtime/tools-commerce/mercado-pago.cjs');
const { TERMS, loadConfig } = require('../../runtime/tools-commerce/policy.cjs');
const { createServiceHttp } = require('../../runtime/project-commerce/service-http.cjs');
const { readOffer, quote, normalizeCheckout, loadServiceConfig } = require('../../runtime/project-commerce/service-policy.cjs');

// The production tools ledger runs unchanged against a small transactional
// memory adapter. The service ledger uses its real private filesystem store.
// Only the database transport and Mercado Pago HTTP responses are simulated.
function memoryDatabase() {
  const values = new Map();
  let tail = Promise.resolve();
  const snapshot = value => ({ data: () => value === undefined ? undefined : structuredClone(value) });
  const doc = key => ({ key, get: async () => snapshot(values.get(key)), collection: name => collection(`${key}/${name}`) });
  const collection = key => ({ doc: id => doc(`${key}/${id}`) });
  const db = { collection, values, fail: false, runTransaction(work) {
    const run = tail.then(async () => {
      if (db.fail) throw Error('DATABASE_UNAVAILABLE');
      const changes = new Map();
      const tx = {
        get: async ref => snapshot(changes.has(ref.key) ? changes.get(ref.key) : values.get(ref.key)),
        create: (ref, value) => {
          assert(!values.has(ref.key) && !changes.has(ref.key), 'create cannot overwrite a ledger event');
          changes.set(ref.key, structuredClone(value));
        },
        set: (ref, value) => changes.set(ref.key, structuredClone(value)),
        update: (ref, update) => {
          const old = changes.has(ref.key) ? changes.get(ref.key) : values.get(ref.key);
          assert(old, 'update requires an existing record');
          changes.set(ref.key, { ...old, ...structuredClone(update) });
        }
      };
      const result = await work(tx);
      for (const [key, value] of changes) values.set(key, value);
      return result;
    });
    tail = run.catch(() => {});
    return run;
  } };
  return db;
}

function setup(t) {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'confenge-shared-webhook-'));
  fs.chmodSync(storageRoot, 0o700);
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  const env = { RUNTIME_PROFILE: 'netcup-production', CONFENGE_STORAGE_DIR: storageRoot,
    TOOLS_COMMERCE_MODE: 'live', TOOLS_COMMERCE_FIREBASE_PROJECT: 'confenge-tools-prod',
    TOOLS_COMMERCE_FIREBASE_WEB_KEY: `AIza${'a'.repeat(32)}`, TOOLS_COMMERCE_FIREBASE_WEB_APP: '1:123456:web:abcdef',
    TOOLS_COMMERCE_HMAC_KEY: randomBytes(32).toString('base64url'),
    TOOLS_COMMERCE_MP_ACCESS_TOKEN: `APP_USR-${'fixture'.repeat(8)}`,
    TOOLS_COMMERCE_MP_WEBHOOK_SECRET: 'fixture-shared-webhook-secret-123456',
    TOOLS_COMMERCE_MP_LIVE_SELLER_ID: '123' };
  const db = memoryDatabase();
  const rawOrders = new Map();
  const calls = [];
  const incidents = [];
  const controls = { sellerId: '123', unavailable: false };
  const providerFactory = options => createMercadoPago({ ...options, fetchImpl: async (url, request) => {
    calls.push({ url, method: request.method });
    assert.equal(request.headers.Authorization, `Bearer ${env.TOOLS_COMMERCE_MP_ACCESS_TOKEN}`);
    if (url.endsWith('/users/me')) return Response.json({ id: controls.sellerId, tags: [] });
    assert.equal(request.method, 'GET', 'a webhook must not create a charge');
    if (controls.unavailable) throw Error('PROVIDER_UNAVAILABLE');
    const order = rawOrders.get(url.split('/').at(-1));
    return order ? Response.json(order) : Response.json({}, { status: 404 });
  } });
  const tools = createCommerceHttp({ env, providerFactory, firebaseFactory: () => ({ db }), onIncident: x => incidents.push(x) });
  const services = createServiceHttp({ env, providerFactory, onIncident: x => incidents.push(x) });
  const toolsConfig = loadConfig(env), serviceConfig = loadServiceConfig(env);
  const toolLedger = tools.getDependencies(toolsConfig).ledger;
  const serviceLedger = services.dependencies(serviceConfig).ledger;
  const addOrder = (reference, amountCents) => {
    const id = `ORD${randomBytes(12).toString('hex').toUpperCase()}`;
    const amount = (amountCents / 100).toFixed(2);
    const order = { id, external_reference: reference, type: 'online', processing_mode: 'manual',
      user_id: '123', currency: 'BRL', total_amount: amount, total_paid_amount: amount,
      status: 'processed', status_detail: 'accredited', last_updated_date: new Date().toISOString(),
      transactions: { payments: [{ amount, paid_amount: amount, status: 'processed', status_detail: 'accredited',
        payment_method: { id: 'visa', type: 'credit_card' } }] } };
    rawOrders.set(id, order);
    return order;
  };
  const signed = id => {
    const requestId = randomUUID(), ts = String(Date.now());
    const digest = createHmac('sha256', env.TOOLS_COMMERCE_MP_WEBHOOK_SECRET)
      .update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
    return { httpMethod: 'POST', body: '{"status":"approved","amount":1}',
      queryStringParameters: { 'data.id': id },
      headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${digest}` } };
  };
  const deliver = (id, app = services) => tools.webhook(signed(id), { onUnmatchedOrder: app.observeSharedWebhook });
  async function seedTools() {
    const uid = randomUUID();
    await toolLedger.register({ uid, email: `synthetic-${uid}@example.test` });
    const { order } = await toolLedger.startOrder({ uid, requestId: randomUUID(), packageId: 'creditos-1',
      termsVersion: TERMS, paymentFlow: 'checkout' });
    return { uid, order, provider: addOrder(order.id, order.amountCents) };
  }
  function seedService() {
    const offer = readOffer();
    const selection = { areaM2: 100, deadlineDays: 90, disciplines: ['eletrica'], floors: 1,
      buildingType: 'new-residential', terrain: 'flat-or-gentle' };
    const priced = quote(selection, offer);
    const input = { ...selection, requestId: randomUUID(), receiptToken: randomBytes(32).toString('base64url'),
      name: 'Pessoa sintética', email: 'synthetic@example.test', phone: '48999999999', city: 'Florianópolis', state: 'SC',
      reference: '', acceptedTerms: true, consent: true, pricingVersion: priced.pricingVersion,
      termsVersion: priced.termsVersion, termsHash: priced.termsHash, quoteHash: priced.quoteHash };
    const { order } = serviceLedger.start({ ...normalizeCheckout(input), quote: priced, offer, ip: '192.0.2.1' });
    return { order, provider: addOrder(order.id, order.quote.amountCents) };
  }
  const orderGets = () => calls.filter(call => /\/v1\/orders\//.test(call.url)).length;
  return { env, db, calls, controls, incidents, tools, services, serviceConfig, toolLedger, serviceLedger,
    addOrder, signed, deliver, seedTools, seedService, orderGets };
}

test('shared callback keeps tool payments, replay and reversal exclusively in the existing tools ledger', async t => {
  const s = setup(t), item = await s.seedTools();
  let forwarded = 0;
  const callback = async (...args) => { forwarded++; return s.services.observeSharedWebhook(...args); };
  const deliver = () => s.tools.webhook(s.signed(item.provider.id), { onUnmatchedOrder: callback });
  assert.equal((await deliver()).statusCode, 200);
  assert.equal((await deliver()).statusCode, 200);
  assert.equal((await s.toolLedger.account(item.uid)).paid, 1);
  assert.equal(s.orderGets(), 2, 'one authenticated order GET per delivery');
  assert.equal(forwarded, 0);
  assert.equal(s.serviceLedger.orders.list().length, 0);
  const payment = item.provider.transactions.payments[0];
  item.provider.status = payment.status = 'refunded';
  item.provider.status_detail = payment.status_detail = 'refunded';
  item.provider.total_refunded_amount = payment.refunded_amount = item.provider.total_amount;
  assert.equal((await deliver()).statusCode, 200);
  assert.equal((await deliver()).statusCode, 200);
  assert.equal((await s.toolLedger.account(item.uid)).paid, 0);
  assert.equal((await s.toolLedger.getOrder(item.uid, item.order.id)).order.status, 'reversed');
  assert.equal(forwarded, 0);
});

test('shared callback uses one authenticated GET for the matching service and does not create tool credits', async t => {
  const s = setup(t), item = s.seedService(), other = s.seedService();
  assert.equal((await s.deliver(item.provider.id)).statusCode, 200);
  assert.equal((await s.deliver(item.provider.id)).statusCode, 200);
  const stored = s.serviceLedger.orders.get(item.order.id);
  assert.equal(stored.status, 'paid');
  assert.equal(stored.events.filter(event => event.type === 'payment_paid').length, 1);
  assert.equal(s.serviceLedger.orders.get(other.order.id).status, 'creating');
  assert.equal(s.orderGets(), 2);
  assert.equal(s.db.values.size, 0, 'no accounts, orders, credits or exports are created for a service');
  s.env.PROJECT_SERVICE_PURCHASES = '0';
  const payment = item.provider.transactions.payments[0];
  item.provider.status = payment.status = 'refunded';
  item.provider.status_detail = payment.status_detail = 'refunded';
  item.provider.total_refunded_amount = payment.refunded_amount = item.provider.total_amount;
  assert.equal((await s.deliver(item.provider.id)).statusCode, 200);
  assert.equal(s.serviceLedger.orders.get(item.order.id).status, 'refunded');
  assert.equal(s.orderGets(), 3, 'paused sales still reconcile without a second order GET');
});

test('unsigned, ambiguous and invalid callbacks cannot query or fund either ledger', async t => {
  const s = setup(t), item = s.seedService();
  for (const event of [
    { ...s.signed(item.provider.id), headers: {} },
    { ...s.signed(item.provider.id), multiValueQueryStringParameters: { 'data.id': [item.provider.id, item.provider.id] } },
    { ...s.signed(item.provider.id), httpMethod: 'GET' },
    { ...s.signed(item.provider.id), isBase64Encoded: true },
  ]) assert((await s.tools.webhook(event, { onUnmatchedOrder: s.services.observeSharedWebhook })).statusCode >= 400);
  assert.equal(s.calls.length, 0);
  assert.equal(s.serviceLedger.orders.get(item.order.id).status, 'creating');
  assert.equal(s.db.values.size, 0);
});

test('another seller, token, webhook secret or environment is never forwarded to the service store', async t => {
  const s = setup(t), item = s.seedService();
  for (const alteration of [{ sellerId: '456' }, { accessToken: 'APP_USR-different-application' },
    { webhookSecret: 'different-webhook-secret-123456' }, { mode: 'sandbox' }, { mode: 'off' }, { configured: false }]) {
    const other = createServiceHttp({ config: { ...s.serviceConfig, ...alteration },
      ledgerFactory: () => { throw Error('UNRELATED_SERVICE_STORE_MUST_NOT_OPEN'); },
      providerFactory: () => { throw Error('UNRELATED_PROVIDER_MUST_NOT_LOAD'); } });
    assert.equal((await s.deliver(item.provider.id, other)).statusCode, 200);
    assert.equal(s.serviceLedger.orders.get(item.order.id).status, 'creating');
  }
  assert.equal(s.orderGets(), 6);
});

test('wrong seller and temporary provider, tools database or service storage failures are retried', async t => {
  for (const kind of ['seller', 'provider', 'tools-database', 'service-storage']) await t.test(kind, async st => {
    const s = setup(st), item = s.seedService();
    let app = s.services;
    if (kind === 'seller') s.controls.sellerId = '456';
    if (kind === 'provider') s.controls.unavailable = true;
    if (kind === 'tools-database') s.db.fail = true;
    if (kind === 'service-storage') app = createServiceHttp({ config: s.serviceConfig,
      ledgerFactory: () => { throw Error('SERVICE_STORAGE_UNAVAILABLE'); } });
    assert.equal((await s.deliver(item.provider.id, app)).statusCode, 503);
    assert.equal(s.serviceLedger.orders.get(item.order.id).status, 'creating');
    assert.equal(s.db.values.size, 0);
    assert.equal(s.orderGets(), kind === 'seller' ? 0 : 1);
    s.controls.sellerId = '123'; s.controls.unavailable = false; s.db.fail = false;
    assert.equal((await s.deliver(item.provider.id)).statusCode, 200);
    assert.equal(s.serviceLedger.orders.get(item.order.id).status, 'paid');
  });
});

test('permanent tools mismatches keep their acknowledgement, but service mismatches never claim success', async t => {
  const s = setup(t), tool = await s.seedTools(), service = s.seedService();
  tool.provider.total_amount = '1.00';
  assert.equal((await s.deliver(tool.provider.id)).statusCode, 200);
  assert(s.incidents.includes('PAYMENT_RECONCILIATION_MISMATCH'));
  assert.equal((await s.toolLedger.account(tool.uid)).paid, 0);
  assert.equal(s.serviceLedger.orders.get(service.order.id).status, 'creating');
  service.provider.total_amount = '1.00';
  assert.equal((await s.deliver(service.provider.id)).statusCode, 422);
  assert.equal(s.serviceLedger.orders.get(service.order.id).status, 'creating');
  const unknown = s.addOrder(randomUUID(), 69000);
  assert.equal((await s.deliver(unknown.id)).statusCode, 200);
  const unknownPix = s.addOrder(randomUUID(), 1490);
  unknownPix.processing_mode = 'automatic';
  unknownPix.transactions.payments[0].payment_method = { id: 'pix', type: 'bank_transfer' };
  assert.equal((await s.deliver(unknownPix.id)).statusCode, 200, 'unrelated Pix keeps the existing acknowledgement');
  assert.equal(s.serviceLedger.orders.list().length, 1, 'unknown provider references cannot create orders');
});

test('deployed tools webhook explicitly wires the internal residential fallback', async () => {
  const { commerceHttp } = require('../../runtime/tools-commerce/http.cjs');
  const { projectServiceHttp } = require('../../runtime/project-commerce/service-http.cjs');
  const previous = commerceHttp.webhook;
  const event = { synthetic: true };
  try {
    commerceHttp.webhook = (actual, options) => {
      assert.equal(actual, event);
      assert.equal(options.onUnmatchedOrder, projectServiceHttp.observeSharedWebhook);
      return { statusCode: 200, body: '{"received":true}' };
    };
    const { handler } = require('../../netlify/functions/tool-credits-webhook.cjs');
    assert.equal((await handler(event)).statusCode, 200);
  } finally { commerceHttp.webhook = previous; }
});
