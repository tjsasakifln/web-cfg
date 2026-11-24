const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHmac } = require('node:crypto');
const { createCommerceHttp } = require('../../runtime/tools-commerce/http.cjs');
const { createMercadoPago } = require('../../runtime/tools-commerce/mercado-pago.cjs');
const { TERMS, TERMS_HASH, TOOL, accountId } = require('../../runtime/tools-commerce/policy.cjs');
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
    let loseCheckoutResponse = false;
    const incidents = [];
    const handler = createCommerceHttp({ config: { mode: 'emulator', projectId, identityKey: randomBytes(32), purchasesEnabled: true, sharedExportsEnabled: true, checkoutEnabled: true,
      accessToken: 'fake-access-token-integration', webhookSecret }, onIncident: x => incidents.push(x), providerFactory: options => createMercadoPago({
        ...options, mode: 'live', sellerId: '1170000100', fetchImpl: async (url, options) => {
          if (url === 'https://api.mercadolibre.com/users/me') return Response.json({ tags: ['normal'], id: '1170000100' });
          if (options.method === 'POST') {
            createCalls++;
            const input = JSON.parse(options.body);
            const id = `ORD${randomUUID().replaceAll('-', '').toUpperCase()}`;
            if (input.processing_mode === 'manual') {
              const order = { id, type: 'online', external_reference: input.external_reference, total_amount: input.total_amount,
                status: 'created', processing_mode: 'manual', currency: 'BRL', user_id: '1170000100',
                checkout_url: `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${id}` };
              providerOrders.set(id, order);
              if (loseCheckoutResponse) { loseCheckoutResponse = false; throw new Error('lost response'); }
              return Response.json(order);
            }
            const order = { id, type: 'online', external_reference: input.external_reference, total_amount: input.total_amount,
              status: 'action_required', transactions: input.transactions };
            order.transactions.payments[0].status = 'action_required';
            order.transactions.payments[0].payment_method.qr_code = 'pix-fixture';
            providerOrders.set(id, order);
            return Response.json(order);
          }
          if (new URL(url).pathname === '/v1/orders') {
            const ref = new URL(url).searchParams.get('external_reference');
            const data = [...providerOrders.values()].filter(order => order.external_reference === ref);
            return Response.json({ data, paging: { total: data.length } });
          }
          const key = url.split('/').at(-1).toUpperCase();
          return providerOrders.has(key) ? Response.json(providerOrders.get(key)) : Response.json({}, { status: 404 });
        },
      }) });
    const { getApp } = sdk('firebase-admin/app');
    const { getAuth } = sdk('firebase-admin/auth');
    const { db } = handler.getDependencies(handler.config());
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
    const exportLocal = (u, toolId = 'calculadora-bdi', requestId = randomUUID(), sha256 = 'a'.repeat(64)) =>
      api(u, 'export-local', { toolId, requestId, payload: { format: 'csv', bytes: 12, sha256 } });
    const suffix = randomBytes(5).toString('hex');
    const a = await identity(`a${suffix}@example.test`);
    const b = await identity(`b${suffix}@example.test`);
    const c = await identity(`c${suffix}@example.test`, false);
    assert.equal((await api(c, 'account', {})).statusCode, 403);
    const aliases = await Promise.all([
      identity(`wallet${suffix}@gmail.com`),
      identity(`wallet${suffix}+social@googlemail.com`),
    ]);
    const registrations = await Promise.all(aliases.map(user => api(user, 'account', {})));
    assert.deepEqual(registrations.map(result => result.statusCode).sort(), [200, 409]);
    assert.equal(json(registrations.find(result => result.statusCode === 200)).freeAvailable, true);
    assert.equal(json(registrations.find(result => result.statusCode === 409)).error, 'ACCOUNT_LINK_REQUIRED');
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
    assert.equal((await exportLocal(b, 'calculadora-bdi', bFreeId)).statusCode, 409);
    assert.equal((await exportFile(b)).statusCode, 402);
    assert.equal((await exportLocal(b)).statusCode, 402);
    assert.equal(json(await api(a, 'account')).promo, 0);
    assert.equal((await exportLocal(a, 'calculadora-bdi', randomUUID(), 'invalid')).statusCode, 422);
    const aFree = await Promise.all([exportFile(a), exportLocal(a)]);
    assert.deepEqual(aFree.map(r => r.statusCode).sort(), [200, 402]);
    const orderRequest = { packageId: 'creditos-1', requestId: randomUUID(), termsVersion: TERMS };
    assert.equal((await api(b, 'orders', { ...orderRequest, amountCents: 1 })).statusCode, 400);
    const orderResponses = await Promise.all([api(b, 'orders', orderRequest), api(b, 'orders', orderRequest)]);
    const order = json(orderResponses.find(r => r.statusCode === 201) || orderResponses[0]);
    assert.equal(order.status, 'pending', JSON.stringify(orderResponses));
    const stored = (await db.doc(`toolsCommerce/v1-emulator/orders/${order.id}`).get()).data();
    assert.equal(stored.termsHash, TERMS_HASH);
    assert.equal(createCalls, 1);
    assert.equal((await api(a, 'order', undefined, { id: order.id })).statusCode, 404);
    const mp = [...providerOrders.values()][0];
    const pix = mp.transactions.payments[0];
    assert.equal(json(await api(b, 'account')).paid, 0);
    const hook = (providerOrder = mp) => {
      const ts = String(Date.now());
      const req = randomUUID();
      const sig = createHmac('sha256', webhookSecret).update(`id:${providerOrder.id.toLowerCase()};request-id:${req};ts:${ts};`).digest('hex');
      return handler.webhook({ httpMethod: 'POST', headers: { 'x-request-id': req, 'x-signature': `ts=${ts},v1=${sig}` },
        queryStringParameters: { 'data.id': providerOrder.id }, body: '{}' });
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
    const paidId = randomUUID();
    const attempts = await Promise.all([exportLocal(b, 'calculadora-bdi', paidId), exportLocal(b, 'rede-de-agua', paidId),
      exportLocal(b, 'caminho-critico-obra', paidId), exportLocal(b, 'calculadora-psicrometrica', paidId)]);
    assert.equal(attempts.filter(r => r.statusCode === 200).length, 1);
    assert.equal(attempts.filter(r => r.statusCode === 409).length, 3);
    const paidReceipt = attempts.find(r => r.statusCode === 200);
    assert.equal((await exportLocal(b, json(paidReceipt).toolId, paidId)).body, paidReceipt.body);
    assert.equal((await exportLocal(b, 'calculadora-bdi')).statusCode, 402);
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

    const cardBuyer = await identity(`d${suffix}@example.test`);
    await api(cardBuyer, 'account', {});
    const checkoutRequest = { packageId: 'creditos-1', requestId: randomUUID(), termsVersion: TERMS, paymentFlow: 'checkout' };
    const checkoutResponse = await api(cardBuyer, 'orders', checkoutRequest);
    assert.equal(checkoutResponse.statusCode, 201, checkoutResponse.body);
    const checkout = json(checkoutResponse);
    assert.equal(checkout.paymentFlow, 'checkout');
    assert.equal(checkout.status, 'pending');
    assert.match(checkout.checkoutUrl, /^https:\/\/www\.mercadopago\.com\.br\/checkout\//);
    assert.equal((await api(cardBuyer, 'orders', { ...checkoutRequest, paymentFlow: 'pix' })).statusCode, 409);
    assert.equal(json(await api(cardBuyer, 'account')).paid, 0);
    const cardOrder = [...providerOrders.values()].find(o => o.external_reference === checkout.id);
    Object.assign(cardOrder, { status: 'processed', status_detail: 'accredited', total_paid_amount: '14.90',
      transactions: { payments: [{ status: 'processed', status_detail: 'accredited', paid_amount: '14.90', amount: '14.90',
        payment_method: { id: 'visa', type: 'credit_card' } }] } });
    await Promise.all([hook(cardOrder), hook(cardOrder)]);
    assert.equal(json(await api(cardBuyer, 'account')).paid, 1);
    assert.equal((await exportLocal(cardBuyer, 'rede-de-agua')).statusCode, 200); // courtesy first
    const cardUses = await Promise.all([exportLocal(cardBuyer, 'calculadora-bdi'), exportFile(cardBuyer),
      exportLocal(cardBuyer, 'caminho-critico-obra')]);
    assert.deepEqual(cardUses.map(r => r.statusCode).sort(), [200, 402, 402]);
    const cardPayment = cardOrder.transactions.payments[0];
    cardOrder.status = cardPayment.status = 'charged_back';
    cardOrder.status_detail = cardPayment.status_detail = 'in_process';
    cardOrder.last_updated_date = '2026-11-09T14:00:00.000Z';
    await hook(cardOrder);
    assert.equal(json(await api(cardBuyer, 'account')).blocked, true);
    cardOrder.status_detail = cardPayment.status_detail = 'reimbursed';
    cardOrder.last_updated_date = '2026-11-09T14:01:00.000Z';
    await hook(cardOrder);
    assert.equal(json(await api(cardBuyer, 'account')).blocked, true);
    const restored = await handler.reconcile(handler.getDependencies(handler.config()), cardOrder.id, { sellerCreditConfirmed: true });
    assert.equal(restored.status, 'paid');
    await hook(cardOrder);
    assert.equal(json(await api(cardBuyer, 'account')).blocked, false);
    assert.equal(json(await api(cardBuyer, 'account')).paid, 0);

    loseCheckoutResponse = true;
    const uncertain = await api(cardBuyer, 'orders', { ...checkoutRequest, requestId: randomUUID() });
    assert.equal(uncertain.statusCode, 202);
    assert.equal(json(uncertain).status, 'review');
    const recovered = await api(cardBuyer, 'order', undefined, { id: json(uncertain).id });
    assert.equal(recovered.statusCode, 200, recovered.body);
    assert.equal(json(recovered).status, 'pending');
    assert.equal(createCalls, 3, 'recovery finds the existing provider order without a second POST');

    cardOrder.status_detail = cardPayment.status_detail = 'settled';
    cardOrder.last_updated_date = '2026-11-09T14:02:00.000Z';
    await Promise.all([hook(cardOrder), hook(cardOrder)]);
    assert.equal(json(await api(cardBuyer, 'order', undefined, { id: checkout.id })).status, 'reversed');
  });


