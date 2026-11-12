'use strict';

const { createMercadoPago } = require('../tools-commerce/mercado-pago.cjs');
const { CommerceError, check, UUID, TOKEN, SELECTION_KEYS, CHECKOUT_KEYS, sha, sameSecret, safeText,
  readOffer, termsFor, publicPricing, quote, normalizeCheckout, loadServiceConfig } = require('./service-policy.cjs');
const { createServiceLedger, publicServiceOrder, providerIdValid } = require('./service-ledger.cjs');

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
const reply = (statusCode, value) => ({ statusCode, headers: HEADERS, body: JSON.stringify(value) });
const header = (event, name) => Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === name)?.[1];
const UNAVAILABLE = 'O pagamento online está temporariamente indisponível. A simulação continua disponível e você pode falar com a CONFENGE para contratar.';

function body(event, keys) {
  check(!event.isBase64Encoded && typeof event.body === 'string' && Buffer.byteLength(event.body) <= 16_384,
    'INVALID_REQUEST', 400);
  check(/^application\/json(?:;|$)/i.test(header(event, 'content-type') || ''), 'INVALID_CONTENT_TYPE', 415);
  let value; try { value = JSON.parse(event.body); } catch { check(false, 'INVALID_REQUEST', 400); }
  check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k)),
    'INVALID_REQUEST', 400);
  return value;
}

