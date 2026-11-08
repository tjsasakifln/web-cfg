const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHmac } = require('node:crypto');
const { createCommerceHttp } = require('../../runtime/tools-commerce/http.cjs');
const { createMercadoPago } = require('../../runtime/tools-commerce/mercado-pago.cjs');
const { TERMS, TOOL, accountId } = require('../../runtime/tools-commerce/policy.cjs');
const { sdk } = require('../../runtime/tools-commerce/firebase.cjs');
const { payload } = require('./fixtures.cjs');

test('Firebase emulator: atomic free and paid exports, Pix replay, referral and reversal',
  { timeout: 120000 }, async () => {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:/, 'run via emulators:exec');
    assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || '', /^127\.0\.0\.1:/, 'run via emulators:exec');
    const projectId = 'demo-confenge-tools';
    const webhookSecret = randomBytes(32).toString('hex');
    const providerOrders = new Map();
    let createCalls = 0;
    const incidents = [];
    const handler = createCommerceHttp({ config: { mode: 'emulator', projectId, identityKey: randomBytes(32), purchasesEnabled: true,
      accessToken: 'fake-access-token-integration', webhookSecret }, onIncident: x => incidents.push(x), providerFactory: options => createMercadoPago({
        ...options, mode: 'live', fetchImpl: async (url, options) => {
          if (url === 'https://api.mercadolibre.com/users/me') return Response.json({ tags: ['normal'] });
          if (options.method === 'POST') {
            createCalls++;
            const input = JSON.parse(options.body);
            const id = `ORD${randomUUID().replaceAll('-', '').toUpperCase()}`;
            const order = { id, type: 'online', external_reference: input.external_reference, total_amount: input.total_amount,
              status: 'action_required', transactions: input.transactions };
            order.transactions.payments[0].status = 'action_required';
            order.transactions.payments[0].payment_method.qr_code = 'pix-fixture';
            providerOrders.set(id, order);
            return Response.json(order);
          }
          const key = url.split('/').at(-1).toUpperCase();
          return providerOrders.has(key) ? Response.json(providerOrders.get(key)) : Response.json({}, { status: 404 });
        },
      }) });
    const { getApp } = sdk('firebase-admin/app');
    const { getAuth } = sdk('firebase-admin/auth');
    handler.getDependencies(handler.config());
    const app = getApp('confenge-tools-emulator-demo-confenge-tools');
    const auth = getAuth(app);
    async function identity(email, verified = true) {
      const password = 'Local-emulator-only!1';
      const user = await auth.createUser({ email, emailVerified: verified, password });
      const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
      const signed = await response.json();
      assert.ok(signed.idToken);
      return { uid: user.uid, token: signed.idToken };
    }
    function api(user, op, input, extra = {}) {
      return handler.api({ httpMethod: input === undefined ? 'GET' : 'POST', queryStringParameters: { op, ...extra },
        headers: { authorization: `Bearer ${user.token}`, origin: 'http://127.0.0.1:8788', 'content-type': 'application/json' },
        ...(input !== undefined ? { body: JSON.stringify(input) } : {}) });
    }
    const json = r => JSON.parse(r.body);
    const exportFile = (u, requestId = randomUUID(), report = payload) => api(u, 'export', { toolId: TOOL, requestId, payload: report });
    const suffix = randomBytes(5).toString('hex');
    const a = await identity(`a${suffix}@example.test`);
    const b = await identity(`b${suffix}@example.test`);
    const c = await identity(`c${suffix}@example.test`, false);
    assert.equal((await api(c, 'account', {})).statusCode, 403);
    const wa = json(await api(a, 'account', {}));
    assert.equal(wa.freeAvailable, true);
    await api(b, 'account', { referralCode: wa.referralCode });
    assert.deepEqual(json(await api(a, 'account')).invites, { earned: 0, pending: 1 });
    const bFreeId = randomUUID();
    assert.equal((await exportFile(b, bFreeId, { ...payload, parametros: { rows: [] } })).statusCode, 422);
    const [free, freeReplay] = await Promise.all([exportFile(b, bFreeId), exportFile(b, bFreeId)]);
    assert.equal(free.statusCode, 200, free.body);
    assert.equal(freeReplay.body, free.body);
    assert.equal((await exportFile(b, bFreeId, { ...payload, exemplo_ficticio: false })).statusCode, 409);
    assert.equal((await exportFile(b)).statusCode, 402);
    assert.equal(json(await api(a, 'account')).promo, 0);
    const aFree = await Promise.all([exportFile(a), exportFile(a)]);
    assert.deepEqual(aFree.map(r => r.statusCode).sort(), [200, 402]);
    const orderRequest = { packageId: 'creditos-1', requestId: randomUUID(), termsVersion: TERMS };
    assert.equal((await api(b, 'orders', { ...orderRequest, amountCents: 1 })).statusCode, 400);
    const orderResponses = await Promise.all([api(b, 'orders', orderRequest), api(b, 'orders', orderRequest)]);
    const order = json(orderResponses.find(r => r.statusCode === 201) || orderResponses[0]);
    assert.equal(order.status, 'pending', JSON.stringify(orderResponses));
    assert.equal(createCalls, 1);
    assert.equal((await api(a, 'order', undefined, { id: order.id })).statusCode, 404);
    const mp = [...providerOrders.values()][0];
    const pix = mp.transactions.payments[0];
    assert.equal(json(await api(b, 'account')).paid, 0);
    const hook = () => {
      const ts = String(Date.now());
      const req = randomUUID();
      const sig = createHmac('sha256', webhookSecret).update(`id:${mp.id.toLowerCase()};request-id:${req};ts:${ts};`).digest('hex');
      return handler.webhook({ httpMethod: 'POST', headers: { 'x-request-id': req, 'x-signature': `ts=${ts},v1=${sig}` },
        queryStringParameters: { 'data.id': mp.id }, body: '{}' });
    };
    assert.equal((await handler.webhook({ httpMethod: 'POST', headers: {}, queryStringParameters: { 'data.id': mp.id }, body: '{}' })).statusCode, 401);
    mp.status = pix.status = 'processed';
    mp.status_detail = pix.status_detail = 'accredited';
    mp.total_paid_amount = pix.paid_amount = '0.01';
    await hook();
    assert.equal(json(await api(b, 'account')).paid, 0);
    mp.total_paid_amount = pix.paid_amount = '14.90';
    const replayed = await Promise.all([hook(), hook(), hook()]);
    assert.ok(replayed.every(x => x.statusCode === 200), JSON.stringify(replayed));
    assert.equal(json(await api(b, 'account')).paid, 1);
    assert.equal(json(await api(a, 'account')).promo, 0, 'purchase alone cannot earn referral');
    const attempts = await Promise.all([exportFile(b), exportFile(b), exportFile(b), exportFile(b)]);
    assert.equal(attempts.filter(r => r.statusCode === 200).length, 1);
    assert.equal(attempts.filter(r => r.statusCode === 402).length, 3);
    assert.deepEqual(json(await api(a, 'account')).invites, { earned: 1, pending: 0 });
    assert.equal(json(await api(a, 'account')).promo, 1);
    const browserDirect = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/toolsCommerce/v1-emulator/accounts/${accountId(a.uid)}`,
      { headers: { authorization: `Bearer ${a.token}` } });
    assert.equal(browserDirect.status, 403);
    await exportFile(a); // consume the promotional credit before reversal
    mp.status = pix.status = 'refunded';
    mp.status_detail = pix.status_detail = 'refunded';
    mp.total_refunded_amount = pix.refunded_amount = '14.90';
    await Promise.all([hook(), hook()]);
    const reversed = json(await api(b, 'order', undefined, { id: order.id }));
    assert.equal(reversed.status, 'reversed', JSON.stringify({ reversed, incidents }));
    assert.equal(json(await api(b, 'account')).blocked, true);
    assert.equal(json(await api(a, 'account')).blocked, true);
    assert.equal(json(await api(a, 'account')).invites.earned, 0);
    assert.equal((await exportFile(b)).statusCode, 409);
  });
