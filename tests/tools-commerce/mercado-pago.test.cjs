'use strict';
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const test = require('node:test');
const { createMercadoPago } = require('../../runtime/tools-commerce/mercado-pago.cjs');
const ID = '018f0f34-7a01-7c75-b7b8-c5c5f169c6ac';
const ORDER = 'ORD01J49MMW3SSBK5PSV3DFR32959';
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
function pixOrder(overrides = {}) {
  return { id: ORDER, external_reference: ID, total_amount: '14.90', total_paid_amount: '0.00', status: 'created',
    transactions: { payments: [{ amount: '14.90', status: 'pending', payment_method: { id: 'pix', type: 'bank_transfer', qr_code: '000201PIX', ticket_url: 'https://www.mercadopago.com.br/sandbox/payments/123' } }] }, ...overrides };
}
test('creates a single automatic Pix order with stable idempotency reference', async () => {
  let call;
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', fetchImpl: async (url, options) => { call = { url, options }; return response(pixOrder()); } });
  const order = await client.createOrder({ id: ID, amountCents: 1490, email: 'buyer@example.com', label: '1 crédito' });
  assert.equal(call.url, 'https://api.mercadopago.com/v1/orders');
  assert.equal(call.options.headers['X-Idempotency-Key'], ID);
  const body = JSON.parse(call.options.body);
  assert.equal(body.external_reference, ID);
  assert.equal(body.total_amount, '14.90');
  assert.equal(body.transactions.payments[0].amount, '14.90');
  assert.deepEqual(body.transactions.payments[0].payment_method, { id: 'pix', type: 'bank_transfer' });
  assert.equal(order.state, 'pending');
  assert.equal(order.currency, 'BRL');
  assert.equal(order.qrCode, '000201PIX');
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
  const client = createMercadoPago({ accessToken: 'token', webhookSecret: 'secret', fetchImpl: async () => { throw new Error('network'); } });
  await assert.rejects(() => client.createOrder({ id: ID, amountCents: 1490, email: 'buyer@example.com', label: '1 crédito' }), /reconcile the existing order/);
});
