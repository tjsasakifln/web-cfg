'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { loadConfig, productReady, authorizedProduct, privateArchive, sha, check, orderId, supplierText, MAX_PRODUCT_BYTES } = require('../../runtime/project-commerce/policy.cjs');
const { createProjectCommerceHttp } = require('../../runtime/project-commerce/http.cjs');
const { createMercadoPago } = require('../../runtime/tools-commerce/mercado-pago.cjs');
const { memoryDb } = require('./memory-db.cjs');
const { report, interval, main } = require('../../runtime/project-commerce/ops.cjs');

const contents = Buffer.from('PK\x03\x04controlled offline fixture; never a public product');
const supplier = { legalName: 'FORNECEDOR SINTÉTICO EXCLUSIVO DE TESTE', registrationType: 'CNPJ', registration: '11222333000181',
  address: { street: 'Rua sintética de testes', number: '1', neighborhood: 'Bairro de teste', city: 'Cidade de teste', state: 'SC', postalCode: '88000000', country: 'BR' },
  email: 'supplier@example.com', phone: '+5548999999999' };
const termsText = supplierText(supplier) + '\n\nCondições exclusivamente sintéticas usadas nos testes locais.';
function product() {
  const p = { id: 'fixture-residential', slug: 'fixture-residential', title: 'Modelo exclusivo de teste', version: 'fixture-r1',
    status: 'approved', amountCents: 10000, currency: 'BRL',
    delivery: { filename: 'fixture-r1.zip', bytes: contents.length, sha256: sha(contents) },
    terms: { version: 'fixture-v1', text: termsText, sha256: sha(termsText), url: '/projetos-prontos/condicoes/', supplier: structuredClone(supplier) },
    evidence: {}, public: { description: 'Fixture sem valor comercial', programme: ['Dois dormitórios'], areaM2: 70,
      floors: 1, dimensions: '7 x 10 m', terrainConditions: 'Fixture de testes', documents: ['Plantas'], formats: ['PDF'],
      deliveryTime: 'Após confirmação', included: ['Projeto'], excluded: ['Adaptação'], license: 'Uma implantação',
      implementations: 1, reuseRule: 'Contratação específica', corrections: 'Correções', changes: 'Por orçamento',
      responsibilities: 'Revisão local', support: 'Canal institucional',
      previews: [{ url: '/assets/projects-ready/fixture.png', alt: 'Fixture', real: true, publicationAuthorized: true }] } };
  for (const key of ['rights', 'technical', 'commercial']) p.evidence[key] = { approved: true, reference: 'TEST-ONLY',
    approvedAt: '2026-11-12T10:00:00Z', productVersion: p.version, archiveSha256: p.delivery.sha256 };
  Object.assign(p.evidence.rights, { owner: 'Fixture', origin: 'Fixture', resaleAuthorization: 'Fixture' });
  Object.assign(p.evidence.technical, { reviewer: 'Fixture', professionalRegistration: 'TEST-ONLY' });
  Object.assign(p.evidence.commercial, { amountCents: p.amountCents, termsSha256: p.terms.sha256 });
  return p;
}
async function setup(t) {
  const filesRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'confenge-project-test-'));
  t.after(() => fs.rm(filesRoot, { recursive: true, force: true }));
  await fs.writeFile(path.join(filesRoot, 'fixture-r1.zip'), contents);
  const db = memoryDb();
  const p = product();
  let time = Date.parse('2026-11-12T12:00:00Z');
  const catalog = { schema: 'confenge.project-catalog/1', version: 'fixture-v1', products: [p] };
  const config = { mode: 'sandbox', origin: 'http://127.0.0.1:8790', purchasesEnabled: true, deliveryPaused: false,
    approvedCatalogVersion: catalog.version, approvedTermsHash: p.terms.sha256, filesRoot,
    firebase: { apiKey: 'fixture' }, webhookSecret: 'test-webhook-secret'.repeat(2) };
  const facts = new Map();
  let creates = 0;
  let gets = 0;
  const parser = createMercadoPago({ accessToken: 'x'.repeat(30), webhookSecret: config.webhookSecret,
    mode: 'sandbox', sellerId: '123', sandboxPayerEmail: 'test_payer@example.com', fetchImpl: async () => { throw new Error('NETWORK_FORBIDDEN'); } });
  const provider = { verifySellerEnvironment: async () => {},
    parseWebhook: parser.parseWebhook,
    async createOrder(input) {
      creates++;
      const providerId = `ORD${String(creates).padStart(12, '0')}`;
      const fact = { providerId, reference: input.id, amountCents: input.amountCents, currency: 'BRL', state: 'pending',
        providerStatus: 'created', paymentFlow: 'pix', qrCode: 'TEST-ONLY', providerUpdatedAt: time };
      facts.set(providerId, fact); return structuredClone(fact);
    },
    async getOrder(id) { gets++; return structuredClone(facts.get(id)); },
    async findOrderId({ reference }) { return [...facts.values()].find(v => v.reference === reference)?.providerId || null; }
  };
  const app = createProjectCommerceHttp({ config, clock: () => time, catalogLoader: async () => catalog,
    firebaseFactory: () => ({ db, authenticate: async token => { check(['alice', 'bob'].includes(token), 'AUTH_REQUIRED', 401); return { uid: token, email: `${token}@example.com` }; } }),
    providerFactory: () => provider, onIncident: () => {} });
  const event = (op, input, user = 'alice') => ({ httpMethod: input === undefined ? 'GET' : 'POST',
    queryStringParameters: { op }, headers: { authorization: `Bearer ${user}`, origin: config.origin, 'content-type': 'application/json' },
    ...(input !== undefined ? { body: JSON.stringify(input) } : {}) });
  const input = () => ({ productId: p.id, productVersion: p.version, requestId: randomUUID(), termsVersion: p.terms.version,
    termsHash: p.terms.sha256, acceptedTerms: true });
  const query = (op, id, user = 'alice') => ({ ...event(op, undefined, user), queryStringParameters: { op, id } });
  const webhook = id => {
    const requestId = randomUUID(); const ts = String(Math.floor(time / 1000));
    const signature = createHmac('sha256', config.webhookSecret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
    return { httpMethod: 'POST', body: '{}', queryStringParameters: { 'data.id': id },
      headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` } };
  };
  const change = (id, state, rest = {}) => { time += 20_000; Object.assign(facts.get(id), { state, providerUpdatedAt: time, ...rest }); };
  return { app, event, input, query, webhook, change, db, catalog, config, product: p, provider, facts, filesRoot,
    counters: () => ({ creates, gets }), advance: () => { time += 20_000; } };
}

test('default is off independently of tools flags and never loads credentials', async () => {
  let loaded = 0;
  const app = createProjectCommerceHttp({ env: { TOOLS_COMMERCE_MODE: 'live', TOOLS_COMMERCE_PURCHASES: '1' }, firebaseFactory: () => { loaded++; } });
  const result = await app.api({ httpMethod: 'GET', queryStringParameters: { op: 'config' } });
  assert.deepEqual(JSON.parse(result.body), { enabled: false, purchasesEnabled: false, products: [], contactUrl: '/projetos-prontos/#contato-projetos' });
  assert.equal((await app.api({ httpMethod: 'POST', queryStringParameters: { op: 'orders' } })).statusCode, 404);
  assert.equal(loaded, 0);
});

test('catalog only releases exact reviewed files with independent rights, price and terms approval', () => {
  assert.equal(productReady(product()), true);
  for (const alter of [p => { p.evidence.rights.approved = false; }, p => { p.evidence.technical.productVersion = 'old'; },
    p => { p.evidence.technical.archiveSha256 = 'b'.repeat(64); }, p => { p.evidence.commercial.amountCents++; },
    p => { p.delivery.filename = '../secret.zip'; }, p => { p.terms.text += 'changed'; },
    p => { p.public.previews[0].publicationAuthorized = false; }, p => { delete p.public.responsibilities; },
    p => { p.public.implementations = 20; }, p => { p.amountCents = 0; }]) {
    const p = product(); alter(p); assert.equal(productReady(p), false);
  }
  assert.throws(() => authorizedProduct({ version: 'v1', products: [product()] }, { purchasesEnabled: true, approvedCatalogVersion: 'v0' }, 'fixture-residential'), /PURCHASES_PAUSED/);
});

test('new orders ignore no client price: adulterated payload is rejected before any provider call', async t => {
  const s = await setup(t);
  for (const extra of [{ amountCents: 1 }, { currency: 'USD' }, { status: 'paid' }, { delivery: '/secret' }]) {
    assert.equal((await s.app.api(s.event('orders', { ...s.input(), ...extra }))).statusCode, 400);
  }
  assert.equal((await s.app.api(s.event('orders', { ...s.input(), acceptedTerms: false }))).statusCode, 422);
  assert.equal(s.counters().creates, 0);
});

test('concurrent duplicate order requests charge once and retain immutable acquired version', async t => {
  const s = await setup(t); const input = s.input();
  const results = await Promise.all(Array.from({ length: 8 }, () => s.app.api(s.event('orders', input))));
  assert.equal(results.filter(v => v.statusCode === 201).length, 1);
  assert.equal(s.counters().creates, 1);
  const created = JSON.parse(results.find(v => v.statusCode === 201).body);
  s.catalog.products = [];
  s.config.purchasesEnabled = false;
  const replay = JSON.parse((await s.app.api(s.event('orders', input))).body);
  assert.equal(replay.id, created.id); assert.equal(replay.terms.text, termsText);
  assert.equal((await s.app.api(s.event('orders', { ...input, productVersion: 'different' }))).statusCode, 409);
});

test('payment GET, signed notification, duplicate and refund govern private delivery', async t => {
  const s = await setup(t);
  const response = await s.app.api(s.event('orders', s.input()));
  const created = JSON.parse(response.body); const providerId = [...s.facts.keys()][0];
  assert.equal(created.status, 'pending');
  assert.equal((await s.app.api(s.query('download', created.id))).statusCode, 403);
  assert.equal((await s.app.api(s.query('order', created.id, 'bob'))).statusCode, 404);
  assert.equal((await s.app.api(s.query('download', created.id, 'bob'))).statusCode, 404);
  const invalid = s.webhook(providerId); invalid.headers['x-signature'] += 'bad';
  assert.equal((await s.app.webhook(invalid)).statusCode, 401);
  s.change(providerId, 'paid', { providerStatus: 'processed' });
  assert.equal((await s.app.webhook(s.webhook(providerId))).statusCode, 200);
  const afterFirst = [...s.db.records.values()].filter(v => v.type === 'project_payment_confirmed').length;
  assert.equal((await s.app.webhook(s.webhook(providerId))).statusCode, 200);
  assert.equal([...s.db.records.values()].filter(v => v.type === 'project_payment_confirmed').length, afterFirst);
  assert.equal(afterFirst, 1);
  s.config.purchasesEnabled = false;
  const file = await s.app.api(s.query('download', created.id));
  assert.equal(file.statusCode, 200); assert.equal(file.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(Buffer.from(file.body, 'base64'), contents);
  s.change(providerId, 'reversed', { providerStatus: 'refunded' });
  // No refund webhook: delivery rechecks the provider and blocks immediately.
  assert.equal((await s.app.api(s.query('download', created.id))).statusCode, 403);
  assert.equal(JSON.parse((await s.app.api(s.query('order', created.id))).body).status, 'refunded');
});

test('provider amount mismatch or pending status never unlocks delivery', async t => {
  const s = await setup(t);
  const created = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
  const providerId = [...s.facts.keys()][0];
  s.change(providerId, 'paid', { amountCents: 1 });
  assert.equal((await s.app.webhook(s.webhook(providerId))).statusCode, 422);
  assert.equal((await s.app.api(s.query('download', created.id))).statusCode, 422);
  assert.equal([...s.db.records.values()].filter(v => v.type === 'project_payment_confirmed').length, 0);
});

test('POST paid is not payment proof and cancellation is distinct from rejection', async t => {
  const s = await setup(t); const original = s.provider.createOrder;
  s.provider.createOrder = async input => ({ ...await original(input), state: 'paid' });
  const created = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
  assert.equal(created.status, 'pending');
  const providerId = [...s.facts.keys()][0];
  s.change(providerId, 'failed', { providerStatus: 'cancelled' });
  await s.app.webhook(s.webhook(providerId));
  assert.equal(JSON.parse((await s.app.api(s.query('order', created.id))).body).status, 'cancelled');
});

test('archive corruption, path traversal, symlink and changed catalogue cannot substitute acquired bytes', async t => {
  const s = await setup(t);
  assert.deepEqual(await privateArchive(s.config, s.product.delivery), contents);
  await assert.rejects(privateArchive(s.config, { ...s.product.delivery, filename: '../fixture.zip' }));
  await fs.writeFile(path.join(s.filesRoot, 'fixture-r1.zip'), Buffer.from('corrupted'));
  await assert.rejects(privateArchive(s.config, s.product.delivery));
  const disabled = JSON.parse((await s.app.api(s.event('config'))).body);
  assert.equal(disabled.purchasesEnabled, false);
  assert.equal((await s.app.api(s.event('orders', s.input()))).statusCode, 503);
  assert.equal(s.counters().creates, 0);
  await fs.rm(path.join(s.filesRoot, 'fixture-r1.zip'));
  await fs.writeFile(path.join(s.filesRoot, 'target.zip'), contents);
  await fs.symlink(path.join(s.filesRoot, 'target.zip'), path.join(s.filesRoot, 'fixture-r1.zip'));
  await assert.rejects(privateArchive(s.config, s.product.delivery));
});

test('support and cancellation create owned idempotent receipts without a refund claim', async t => {
  const s = await setup(t);
  const created = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
  const input = { orderId: created.id, requestId: randomUUID(), kind: 'cancellation', message: 'Solicito cancelamento. TESTE.' };
  assert.equal((await s.app.api(s.event('support', input, 'bob'))).statusCode, 404);
  const first = await s.app.api(s.event('support', input)); const again = await s.app.api(s.event('support', input));
  assert.equal(first.statusCode, 201); assert.equal(again.statusCode, 200); assert.equal(first.body, again.body);
  assert.equal((await s.app.api(s.event('support', { ...input, message: 'Mudou' }))).statusCode, 409);
  const order = JSON.parse((await s.app.api(s.query('order', created.id))).body);
  assert.equal(order.status, 'pending'); assert.equal(order.requests.length, 1); assert.equal(order.requests[0].status, 'received');
});

test('foreign origins, absent authentication and disabled purchases fail closed', async t => {
  const s = await setup(t); const e = s.event('orders', s.input()); e.headers.origin = 'https://evil.example';
  assert.equal((await s.app.api(e)).statusCode, 403);
  delete e.headers.authorization; assert.equal((await s.app.api(e)).statusCode, 401);
  s.config.purchasesEnabled = false;
  assert.equal((await s.app.api(s.event('orders', s.input()))).statusCode, 503);
  assert.equal(s.counters().creates, 0);
});

test('config isolates production, test seller, Firebase project and signed webhook credentials', () => {
  const sandbox = { PROJECT_COMMERCE_MODE: 'sandbox', PROJECT_COMMERCE_FIREBASE_PROJECT: 'confenge-project-hml',
    PROJECT_COMMERCE_FIREBASE_WEB_KEY: 'AIza' + 'x'.repeat(30), PROJECT_COMMERCE_FIREBASE_WEB_APP: '1:123:web:abc',
    PROJECT_COMMERCE_SANDBOX_UIDS: 'tester', PROJECT_COMMERCE_SANDBOX_ORIGIN: 'http://127.0.0.1:8790',
    PROJECT_COMMERCE_MP_TEST_SELLER_ID: '123', PROJECT_COMMERCE_MP_ACCESS_TOKEN: 'APP_USR-' + 'x'.repeat(30),
    PROJECT_COMMERCE_MP_WEBHOOK_SECRET: 'x'.repeat(30) };
  assert.equal(loadConfig(sandbox).purchasesEnabled, false);
  assert.throws(() => loadConfig({ ...sandbox, RUNTIME_PROFILE: 'netcup-production' }));
  assert.throws(() => loadConfig({ ...sandbox, PROJECT_COMMERCE_FIREBASE_PROJECT: 'confenge-project-prod' }));
  assert.throws(() => loadConfig({ ...sandbox, PROJECT_COMMERCE_MP_LIVE_SELLER_ID: '456' }));
  assert.throws(() => loadConfig({ ...sandbox, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }));
  assert.throws(() => loadConfig({ ...sandbox, PROJECT_COMMERCE_MP_WEBHOOK_SECRET: '' }));
  assert.notEqual(orderId('alice', '0'.repeat(36)), orderId('bob', '0'.repeat(36)));
});

test('private metrics distinguish payment confirmation, refund, access and unverified settlement', async t => {
  const s = await setup(t);
  const created = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
  const providerId = [...s.facts.keys()][0];
  s.change(providerId, 'paid');
  await s.app.webhook(s.webhook(providerId));
  await s.app.api(s.query('download', created.id));
  let result = await report({ db: s.db, mode: 'sandbox' }, '2026-11-12', '2026-11-13');
  assert.equal(result.metrics.paymentConfirmations, 1);
  assert.equal(result.metrics.keptPaidOrders, 1);
  assert.equal(result.metrics.deliveryAccessesAuthorized, 1);
  assert.equal(result.metrics.grossConfirmedCents, 10000);
  assert.equal(result.metrics.settlementReceivedCents, null);
  s.change(providerId, 'reversed'); await s.app.webhook(s.webhook(providerId));
  result = await report({ db: s.db, mode: 'sandbox' }, '2026-11-12', '2026-11-13');
  assert.equal(result.metrics.grossConfirmedCents, 10000);
  assert.equal(result.metrics.refundedCents, 10000);
  assert.equal(result.metrics.keptPaidCents, 0);
  assert.equal(result.metrics.keptPaidOrders, 0);
  assert.deepEqual(await report({ mode: 'off' }, '2026-11-12', '2026-11-13'),
    { available: false, reason: 'PROJECT_COMMERCE_DISABLED', metrics: null });
  assert.throws(() => interval('2026-02-30', '2026-03-03'));
  assert.throws(() => interval('2026-01-01', '2027-01-01'));
});

test('operator support resolution preserves payment and does not invent a refund', async t => {
  const s = await setup(t);
  const order = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
  const input = { orderId: order.id, requestId: randomUUID(), kind: 'cancellation', message: 'Pedido controlado' };
  const receipt = JSON.parse((await s.app.api(s.event('support', input))).body);
  const pending = await main(['requests'], s.app);
  assert.equal(pending.requests.length, 1);
  assert.equal(pending.requests[0].contactEmail, 'alice@example.com');
  const resolved = await main(['resolve-request', receipt.receiptId, '--reference', 'TESTE-ATENDIMENTO'], s.app);
  assert.equal(resolved.paymentStatus, 'pending');
  assert.equal((await main(['requests'], s.app)).requests.length, 0);
  const detail = await main(['order', order.id], s.app);
  assert.equal(detail.status, 'pending'); assert.equal(detail.requests[0].status, 'resolved');
  assert.equal(detail.contactEmail, 'alice@example.com');
  const buyerView = JSON.parse((await s.app.api(s.query('order', order.id))).body);
  assert.equal(buyerView.contactEmail, undefined);
});

test('public configuration excludes approval references and arbitrary internal fields', async t => {
  const s = await setup(t);
  s.product.public.internalNote = 'MUST-NOT-PUBLISH';
  s.product.public.amountCents = 1;
  const result = JSON.parse((await s.app.api(s.event('config'))).body);
  assert.equal(result.products[0].amountCents, 10000);
  assert.equal(result.products[0].internalNote, undefined);
  assert.equal(result.products[0].evidence, undefined);
  assert.equal(result.products[0].terms.text, termsText);
});

test('uncertain creation is recovered by reference without making a new charge', async t => {
  const s = await setup(t); const create = s.provider.createOrder;
  s.provider.createOrder = async input => { await create(input); throw new Error('connection lost after provider accepted'); };
  const input = s.input();
  const created = await s.app.api(s.event('orders', input));
  assert.equal(created.statusCode, 202);
  const order = JSON.parse(created.body); assert.equal(order.status, 'review');
  assert.equal((await s.app.api(s.event('orders', input))).statusCode, 200);
  s.advance();
  const recovered = JSON.parse((await s.app.api(s.query('order', order.id))).body);
  assert.equal(recovered.status, 'pending'); assert.equal(s.counters().creates, 1);
});

test('refund with equal or older provider timestamp cannot keep access paid', async t => {
  for (const delta of [0, -1000]) {
    const s = await setup(t);
    const created = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
    const providerId = [...s.facts.keys()][0];
    s.change(providerId, 'paid'); await s.app.webhook(s.webhook(providerId));
    const paidTimestamp = s.facts.get(providerId).providerUpdatedAt;
    s.change(providerId, 'reversed', { providerUpdatedAt: paidTimestamp + delta });
    assert.equal((await s.app.api(s.query('download', created.id))).statusCode, 403);
    const order = JSON.parse((await s.app.api(s.query('order', created.id))).body);
    assert.equal(order.status, 'refunded');
    s.change(providerId, 'paid');
    assert.equal((await s.app.api(s.query('download', created.id))).statusCode, 403);
  }
});

test('webhook completion before create POST response keeps verified paid state', async t => {
  const s = await setup(t); const create = s.provider.createOrder;
  s.provider.createOrder = async input => {
    const initial = await create(input);
    s.change(initial.providerId, 'paid');
    assert.equal((await s.app.webhook(s.webhook(initial.providerId))).statusCode, 200);
    return initial;
  };
  const order = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
  assert.equal(order.status, 'paid');
  assert.equal((await s.app.api(s.query('download', order.id))).statusCode, 200);
});

test('cancellation does not require justification; support still requires a message', async t => {
  const s = await setup(t);
  const order = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
  const input = { orderId: order.id, requestId: randomUUID(), kind: 'cancellation', message: '' };
  assert.equal((await s.app.api(s.event('support', input))).statusCode, 201);
  assert.equal((await s.app.api(s.event('support', { ...input, requestId: randomUUID(), kind: 'support' }))).statusCode, 422);
});

test('supplier identity, physical address and contact must be present and bound to accepted terms', () => {
  assert.equal(productReady(product()), true);
  for (const change of [p => { delete p.terms.supplier; }, p => { p.terms.supplier.address.street = ''; },
    p => { p.terms.supplier.registration = 11222333000181; },
    p => { p.terms.supplier.registration = '00000000000000'; }, p => { p.terms.supplier.registration = '11222333000182'; },
    p => { p.terms.supplier.address.postalCode = ''; }, p => { p.terms.supplier.address.state = 'XX'; },
    p => { p.terms.supplier.email = ''; }, p => { p.terms.supplier.legalName = 'Different supplier'; },
    p => { p.terms.text = 'Terms omit the supplier'; p.terms.sha256 = sha(p.terms.text); p.evidence.commercial.termsSha256 = p.terms.sha256; }]) {
    const p = product(); change(p); assert.equal(productReady(p), false);
  }
});

test('multibyte product snapshot is capped before exposing purchase or creating an order', async t => {
  const s = await setup(t);
  for (const field of ['programme', 'documents', 'formats', 'included', 'excluded']) {
    s.product.public[field] = Array.from({ length: 40 }, () => '漢'.repeat(2000));
  }
  assert.ok(Buffer.byteLength(JSON.stringify(s.product), 'utf8') > 1024 * 1024);
  assert.equal(MAX_PRODUCT_BYTES, 256 * 1024);
  assert.equal(productReady(s.product), false);
  const config = JSON.parse((await s.app.api(s.event('config'))).body);
  assert.equal(config.purchasesEnabled, false); assert.deepEqual(config.products, []);
  assert.equal((await s.app.api(s.event('orders', s.input()))).statusCode, 409);
  assert.equal(s.counters().creates, 0);
  assert.equal(s.db.records.size, 0);
});

test('real provider adapter preserves partial refund amounts and ledger counts only incremental confirmed money', async t => {
  const s = await setup(t);
  const created = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
  const providerId = [...s.facts.keys()][0];
  s.change(providerId, 'paid'); await s.app.webhook(s.webhook(providerId));
  const payment = { amount: '100.00', paid_amount: '100.00', refunded_amount: '50.00', status: 'processed',
    status_detail: 'partially_refunded', payment_method: { id: 'pix', type: 'bank_transfer' } };
  const raw = { id: providerId, external_reference: created.id, total_amount: '100.00', total_paid_amount: '100.00',
    total_refunded_amount: '50.00', status: 'processed', status_detail: 'partially_refunded',
    last_updated_date: '2026-11-12T13:00:00Z', user_id: '123', transactions: { payments: [payment] } };
  const real = createMercadoPago({ accessToken: 'TEST-TOKEN', webhookSecret: 'TEST-SECRET', mode: 'sandbox', sellerId: '123',
    sandboxPayerEmail: 'test_payer@example.com', fetchImpl: async () => ({ ok: true, json: async () => structuredClone(raw) }) });
  s.provider.getOrder = id => real.getOrder(id);
  const normalized = await real.getOrder(providerId);
  assert.equal(normalized.state, 'review'); assert.equal(normalized.refundAmountKnown, true);
  assert.equal(normalized.refundedAmountCents, 5000);
  await Promise.all(Array.from({ length: 8 }, () => s.app.webhook(s.webhook(providerId))));
  let result = await report({ db: s.db, mode: 'sandbox' }, '2026-11-12', '2026-11-13');
  assert.equal(result.metrics.refundedCents, 5000);
  assert.equal(result.metrics.knownRefundedCents, 5000);
  assert.equal(result.metrics.refundsConfirmed, 1); assert.equal(result.metrics.fullRefundsConfirmed, 0);
  assert.equal((await s.app.api(s.query('download', created.id))).statusCode, 403);
  raw.total_refunded_amount = '75.00'; payment.refunded_amount = '75.00'; raw.last_updated_date = '2026-11-12T14:00:00Z';
  await s.app.webhook(s.webhook(providerId)); await s.app.webhook(s.webhook(providerId));
  result = await report({ db: s.db, mode: 'sandbox' }, '2026-11-12', '2026-11-13');
  assert.equal(result.metrics.refundedCents, 7500);
  raw.total_refunded_amount = '90.00'; payment.refunded_amount = '80.00'; raw.last_updated_date = '2026-11-12T15:00:00Z';
  await s.app.webhook(s.webhook(providerId));
  result = await report({ db: s.db, mode: 'sandbox' }, '2026-11-12', '2026-11-13');
  assert.equal(result.metrics.refundedCents, null); assert.equal(result.metrics.knownRefundedCents, 7500);
  assert.equal(result.metrics.unresolvedRefundOrders, 1);
  raw.status = payment.status = 'refunded'; raw.status_detail = payment.status_detail = 'refunded';
  raw.total_refunded_amount = payment.refunded_amount = '100.00'; raw.last_updated_date = '2026-11-12T16:00:00Z';
  await s.app.webhook(s.webhook(providerId));
  result = await report({ db: s.db, mode: 'sandbox' }, '2026-11-12', '2026-11-13');
  assert.equal(result.metrics.refundedCents, 10000); assert.equal(result.metrics.fullRefundsConfirmed, 1);
  assert.equal(result.metrics.unresolvedRefundOrders, 0);
});

test('coherent full provider refund can omit one duplicated total without becoming unresolved', async t => {
  const s = await setup(t);
  const created = JSON.parse((await s.app.api(s.event('orders', s.input()))).body);
  const providerId = [...s.facts.keys()][0];
  s.change(providerId, 'paid'); await s.app.webhook(s.webhook(providerId));
  const raw = { id: providerId, external_reference: created.id, total_amount: '100.00', total_paid_amount: '100.00',
    total_refunded_amount: '100.00', status: 'refunded', status_detail: 'refunded', user_id: '123',
    last_updated_date: '2026-11-12T14:00:00Z', transactions: { payments: [{ amount: '100.00', paid_amount: '100.00',
      status: 'refunded', status_detail: 'refunded', payment_method: { id: 'pix', type: 'bank_transfer' } }] } };
  const real = createMercadoPago({ accessToken: 'TEST-TOKEN', webhookSecret: 'TEST-SECRET', mode: 'sandbox', sellerId: '123',
    sandboxPayerEmail: 'test_payer@example.com', fetchImpl: async () => ({ ok: true, json: async () => structuredClone(raw) }) });
  s.provider.getOrder = id => real.getOrder(id);
  assert.equal((await real.getOrder(providerId)).refundAmountKnown, true);
  await s.app.webhook(s.webhook(providerId));
  let reportResult = await report({ db: s.db, mode: 'sandbox' }, '2026-11-12', '2026-11-13');
  assert.equal(reportResult.metrics.refundedCents, 10000);
  assert.equal(reportResult.metrics.unresolvedRefundOrders, 0);
  raw.transactions.payments[0].refunded_amount = '100.00';
  await s.app.webhook(s.webhook(providerId));
  reportResult = await report({ db: s.db, mode: 'sandbox' }, '2026-11-12', '2026-11-13');
  assert.equal(reportResult.metrics.refundedCents, 10000);
});
