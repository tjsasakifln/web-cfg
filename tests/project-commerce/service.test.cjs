'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { createServiceHttp } = require('../../runtime/project-commerce/service-http.cjs');
const { readOffer, termsFor, quote, loadServiceConfig } = require('../../runtime/project-commerce/service-policy.cjs');
const { createMercadoPago } = require('../../runtime/tools-commerce/mercado-pago.cjs');

const selection = () => ({ areaM2: 100, deadlineDays: 60,
  disciplines: ['arquitetura', 'estrutura', 'eletrica', 'hidrossanitario'], floors: 1,
  buildingType: 'new-residential', terrain: 'flat-or-gentle' });
function setup(t) {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'confenge-project-service-'));
  fs.chmodSync(storageRoot, 0o700);
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  let time = Date.parse('2026-11-12T17:00:00Z');
  let creates = 0;
  let gets = 0;
  let sellerFails = false;
  let creationThrows = false;
  const facts = new Map();
  const offer = readOffer();
  const config = { mode: 'sandbox', configured: true, purchasesEnabled: true,
    origin: 'http://localhost:8790', storageRoot, accessToken: 'fixture'.repeat(8),
    webhookSecret: 'fixture-webhook-secret'.repeat(2), sellerId: '123', sandboxPayerEmail: 'test_payer@example.com' };
  const signatureParser = createMercadoPago({ ...config, fetchImpl: () => { throw Error('NETWORK_FORBIDDEN'); } });
  const provider = {
    verifySellerEnvironment: async () => { if (sellerFails) throw Error('WRONG_SELLER'); },
    parseWebhook: signatureParser.parseWebhook,
    async createCheckoutOrder(input) {
      creates++;
      const stored = app.dependencies(config).ledger.orders.get(input.id);
      assert.equal(stored.status, 'creating', 'order must already exist durably when calling Mercado Pago');
      assert.equal(input.items.length, stored.quote.items.length);
      assert.equal(input.items.reduce((n, item) => n + item.amountCents, 0), input.amountCents);
      assert.equal(input.returnUrl, `https://confenge.com.br/projetos-prontos/?pedido=${input.id}#pedido`);
      assert(!input.returnUrl.includes('receipt'));
      const providerId = `ORD${String(creates).padStart(12, '0')}`;
      const fact = { providerId, reference: input.id, amountCents: input.amountCents, currency: 'BRL', state: 'pending',
        paymentFlow: 'checkout', checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test',
        providerUpdatedAt: time, providerStatus: 'created' };
      facts.set(providerId, fact);
      if (creationThrows) throw Error('RESPONSE_LOST');
      return structuredClone(fact);
    },
    async getOrder(id) { gets++; return structuredClone(facts.get(id)); },
    async findOrderId({ reference }) { return [...facts.values()].find(f => f.reference === reference)?.providerId || null; }
  };
  const app = createServiceHttp({ config, offerLoader: () => offer, providerFactory: () => provider,
    clock: () => time, onIncident: () => {} });
  const event = (op, payload, token) => ({ httpMethod: payload === undefined ? 'GET' : 'POST',
    queryStringParameters: { op }, headers: { origin: config.origin, 'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}) }, requestContext: { identity: { sourceIp: '192.0.2.1' } },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });
  const input = () => ({ ...selection(), requestId: randomUUID(), receiptToken: randomBytes(32).toString('base64url'),
    name: 'Comprador sintético', email: 'fixture@example.com', phone: '(48) 99999-9999', city: 'Florianópolis', state: 'SC',
    reference: 'Rascunho próprio de teste', acceptedTerms: true, consent: true, pricingVersion: offer.version,
    termsVersion: offer.terms.version, termsHash: termsFor(offer).sha256, quoteHash: quote(selection(), offer).quoteHash });
  const status = input => ({ ...event('service-status', undefined, input.receiptToken),
    queryStringParameters: { op: 'service-status', id: input.requestId } });
  const webhook = id => {
    const requestId = randomUUID(); const ts = String(Math.floor(time / 1000));
    const sig = createHmac('sha256', config.webhookSecret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
    return { httpMethod: 'POST', body: '{}', queryStringParameters: { 'data.id': id },
      headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${sig}` } };
  };
  return { app, input, event, status, webhook, offer, config, facts, provider,
    advance: () => { time += 20_000; }, counts: () => ({ creates, gets }),
    breakSeller: () => { sellerFails = true; }, loseResponse: () => { creationThrows = true; },
    change: (id, state, rest = {}) => { time += 20_000; Object.assign(facts.get(id), { state, providerUpdatedAt: time, ...rest }); } };
}
const decoded = r => JSON.parse(r.body);

test('pricing is transparent, per-discipline, monotone for all supported deadlines and rounded in cents', () => {
  const offer = readOffer();
  assert.equal(quote({ ...selection(), deadlineDays: 90 }, offer).amountCents, 416000);
  assert.equal(quote(selection(), offer).amountCents, 447200);
  assert.equal(quote({ ...selection(), deadlineDays: 15 }, offer).amountCents, 728000);
  for (const areaM2 of [50, 50.01, 100, 100.37, 250]) {
    let previous = Infinity;
    for (let deadlineDays = 15; deadlineDays <= 90; deadlineDays++) {
      const q = quote({ ...selection(), areaM2, deadlineDays }, offer);
      assert(Number.isSafeInteger(q.amountCents));
      assert(q.amountCents <= previous);
      assert.equal(q.items.reduce((sum, item) => sum + item.amountCents, 0), q.amountCents);
      previous = q.amountCents;
    }
  }
  assert.equal(quote({ ...selection(), disciplines: ['eletrica'], deadlineDays: 90, areaM2: 50 }, offer).amountCents, 69000);
});

test('config keeps truthful quote available without credentials and never advertises checkout', async () => {
  let called = false;
  const app = createServiceHttp({ env: { RUNTIME_PROFILE: 'netcup-production' },
    providerFactory: () => { called = true; throw Error('NO_PROVIDER'); } });
  const result = decoded(await app.api({ httpMethod: 'GET', queryStringParameters: { op: 'service-config' } }));
  assert.equal(result.purchasesEnabled, false);
  assert.equal(result.pricing.disciplines.length, 4);
  assert.equal(called, false);
  const quoteResult = await app.api({ httpMethod: 'POST', queryStringParameters: { op: 'service-quote' },
    headers: { origin: 'https://confenge.com.br', 'content-type': 'application/json' }, body: JSON.stringify(selection()) });
  assert.equal(quoteResult.statusCode, 200);
  assert.equal(decoded(quoteResult).amountCents, 447200);
});

test('production cannot reuse a test environment token and a mismatched seller closes checkout', async t => {
  const c = loadServiceConfig({ RUNTIME_PROFILE: 'netcup-production', TOOLS_COMMERCE_MODE: 'sandbox',
    TOOLS_COMMERCE_MP_ACCESS_TOKEN: 'APP_USR-test'.repeat(3), TOOLS_COMMERCE_MP_TEST_SELLER_ID: '123',
    TOOLS_COMMERCE_MP_WEBHOOK_SECRET: 'x'.repeat(30), CONFENGE_STORAGE_DIR: '/tmp/store' });
  assert.equal(c.configured, false);
  assert.throws(() => loadServiceConfig({ RUNTIME_PROFILE: 'netcup-production', PROJECT_SERVICE_MODE: 'sandbox' }));
  const s = setup(t); s.breakSeller();
  assert.equal(decoded(await s.app.api(s.event('service-config'))).purchasesEnabled, false);
  assert.equal((await s.app.api(s.event('service-checkout', s.input()))).statusCode, 503);
  assert.equal(s.counts().creates, 0);
});

test('out-of-scope inputs, price tampering, stale terms and missing consent cannot create charges', async t => {
  const s = setup(t);
  for (const alteration of [{ amountCents: 1 }, { currency: 'USD' }, { status: 'paid' },
    { areaM2: 251 }, { areaM2: 100.001 }, { deadlineDays: 14 }, { deadlineDays: 91 },
    { deadlineDays: 15.5 }, { floors: 3 }, { terrain: 'steep' }, { buildingType: 'renovation' },
    { disciplines: [] }, { disciplines: ['eletrica', 'eletrica'] }, { disciplines: ['solar'] },
    { acceptedTerms: false }, { consent: false }, { termsHash: 'a'.repeat(64) }]) {
    const r = await s.app.api(s.event('service-checkout', { ...s.input(), ...alteration }));
    const expected = Object.keys(alteration).some(k => ['amountCents', 'currency', 'status'].includes(k)) ? 400 :
      'termsHash' in alteration ? 409 : 422;
    assert.equal(r.statusCode, expected, `must reject ${JSON.stringify(alteration)} by the corresponding validator`);
    s.advance();
  }
  assert.equal(s.counts().creates, 0);
});

test('concurrent replays persist before charging, preserve terms and authorize only the secret holder', async t => {
  const s = setup(t); const input = s.input();
  const responses = await Promise.all(Array.from({ length: 8 }, () => s.app.api(s.event('service-checkout', input))));
  assert.equal(responses.filter(r => r.statusCode === 201).length, 1);
  assert.equal(s.counts().creates, 1);
  const order = decoded(responses.find(r => r.statusCode === 201));
  assert.equal(order.status, 'pending'); assert.equal(order.items.length, 4);
  assert.equal(order.termsHash, termsFor(s.offer).sha256);
  const rawStored = JSON.stringify(s.app.dependencies(s.config).ledger.orders.get(order.id));
  assert(!rawStored.includes(input.receiptToken));
  const wrong = s.status({ ...input, receiptToken: randomBytes(32).toString('base64url') });
  assert.equal((await s.app.api(wrong)).statusCode, 404);
  assert.equal((await s.app.api(s.event('service-checkout', { ...input, areaM2: 110 }))).statusCode, 409);
  s.config.purchasesEnabled = false;
  s.offer.version = '2026-11-12-v2';
  const replay = decoded(await s.app.api(s.event('service-checkout', input)));
  assert.equal(replay.id, order.id); assert.equal(replay.amountCents, order.amountCents);
});

test('the exact reviewed quote prevents price changes without a version bump from silently changing the charge', async t => {
  const s = setup(t); const input = s.input();
  s.offer.pricing.disciplines[0].rateCents += 100;
  const response = await s.app.api(s.event('service-checkout', input));
  assert.equal(response.statusCode, 409);
  assert.equal(decoded(response).error, 'QUOTE_CHANGED');
  assert.equal(s.counts().creates, 0);
});

test('server retrieval and signed webhook control paid, refund and duplicate events', async t => {
  const s = setup(t); const input = s.input();
  await s.app.api(s.event('service-checkout', input));
  const providerId = [...s.facts.keys()][0];
  const fakeReturn = s.status(input); fakeReturn.queryStringParameters.status = 'approved';
  assert.equal(decoded(await s.app.api(fakeReturn)).status, 'pending');
  const invalid = s.webhook(providerId); invalid.headers['x-signature'] = 'ts=1,v1=invalid';
  assert.equal((await s.app.webhook(invalid)).statusCode, 401);
  assert.equal(s.counts().gets, 0);
  s.change(providerId, 'paid');
  assert.equal((await s.app.webhook(s.webhook(providerId))).statusCode, 200);
  let stored = s.app.dependencies(s.config).ledger.orders.get(input.requestId);
  assert.equal(stored.status, 'paid');
  assert.equal((await s.app.webhook(s.webhook(providerId))).statusCode, 200);
  stored = s.app.dependencies(s.config).ledger.orders.get(input.requestId);
  assert.equal(stored.events.filter(e => e.type === 'payment_paid').length, 1);
  s.change(providerId, 'reversed', { refundAmountKnown: true, refundedAmountCents: stored.quote.amountCents });
  await s.app.webhook(s.webhook(providerId));
  assert.equal(decoded(await s.app.api(s.status(input))).status, 'refunded');
});

test('amount mismatch and partial refund never produce a paid receipt', async t => {
  const s = setup(t); const input = s.input();
  await s.app.api(s.event('service-checkout', input));
  const providerId = [...s.facts.keys()][0]; const amountCents = s.facts.get(providerId).amountCents;
  s.change(providerId, 'paid', { amountCents: 1 });
  assert.equal((await s.app.webhook(s.webhook(providerId))).statusCode, 422);
  assert.equal(s.app.dependencies(s.config).ledger.orders.get(input.requestId).status, 'pending');
  s.change(providerId, 'paid', { amountCents, refundAmountKnown: true, refundedAmountCents: 100 });
  await s.app.webhook(s.webhook(providerId));
  assert.equal(s.app.dependencies(s.config).ledger.orders.get(input.requestId).status, 'review');
});

test('indeterminate refunds from the real adapter remain held until an explicit coherent financial observation', async t => {
  const s = setup(t); const input = s.input();
  await s.app.api(s.event('service-checkout', input));
  const providerId = [...s.facts.keys()][0];
  const amountCents = s.facts.get(providerId).amountCents;
  const amount = (amountCents / 100).toFixed(2);
  let raw = { id: providerId, external_reference: input.requestId, user_id: 123, type: 'online',
    processing_mode: 'manual', currency_id: 'BRL', site_id: 'MLB', total_amount: amount,
    total_paid_amount: amount, status: 'processed', status_detail: 'accredited',
    last_updated_date: '2026-11-12T19:00:00Z', transactions: { payments: [{ amount, paid_amount: amount,
      status: 'processed', status_detail: 'accredited', payment_method: { id: 'visa', type: 'credit_card' } }] } };
  const real = createMercadoPago({ ...s.config, fetchImpl: async () => ({ ok: true, json: async () => structuredClone(raw) }) });
  s.provider.getOrder = real.getOrder;
  await s.app.webhook(s.webhook(providerId));
  const stored = () => s.app.dependencies(s.config).ledger.orders.get(input.requestId);
  assert.equal(stored().status, 'paid');
  raw.total_refunded_amount = '100.00';
  raw.last_updated_date = '2026-11-12T19:01:00Z';
  // Missing payment-level refund total makes this a genuine unknown, not zero.
  assert.equal((await real.getOrder(providerId)).refundAmountKnown, false);
  await s.app.webhook(s.webhook(providerId));
  assert.equal(stored().status, 'review');
  delete raw.total_refunded_amount;
  raw.last_updated_date = '2026-11-12T19:02:00Z';
  assert.equal((await real.getOrder(providerId)).state, 'paid');
  assert.equal((await real.getOrder(providerId)).refundAmountKnown, undefined);
  await s.app.webhook(s.webhook(providerId));
  assert.equal(stored().status, 'review', 'omitted refund totals must not clear an unresolved financial hold');
  raw.total_refunded_amount = '0.00';
  raw.transactions.payments[0].refunded_amount = '0.00';
  raw.last_updated_date = '2026-11-12T19:03:00Z';
  await s.app.webhook(s.webhook(providerId));
  assert.equal(stored().status, 'paid', 'explicit coherent zero refund resolves the unknown');
  delete raw.transactions.payments[0].refunded_amount;
  raw.total_refunded_amount = '100.00';
  raw.last_updated_date = '2026-11-12T19:02:30Z';
  await s.app.webhook(s.webhook(providerId));
  assert.equal(stored().status, 'review', 'an older indeterminate financial reversal must not be ignored');
  assert.equal(stored().providerUpdatedAt, Date.parse('2026-11-12T19:03:00Z'));
});

test('a lost provider response is reconciled by original reference without creating another charge', async t => {
  const s = setup(t); s.loseResponse(); const input = s.input();
  const result = await s.app.api(s.event('service-checkout', input));
  assert.equal(result.statusCode, 202); assert.equal(decoded(result).status, 'review');
  assert.equal((await s.app.api(s.event('service-checkout', input))).statusCode, 200);
  assert.equal(s.counts().creates, 1);
  s.advance();
  assert.equal(decoded(await s.app.api(s.status(input))).status, 'pending');
  assert.equal(s.counts().creates, 1);
});

test('verified webhook wins a creation-response race and an older financial reversal suspends fulfilment', async t => {
  const s = setup(t); const input = s.input();
  const create = s.provider.createCheckoutOrder;
  s.provider.createCheckoutOrder = async payload => {
    const result = await create(payload);
    s.change(result.providerId, 'paid');
    await s.app.webhook(s.webhook(result.providerId));
    return result;
  };
  const r = decoded(await s.app.api(s.event('service-checkout', input)));
  assert.equal(r.status, 'paid');
  const providerId = [...s.facts.keys()][0];
  s.change(providerId, 'reversed', { providerUpdatedAt: 1, refundAmountKnown: true, refundedAmountCents: r.amountCents });
  await s.app.webhook(s.webhook(providerId));
  assert.equal(decoded(await s.app.api(s.status(input))).status, 'refunded');
});

test('cancellation is idempotent and produces a stored request without pretending a refund', async t => {
  const s = setup(t); const input = s.input();
  await s.app.api(s.event('service-checkout', input));
  const request = { orderId: input.requestId, requestId: randomUUID(), kind: 'cancellation', message: '' };
  const event = s.event('service-support', request, input.receiptToken);
  assert.equal((await s.app.api(event)).statusCode, 201);
  assert.equal((await s.app.api(event)).statusCode, 200);
  const order = s.app.dependencies(s.config).ledger.orders.get(input.requestId);
  assert.equal(order.requests.length, 1); assert.equal(order.status, 'pending');
  assert.equal((await s.app.api(s.event('service-support', request, randomBytes(32).toString('base64url')))).statusCode, 404);
});

test('Checkout Pro sends separate discipline items and rejects inconsistent totals', async () => {
  const id = randomUUID(); let body; let posts = 0;
  const adapter = createMercadoPago({ mode: 'live', accessToken: 'APP_USR-fixture'.repeat(3), sellerId: '123',
    webhookSecret: 'fixture'.repeat(5), fetchImpl: async (url, options) => {
      if (url.endsWith('/users/me')) return { ok: true, json: async () => ({ id: 123, tags: [] }) };
      posts++; body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ id: 'ORD000000000001', external_reference: id, total_amount: '200.00',
        type: 'online', processing_mode: 'manual', status: 'created', user_id: 123,
        checkout_url: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture' }) };
    } });
  const input = { id, amountCents: 20000, email: 'fixture@example.com', label: 'Projetos',
    returnUrl: 'https://confenge.com.br/projetos-prontos/',
    items: [{ title: 'Elétrica', quantity: 1, amountCents: 9000 }, { title: 'Hidrossanitário', quantity: 1, amountCents: 11000 }] };
  const result = await adapter.createCheckoutOrder(input);
  assert.equal(result.paymentFlow, 'checkout');
  assert.deepEqual(body.items, [{ title: 'Elétrica', quantity: 1, unit_price: '90.00' }, { title: 'Hidrossanitário', quantity: 1, unit_price: '110.00' }]);
  await assert.rejects(adapter.createCheckoutOrder({ ...input, amountCents: 19999 }), /sum/);
  assert.equal(posts, 1);
});

test('operational readiness stays behind existing OPS authorization and never exposes its token', async () => {
  const previous = Object.fromEntries(['RUNTIME_PROFILE', 'OPS_TOKEN', 'PROJECT_SERVICE_MODE'].map(k => [k, process.env[k]]));
  const opsToken = 'fixture-ops-token-for-service-report-only';
  try {
    process.env.RUNTIME_PROFILE = 'netcup-production';
    process.env.OPS_TOKEN = opsToken;
    process.env.PROJECT_SERVICE_MODE = 'off';
    const { handler } = require('../../netlify/functions/ops.cjs');
    const event = { httpMethod: 'GET', queryStringParameters: { action: 'project_services', op: 'preflight' },
      headers: { origin: 'https://confenge.com.br', 'client-ip': '192.0.2.8' } };
    assert.equal((await handler(event)).statusCode, 401);
    const response = await handler({ ...event, headers: { ...event.headers, authorization: `Bearer ${opsToken}` } });
    assert.equal(response.statusCode, 200);
    assert.equal(decoded(response).readyForPurchase, false);
    assert.equal(decoded(response).mode, 'off');
    assert(!response.body.includes(opsToken));
    assert.equal(response.headers['Cache-Control'], 'no-store');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
