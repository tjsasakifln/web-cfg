'use strict';

const { randomUUID } = require('node:crypto');
const { check, sha, accountId, orderId, publicSupplier, productReady } = require('./policy.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const ORIGIN = 'CONFENGE_WEB';
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const day = value => {
  const parts = Object.fromEntries(calendar.formatToParts(value).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const providerIdValid = id => typeof id === 'string' && /^ORD[A-Z0-9]{8,70}$/.test(id);
const publicOrder = o => ({ id: o.id, productId: o.product.id, productVersion: o.product.version,
  title: o.product.title, amountCents: o.amountCents, currency: o.currency, status: o.status,
  createdAt: o.createdAt, termsAcceptedAt: o.termsAcceptedAt, paidAt: o.paidAt || null, refundedAt: o.refundedAt || null,
  termsVersion: o.product.terms.version, termsHash: o.product.terms.sha256,
  terms: { version: o.product.terms.version, sha256: o.product.terms.sha256,
    url: o.product.terms.url, text: o.product.terms.text,
    ...(o.product.terms.supplier ? { supplier: publicSupplier(o.product.terms.supplier) } : {}) }, requests: o.requests || [],
  deliveryAvailable: o.status === 'paid', deliveryVersion: o.product.version,
  ...(o.status === 'pending' ? { payment: o.payment || {} } : {}),
  ...(o.status === 'review' ? { message: 'O pagamento está em conferência. Consulte este pedido antes de tentar novamente.' } : {}) });

function createLedger({ db, mode, clock = Date.now }) {
  const root = db.collection('projectCommerce').doc(`v1-${mode}`);
  const ref = (type, id) => root.collection(type).doc(id);
  const get = async (tx, doc) => (await tx.get(doc)).data();
  const event = (tx, order, key, type, detail = {}) => tx.create(ref('orders', order.id).collection('events').doc(key),
    { source: ORIGIN, type, at: clock(), productId: order.product.id, productVersion: order.product.version,
      orderId: order.id, ...detail });
  const own = (o, uid) => { check(o?.accountId === accountId(uid), 'ORDER_NOT_FOUND', 404); return o; };

  async function startOrder({ uid, email, requestId, product, catalogVersion, termsVersion, termsHash, acceptedTerms }) {
    const id = orderId(uid, requestId);
    const buyer = accountId(uid);
    const now = clock();
    return db.runTransaction(async tx => {
      const existing = await get(tx, ref('orders', id));
      if (existing) {
        check(existing.accountId === buyer && existing.product.id === product.id &&
          existing.product.version === product.version && existing.product.terms.version === termsVersion &&
          existing.product.terms.sha256 === termsHash && acceptedTerms === true, 'REQUEST_CONFLICT', 409);
        return { created: false, order: existing };
      }
      check(productReady(product), 'PROJECT_UNAVAILABLE', 409);
      check(acceptedTerms === true && termsVersion === product.terms.version && termsHash === product.terms.sha256,
        'PROJECT_TERMS_REQUIRED', 422);
      const accountRef = ref('accounts', buyer);
      const account = await get(tx, accountRef) || { recentOrderIds: [], orderDay: '', orderCount: 0 };
      const count = account.orderDay === day(now) ? account.orderCount : 0;
      check(count < 5, 'ORDER_LIMIT', 429);
      const order = { id, accountId: buyer, contactEmail: email, source: ORIGIN, kind: 'project_license', catalogVersion,
        product: clone(product), amountCents: product.amountCents, currency: 'BRL', termsAcceptedAt: now,
        createdAt: now, status: 'creating', providerId: null, provider: 'mercado_pago',
        nextPollAt: 0, accessCount: 0 };
      tx.create(ref('orders', id), order);
      tx.set(accountRef, { firebaseUid: uid, contactEmail: email, orderDay: day(now), orderCount: count + 1,
        recentOrderIds: [id, ...account.recentOrderIds.filter(v => v !== id)].slice(0, 50) });
      event(tx, order, 'created', 'project_checkout_started');
      return { created: true, order };
    });
  }

  async function owned(uid, id) { return own((await ref('orders', id).get()).data(), uid); }
  async function previous(uid, input) {
    const old = (await ref('orders', orderId(uid, input.requestId)).get()).data();
    if (!old) return null;
    own(old, uid);
    check(old.product.id === input.productId && old.product.version === input.productVersion &&
      old.product.terms.version === input.termsVersion && old.product.terms.sha256 === input.termsHash &&
      input.acceptedTerms === true, 'REQUEST_CONFLICT', 409);
    return old;
  }
  async function recent(uid) {
    const account = (await ref('accounts', accountId(uid)).get()).data();
    return Promise.all((account?.recentOrderIds || []).map(async id => publicOrder(await owned(uid, id))));
  }
  async function shouldPoll(uid, id) {
    return db.runTransaction(async tx => {
      const order = own(await get(tx, ref('orders', id)), uid);
      const recover = !order.providerId && (order.status === 'review' && order.reason === 'creation_uncertain' ||
        order.status === 'creating' && clock() - order.createdAt >= 60_000);
      if (order.nextPollAt > clock() || (!recover && !['pending', 'paid', 'review'].includes(order.status))) return { order, poll: false };
      tx.update(ref('orders', id), { nextPollAt: clock() + 10_000 });
      return { order, poll: true };
    });
  }
  async function uncertain(id) {
    return db.runTransaction(async tx => {
      const order = await get(tx, ref('orders', id));
      if (order.status !== 'creating') return order;
      const next = { ...order, status: 'review', reason: 'creation_uncertain', updatedAt: clock() };
      tx.set(ref('orders', id), next);
      event(tx, next, 'creation-uncertain', 'project_creation_uncertain');
      return next;
    });
  }

  async function observe(fact, { creation = false } = {}) {
    check(providerIdValid(fact?.providerId) && typeof fact.reference === 'string' &&
      Number.isSafeInteger(fact.amountCents) && fact.amountCents > 0 && fact.currency === 'BRL' &&
      ['pending', 'paid', 'reversed', 'failed', 'review'].includes(fact.state), 'PAYMENT_MISMATCH', 422);
    if (fact.refundAmountKnown === true) check(Number.isSafeInteger(fact.refundedAmountCents) &&
      fact.refundedAmountCents >= 0 && fact.refundedAmountCents <= fact.amountCents, 'PAYMENT_MISMATCH', 422);
    return db.runTransaction(async tx => {
      const orderRef = ref('orders', fact.reference);
      const old = await get(tx, orderRef);
      if (!old) return null;
      check(old.amountCents === fact.amountCents && old.currency === fact.currency &&
        (fact.paymentFlow || 'pix') === 'pix' && (!old.providerId || old.providerId === fact.providerId), 'PAYMENT_MISMATCH', 422);
      const bindingRef = ref('providerOrders', sha(fact.providerId));
      const binding = await get(tx, bindingRef);
      check(!binding || binding.orderId === old.id, 'PAYMENT_MISMATCH', 422);
      if (old.status === 'refunded' && !(old.refundAmountKnown === false && fact.state === 'reversed')) return old;
      // A webhook GET may finish before the create-order POST returns. Never
      // demote or freeze that already reconciled state using the POST response.
      if (creation && old.providerId && old.status !== 'creating') return old;
      const stale = old.providerUpdatedAt && fact.providerUpdatedAt && fact.providerUpdatedAt < old.providerUpdatedAt;
      if (stale && !(old.paidAt && fact.state !== 'paid')) return old;
      let state = fact.state === 'reversed' ? 'refunded' : fact.state;
      if (state === 'failed' && ['cancelled', 'canceled', 'expired'].includes(fact.providerStatus)) state = 'cancelled';
      // POST response never releases files. Only a verified provider GET does.
      if (creation && ['paid', 'refunded'].includes(state)) state = 'pending';
      if (old.paidAt && ['pending', 'failed', 'cancelled'].includes(state)) state = 'review';
      if (old.hold && state === 'paid') state = 'review';
      if (stale && old.paidAt && state !== 'refunded') state = 'review';
      if (old.providerUpdatedAt && fact.providerUpdatedAt === old.providerUpdatedAt &&
          !creation && state !== 'refunded' && old.status !== 'creating' && old.status !== state && old.status !== 'pending') state = 'review';
      const now = clock();
      const next = { ...old, status: state, providerId: fact.providerId, updatedAt: now, observedAt: now };
      delete next.reason;
      if (Number.isFinite(fact.providerUpdatedAt)) next.providerUpdatedAt = Math.max(old.providerUpdatedAt || 0, fact.providerUpdatedAt);
      if (state === 'review' && old.paidAt) next.hold = true;
      if (state === 'paid') next.paidAt ||= now;
      if (state === 'refunded') next.refundedAt ||= now;
      if (state === 'cancelled') next.cancelledAt ||= now;
      if (state === 'pending') {
        next.payment = { ...(old.payment || {}) };
        for (const key of ['qrCode', 'qrImage', 'checkoutUrl', 'expiresAt']) if (fact[key] != null) next.payment[key] = fact[key];
      } else delete next.payment;
      if (!creation) {
        const previousRefund = old.refundedAmountCents || 0;
        const cumulativeRefund = state === 'refunded' ? old.amountCents :
          fact.refundAmountKnown === true ? fact.refundedAmountCents : undefined;
        const uncertainRefund = state !== 'refunded' && (fact.refundAmountKnown === false ||
          cumulativeRefund !== undefined && cumulativeRefund < previousRefund);
        if (uncertainRefund) {
          next.refundAmountKnown = false;
          if (old.refundAmountKnown !== false) tx.set(ref('refundReviews', old.id),
            { orderId: old.id, at: now, status: 'open', knownRefundedAmountCents: previousRefund });
        } else if (cumulativeRefund !== undefined) {
          next.refundAmountKnown = true;
          next.refundedAmountCents = cumulativeRefund;
          if (old.refundAmountKnown === false) tx.set(ref('refundReviews', old.id), { orderId: old.id, at: now, status: 'resolved' });
          if (cumulativeRefund > previousRefund) {
            const key = sha(`refund\0${old.id}\0${cumulativeRefund}`);
            tx.create(ref('refundAmounts', key), { orderId: old.id, at: now, amountCents: cumulativeRefund - previousRefund,
              cumulativeAmountCents: cumulativeRefund, currency: 'BRL', productId: old.product.id });
            event(tx, next, `refund-amount-${key}`, 'project_refund_amount_confirmed',
              { amountCents: cumulativeRefund - previousRefund, cumulativeAmountCents: cumulativeRefund, currency: 'BRL' });
          }
        }
      }
      if (!binding) tx.create(bindingRef, { orderId: old.id });
      tx.set(orderRef, next);
      if (old.status !== next.status) {
        const seq = (old.transitionCount || 0) + 1;
        tx.update(orderRef, { transitionCount: seq });
        event(tx, next, `state-${seq}`, state === 'paid' ? 'project_payment_confirmed' :
          state === 'refunded' ? 'project_refund_confirmed' : 'project_payment_state',
        { status: state, amountCents: old.amountCents, currency: 'BRL' });
      }
      return next;
    });
  }

  async function authorizeAccess(uid, id) {
    return db.runTransaction(async tx => {
      const order = own(await get(tx, ref('orders', id)), uid);
      check(order.status === 'paid' && !order.hold, 'PAYMENT_NOT_CONFIRMED', 403);
      const now = clock();
      const accessId = randomUUID();
      tx.update(ref('orders', id), { accessCount: (order.accessCount || 0) + 1, lastAccessAt: now });
      event(tx, order, `access-${accessId}`, 'project_delivery_access_authorized', { fileSha256: order.product.delivery.sha256 });
      tx.create(ref('accesses', accessId), { at: now, orderId: order.id, productId: order.product.id,
        productVersion: order.product.version, fileSha256: order.product.delivery.sha256 });
      return { order, accessId, at: now };
    });
  }
  async function support(uid, input, email) {
    const receiptId = sha(`project-support\0${accountId(uid)}\0${input.requestId.toLowerCase()}`);
    const requestRef = ref('requests', receiptId);
    const materialHash = sha(JSON.stringify([input.orderId, input.kind, input.message]));
    return db.runTransaction(async tx => {
      const old = await get(tx, requestRef);
      const order = own(await get(tx, ref('orders', input.orderId)), uid);
      if (old) {
        check(old.accountId === accountId(uid) && old.materialHash === materialHash, 'REQUEST_CONFLICT', 409);
        return { created: false, receipt: { ok: true, receiptId, createdAt: old.createdAt, status: old.status } };
      }
      check((order.requests || []).length < 20, 'SUPPORT_LIMIT', 429);
      const createdAt = clock();
      const summary = { receiptId, kind: input.kind, createdAt, status: 'received' };
      tx.create(requestRef, { ...summary, accountId: order.accountId, orderId: order.id, contactEmail: email,
        message: input.message, materialHash, source: ORIGIN });
      tx.update(ref('orders', order.id), { requests: [...(order.requests || []), summary] });
      event(tx, order, `request-${receiptId}`, 'project_support_received', { kind: input.kind, receiptId });
      return { created: true, receipt: { ok: true, receiptId, createdAt, status: 'received' } };
    });
  }
  return { startOrder, previous, owned, recent, shouldPoll, uncertain, observe, authorizeAccess, support, root, ref };
}

module.exports = { createLedger, publicOrder, providerIdValid };
