'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCheckoutAdapter, FLOW } = require('../config/checkout.cjs');
const Stripe = require('stripe');

const acceptedQuote = () => ({
  request: {
    id: 'engreq_fixture', revision: 2, title: 'Projeto contratado', amountCents: 100000,
    currency: 'brl', customerId: 'cus_local', sellerId: 'sel_local',
    customerAcceptedRevision: 2, providerAcceptedRevision: 2,
  },
  accountId: 'acct_provider', feeCents: 10000, customerId: 'cus_local',
});

function harness(options = {}) {
  const calls = [];
  const q = acceptedQuote();
  const metadata = { flow: FLOW, request_id: q.request.id, revision: '2', customer_id: 'cus_local',
    seller_id: 'sel_local', connected_account: 'acct_provider', amount_cents: '100000', fee_cents: '10000', currency: 'brl' };
  const charge = { id: 'ch_fixture', payment_intent: 'pi_fixture', livemode: false, amount: 100000,
    amount_captured: 100000, currency: 'brl', paid: true, captured: true, amount_refunded: 0, disputed: false };
  const intent = { id: 'pi_fixture', livemode: false, amount: 100000, amount_received: 100000, currency: 'brl',
    application_fee_amount: 10000, transfer_data: { destination: 'acct_provider' }, status: 'succeeded',
    metadata: { ...metadata }, latest_charge: charge };
  const session = { id: 'cs_test_fixture', livemode: false, mode: 'payment', status: 'complete', payment_status: 'paid',
    url: 'https://checkout.stripe.com/c/pay/cs_test_fixture', amount_total: 100000, currency: 'brl',
    client_reference_id: 'engreq_fixture', metadata: { ...metadata }, payment_intent: intent };
  const account = { id: 'acct_provider', country: 'BR', details_submitted: true, charges_enabled: true,
    payouts_enabled: true, capabilities: { card_payments: 'active', transfers: 'active' },
    requirements: { currently_due: [], past_due: [], pending_verification: [] } };
  const refunds = [];
  let event = { id: 'evt_fixture', livemode: false, type: 'checkout.session.completed', data: { object: { id: session.id } } };
  const stripe = {
    accounts: { retrieve: async (id) => { calls.push(['account.retrieve', id]); return account; } },
    checkout: { sessions: {
      create: async (body, requestOptions) => { calls.push(['session.create', body, requestOptions]); return session; },
      retrieve: async (id, requestOptions) => { calls.push(['session.retrieve', id, requestOptions]); return session; },
    } },
    paymentIntents: { retrieve: async (id) => { calls.push(['intent.retrieve', id]); return intent; } },
    charges: { retrieve: async (id) => { calls.push(['charge.retrieve', id]); return charge; } },
    disputes: { retrieve: async (id) => { calls.push(['dispute.retrieve', id]); return { id, livemode: false, charge: charge.id }; } },
    refunds: {
      list: async (params) => { calls.push(['refunds.list', params]); return { data: refunds, has_more: false }; },
      retrieve: async (id) => { calls.push(['refund.retrieve', id]); return refunds.find((refund) => refund.id === id); },
    },
    webhooks: { constructEvent: (body, signature, secret) => {
      calls.push(['verify', body, signature, secret]);
      if (signature !== 'valid-fixture-signature') throw new Error('Invalid signature');
      return event;
    } },
  };
  const adapter = createCheckoutAdapter({ stripe, mode: 'test', webhookSecret: 'whsec_fixture', paymentsEnabled: true, ...options });
  return { adapter, stripe, calls, q, session, intent, charge, account, refunds, setEvent: (next) => { event = next; } };
}

test('disabled payments and unaccepted or stale quotes cannot call Stripe', async () => {
  const disabled = harness({ paymentsEnabled: false });
  await assert.rejects(disabled.adapter.createCheckout(disabled.q), /disabled/);
  assert.deepEqual(disabled.calls, []);
  for (const key of ['customerAcceptedRevision', 'providerAcceptedRevision']) {
    const h = harness();
    h.q.request[key] = 1;
    await assert.rejects(h.adapter.createCheckout(h.q), /Both parties/);
    assert.deepEqual(h.calls, []);
  }
});

test('wrong buyer, decimal amounts, foreign currency and oversized fee cannot create checkout', async () => {
  const mutations = [
    (q) => { q.customerId = 'cus_other'; }, (q) => { q.request.amountCents = 1.1; },
    (q) => { q.request.currency = 'usd'; }, (q) => { q.feeCents = 100001; },
  ];
  for (const mutate of mutations) {
    const h = harness(); mutate(h.q);
    await assert.rejects(h.adapter.createCheckout(h.q));
    assert.deepEqual(h.calls, []);
  }
});