test('Firebase emulator: paid Pro cycle, concurrent consumption, duplicate invoice, reversal and cancellation',
  { timeout: 120000 }, async () => {
    const {createLedger}=require('../../runtime/tools-commerce/ledger.cjs');
    const {createSubscriptions}=require('../../runtime/tools-commerce/subscriptions.cjs');
    const {PRO,nextMonth}=require('../../runtime/tools-commerce/subscription-policy.cjs');
    const {getApp}=sdk('firebase-admin/app');
    const {getFirestore}=sdk('firebase-admin/firestore');
    const db=getFirestore(getApp('confenge-tools-emulator-demo-confenge-tools'));
    let now=Date.parse('2026-11-15T12:00:00-03:00'), raw, calls=0, currentState='paid';
    const user={uid:randomUUID(),email:randomUUID()+'@example.test'}, clock=()=>now;
    const ledger=createLedger({db,mode:'emulator',identityKey:randomBytes(32),clock});
    await ledger.register(user);
    const provider={
      async create({ref}) { calls++; raw={id:'sub-'+randomUUID(),external_reference:ref,status:'pending',date_created:new Date(now).toISOString(),init_point:'https://www.mercadopago.com.br/subscriptions/checkout'};return {raw,url:raw.init_point}; },
      verifyContract(r,o,ref){assert.equal(r.external_reference,ref);assert.equal(o.amountCents,4990);},
      checkoutUrl:r=>r.init_point,
      getSubscription:async()=>raw,findInvoices:async()=>[],findSubscriptions:async()=>raw?[raw]:[],
      cancel:async()=>{raw={...raw,status:'cancelled',last_modified:new Date(now).toISOString()};},
      invoiceFact:async(i,r)=>({invoiceId:i.id,subscriptionId:r.id,reference:r.external_reference,
        startsAt:i.start,expiresAt:nextMonth(i.start),amountCents:4990,currency:'BRL',invoiceUpdatedAt:now,
        paymentId:'payment-'+i.id,paymentUpdatedAt:now,approvedAt:i.approvedAt??i.start,state:currentState,refundedCents:currentState==='reversed'?4990:0})
    };
    const service=createSubscriptions({db,cfg:{mode:'emulator',subscriptions:{returnOrigin:'https://example.test'}},provider,clock});
    const args={offerId:PRO.id,termsVersion:PRO.termsVersion,termsHash:PRO.termsHash,accepted:true};
    await Promise.all([service.start(user,args),service.start(user,args)]);
    assert.equal(calls,1);
    assert.equal((await ledger.account(user.uid)).subscriptionCredits,0);
    raw={...raw,status:'authorized',last_modified:new Date(now).toISOString()};
    const invoice={id:randomUUID(),start:now};
    currentState='pending';
    await service.observeInvoice(invoice,raw);
    assert.equal((await ledger.account(user.uid)).subscriptionCredits,0);
    currentState='paid';now+=1000;
    await Promise.all([service.observeInvoice(invoice,raw),service.observeInvoice(invoice,raw)]);
    assert.equal((await ledger.account(user.uid)).subscriptionCredits,6);
    const exportOne=async()=>{const input={uid:user.uid,toolId:'calculadora-bdi',requestId:randomUUID(),digest:randomUUID()};const q=await ledger.quoteExport(input);return ledger.completeExport({...input,authorization:q.token});};
    const results=await Promise.all([exportOne(),exportOne(),exportOne()]);
    assert.ok(results.every(r=>r.bucket==='subscription'));
    assert.equal((await ledger.account(user.uid)).subscriptionCredits,3);
    assert.equal((await ledger.account(user.uid)).freeAvailable,true);
    // A payment for the next contractual cycle must not change today's balance.
    const future={id:randomUUID(),start:nextMonth(invoice.start),approvedAt:now};
    await service.observeInvoice(future,raw);
    assert.equal((await ledger.account(user.uid)).subscriptionCredits,3);
    assert.equal((await ledger.account(user.uid)).futureSubscriptionCredits,6);
    const cancelled=await service.cancel(user);
    assert.equal(cancelled.status,'cancelled');
    assert.equal((await ledger.account(user.uid)).subscriptionCredits,3);
    await assert.rejects(()=>service.start(user,args),/CYCLE_STILL_ACTIVE/);
    currentState='reversed';now+=1000;
    await service.observeInvoice(invoice,raw);
    assert.equal((await ledger.account(user.uid)).subscriptionCredits,0);
    assert.equal((await ledger.account(user.uid)).futureSubscriptionCredits,6);
    assert.equal((await ledger.account(user.uid)).freeAvailable,true);
    assert.equal((await exportOne()).bucket,'free');
    now=future.start;
    assert.equal((await ledger.account(user.uid)).subscriptionCredits,6);
    assert.equal((await exportOne()).bucket,'subscription');
    await assert.rejects(()=>service.status({uid:randomUUID()}).then(r=>{if(!r)throw Error('not owned');}),/not owned/);
  });


