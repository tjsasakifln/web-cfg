'use strict';

const { projectServiceHttp } = require('./service-http.cjs');
const { readOffer, termsFor, UUID } = require('./service-policy.cjs');
const { publicServiceOrder, providerIdValid } = require('./service-ledger.cjs');

async function preflight(app = projectServiceHttp) {
  const offer = readOffer();
  let config;
  try { config = app.config(); }
  catch { return { available: false, readyForPurchase: false, reason: 'INVALID_PRIVATE_CONFIGURATION' }; }
  const result = { mode: config.mode, offerVersion: offer.version, termsHash: termsFor(offer).sha256,
    purchasesRequested: Boolean(config.purchasesEnabled), configured: Boolean(config.configured),
    credentials: { accessToken: Boolean(config.accessToken), expectedSeller: Boolean(config.sellerId),
      webhookSecret: Boolean(config.webhookSecret), storageRoot: Boolean(config.storageRoot) },
    sellerVerified: false, durableStoreVerified: false, readyForPurchase: false };
  if (!config.configured || config.mode === 'off') return result;
  try {
    const dep = app.dependencies(config);
    dep.ledger.probe(); result.durableStoreVerified = true;
    await dep.provider.verifySellerEnvironment(); result.sellerVerified = true;
    result.readyForPurchase = Boolean(config.purchasesEnabled && offer.supplier.address);
  } catch { result.reason = 'PRIVATE_DEPENDENCY_UNAVAILABLE'; }
  return result;
}

async function report({ orderId, limit = 100 } = {}, app = projectServiceHttp) {
  const config = app.config();
  const readiness = await preflight(app);
  if (!config.configured || config.mode === 'off') return { readiness, available: false, orders: [] };
  const dep = app.dependencies(config);
  if (orderId !== undefined) {
    if (!UUID.test(orderId)) throw Error('INVALID_ORDER_ID');
    const order = dep.ledger.orders.get(orderId.toLowerCase());
    if (!order) throw Error('ORDER_NOT_FOUND');
    return { readiness, available: true, order: { ...publicServiceOrder(order), customer: order.customer,
      providerId: order.providerId, nextAction: order.nextAction, events: order.events,
      kind: order.kind, mode: order.mode }, containsPersonalData: true };
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw Error('INVALID_LIMIT');
  const orders = dep.ledger.orders.list().map(row => row.value).sort((a, b) => b.createdAt - a.createdAt);
  return { readiness, available: true, orders: orders.slice(0, limit).map(order => ({ id: order.id,
    createdAt: order.createdAt, status: order.status, amountCents: order.quote.amountCents,
    disciplines: order.quote.items.map(item => item.id), deadlineDays: order.quote.deadlineDays,
    openRequests: order.requests.filter(r => r.status === 'received').length })), limited: orders.length > limit,
    metrics: { createdOrders: orders.length, confirmedPayments: orders.filter(o => o.paidAt).length,
      keptPaidOrders: orders.filter(o => o.status === 'paid' && !o.hold).length,
      keptPaidCents: orders.filter(o => o.status === 'paid' && !o.hold).reduce((sum, o) => sum + o.quote.amountCents, 0),
      refundedCents: orders.reduce((sum, o) => sum + (o.refundedAmountCents || 0), 0), settlementReceivedCents: null },
    interpretation: 'Confirmação de pagamento pelo provedor não comprova liquidação bancária. A equipe comercial confere documentos e o início do prazo; não há aceite técnico automático.' };
}

async function main([action, id], app = projectServiceHttp) {
  if (action === 'preflight') return preflight(app);
  if (action === 'orders') return report({}, app);
  if (action === 'order') return report({ orderId: id }, app);
  if (action === 'reconcile' && providerIdValid(id)) {
    const config = app.config();
    const order = await app.reconcile(app.dependencies(config), id);
    return { matched: Boolean(order), ...(order ? { order: publicServiceOrder(order) } : {}) };
  }
  throw Error('INVALID_COMMAND');
}

if (require.main === module) main(process.argv.slice(2)).then(result => {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}).catch(error => { process.stderr.write(`Operação não concluída: ${error.message}\n`); process.exitCode = 1; });

module.exports = { preflight, report, main };