test('account country, KYC and payment capabilities are checked through Stripe before checkout', async () => {
  const changes = [
    { country: 'US' }, { payouts_enabled: false }, { details_submitted: false },
    { capabilities: { card_payments: 'active', transfers: 'pending' } },
    { requirements: { currently_due: ['individual.verification.document'] } },
  ];
  for (const change of changes) {
    const h = harness(); Object.assign(h.account, change);
    await assert.rejects(h.adapter.createCheckout(h.q));
    assert.equal(h.calls.some((call) => call[0] === 'session.create'), false);
  }
});

test('destination charge uses exact accepted cents, server fee, cards and a stable per-revision key', async () => {
  const h = harness();
  await h.adapter.createCheckout(h.q);
  await h.adapter.createCheckout(h.q);
  const calls = h.calls.filter((call) => call[0] === 'session.create');
  const body = calls[0][1];
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(body.line_items[0].price_data.unit_amount, 100000);
  assert.equal(body.payment_intent_data.application_fee_amount, 10000);
  assert.equal(body.payment_intent_data.transfer_data.destination, 'acct_provider');
  assert.equal(body.payment_intent_data.capture_method, 'automatic');
  assert.deepEqual(body.payment_method_types, ['card']);
  assert.deepEqual(body.adaptive_pricing, { enabled: false });
  assert.deepEqual(body.automatic_tax, { enabled: false });
  assert.equal(body.allow_promotion_codes, false);
  assert.equal(body.success_url, 'https://confenge.com.br/profissionais/?session_id={CHECKOUT_SESSION_ID}#contratacoes');
  assert.equal(body.cancel_url, 'https://confenge.com.br/profissionais/#contratacoes');
  assert.equal(body.metadata.request_id, 'engreq_fixture');
  assert.equal(calls[0][2].idempotencyKey, 'confenge-engineering-checkout:v1:engreq_fixture:2');
  assert.equal(body.customer, undefined); // Medusa customer IDs are not Stripe customer IDs.
});

test('checkout refuses a resource in the wrong mode and a foreign redirect URL', async () => {
  const h = harness(); h.session.livemode = true;
  await assert.rejects(h.adapter.createCheckout(h.q), /wrong payment mode/);
  h.session.livemode = false; h.session.url = 'https://checkout.stripe.com.evil.example/pay';
  await assert.rejects(h.adapter.createCheckout(h.q), /Unexpected Stripe/);
});

test('webhook passes the unchanged raw bytes to the SDK and rejects malformed input or signature', () => {
  const h = harness(); const raw = Buffer.from('{"id":"evt_fixture"}');
  h.adapter.verifyEvent(raw, 'valid-fixture-signature');
  assert.strictEqual(h.calls[0][1], raw);
  assert.throws(() => h.adapter.verifyEvent({ id: 'evt_fixture' }, 'valid-fixture-signature'), /raw body/);
  assert.throws(() => h.adapter.verifyEvent(raw, 'invalid'), /Invalid signature/);
});

test('the installed Stripe SDK validates a real HMAC signature and rejects tampered payloads', () => {
  const stripe = new Stripe('sk_test_fixture_not_a_credential');
  const secret = 'whsec_crypto_fixture_not_a_credential';
  const raw = JSON.stringify({ id: 'evt_crypto', object: 'event', livemode: false,
    type: 'checkout.session.completed', data: { object: { id: 'cs_test_fixture' } } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret });
  const adapter = createCheckoutAdapter({ stripe, mode: 'test', webhookSecret: secret, paymentsEnabled: false });
  assert.equal(adapter.verifyEvent(Buffer.from(raw), signature).id, 'evt_crypto');
  assert.throws(() => adapter.verifyEvent(`${raw} `, signature), /signature/i);
});

test('a paid redirect/session is not enough when the underlying payment is not captured', async () => {
  const h = harness(); h.intent.status = 'requires_capture';
  await assert.rejects(h.adapter.retrieveCheckout(h.session.id, h.q), /complete captured payment/);
});

test('server lookup verifies amount, revision, destination, commission, mode and charge ownership', async () => {
  const mutations = [
    (h) => { h.session.amount_total = 1; },
    (h) => { h.session.metadata.revision = '1'; },
    (h) => { h.intent.transfer_data.destination = 'acct_other'; },
    (h) => { h.intent.application_fee_amount = 0; },
    (h) => { h.intent.livemode = true; },
    (h) => { h.charge.payment_intent = 'pi_other'; },
    (h) => { h.charge.amount_captured = 99999; },
  ];
  for (const mutate of mutations) {
    const h = harness(); mutate(h);
    await assert.rejects(h.adapter.retrieveCheckout(h.session.id, h.q));
  }
});

