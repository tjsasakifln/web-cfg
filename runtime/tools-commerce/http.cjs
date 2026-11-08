const { PACKAGES, TERMS, TOOL, MAX_BODY, UUID, REFERRAL, CommerceError, check, loadConfig } = require('./policy.cjs');
const { createLedger, publicOrder } = require('./ledger.cjs');
const { createFirebase } = require('./firebase.cjs');
const { createMercadoPago } = require('./mercado-pago.cjs');
const { modelaReport } = require('./report.cjs');

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
const reply = (statusCode, json) => ({ statusCode, headers: HEADERS, body: JSON.stringify(json) });
const only = (body, allowed) => check(body && typeof body === 'object' && !Array.isArray(body) &&
  Object.keys(body).every(k => allowed.includes(k)), 'INVALID_REQUEST', 400);
function header(event, name) {
  return Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === name)?.[1];
}
function bodyOf(event, limit) {
  check(!event.isBase64Encoded && typeof event.body === 'string', 'INVALID_REQUEST', 400);
  check(Buffer.byteLength(event.body) <= limit, 'PAYLOAD_TOO_LARGE', 413);
  check(/^application\/json(?:;|$)/i.test(header(event, 'content-type') || ''), 'INVALID_CONTENT_TYPE', 415);
  try { return JSON.parse(event.body); } catch { check(false, 'INVALID_REQUEST', 400); }
}
const validId = id => typeof id === 'string' && UUID.test(id);
const validProviderId = id => typeof id === 'string' && /^ORD[A-Za-z0-9]{8,70}$/i.test(id);

