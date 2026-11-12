'use strict';

const { createFirebase } = require('../tools-commerce/firebase.cjs');
const { createMercadoPago } = require('../tools-commerce/mercado-pago.cjs');
const { CommerceError, check, UUID, ID, loadConfig, readCatalog, productReady, authorizedProduct,
  privateArchive, publicProduct } = require('./policy.cjs');
const { createLedger, publicOrder, providerIdValid } = require('./ledger.cjs');

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
const reply = (statusCode, value) => ({ statusCode, headers: HEADERS, body: JSON.stringify(value) });
const header = (event, key) => Object.entries(event.headers || {}).find(([name]) => name.toLowerCase() === key)?.[1];
const validId = id => typeof id === 'string' && UUID.test(id);
function body(event, keys) {
  check(!event.isBase64Encoded && typeof event.body === 'string' && Buffer.byteLength(event.body) <= 8192, 'INVALID_REQUEST', 400);
  check(/^application\/json(?:;|$)/i.test(header(event, 'content-type') || ''), 'INVALID_CONTENT_TYPE', 415);
  let data;
  try { data = JSON.parse(event.body); } catch { check(false, 'INVALID_REQUEST', 400); }
  check(data && !Array.isArray(data) && typeof data === 'object' && Object.keys(data).every(k => keys.includes(k)), 'INVALID_REQUEST', 400);
  return data;
}

