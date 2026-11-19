'use strict';

const FLOW = 'confenge_engineering_v1';
const SUPPORTED_EVENTS = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'refund.created', 'refund.updated', 'refund.failed',
]);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function identifier(value, name) {
  check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value), `Invalid ${name}`);
  return value;
}

function cents(value, name, { zero = false } = {}) {
  check(Number.isSafeInteger(value) && value >= (zero ? 0 : 1) && value <= 99_999_999,
    `Invalid ${name}; use integer BRL centavos`);
  return value;
}

function quote(input) {
  const request = input?.request;
  check(request && typeof request === 'object', 'Missing immutable engineering quote');
  const id = identifier(request.id, 'request id');
  check(Number.isSafeInteger(request.revision) && request.revision > 0, 'Invalid quote revision');
  const revision = request.revision;
  check(request.customerAcceptedRevision === revision && request.providerAcceptedRevision === revision,
    'Both parties must accept the current quote before checkout');
  const customerId = identifier(input.customerId, 'customer id');
  check(request.customerId === customerId, 'Checkout customer does not own the engineering request');
  const sellerId = identifier(request.sellerId, 'seller id');
  const accountId = identifier(input.accountId, 'Stripe account id');
  check(accountId.startsWith('acct_'), 'Invalid Stripe connected account');
  const amountCents = cents(request.amountCents, 'quote amount');
  const feeCents = cents(input.feeCents, 'platform fee', { zero: true });
  check(feeCents <= amountCents, 'Platform fee cannot exceed the quote amount');
  check(request.currency === 'brl', 'Engineering checkout supports BRL only');
  check(typeof request.title === 'string' && request.title.trim().length > 0, 'Missing quote title');
  return Object.freeze({ id, revision, customerId, sellerId, accountId, amountCents,
    feeCents, currency: 'brl', title: request.title.trim().slice(0, 200) });
}

function metadataFor(q) {
  return {
    flow: FLOW,
    request_id: q.id,
    revision: String(q.revision),
    customer_id: q.customerId,
    seller_id: q.sellerId,
    connected_account: q.accountId,
    amount_cents: String(q.amountCents),
    fee_cents: String(q.feeCents),
    currency: q.currency,
  };
}

function identityFromMetadata(metadata) {
  check(metadata?.flow === FLOW, 'Unrecognized engineering payment');
  const revision = Number(metadata.revision);
  check(Number.isSafeInteger(revision) && revision > 0 && String(revision) === metadata.revision,
    'Invalid engineering payment revision');
  return {
    requestId: identifier(metadata.request_id, 'payment request id'),
    revision,
    customerId: identifier(metadata.customer_id, 'payment customer id'),
    sellerId: identifier(metadata.seller_id, 'payment seller id'),
  };
}

function assertMetadata(actual, expected) {
  for (const [key, value] of Object.entries(metadataFor(expected))) {
    check(actual?.[key] === value, `Engineering payment metadata mismatch: ${key}`);
  }
}

function canonicalBase(value, mode) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid marketplace public URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  check(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/' &&
    ((url.hostname === 'confenge.com.br' && url.protocol === 'https:' && !url.port) ||
      (mode === 'test' && local && ['http:', 'https:'].includes(url.protocol))),
  'Marketplace returns must use the CONFENGE origin (localhost only in test mode)');
  return url.origin;
}

/**
 * Stripe is injected so tests exercise the actual requests without charging.
 * Inputs MUST come from the authenticated server's immutable accepted quote.
 * The server must persist/reuse sessionId; Stripe's idempotency retention alone
 * is not a permanent uniqueness constraint for a quote.
 */