test('valid payment facts distinguish charged, refunded and disputed money', async () => {
  const h = harness();
  assert.equal((await h.adapter.retrieveCheckout(h.session.id, h.q)).paid, true);
  h.charge.amount_refunded = 1000;
  h.refunds.push({ id: 're_fixture', charge: h.charge.id, amount: 1000, currency: 'brl', status: 'succeeded' });
  let facts = await h.adapter.retrieveCheckout(h.session.id, h.q);
  assert.equal(facts.paid, false);
  assert.equal(facts.paymentCaptured, true);
  assert.equal(facts.refundedAmountCents, 1000);
  assert.equal(facts.fullyRefunded, false);
  h.charge.amount_refunded = 100000;
  h.refunds[0].amount = 100000;
  assert.equal((await h.adapter.retrieveCheckout(h.session.id, h.q)).fullyRefunded, true);
  h.charge.amount_refunded = 0; h.refunds.length = 0; h.charge.disputed = true;
  facts = await h.adapter.retrieveCheckout(h.session.id, h.q);
  assert.equal(facts.paid, false);
  assert.equal(facts.disputed, true);
});

test('an unpaid checkout without a payment intent is a pending fact, not payment success', async () => {
  const h = harness(); h.session.status = 'open'; h.session.payment_status = 'unpaid'; h.session.payment_intent = null;
  const facts = await h.adapter.retrieveCheckout(h.session.id, h.q);
  assert.equal(facts.paid, false);
  assert.equal(facts.paymentIntentId, null);
});

test('only a verified event can trigger authoritative identity lookup', async () => {
  const h = harness();
  await assert.rejects(h.adapter.readPaymentEvent({ type: 'checkout.session.completed' }), /verified first/);
  const evt = h.adapter.verifyEvent('{}', 'valid-fixture-signature');
  const identity = await h.adapter.readPaymentEvent(evt);
  assert.equal(identity.requestId, 'engreq_fixture');
  assert.equal(identity.revision, 2);
  assert.equal(identity.sessionId, 'cs_test_fixture');
  assert.equal(h.calls.some((call) => call[0] === 'session.retrieve'), true);
});

test('refund and dispute events resolve their request via authenticated charge and intent reads', async () => {
  for (const type of ['charge.refunded', 'charge.dispute.created', 'refund.created', 'refund.updated', 'refund.failed']) {
    const h = harness();
    h.refunds.push({ id: 're_fixture', charge: h.charge.id, amount: 1000, currency: 'brl', status: 'pending' });
    h.setEvent({ id: 'evt_money', livemode: false, type, data: { object: {
      id: type.startsWith('refund.') ? 're_fixture' : type === 'charge.refunded' ? 'ch_fixture' : 'dp_fixture',
    } } });
    const evt = h.adapter.verifyEvent('{}', 'valid-fixture-signature');
    const identity = await h.adapter.readPaymentEvent(evt);
    assert.equal(identity.requestId, 'engreq_fixture');
    assert.equal(identity.paymentIntentId, 'pi_fixture');
    assert.equal(identity.chargeId, 'ch_fixture');
    assert.equal(h.calls.some((call) => call[0] === 'charge.retrieve'), true);
    assert.equal(h.calls.some((call) => call[0] === 'intent.retrieve'), true);
  }
});

test('a full refund requested or failed is never reported as a successful full refund', async () => {
  const h = harness();
  h.charge.amount_refunded = 100000;
  h.refunds.push({ id: 're_fixture', charge: h.charge.id, amount: 100000, currency: 'brl', status: 'pending' });
  let facts = await h.adapter.retrieveCheckout(h.session.id, h.q);
  assert.equal(facts.fullyRefunded, false);
  assert.equal(facts.refundedAmountCents, 0);
  assert.equal(facts.refundPendingAmountCents, 100000);
  assert.equal(facts.paid, false);
  h.refunds[0].status = 'failed'; h.charge.amount_refunded = 0;
  facts = await h.adapter.retrieveCheckout(h.session.id, h.q);
  assert.equal(facts.fullyRefunded, false);
  assert.equal(facts.refundFailedAmountCents, 100000);
  assert.equal(facts.paid, false);
});

test('refund reconciliation follows all pages and refuses a foreign charge', async () => {
  const h = harness();
  h.stripe.refunds.list = async (params) => ({
    data: [{ id: params.starting_after ? 're_second' : 're_first', charge: h.charge.id,
      amount: 50000, currency: 'brl', status: 'succeeded' }],
    has_more: !params.starting_after,
  });
  assert.equal((await h.adapter.retrieveCheckout(h.session.id, h.q)).fullyRefunded, true);
  h.stripe.refunds.list = async () => ({ data: [{ id: 're_foreign', charge: 'ch_other', amount: 100000,
    currency: 'brl', status: 'succeeded' }], has_more: false });
  await assert.rejects(h.adapter.retrieveCheckout(h.session.id, h.q), /does not match/);
});

test('other platform products and connected-account events cannot update engineering requests', async () => {
  const h = harness(); h.session.metadata.flow = 'another_product';
  let event = h.adapter.verifyEvent('{}', 'valid-fixture-signature');
  assert.equal(await h.adapter.readPaymentEvent(event), null);
  h.setEvent({ id: 'evt_connected', livemode: false, account: 'acct_other', type: 'charge.refunded', data: { object: { id: 'ch_fixture' } } });
  event = h.adapter.verifyEvent('{}', 'valid-fixture-signature');
  assert.equal(await h.adapter.readPaymentEvent(event), null);
});