function createProjectCommerceHttp({ env = process.env, config: injected, firebaseFactory = createFirebase,
  providerFactory = createMercadoPago, catalogLoader = readCatalog, archiveReader = privateArchive,
  clock = Date.now, onIncident = code => console.error(`project_commerce:${code}`) } = {}) {
  const config = () => injected || loadConfig(env);
  let dependencies;
  const limits = new Map();
  function throttle(uid, op) {
    const key = `${uid}:${op}`;
    let entry = limits.get(key);
    if (!entry || clock() - entry.at > 60_000) {
      if (limits.size > 5000) limits.delete(limits.keys().next().value);
      limits.set(key, entry = { at: clock(), count: 0 });
    }
    check(++entry.count <= (op === 'download' ? 10 : 30), 'TOO_MANY_REQUESTS', 429);
  }
  function getDependencies(cfg) {
    if (!dependencies) {
      const firebase = firebaseFactory(cfg);
      dependencies = { ...firebase, ledger: createLedger({ db: firebase.db, mode: cfg.mode, clock }),
        provider: providerFactory({ accessToken: cfg.accessToken, webhookSecret: cfg.webhookSecret,
          mode: cfg.mode, sellerId: cfg.sellerId, sandboxPayerEmail: cfg.sandboxPayerEmail }) };
    }
    return dependencies;
  }
  function failure(error) {
    if (error instanceof CommerceError) return reply(error.status, { error: error.message });
    onIncident('UNAVAILABLE');
    return reply(503, { error: 'PROJECT_COMMERCE_UNAVAILABLE' });
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
    const current = await reconcile(dep, providerId);
    check(current?.id === order.id, 'PAYMENT_MISMATCH', 422);
    return current;
  }

  async function api(event) {
    try {
      const cfg = config();
      const q = event.queryStringParameters || {};
      const method = event.httpMethod;
      if (method === 'GET' && q.op === 'config') {
        if (cfg.mode === 'off') return reply(200, { enabled: false, purchasesEnabled: false, products: [], contactUrl: '/projetos-prontos/#contato-projetos' });
        const catalog = await catalogLoader();
        const products = [];
        if (cfg.purchasesEnabled && !cfg.deliveryPaused && cfg.approvedCatalogVersion === catalog.version) {
          for (const product of catalog.products) {
            if (!productReady(product) || cfg.approvedTermsHash !== product.terms.sha256) continue;
            try { await archiveReader(cfg, product.delivery); products.push(publicProduct(product)); }
            catch { onIncident('CATALOG_DELIVERY_UNAVAILABLE'); }
          }
        }
        return reply(200, { enabled: true, purchasesEnabled: products.length > 0, firebase: cfg.firebase,
          products, contactUrl: '/projetos-prontos/#contato-projetos' });
      }
      if (cfg.mode === 'off') return reply(404, { error: 'FEATURE_DISABLED' });
      const methods = { orders: ['GET', 'POST'], order: ['GET'], download: ['GET'], support: ['POST'] };
      check(Object.hasOwn(methods, q.op), 'NOT_FOUND', 404);
      check(methods[q.op].includes(method), 'METHOD_NOT_ALLOWED', 405);
      check((event.multiValueQueryStringParameters?.id || []).length <= 1, 'INVALID_REQUEST', 400);
      const bearer = /^Bearer ([A-Za-z0-9._-]{1,8192})$/.exec(header(event, 'authorization') || '');
      check(bearer, 'AUTH_REQUIRED', 401);
      if (method === 'POST') check(header(event, 'origin') === cfg.origin, 'ORIGIN_FORBIDDEN', 403);
      const dep = getDependencies(cfg);
      const user = await dep.authenticate(bearer[1]);
      throttle(user.uid, q.op);
      if (q.op === 'orders' && method === 'GET') return reply(200, { orders: await dep.ledger.recent(user.uid) });
      if (q.op === 'orders') {
        const input = body(event, ['productId', 'productVersion', 'requestId', 'termsVersion', 'termsHash', 'acceptedTerms']);
        check(ID.test(input.productId || '') && validId(input.requestId), 'INVALID_REQUEST', 422);
        const old = await dep.ledger.previous(user.uid, input);
        if (old) return reply(200, publicOrder(old));
        const catalog = await catalogLoader();
        const product = authorizedProduct(catalog, cfg, input.productId);
        check(input.productVersion === product.version, 'PROJECT_VERSION_CHANGED', 409);
        await archiveReader(cfg, product.delivery);
        await dep.provider.verifySellerEnvironment();
        const { created, order } = await dep.ledger.startOrder({ uid: user.uid, email: user.email, ...input, product, catalogVersion: catalog.version });
        if (!created) return reply(200, publicOrder(order));
        try {
          const fact = await dep.provider.createOrder({ id: order.id, amountCents: order.amountCents,
            email: user.email, label: `Licença de projeto ${product.title} ${product.version} - CONFENGE` });
          check(fact.reference === order.id, 'PAYMENT_MISMATCH', 422);
          return reply(201, publicOrder(await dep.ledger.observe(fact, { creation: true })));
        } catch {
          onIncident('ORDER_CREATION_UNCERTAIN');
          return reply(202, publicOrder(await dep.ledger.uncertain(order.id)));
        }
      }
      if (q.op === 'support') {
        const input = body(event, ['orderId', 'requestId', 'kind', 'message']);
        check(validId(input.orderId) && validId(input.requestId) && ['support', 'cancellation'].includes(input.kind) &&
          typeof input.message === 'string' && (input.kind === 'cancellation' || input.message.trim().length > 0) && input.message.length <= 2000 &&
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.message), 'INVALID_REQUEST', 422);
        const result = await dep.ledger.support(user.uid, { ...input, message: input.message.trim() }, user.email);
        return reply(result.created ? 201 : 200, result.receipt);
      }
      check(validId(q.id), 'ORDER_NOT_FOUND', 404);
      if (q.op === 'order') {
        const { order, poll } = await dep.ledger.shouldPoll(user.uid, q.id);
        return reply(200, publicOrder(poll ? await refresh(dep, order) : order));
      }
      check(!cfg.deliveryPaused, 'DELIVERY_PAUSED', 503);
      let order = await dep.ledger.owned(user.uid, q.id);
      // Always refresh before access, including already paid orders. A browser
      // return, stale local status or a lost refund webhook cannot release a ZIP.
      order = await refresh(dep, order);
      check(order.status === 'paid' && !order.hold, 'PAYMENT_NOT_CONFIRMED', 403);
      const bytes = await archiveReader(cfg, order.product.delivery);
      const access = await dep.ledger.authorizeAccess(user.uid, order.id);
      return { statusCode: 200, headers: { ...HEADERS, 'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${order.product.delivery.filename}"`,
        'X-Confenge-Access-Id': access.accessId, 'X-Content-SHA256': order.product.delivery.sha256 },
      body: bytes.toString('base64'), isBase64Encoded: true };
    } catch (error) { return failure(error); }
  }

  async function webhook(event) {
    try {
      const cfg = config();
      if (cfg.mode === 'off') return reply(404, { error: 'FEATURE_DISABLED' });
      check(event.httpMethod === 'POST', 'METHOD_NOT_ALLOWED', 405);
      check(!event.isBase64Encoded && Buffer.byteLength(event.body || '') <= 64 * 1024, 'INVALID_WEBHOOK', 400);
      check((event.multiValueQueryStringParameters?.['data.id'] || []).length <= 1, 'INVALID_WEBHOOK', 401);
      const dep = getDependencies(cfg);
      let providerId;
      try { ({ providerId } = dep.provider.parseWebhook({ headers: event.headers, query: event.queryStringParameters || {} })); }
      catch { check(false, 'INVALID_WEBHOOK', 401); }
      await reconcile(dep, providerId);
      return reply(200, { received: true });
    } catch (error) { return failure(error); }
  }
  return { api, webhook, config, getDependencies, reconcile };
}

module.exports = { createProjectCommerceHttp, projectCommerceHttp: createProjectCommerceHttp() };
