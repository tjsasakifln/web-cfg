'use strict';

const { HostFileBackend, canonicalJson } = require('../../netlify/functions/lib/host-file-store.cjs');
const { randomUUID } = require('node:crypto');
const { check, sha, sameSecret, termsFor } = require('./service-policy.cjs');

const providerIdValid = id => typeof id === 'string' && /^ORD[A-Z0-9]{8,70}$/.test(id);
const clone = value => JSON.parse(JSON.stringify(value));
function publicServiceOrder(order) {
  return { id: order.id, status: order.status, items: order.quote.items, amountCents: order.quote.amountCents,
    currency: 'BRL', areaM2: order.quote.areaM2, deadlineDays: order.quote.deadlineDays,
    createdAt: order.createdAt, paidAt: order.paidAt || null, refundedAt: order.refundedAt || null,
    pricingVersion: order.quote.pricingVersion, termsVersion: order.terms.version, termsHash: order.terms.sha256,
    quoteHash: order.quote.quoteHash,
    terms: order.terms, requests: order.requests || [],
    ...(order.status === 'pending' && !order.hold && order.checkoutUrl ? { checkoutUrl: order.checkoutUrl } : {}),
    message: order.status === 'paid' ? 'Pagamento confirmado. A equipe confere os dados e informa os documentos necessários para iniciar o prazo contratado.' :
      order.status === 'refunded' ? 'Devolução integral confirmada pelo Mercado Pago.' :
        order.status === 'review' || order.status === 'creating' ? 'Estamos conferindo este pedido. Consulte novamente antes de tentar outra compra.' :
          order.status === 'failed' ? 'Esta tentativa não foi concluída. Você pode tentar contratar novamente.' :
            'Pedido registrado. O pagamento ainda precisa ser confirmado pelo Mercado Pago.' };
}