function createServiceHttp({ env = process.env, config: injected, offerLoader = readOffer,
  providerFactory = createMercadoPago, ledgerFactory = createServiceLedger, clock = Date.now,
  onIncident = code => console.error(`project_service:${code}`) } = {}) {
  const config = () => injected || loadServiceConfig(env);
  let deps;
  const volatileLimits = new Map();
  function throttle(event, kind) {
    const ip = event.requestContext?.identity?.sourceIp || header(event, 'client-ip') || 'unknown';
    const key = `${sha(ip)}:${kind}`;
    let entry = volatileLimits.get(key);
    if (!entry || clock() - entry.at >= 60_000) {
      if (volatileLimits.size >= 5000) volatileLimits.delete(volatileLimits.keys().next().value);
      volatileLimits.set(key, entry = { count: 0, at: clock() });
    }
    check(++entry.count <= (kind === 'checkout' ? 15 : 60), 'TOO_MANY_REQUESTS', 429);
    return ip;
  }
  function dependencies(cfg) {
    check(cfg.mode !== 'off' && cfg.configured, 'PAYMENT_UNAVAILABLE', 503);
    deps ||= { ledger: ledgerFactory({ storageRoot: cfg.storageRoot, mode: cfg.mode, clock }),
      provider: providerFactory({ accessToken: cfg.accessToken, webhookSecret: cfg.webhookSecret,
        sellerId: cfg.sellerId, mode: cfg.mode, sandboxPayerEmail: cfg.sandboxPayerEmail }) };
    return deps;
  }
  function failure(error) {
    if (error instanceof CommerceError) return reply(error.status, { error: error.message,
      ...(error.status === 503 ? { message: UNAVAILABLE } : {}) });
    onIncident('PAYMENT_UNAVAILABLE');
    return reply(503, { error: 'PAYMENT_UNAVAILABLE', message: UNAVAILABLE });
  }
  async function reconcile(dep, providerId) {
    check(providerIdValid(providerId), 'PAYMENT_MISMATCH', 422);
    await dep.provider.verifySellerEnvironment();
    const fact = await dep.provider.getOrder(providerId);
    check(fact.providerId === providerId, 'PAYMENT_MISMATCH', 422);
    return dep.ledger.observe(fact);
  }
  async function refresh(dep, order) {
    const providerId = order.providerId || await dep.provider.findOrderId({ reference: order.id, createdAt: order.createdAt });
    if (!providerId) return dep.ledger.uncertain(order.id);
    const next = await reconcile(dep, providerId);
    check(next?.id === order.id, 'PAYMENT_MISMATCH', 422);
    return next;
  }
  function observeSharedWebhook(fact, sourceConfig) {
    const cfg = config();
    // Internal handoff only: the tools webhook has verified its signature,
    // seller and GET response, and found no corresponding tools order. Exact
    // credentials bind that fact to this same application and environment;
    // another seller, token or webhook secret must use its own callback.
    if (fact?.paymentFlow !== 'checkout' || !cfg.configured || !['live', 'sandbox'].includes(cfg.mode) || !sourceConfig ||
        sourceConfig.mode !== cfg.mode || sourceConfig.sellerId !== cfg.sellerId ||
        !['accessToken', 'webhookSecret'].every(key =>
          typeof sourceConfig[key] === 'string' && sourceConfig[key].length > 0 &&
          typeof cfg[key] === 'string' && cfg[key].length > 0 &&
          sameSecret(sha(sourceConfig[key]), sha(cfg[key])))) return null;
    // Pausing new purchases must not stop payment/reversal reconciliation.
    // Reuse the verified fact; do not fetch the provider's order a second time.
    return dependencies(cfg).ledger.observe(fact);
  }
  function requireOrigin(event, cfg) {
    const origin = header(event, 'origin');
    // Quotes remain available without payment credentials, but requests must
    // originate on the canonical site (or the explicitly configured sandbox).
    check(origin === (cfg.origin || 'https://confenge.com.br'), 'ORIGIN_FORBIDDEN', 403);
  }

  async function api(event) {
    try {
      const q = event.queryStringParameters || {};
      check((event.multiValueQueryStringParameters?.op || []).length <= 1 &&
        (event.multiValueQueryStringParameters?.id || []).length <= 1, 'INVALID_REQUEST', 400);
      const methods = { 'service-config': 'GET', 'service-quote': 'POST', 'service-checkout': 'POST',
        'service-status': 'GET', 'service-support': 'POST' };
      check(Object.hasOwn(methods, q.op), 'NOT_FOUND', 404);
      check(event.httpMethod === methods[q.op], 'METHOD_NOT_ALLOWED', 405);
      const offer = offerLoader();
      if (q.op === 'service-config') {
        throttle(event, 'config');
        let ready = false;
        try {
          const cfg = config();
          if (cfg.mode !== 'off' && cfg.configured && cfg.purchasesEnabled && safeText(offer.supplier.address, 20, 500)) {
            const dep = dependencies(cfg);
            await dep.provider.verifySellerEnvironment();
            // Verify persistence before advertising an available checkout.
            dep.ledger.probe();
            ready = true;
          }
        } catch { onIncident('CHECKOUT_READINESS_FAILED'); }
        return reply(200, { enabled: true, purchasesEnabled: ready, pricing: publicPricing(offer), terms: termsFor(offer),
          supplier: offer.supplier, scope: offer.scope, contactUrl: '/projetos-prontos/#contato-projetos',
          ...(!ready ? { message: UNAVAILABLE } : {}) });
      }
      const cfg = config();
      if (event.httpMethod === 'POST') requireOrigin(event, cfg);
      if (q.op === 'service-quote') {
        throttle(event, 'quote');
        return reply(200, quote(body(event, SELECTION_KEYS), offer));
      }
      const dep = dependencies(cfg);
      if (q.op === 'service-checkout') {
        const ip = throttle(event, 'checkout');
        const normalized = normalizeCheckout(body(event, CHECKOUT_KEYS));
        const existing = dep.ledger.previous(normalized);
        if (existing) return reply(existing.status === 'creating' ? 202 : 200, publicServiceOrder(existing));
        check(cfg.purchasesEnabled, 'PURCHASES_PAUSED', 503);
        check(safeText(offer.supplier.address, 20, 500), 'PAYMENT_UNAVAILABLE', 503);
        const selection = quote(normalized.input, offer);
        check(normalized.input.pricingVersion === selection.pricingVersion &&
          normalized.input.termsVersion === selection.termsVersion && normalized.input.termsHash === selection.termsHash &&
          normalized.input.quoteHash === selection.quoteHash,
        'QUOTE_CHANGED', 409);
        await dep.provider.verifySellerEnvironment();
        const { created, order } = dep.ledger.start({ ...normalized, quote: selection, offer, ip });
        if (!created) return reply(order.status === 'creating' ? 202 : 200, publicServiceOrder(order));
        try {
          const fact = await dep.provider.createCheckoutOrder({ id: order.id, amountCents: order.quote.amountCents,
            email: order.customer.email, label: `Projetos residenciais CONFENGE: ${order.quote.areaM2} m², ${order.quote.deadlineDays} dias`,
            items: order.quote.items.map(item => ({ title: item.title, amountCents: item.amountCents, quantity: 1 })),
            returnUrl: `https://confenge.com.br/projetos-prontos/?pedido=${order.id}#pedido` });
          check(fact.reference === order.id, 'PAYMENT_MISMATCH', 422);
          return reply(201, publicServiceOrder(dep.ledger.observe(fact, { creation: true })));
        } catch {
          onIncident('CHECKOUT_CREATION_UNCERTAIN');
          return reply(202, publicServiceOrder(dep.ledger.uncertain(order.id)));
        }
      }
      throttle(event, 'status');
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header(event, 'authorization') || '');
      check(match && TOKEN.test(match[1]), 'ORDER_NOT_FOUND', 404);
      const receiptHash = sha(match[1]);
      if (q.op === 'service-support') {
        const input = body(event, ['orderId', 'requestId', 'kind', 'message']);
        check(UUID.test(input.orderId || '') && UUID.test(input.requestId || '') &&
          ['support', 'cancellation'].includes(input.kind) && typeof input.message === 'string' &&
          input.message.length <= 2000 && (input.kind === 'cancellation' || input.message.trim().length > 0) &&
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.message), 'INVALID_REQUEST', 422);
        const result = dep.ledger.support(input.orderId.toLowerCase(), receiptHash,
          { ...input, requestId: input.requestId.toLowerCase(), message: input.message.trim() });
        return reply(result.created ? 201 : 200, result.receipt);
      }
      check(UUID.test(q.id || ''), 'ORDER_NOT_FOUND', 404);
      const { order, poll } = dep.ledger.shouldPoll(q.id.toLowerCase(), receiptHash);
      return reply(200, publicServiceOrder(poll ? await refresh(dep, order) : order));
    } catch (error) { return failure(error); }
  }

  async function webhook(event) {
    try {
      const cfg = config();
      check(event.httpMethod === 'POST', 'METHOD_NOT_ALLOWED', 405);
      check(!event.isBase64Encoded && Buffer.byteLength(event.body || '') <= 65_536 &&
        (event.multiValueQueryStringParameters?.['data.id'] || []).length <= 1, 'INVALID_WEBHOOK', 400);
      const dep = dependencies(cfg);
      let providerId;
      try { ({ providerId } = dep.provider.parseWebhook({ headers: event.headers, query: event.queryStringParameters || {} })); }
      catch { check(false, 'INVALID_WEBHOOK', 401); }
      const order = await reconcile(dep, providerId);
      return reply(200, { received: true, matched: Boolean(order) });
    } catch (error) { return failure(error); }
  }
  return { api, webhook, config, dependencies, reconcile, observeSharedWebhook };
}

module.exports = { createServiceHttp, projectServiceHttp: createServiceHttp() };