function createCheckoutAdapter({ stripe, mode, webhookSecret, paymentsEnabled = false,
  publicBaseUrl = 'https://confenge.com.br' }) {
  check(['test', 'live'].includes(mode), 'Invalid Stripe payment mode');
  check(stripe && typeof stripe === 'object', 'Stripe client is required');
  check(typeof webhookSecret === 'string' && /^whsec_.+/.test(webhookSecret), 'Stripe webhook secret is required');
  check(typeof paymentsEnabled === 'boolean', 'paymentsEnabled must be a boolean');
  const origin = canonicalBase(publicBaseUrl, mode);
  const live = mode === 'live';
  const verifiedEvents = new WeakSet();
  const assertMode = (object) => check(object?.livemode === live, 'Stripe resource belongs to the wrong payment mode');

  async function createCheckout(input) {
    check(paymentsEnabled, 'Marketplace payments are disabled');
    const q = quote(input);
    const account = await stripe.accounts.retrieve(q.accountId);
    check(account.id === q.accountId && account.country === 'BR', 'Connected account must belong to the Brazilian provider');
    check(account.details_submitted === true && account.charges_enabled === true && account.payouts_enabled === true &&
      account.capabilities?.card_payments === 'active' && account.capabilities?.transfers === 'active',
    'Connected account is not ready to receive marketplace payments');
    check(!account.requirements?.disabled_reason &&
      ['currently_due', 'past_due', 'pending_verification'].every((key) => !account.requirements?.[key]?.length),
    'Connected account has unresolved verification requirements');
    const metadata = metadataFor(q);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      // An account-level Adaptive Pricing setting must not change the
      // currency or amount of an already accepted engineering quote.
      adaptive_pricing: { enabled: false },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      locale: 'pt-BR',
      client_reference_id: q.id,
      line_items: [{
        price_data: { currency: q.currency, unit_amount: q.amountCents, product_data: { name: q.title } },
        quantity: 1,
      }],
      metadata,
      payment_intent_data: {
        capture_method: 'automatic',
        application_fee_amount: q.feeCents,
        transfer_data: { destination: q.accountId },
        metadata,
      },
      success_url: `${origin}/profissionais/?session_id={CHECKOUT_SESSION_ID}#contratacoes`,
      cancel_url: `${origin}/profissionais/#contratacoes`,
    }, {
      idempotencyKey: `confenge-engineering-checkout:v1:${q.id}:${q.revision}`,
    });
    assertMode(session);
    identifier(session.id, 'checkout session id');
    let redirect;
    try { redirect = new URL(session.url); } catch { throw new Error('Stripe did not return a checkout URL'); }
    check(redirect.protocol === 'https:' && redirect.hostname === 'checkout.stripe.com' &&
      !redirect.username && !redirect.password, 'Unexpected Stripe checkout URL');
    return Object.freeze({ sessionId: session.id, url: session.url, expiresAt: session.expires_at ?? null,
      requestId: q.id, revision: q.revision });
  }

  function verifyEvent(rawBody, signature) {
    check(typeof rawBody === 'string' || Buffer.isBuffer(rawBody), 'Stripe signature requires the original raw body');
    check(typeof signature === 'string' && signature.length > 0, 'Missing Stripe webhook signature');
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    assertMode(event);
    verifiedEvents.add(event);
    return event;
  }

  async function paymentIntent(value) {
    if (value && typeof value === 'object') return value;
    if (typeof value === 'string' && value.startsWith('pi_')) {
      return stripe.paymentIntents.retrieve(value, { expand: ['latest_charge'] });
    }
    return null;
  }

  async function chargeObject(value) {
    if (value && typeof value === 'object') return value;
    if (typeof value === 'string' && value.startsWith('ch_')) return stripe.charges.retrieve(value);
    return null;
  }

  // A refund request can remain pending or fail after being created. The
  // charge aggregate alone cannot establish that each refund succeeded.
  async function refundFacts(charge) {
    const totals = { refundedAmountCents: 0, refundPendingAmountCents: 0, refundFailedAmountCents: 0 };
    if (!charge) return totals;
    const seen = new Set();
    let startingAfter;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const page = await stripe.refunds.list({ charge: charge.id, limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}) });
      check(Array.isArray(page.data), 'Invalid refund list');
      for (const refund of page.data) {
        identifier(refund.id, 'refund id');
        if (seen.has(refund.id)) continue;
        seen.add(refund.id);
        const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id;
        check(chargeId === charge.id && refund.currency === charge.currency &&
          Number.isSafeInteger(refund.amount) && refund.amount > 0 && refund.amount <= charge.amount,
        'Refund does not match the engineering charge');
        if (refund.status === 'succeeded') totals.refundedAmountCents += refund.amount;
        else if (['pending', 'requires_action', null].includes(refund.status)) totals.refundPendingAmountCents += refund.amount;
        else if (['failed', 'canceled'].includes(refund.status)) totals.refundFailedAmountCents += refund.amount;
        else throw new Error('Unknown refund state requires reconciliation');
      }
      check(totals.refundedAmountCents + totals.refundPendingAmountCents <= charge.amount,
        'Refund totals exceed the engineering charge');
      if (!page.has_more) return totals;
      const next = page.data.at(-1)?.id;
      check(next && next !== startingAfter, 'Invalid refund pagination');
      startingAfter = next;
    }
    throw new Error('Too many refund records to reconcile automatically');
  }

  async function retrieveCheckout(sessionId, expected) {
    identifier(sessionId, 'checkout session id');
    const q = quote(expected);
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.latest_charge'] });
    assertMode(session);
    check(session.id === sessionId && session.mode === 'payment', 'Unexpected checkout session');
    check(session.client_reference_id === q.id, 'Checkout request mismatch');
    assertMetadata(session.metadata, q);
    check(session.amount_total === q.amountCents && session.currency === q.currency, 'Checkout amount or currency mismatch');
    const intent = await paymentIntent(session.payment_intent);
    let charge = null;
    if (intent) {
      assertMode(intent);
      assertMetadata(intent.metadata, q);
      const destination = typeof intent.transfer_data?.destination === 'string'
        ? intent.transfer_data.destination : intent.transfer_data?.destination?.id;
      check(intent.amount === q.amountCents && intent.currency === q.currency &&
        intent.application_fee_amount === q.feeCents && destination === q.accountId,
      'Payment amount, commission or connected account mismatch');
      charge = await chargeObject(intent.latest_charge);
      if (charge) {
        assertMode(charge);
        const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        check(intentId === intent.id && charge.amount === q.amountCents && charge.currency === q.currency,
          'Charge does not match the engineering payment');
      }
    }
    const claimedPaid = session.status === 'complete' && session.payment_status === 'paid';
    if (claimedPaid) {
      check(intent?.status === 'succeeded' && intent.amount_received === q.amountCents &&
        charge?.paid === true && charge.captured === true && charge.amount_captured === q.amountCents,
      'Checkout is not backed by a complete captured payment');
    }
    const { refundedAmountCents, refundPendingAmountCents, refundFailedAmountCents } = await refundFacts(charge);
    const disputed = charge?.disputed === true;
    return Object.freeze({
      requestId: q.id, revision: q.revision, sessionId: session.id,
      customerId: q.customerId, sellerId: q.sellerId, accountId: q.accountId,
      amountCents: q.amountCents, feeCents: q.feeCents, currency: q.currency,
      paymentIntentId: intent?.id ?? null, chargeId: charge?.id ?? null,
      paymentStatus: session.payment_status, sessionStatus: session.status,
      paid: claimedPaid && refundedAmountCents === 0 && refundPendingAmountCents === 0 &&
        refundFailedAmountCents === 0 && !disputed,
      paymentCaptured: claimedPaid,
      refundedAmountCents,
      refundPendingAmountCents,
      refundFailedAmountCents,
      fullyRefunded: refundedAmountCents === q.amountCents,
      disputed,
      mode,
    });
  }

  // Resolve identity from authenticated Stripe reads. The caller then loads
  // its own request and calls retrieveCheckout against its saved immutable quote.
  async function readPaymentEvent(event) {
    check(verifiedEvents.has(event), 'Payment event must be signature-verified first');
    if (!SUPPORTED_EVENTS.has(event.type)) return null;
    if (event.account) return null;
    if (event.type.startsWith('checkout.session.')) {
      const session = await stripe.checkout.sessions.retrieve(identifier(event.data?.object?.id, 'event session id'));
      assertMode(session);
      if (session.metadata?.flow !== FLOW) return null;
      return { ...identityFromMetadata(session.metadata), sessionId: session.id,
        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
        eventId: event.id, eventType: event.type };
    }
    let charge;
    if (event.type.startsWith('refund.')) {
      const refund = await stripe.refunds.retrieve(identifier(event.data?.object?.id, 'event refund id'));
      charge = await chargeObject(refund.charge);
    } else if (event.type === 'charge.refunded') {
      charge = await stripe.charges.retrieve(identifier(event.data?.object?.id, 'event charge id'));
    } else {
      const dispute = await stripe.disputes.retrieve(identifier(event.data?.object?.id, 'event dispute id'));
      assertMode(dispute);
      charge = await chargeObject(dispute.charge);
    }
    check(charge, 'Unable to resolve charge for payment event');
    assertMode(charge);
    const intent = await paymentIntent(charge.payment_intent);
    if (!intent) return null;
    assertMode(intent);
    if (intent.metadata?.flow !== FLOW) return null;
    return { ...identityFromMetadata(intent.metadata), paymentIntentId: intent.id,
      chargeId: charge.id, eventId: event.id, eventType: event.type };
  }

  return Object.freeze({ createCheckout, verifyEvent, retrieveCheckout, readPaymentEvent });
}

module.exports = { createCheckoutAdapter, FLOW, SUPPORTED_EVENTS };
