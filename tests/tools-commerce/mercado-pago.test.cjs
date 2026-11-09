'use strict';
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const test = require('node:test');
const { createMercadoPago } = require('../../runtime/tools-commerce/mercado-pago.cjs');
const ID = '018f0f34-7a01-7c75-b7b8-c5c5f169c6ac';
const ORDER = 'ORD01J49MMW3SSBK5PSV3DFR32959';
const SELLER_PROFILE = 'https://api.mercadolibre.com/users/me';
const SELLER_ID = '1170000100';
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
function pixOrder(overrides = {}) {
  return { id: ORDER, external_reference: ID, total_amount: '14.90', total_paid_amount: '0.00', status: 'created',
    transactions: { payments: [{ amount: '14.90', status: 'pending', payment_method: { id: 'pix', type: 'bank_transfer', qr_code: '000201PIX', ticket_url: 'https://www.mercadopago.com.br/sandbox/payments/123' } }] }, ...overrides };
}
function checkoutOrder(overrides = {}) {
  return { id: ORDER, type: 'online', processing_mode: 'manual', capture_mode: 'automatic_async',
    external_reference: ID, total_amount: '14.90', total_paid_amount: '0.00', status: 'created', status_detail: 'created',
    checkout_url: 'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=' + ORDER,
    country_code: 'BRA', currency: 'BRL', user_id: SELLER_ID, transactions: { payments: [] }, ...overrides };
}
test('creates a single automatic Pix order with stable idempotency reference', async () => {
  let call;
  let profileId = '1170000101';
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID, fetchImpl: async (url, options) => {
    if (url === SELLER_PROFILE) return response({ tags: ['normal'], id: profileId });
    call = { url, options };
    return response(pixOrder());
  } });
  const input = { id: ID, amountCents: 1490, email: 'buyer@example.com', label: '1 crédito' };
  await assert.rejects(() => client.createOrder(input), /configured ID/);
  assert.equal(call, undefined);
  profileId = SELLER_ID;
  const order = await client.createOrder(input);
  assert.equal(call.url, 'https://api.mercadopago.com/v1/orders');
  assert.equal(call.options.headers['X-Idempotency-Key'], ID);
  const body = JSON.parse(call.options.body);
  assert.equal(body.external_reference, ID);
  assert.equal(body.total_amount, '14.90');
  assert.deepEqual(body.payer, { email: 'buyer@example.com' });
  assert.equal(body.processing_mode, 'automatic');
  assert.equal(body.capture_mode, undefined);
  assert.equal(body.items, undefined);
  assert.equal(body.transactions.payments[0].amount, '14.90');
  assert.deepEqual(body.transactions.payments[0].payment_method, { id: 'pix', type: 'bank_transfer' });
  assert.equal(order.state, 'pending');
  assert.equal(order.currency, 'BRL');
  assert.equal(order.qrCode, '000201PIX');
  assert.equal(order.paymentFlow, 'pix');
});
test('uses only the verified sandbox seller and keeps an asynchronous Pix order pending', async () => {
  let sellerTags = ['normal'];
  let sellerId = 1170000101;
  let sent;
  const client = createMercadoPago({ mode: 'sandbox', sellerId: SELLER_ID, sandboxPayerEmail: 'test_payer@example.com',
    accessToken: 'token', webhookSecret: 'secret', fetchImpl: async (url, options) => {
      if (url === SELLER_PROFILE) return response({ tags: sellerTags, id: sellerId });
      if (options.method === 'GET') return response(pixOrder());
      sent = JSON.parse(options.body);
      return response(pixOrder({ status: 'processing', transactions: {} }));
    } });
  const input = { id: ID, amountCents: 1490, email: 'buyer@example.com', label: '1 crédito' };
  await assert.rejects(() => client.createOrder(input), /configured environment/);
  assert.equal(sent, undefined);
  sellerTags = ['normal', 'test_user'];
  await assert.rejects(() => client.createOrder(input), /configured ID/);
  assert.equal(sent, undefined);
  sellerId = 1170000100;
  const pending = await client.createOrder(input);
  assert.deepEqual(sent, {
    type: 'online', external_reference: ID, total_amount: '14.90',
    transactions: { payments: [{ amount: '14.90', payment_method: { id: 'pix', type: 'bank_transfer' } }] },
    payer: { email: 'test_payer@example.com', first_name: 'APRO' }
  });
  assert.equal(pending.state, 'pending');
  assert.equal(pending.qrCode, undefined);
  assert.equal((await client.getOrder(ORDER)).qrCode, '000201PIX');
});
test('creates Checkout Pro with every account-enabled method and safe return URLs', async () => {
  let call;
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
    fetchImpl: async (url, options) => {
      if (url === SELLER_PROFILE) return response({ tags: ['normal'], id: SELLER_ID });
      call = { url, options };
      return response(checkoutOrder());
    } });
  const checkout = await client.createCheckoutOrder({ id: ID, amountCents: 1490, email: 'buyer@example.com',
    label: '1 crédito para exportar — CONFENGE', returnUrl: 'https://confenge.com.br/ferramentas/?pagamento=retorno' });
  assert.equal(call.url, 'https://api.mercadopago.com/v1/orders');
  assert.equal(call.options.headers['X-Idempotency-Key'], ID);
  const body = JSON.parse(call.options.body);
  assert.equal(body.processing_mode, 'manual');
  assert.equal(body.capture_mode, 'automatic_async');
  assert.deepEqual(body.items, [{ title: '1 crédito para exportar — CONFENGE', quantity: 1, unit_price: '14.90' }]);
  assert.equal(body.transactions, undefined);
  assert.equal(body.config.payment_method, undefined, 'omitting method restrictions leaves all account-enabled methods available');
  assert.deepEqual(body.config.online, {
    success_url: 'https://confenge.com.br/ferramentas/?pagamento=retorno',
    failure_url: 'https://confenge.com.br/ferramentas/?pagamento=retorno',
    pending_url: 'https://confenge.com.br/ferramentas/?pagamento=retorno', auto_return: 'approved'
  });
  assert.equal(checkout.state, 'pending');
  assert.equal(checkout.paymentFlow, 'checkout');
  assert.match(checkout.checkoutUrl, /^https:\/\/www\.mercadopago\.com\.br\/checkout\//);
});
test('rejects unsafe Checkout Pro return and redirect URLs', async () => {
  let posts = 0;
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
    fetchImpl: async (url) => {
      if (url === SELLER_PROFILE) return response({ tags: ['normal'], id: SELLER_ID });
      posts++;
      return response(checkoutOrder({ checkout_url: 'https://evil.example/checkout/' + ORDER }));
    } });
  const input = { id: ID, amountCents: 1490, email: 'buyer@example.com', label: '1 crédito' };
  await assert.rejects(() => client.createCheckoutOrder({ ...input, returnUrl: 'http://confenge.com.br/' }), /HTTPS URL/);
  assert.equal(posts, 0);
  await assert.rejects(() => client.createCheckoutOrder({ ...input, returnUrl: 'https://confenge.com.br/' }), /invalid checkout URL/);
  assert.equal(posts, 1);
});
test('reconciles one fully accredited payment from each Checkout Pro method', async (t) => {
  for (const [id, type] of [['pix', 'bank_transfer'], ['visa', 'credit_card'], ['debvisa', 'debit_card'],
    ['account_money', 'account_money'], ['bolbradesco', 'ticket']]) {
    await t.test(type, async () => {
      const paid = checkoutOrder({ status: 'processed', status_detail: 'accredited', total_paid_amount: '14.90',
        transactions: { payments: [{ amount: '14.90', paid_amount: '14.90', status: 'processed',
          status_detail: 'accredited', payment_method: { id, type } }] } });
      const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
        fetchImpl: async () => response(paid) });
      const fact = await client.getOrder(ORDER);
      assert.equal(fact.state, 'paid');
      assert.equal(fact.paymentFlow, 'checkout');
      assert.equal(fact.paymentMethod, id);
    });
  }
});
test('keeps partial, multiple and malformed Checkout Pro payments in review', async () => {
  const payment = { amount: '14.90', paid_amount: '14.90', status: 'processed', status_detail: 'accredited',
    payment_method: { id: 'visa', type: 'credit_card' } };
  let data = checkoutOrder({ status: 'processed', status_detail: 'accredited', total_paid_amount: '7.00',
    transactions: { payments: [{ ...payment, paid_amount: '7.00' }] } });
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
    fetchImpl: async () => response(data) });
  assert.equal((await client.getOrder(ORDER)).state, 'review');
  data = checkoutOrder({ status: 'processed', status_detail: 'accredited', total_paid_amount: '14.90',
    transactions: { payments: [payment, { ...payment, payment_method: { id: 'pix', type: 'bank_transfer' } }] } });
  assert.equal((await client.getOrder(ORDER)).state, 'review');
  data = checkoutOrder({ status: 'processed', status_detail: 'accredited', total_paid_amount: '14.90',
    transactions: { payments: [{ ...payment, payment_method: { id: 'bad method', type: 'credit_card' } }] } });
  assert.equal((await client.getOrder(ORDER)).state, 'review');
});
test('labels coherent full chargebacks and reverses only a settled dispute', async () => {
  let detail = 'in_process';
  const disputed = () => checkoutOrder({ status: 'charged_back', status_detail: detail, total_paid_amount: '14.90',
    transactions: { payments: [{ amount: '14.90', paid_amount: '14.90', status: 'charged_back',
      status_detail: detail, payment_method: { id: 'visa', type: 'credit_card' } }] } });
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
    fetchImpl: async () => response(disputed()) });
  assert.deepEqual({ state: (await client.getOrder(ORDER)).state, dispute: (await client.getOrder(ORDER)).dispute },
    { state: 'review', dispute: 'open' });
  detail = 'reimbursed';
  const won = await client.getOrder(ORDER);
  assert.deepEqual({ state: won.state, dispute: won.dispute }, { state: 'review', dispute: 'won' });
  detail = 'settled';
  const settled = await client.getOrder(ORDER);
  assert.equal(settled.state, 'reversed');
  assert.equal(settled.dispute, undefined);
  const incoherent = checkoutOrder({ status: 'processed', status_detail: 'accredited', total_paid_amount: '14.90',
    transactions: { payments: [{ amount: '14.90', paid_amount: '14.90', status: 'charged_back',
      status_detail: 'in_process', payment_method: { id: 'visa', type: 'credit_card' } }] } });
  const inconsistent = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
    fetchImpl: async () => response(incoherent) });
  const held = await inconsistent.getOrder(ORDER);
  assert.equal(held.state, 'review');
  assert.equal(held.dispute, undefined);
});
test('exposes a valid provider update timestamp and omits invalid provider dates', async () => {
  let data = checkoutOrder({ last_updated_date: '2026-11-09T12:34:56.123456789Z' });
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
    fetchImpl: async () => response(data) });
  assert.equal((await client.getOrder(ORDER)).providerUpdatedAt, Date.parse('2026-11-09T12:34:56.123Z'));
  data = checkoutOrder({ last_updated_date: '09/11/2026 12:34:56' });
  assert.equal((await client.getOrder(ORDER)).providerUpdatedAt, undefined);
});
test('finds one uncertain order by stable reference without creating another order', async () => {
  const createdAt = Date.parse('2026-11-09T12:00:00.000Z');
  let searchCall;
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
    fetchImpl: async (url, options) => {
      if (url === SELLER_PROFILE) return response({ tags: ['normal'], id: SELLER_ID });
      searchCall = { url, options };
      return response({ data: [{ id: ORDER, external_reference: ID, user_id: SELLER_ID },
        { id: 'ORDIGNORED123', external_reference: 'different-reference', user_id: SELLER_ID }],
      paging: { total: 1 } });
    } });
  assert.equal(await client.findOrderId({ reference: ID, createdAt }), ORDER);
  const url = new URL(searchCall.url);
  assert.equal(url.origin + url.pathname, 'https://api.mercadopago.com/v1/orders');
  assert.equal(url.searchParams.get('begin_date'), '2026-11-09T11:45:00.000Z');
  assert.equal(url.searchParams.get('end_date'), '2026-11-09T12:15:00.000Z');
  assert.equal(url.searchParams.get('external_reference'), ID);
  assert.equal(url.searchParams.get('limit'), '2');
  assert.equal(searchCall.options.method, 'GET');
  assert.equal(searchCall.options.body, undefined);
});
test('returns null for no recovered order and fails closed on ambiguous or invalid searches', async () => {
  const createdAt = Date.parse('2026-11-09T12:00:00.000Z');
  let data = { data: [] };
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
    fetchImpl: async (url) => url === SELLER_PROFILE ? response({ tags: ['normal'], id: SELLER_ID }) : response(data) });
  assert.equal(await client.findOrderId({ reference: ID, createdAt }), null);
  data = { data: [{ id: ORDER, external_reference: ID },
    { id: 'ORD01J49MMW3SSBK5PSV3DFR32960', external_reference: ID }] };
  await assert.rejects(() => client.findOrderId({ reference: ID, createdAt }), /ambiguous order search/);
  data = { data: [{ id: 'not-an-order', external_reference: ID }] };
  await assert.rejects(() => client.findOrderId({ reference: ID, createdAt }), /incompatible order search/);
  data = {};
  await assert.rejects(() => client.findOrderId({ reference: ID, createdAt }), /invalid order search/);
  await assert.rejects(() => client.findOrderId({ reference: ID, createdAt: NaN }), /timestamp/);
});
test('rejects Checkout Pro orders from another seller, country or currency', async () => {
  let data = checkoutOrder({ user_id: '999' });
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID,
    fetchImpl: async () => response(data) });
  await assert.rejects(() => client.getOrder(ORDER), /incompatible order/);
  data = checkoutOrder({ currency: 'USD' });
  await assert.rejects(() => client.getOrder(ORDER), /incompatible order/);
  data = checkoutOrder({ country_code: 'ARG' });
  await assert.rejects(() => client.getOrder(ORDER), /incompatible order/);
});
test('marks only fully paid fetched Pix orders as paid', async () => {
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', fetchImpl: async () => response(pixOrder({ status: 'processed', status_detail: 'accredited', total_paid_amount: '14.90', transactions: { payments: [{ amount: '14.90', paid_amount: '14.90', status: 'processed', status_detail: 'accredited', payment_method: { id: 'pix', type: 'bank_transfer' } }] } })) });
  assert.equal((await client.getOrder(ORDER)).state, 'paid');
});
test('freezes partial payments and unproven refunds for review', async () => {
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', fetchImpl: async () => response(pixOrder({ status: 'processed', total_paid_amount: '7.00', transactions: { payments: [{ amount: '14.90', paid_amount: '7.00', status: 'processed', payment_method: { id: 'pix', type: 'bank_transfer' } }] } })) });
  assert.equal((await client.getOrder(ORDER)).state, 'review');
});
test('marks an official refunded order as reversed only after its full original payment', async () => {
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', fetchImpl: async () => response(pixOrder({ status: 'refunded', status_detail: 'refunded', total_paid_amount: '14.90', transactions: { payments: [{ amount: '14.90', status: 'refunded', status_detail: 'refunded', paid_amount: '14.90', payment_method: { id: 'pix', type: 'bank_transfer' } }] } })) });
  assert.equal((await client.getOrder(ORDER)).state, 'reversed');
});
test('rejects a partial refund detail and an extra payment even with equal totals', async () => {
  const p = { amount: '14.90', paid_amount: '14.90', status: 'processed', status_detail: 'accredited', payment_method: { id: 'pix', type: 'bank_transfer' } };
  let data = pixOrder({ status: 'processed', status_detail: 'partially_refunded', total_paid_amount: '14.90', transactions: { payments: [p] } });
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', fetchImpl: async () => response(data) });
  assert.equal((await client.getOrder(ORDER)).state, 'review');
  data = { ...data, status_detail: 'accredited', transactions: { payments: [p, { ...p, payment_method: { id: 'credit_card' } }] } };
  assert.equal((await client.getOrder(ORDER)).state, 'review');
});
test('validates lowercase Mercado Pago webhook manifest and ignores body identity', () => {
  const providerId = ORDER, requestId = 'request-1', ts = '1710000000';
  const manifest = 'id:' + providerId.toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';';
  const v1 = createHmac('sha256', 'secret').update(manifest).digest('hex');
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', fetchImpl: async () => response({}) });
  assert.deepEqual(client.parseWebhook({ headers: { 'X-Signature': 'ts=' + ts + ',v1=' + v1, 'X-Request-Id': requestId }, query: { 'data.id': providerId }, body: { data: { id: 'tampered' } } }), { providerId });
  assert.throws(() => client.parseWebhook({ headers: { 'x-signature': 'ts=' + ts + ',v1=nope', 'x-request-id': requestId }, query: { 'data.id': providerId } }), /signature/);
});
test('does not retry an uncertain provider POST', async () => {
  let posts = 0;
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', sellerId: SELLER_ID, fetchImpl: async url => {
    if (url === SELLER_PROFILE) return response({ tags: ['normal'], id: SELLER_ID });
    posts++;
    throw new Error('network');
  } });
  await assert.rejects(() => client.createOrder({ id: ID, amountCents: 1490, email: 'buyer@example.com', label: '1 crédito' }), /reconcile the existing order/);
  assert.equal(posts, 1);
});