function createCommerceHttp({ env = process.env, config: injectedConfig, firebaseFactory = createFirebase,
  providerFactory = createMercadoPago, clock = Date.now, onIncident = code => console.error(`tool_commerce:${code}`) } = {}) {
  let dependencies;
  const usage = new Map();
  const config = () => injectedConfig || loadConfig(env);
  function throttle(uid, op) {
    const at = clock();
    const key = `${uid}:${op}`;
    let entry = usage.get(key);
    if (!entry || at - entry.since >= 60_000) {
      if (usage.size >= 5000) usage.delete(usage.keys().next().value);
      entry = { since: at, count: 0 }; usage.set(key, entry);
    }
    check(++entry.count <= (op === 'export' ? 20 : 30), 'TOO_MANY_REQUESTS', 429);
  }
  function getDependencies(cfg) {
    if (!dependencies) {
      const firebase = firebaseFactory(cfg);
      dependencies = { ...firebase, ledger: createLedger({ db: firebase.db, mode: cfg.mode, identityKey: cfg.identityKey, clock }),
        provider: cfg.accessToken ? providerFactory({ accessToken: cfg.accessToken, webhookSecret: cfg.webhookSecret,
          mode: cfg.mode, sellerId: cfg.sellerId, sandboxPayerEmail: cfg.sandboxPayerEmail }) : null };
    }
    return dependencies;
  }
  function failure(error) {
    if (error instanceof CommerceError) return reply(error.status, { error: error.message });
    onIncident('UNAVAILABLE');
    return reply(503, { error: 'COMMERCE_UNAVAILABLE' });
  }
  function verifyOrigin(event, cfg) {
    if (cfg.mode === 'live') check(header(event, 'origin') === 'https://confenge.com.br', 'ORIGIN_FORBIDDEN', 403);
    else if (cfg.mode === 'emulator') check(/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{2,5})?$/.test(header(event, 'origin') || ''), 'ORIGIN_FORBIDDEN', 403);
    else if (env.TOOLS_COMMERCE_SANDBOX_ORIGIN) check(header(event, 'origin') === env.TOOLS_COMMERCE_SANDBOX_ORIGIN, 'ORIGIN_FORBIDDEN', 403);
  }
  async function reconcile({ provider, ledger }, id) {
    check(validProviderId(id), 'INVALID_PROVIDER_ORDER', 422);
    const fact = await provider.getOrder(id);
    check(fact?.providerId?.toLowerCase() === id.toLowerCase() && validId(fact.reference) &&
      Number.isSafeInteger(fact.amountCents) && fact.amountCents > 0 && fact.currency === 'BRL' &&
      ['pending', 'paid', 'reversed', 'failed', 'review'].includes(fact.state), 'PAYMENT_MISMATCH', 422);
    return ledger.observe(fact);
  }

  async function api(event) {
    try {
      const cfg = config();
      const q = event.queryStringParameters || {};
      const method = event.httpMethod;
      if (q.op === 'config' && method === 'GET') {
        if (cfg.mode === 'off') return reply(200, { enabled: false });
        return reply(200, { enabled: true, firebase: cfg.firebase, ...(cfg.authEmulator ? { authEmulator: cfg.authEmulator } : {}),
          tools: [TOOL], packages: PACKAGES, termsVersion: TERMS, termsUrl: '/termos-de-uso/#creditos-ferramentas',
          purchasesEnabled: cfg.purchasesEnabled, exportsPaused: cfg.exportsPaused });
      }
      if (cfg.mode === 'off') return reply(404, { error: 'FEATURE_DISABLED' });
      if (!['account', 'orders', 'order', 'export'].includes(q.op)) return reply(404, { error: 'NOT_FOUND' });
      const expected = { account: ['GET', 'POST'], orders: ['POST'], order: ['GET'], export: ['POST'] };
      check(expected[q.op].includes(method), 'METHOD_NOT_ALLOWED', 405);
      const authHeader = header(event, 'authorization');
      const bearer = typeof authHeader === 'string' && /^Bearer ([A-Za-z0-9._-]{1,8192})$/.exec(authHeader);
      check(bearer, 'AUTH_REQUIRED', 401);
      if (method === 'POST') verifyOrigin(event, cfg);
      const dep = getDependencies(cfg);
      const user = await dep.authenticate(bearer[1]);
      throttle(user.uid, q.op);
      const { ledger, provider } = dep;
      if (q.op === 'account') {
        if (method === 'GET') return reply(200, await ledger.account(user.uid));
        const input = bodyOf(event, 8192);
        only(input, ['referralCode']);
        check(input.referralCode === undefined || typeof input.referralCode === 'string' && REFERRAL.test(input.referralCode), 'INVALID_REFERRAL', 422);
        return reply(200, await ledger.register({ ...user, referralCode: input.referralCode }));
      }
      if (q.op === 'order') {
        check(validId(q.id), 'ORDER_NOT_FOUND', 404);
        const { order, poll } = await ledger.getOrder(user.uid, q.id, Boolean(provider));
        if (order.status === 'creating' && clock() - order.createdAt > 60_000) {
          return reply(200, publicOrder(await ledger.markCreationUnknown(order.id)));
        }
        if (poll) {
          const fresh = await reconcile(dep, order.providerId);
          check(fresh?.id === order.id, 'PAYMENT_MISMATCH', 422);
          return reply(200, publicOrder(fresh));
        }
        return reply(200, publicOrder(order));
      }
      if (q.op === 'orders') {
        check(cfg.purchasesEnabled && provider, 'PURCHASES_PAUSED', 503);
        const input = bodyOf(event, 8192);
        only(input, ['packageId', 'requestId', 'termsVersion']);
        check(validId(input.requestId), 'INVALID_REQUEST_ID', 422);
        await provider.verifySellerEnvironment();
        const { created, order } = await ledger.startOrder({ uid: user.uid, ...input });
        if (!created) return reply(200, publicOrder(order));
        try {
          const fact = await provider.createOrder({ id: order.id, amountCents: order.amountCents, email: user.email,
            label: `${order.credits} ${order.credits === 1 ? 'crédito' : 'créditos'} para exportar — CONFENGE` });
          check(validProviderId(fact.providerId) && fact.reference === order.id, 'PAYMENT_MISMATCH', 422);
          return reply(201, publicOrder(await ledger.observe(fact, { creation: true })));
        } catch {
          onIncident('PIX_CREATION_REVIEW');
          return reply(202, publicOrder(await ledger.markCreationUnknown(order.id)));
        }
      }
      check(!cfg.exportsPaused, 'EXPORT_PAUSED', 503);
      const input = bodyOf(event, MAX_BODY);
      only(input, ['toolId', 'requestId', 'payload']);
      check(input.toolId === TOOL && validId(input.requestId), 'INVALID_EXPORT', 422);
      const artifact = modelaReport(input.payload, cfg.identityKey);
      const emission = await ledger.completeExport({ uid: user.uid, toolId: TOOL, requestId: input.requestId, digest: artifact.digest });
      return { statusCode: 200, headers: { ...HEADERS, 'Content-Disposition': 'attachment; filename="modela-pro-memoria.json"' },
        body: artifact.render(emission) };
    } catch (error) { return failure(error); }
  }

  async function webhook(event) {
    try {
      const cfg = config();
      if (cfg.mode === 'off' || !cfg.accessToken || !cfg.webhookSecret) return reply(404, { error: 'FEATURE_DISABLED' });
      check(event.httpMethod === 'POST', 'METHOD_NOT_ALLOWED', 405);
      check(!event.isBase64Encoded && Buffer.byteLength(event.body || '') <= 64 * 1024, 'PAYLOAD_TOO_LARGE', 413);
      const dep = getDependencies(cfg);
      const query = event.queryStringParameters || {};
      check((event.multiValueQueryStringParameters?.['data.id'] || []).length <= 1, 'INVALID_WEBHOOK', 401);
      let providerId;
      try { ({ providerId } = dep.provider.parseWebhook({ headers: event.headers, query })); }
      catch { check(false, 'INVALID_WEBHOOK', 401); }
      try { await reconcile(dep, providerId); }
      catch (error) {
        if (!(error instanceof CommerceError) || error.status >= 500) throw error;
        // Permanent inconsistencies require reconciliation by the operator. Never credit from them.
        onIncident('PIX_RECONCILIATION_MISMATCH');
      }
      return reply(200, { received: true });
    } catch (error) { return failure(error); }
  }
  return { api, webhook, reconcile, config, getDependencies };
}

module.exports = { createCommerceHttp, commerceHttp: createCommerceHttp() };