function createServiceLedger({ storageRoot, mode, clock = Date.now, backend: injected } = {}) {
  const backend = injected || new HostFileBackend(storageRoot);
  const orders = backend.namespace(`project-services-${mode}`);
  const rate = backend.namespace(`project-service-rate-${mode}`);
  const own = (id, receiptHash) => {
    const order = orders.get(id);
    check(order && sameSecret(order.receiptHash, receiptHash), 'ORDER_NOT_FOUND', 404);
    return order;
  };
  function previous({ input, receiptHash, requestHash }) {
    const existing = orders.get(input.requestId);
    if (!existing) return null;
    check(sameSecret(existing.receiptHash, receiptHash), 'ORDER_NOT_FOUND', 404);
    check(existing.requestHash === requestHash, 'REQUEST_CONFLICT', 409);
    return existing;
  }
  function start({ input, receiptHash, requestHash, quote, offer, ip }) {
    return backend.withExclusiveLock(() => {
      const old = previous({ input, receiptHash, requestHash });
      if (old) return { created: false, order: old };
      const now = clock();
      const day = new Date(now).toISOString().slice(0, 10);
      const buckets = [
        { key: `buyer-${sha(input.email)}-${day}`, limit: 5 },
        { key: `origin-${sha(ip || 'unknown')}-${day}`, limit: 30 }
      ];
      for (const b of buckets) check((rate.get(b.key)?.count || 0) < b.limit, 'TOO_MANY_REQUESTS', 429);
      const order = { schema: 'confenge.project-service-order/1', id: input.requestId, receiptHash, requestHash,
        source: 'CONFENGE_WEB', kind: 'residential_project_service', mode, createdAt: now, updatedAt: now,
        attribution: { page_path: '/projetos-prontos/', route_family: 'ready_projects',
          intent_family: 'projetar_revisar_compatibilizar', canonical_service_family: 'engineering_projects_coordination',
          nucleus_id: 'building_engineering_documentation' },
        customer: { name: input.name, email: input.email, phone: input.phone, city: input.city, state: input.state,
          reference: input.reference }, quote: clone(quote), terms: termsFor(offer), supplier: clone(offer.supplier),
        acceptedTermsAt: now, privacyConsentAt: now, status: 'creating', provider: 'mercado_pago', providerId: null,
        nextPollAt: now + 60_000, requests: [], events: [{ type: 'checkout_started', at: now }],
        nextAction: 'Confirmar pagamento, conferir escopo e solicitar documentação no atendimento comercial.' };
      orders._putUnlocked(order.id, order, { onlyIfNew: true });
      for (const b of buckets) rate._putUnlocked(b.key, { count: (rate.get(b.key)?.count || 0) + 1, day });
      // A read-back is part of returning a receipt. A storage failure never
      // falls through to the payment provider or a false "received" response.
      const saved = orders.get(order.id);
      check(saved?.requestHash === requestHash, 'PAYMENT_UNAVAILABLE', 503);
      return { created: true, order: saved };
    });
  }
  function uncertain(id) {
    return backend.withExclusiveLock(() => {
      const old = orders.get(id);
      check(old, 'ORDER_NOT_FOUND', 404);
      if (old.status !== 'creating') return old;
      const next = { ...old, status: 'review', reason: 'creation_uncertain', updatedAt: clock(), nextPollAt: clock() + 10_000,
        events: [...old.events, { type: 'creation_uncertain', at: clock() }] };
      orders._putUnlocked(id, next);
      return next;
    });
  }
  function rejected(id) {
    return backend.withExclusiveLock(() => {
      const old = orders.get(id);
      check(old, 'ORDER_NOT_FOUND', 404);
      // A verified webhook may already have bound or paid this order. A
      // creation refusal can close only a still-unbound creating attempt.
      if (old.status !== 'creating' || old.providerId || old.paidAt) return old;
      const now = clock();
      const next = { ...old, status: 'failed', reason: 'creation_rejected', updatedAt: now,
        events: [...old.events, { type: 'checkout_creation_rejected', at: now }] };
      orders._putUnlocked(id, next);
      return next;
    });
  }
  function shouldPoll(id, receiptHash) {
    return backend.withExclusiveLock(() => {
      const order = own(id, receiptHash);
      if (order.nextPollAt > clock() || ['refunded'].includes(order.status) ||
          order.status === 'failed' && order.reason === 'creation_rejected' && !order.providerId) return { order, poll: false };
      const next = { ...order, nextPollAt: clock() + 15_000 };
      orders._putUnlocked(id, next);
      return { order: next, poll: true };
    });
  }
  function observe(fact, { creation = false } = {}) {
    check(providerIdValid(fact?.providerId) && typeof fact.reference === 'string' &&
      Number.isSafeInteger(fact.amountCents) && fact.amountCents > 0 && fact.currency === 'BRL' &&
      fact.paymentFlow === 'checkout' && ['pending', 'paid', 'reversed', 'failed', 'review'].includes(fact.state),
    'PAYMENT_MISMATCH', 422);
    return backend.withExclusiveLock(() => {
      const old = orders.get(fact.reference);
      if (!old) return null;
      check(old.quote.amountCents === fact.amountCents && (!old.providerId || old.providerId === fact.providerId),
        'PAYMENT_MISMATCH', 422);
      // A webhook can finish before the original POST returns. A creation
      // response must never overwrite the state independently fetched by GET.
      if (creation && old.providerId) return old;
      if (fact.providerUpdatedAt !== undefined) check(Number.isFinite(fact.providerUpdatedAt), 'PAYMENT_MISMATCH', 422);
      const explicitRefund = fact.refundAmountKnown === true && Number.isSafeInteger(fact.refundedAmountCents) &&
        fact.refundedAmountCents >= 0 && fact.refundedAmountCents <= fact.amountCents;
      const indeterminateRefund = fact.refundAmountKnown === false || fact.refundAmountKnown === true && !explicitRefund;
      if (old.providerUpdatedAt && fact.providerUpdatedAt && fact.providerUpdatedAt < old.providerUpdatedAt &&
          fact.state !== 'reversed' && !(fact.refundedAmountCents > 0) && !indeterminateRefund) return old;
      if (old.status === 'refunded') return old;
      const now = clock();
      let status = fact.state === 'reversed' ? 'refunded' : fact.state;
      if (creation && status === 'paid') status = 'pending';
      if (old.paidAt && !['paid', 'refunded'].includes(status)) status = 'review';
      // An absent refund field is not evidence that a previously indeterminate
      // reversal disappeared. Keep the hold until explicit, coherent totals.
      const refundUnresolved = indeterminateRefund || Boolean(old.refundUnresolved) && !explicitRefund;
      if (refundUnresolved) status = 'review';
      const observedRefund = explicitRefund ? fact.refundedAmountCents : old.refundedAmountCents || 0;
      if (observedRefund > 0 && observedRefund < fact.amountCents) status = 'review';
      if (old.refundedAmountCents > observedRefund) status = 'review';
      const fingerprint = sha(canonicalJson({ providerId: fact.providerId, status,
        refundAmountKnown: fact.refundAmountKnown ?? null, refundUnresolved, observedRefund, providerStatus: fact.providerStatus || '' }));
      const changed = old.lastFactHash !== fingerprint;
      let checkoutUrl = old.checkoutUrl;
      if (typeof fact.checkoutUrl === 'string') {
        let url; try { url = new URL(fact.checkoutUrl); } catch {}
        check(url && url.protocol === 'https:' && url.host === 'www.mercadopago.com.br' &&
          url.pathname.startsWith('/checkout/') && !url.username && !url.password, 'PAYMENT_MISMATCH', 422);
        checkoutUrl = url.href;
      }
      const next = { ...old, status, hold: status === 'review', refundUnresolved, providerId: fact.providerId, checkoutUrl: checkoutUrl || null,
        lastFactHash: fingerprint, updatedAt: now, nextPollAt: now + 15_000,
        refundedAmountCents: Math.max(old.refundedAmountCents || 0, observedRefund),
        ...(fact.providerUpdatedAt ? { providerUpdatedAt: Math.max(old.providerUpdatedAt || 0, fact.providerUpdatedAt) } : {}),
        ...(status === 'paid' && !old.paidAt ? { paidAt: now } : {}),
        ...(status === 'refunded' && !old.refundedAt ? { refundedAt: now } : {}),
        events: changed ? [...old.events, { type: `payment_${status}`, at: now, providerId: fact.providerId,
          refundUnresolved, refundedAmountCents: Math.max(old.refundedAmountCents || 0, observedRefund) }].slice(-200) : old.events };
      orders._putUnlocked(old.id, next);
      return next;
    });
  }
  function support(id, receiptHash, { requestId, kind, message }) {
    return backend.withExclusiveLock(() => {
      const order = own(id, receiptHash);
      const existing = order.requests.find(r => r.id === requestId);
      if (existing) {
        check(existing.kind === kind && existing.message === message, 'REQUEST_CONFLICT', 409);
        return { created: false, receipt: { id: existing.id, kind: existing.kind, status: existing.status, createdAt: existing.createdAt } };
      }
      check(order.requests.length < 20, 'TOO_MANY_REQUESTS', 429);
      const request = { id: requestId, kind, message, status: 'received', createdAt: clock() };
      const next = { ...order, requests: [...order.requests, request], updatedAt: clock(),
        events: [...order.events, { type: `request_${kind}`, id: requestId, at: clock() }].slice(-200) };
      orders._putUnlocked(id, next);
      return { created: true, receipt: { id: request.id, kind, status: 'received', createdAt: request.createdAt } };
    });
  }
  function probe() {
    const probes = backend.namespace('project-service-readiness');
    const key = randomUUID();
    probes.put(key, { at: clock(), kind: 'storage_probe' }, { onlyIfNew: true });
    check(probes.get(key)?.kind === 'storage_probe', 'PAYMENT_UNAVAILABLE', 503);
    probes.delete(key);
    return true;
  }
  return { backend, orders, previous, start, own, shouldPoll, observe, uncertain, rejected, support, probe };
}

module.exports = { createServiceLedger, publicServiceOrder, providerIdValid };