test('Firebase emulator: experimental budget and quote consent cannot fall through to another bucket',
  {timeout:120000},async()=>{
  const {createLedger}=require('../../runtime/tools-commerce/ledger.cjs');
  const {getApp}=sdk('firebase-admin/app'),{getFirestore}=sdk('firebase-admin/firestore');
  const db=getFirestore(getApp('confenge-tools-emulator-demo-confenge-tools'));
  const idKey=randomBytes(32),mode='emulator', root=db.collection('toolsCommerce').doc('v1-'+mode);
  let now=Date.parse('2029-06-15T12:00:00-03:00');
  const opts={db,mode,identityKey:idKey,clock:()=>now,requireConsent:true};
  const ledger=createLedger({...opts,experiment:{costCents:100,maxAccounts:50,budgetCents:100}});
  const user={uid:randomUUID(),email:randomUUID()+'@example.test'};
  await ledger.register(user);
  const wallet=root.collection('accounts').doc(accountId(user.uid));
  await wallet.update({experimentGroup:'B',freeAvailable:false});
  const payload=()=>({uid:user.uid,toolId:'calculadora-bdi',requestId:randomUUID(),digest:randomUUID()});
  const a=payload(),b=payload();
  const qa=await ledger.quoteExport(a),qb=await ledger.quoteExport(b);
  assert.equal(qa.bucket,'experiment');assert.equal(qb.bucket,'experiment');
  assert.equal((await ledger.account(user.uid)).experimental.available,true);
  const disabled=createLedger(opts);
  const result=await disabled.completeExport({...a,authorization:qa.token});
  assert.equal(result.bucket,'experiment','reserved benefit survives switch-off');
  assert.equal((await disabled.completeExport({...a,authorization:qa.token})).exportId,result.exportId);
  const retry={...a,requestId:randomUUID()};
  const recovery=await disabled.quoteExport(retry);
  assert.equal(recovery.recovery,true);
  assert.equal((await disabled.completeExport({...retry,authorization:recovery.token})).exportId,result.exportId);
  await assert.rejects(()=>disabled.quoteExport({...retry,digest:randomUUID()}),/REQUEST_CONFLICT/);
  await assert.rejects(()=>disabled.completeExport({...retry,digest:randomUUID(),authorization:recovery.token}),/REQUEST_CONFLICT/);
  await assert.rejects(()=>disabled.completeExport({...retry,uid:randomUUID(),authorization:recovery.token}),/ACCOUNT_REQUIRED|EXPORT_CONFIRMATION_REQUIRED/);
  assert.equal((await ledger.account(user.uid)).experimental.consumed,true);
  await assert.rejects(()=>ledger.completeExport({...b,authorization:qb.token}),/NO_CREDITS|EXPORT_CONFIRMATION_CHANGED/);
  const second={uid:randomUUID(),email:randomUUID()+'@example.test'};
  await ledger.register(second);
  await root.collection('accounts').doc(accountId(second.uid)).update({experimentGroup:'B',freeAvailable:false});
  assert.equal((await ledger.account(second.uid)).experimental.available,false);
  now=Date.parse('2029-07-01T03:00:00Z');
  assert.equal((await ledger.account(user.uid)).experimental.available,true);
  await assert.rejects(()=>ledger.quoteExport({...payload(),toolId:'cad-editor'}),/NO_CREDITS/);
  await wallet.update({experimentGroup:'A'});
  assert.equal((await ledger.account(user.uid)).experimental.available,false);
  await wallet.update({experimentGroup:'B',subscriptionId:randomUUID(),subscriptionStatus:'authorized'});
  assert.equal((await ledger.account(user.uid)).experimental.available,false);
});
