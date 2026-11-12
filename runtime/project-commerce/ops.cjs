'use strict';

const { projectCommerceHttp } = require('./http.cjs');
const { readCatalog, productReady, privateArchive, UUID } = require('./policy.cjs');
const { publicOrder, providerIdValid } = require('./ledger.cjs');

function interval(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) throw new Error('INVALID_INTERVAL');
  const first = Date.parse(`${from}T00:00:00-03:00`);
  const last = Date.parse(`${to}T00:00:00-03:00`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first || last - first > 93 * 86400000 ||
      new Date(first - 3 * 3600000).toISOString().slice(0, 10) !== from ||
      new Date(last - 3 * 3600000).toISOString().slice(0, 10) !== to) throw new Error('INVALID_INTERVAL');
  return { first, last };
}
async function bounded(query) {
  const rows = [];
  let cursor;
  for (let page = 0; page < 100; page++) {
    const snapshot = await (cursor ? query.startAfter(cursor) : query).limit(200).get();
    rows.push(...snapshot.docs.map(doc => doc.data()));
    if (snapshot.docs.length < 200) return rows;
    cursor = snapshot.docs.at(-1);
  }
  throw new Error('REPORT_TOO_LARGE');
}
async function report({ db, mode }, from, to) {
  const { first, last } = interval(from, to);
  if (mode === 'off') return { available: false, reason: 'PROJECT_COMMERCE_DISABLED', metrics: null };
  const root = db.collection('projectCommerce').doc(`v1-${mode}`);
  const range = (collection, key) => bounded(root.collection(collection).where(key, '>=', first).where(key, '<', last).orderBy(key));
  const [created, confirmed, refunded, accesses, requests, refundAmounts, refundReviews] = await Promise.all([
    range('orders', 'createdAt'), range('orders', 'paidAt'), range('orders', 'refundedAt'),
    range('accesses', 'at'), range('requests', 'createdAt'), range('refundAmounts', 'at'),
    bounded(root.collection('refundReviews').where('status', '==', 'open'))
  ]);
  const sum = rows => rows.reduce((total, row) => total + row.amountCents, 0);
  const kept = confirmed.filter(o => o.status === 'paid' && !o.hold);
  return { available: true, mode, from, toExclusive: to, timezone: 'America/Sao_Paulo',
    dates: 'Eventos pelo momento em que foram observados e registrados; estados pelo momento da consulta.',
    metrics: { ordersCreated: created.length, paymentConfirmations: confirmed.length, keptPaidOrders: kept.length,
      cancelledOrders: created.filter(o => o.status === 'cancelled').length,
      failedOrders: created.filter(o => o.status === 'failed').length, reviewOrders: created.filter(o => o.status === 'review').length,
      refundsConfirmed: new Set(refundAmounts.map(r => r.orderId)).size, fullRefundsConfirmed: refunded.length,
      unresolvedRefundOrders: refundReviews.length, deliveryAccessesAuthorized: accesses.length,
      grossConfirmedCents: sum(confirmed), refundedCents: refundReviews.length ? null : sum(refundAmounts),
      knownRefundedCents: sum(refundAmounts), fullRefundedCents: sum(refunded), keptPaidCents: sum(kept),
      pendingOrderCents: sum(created.filter(o => o.status === 'pending')),
      supportRequests: requests.length, cancellationRequests: requests.filter(r => r.kind === 'cancellation').length,
      settlementReceivedCents: null, settlementReceivableCents: null, providerFeesCents: null,
      acquisitionExpensesCents: null, serviceHours: null },
    currency: 'BRL', revenueKind: 'project_license',
    manualFields: ['settlementReceivedCents', 'settlementReceivableCents', 'providerFeesCents', 'acquisitionExpensesCents', 'serviceHours'],
    interpretation: 'Confirmação do pagamento não comprova liquidação no banco. Reembolsos parciais coerentes são somados por aumento confirmado, sem repetir o acumulado. Divergência não resolvida mantém refundedCents nulo; knownRefundedCents é apenas o montante confirmado no intervalo. Autorização de acesso não comprova salvamento do arquivo. Adaptações e complementares permanecem no controle comercial de serviços.' };
}

async function preflight(config, app = projectCommerceHttp) {
  const catalog = await readCatalog();
  const products = [];
  for (const product of catalog.products) {
    const ready = productReady(product);
    let archiveVerified = false;
    if (ready && config.mode !== 'off') {
      try { await privateArchive(config, product.delivery); archiveVerified = true; } catch {}
    }
    products.push({ id: product.id, version: product.version, evidenceReady: ready, archiveVerified });
  }
  let sellerVerified = false;
  if (config.mode !== 'off') { await app.getDependencies(config).provider.verifySellerEnvironment(); sellerVerified = true; }
  return { mode: config.mode, purchasesRequested: Boolean(config.purchasesEnabled), catalogVersion: catalog.version,
    catalogApproved: config.approvedCatalogVersion === catalog.version, sellerVerified, products,
    readyForPurchase: config.mode !== 'off' && config.purchasesEnabled && !config.deliveryPaused && sellerVerified &&
      config.approvedCatalogVersion === catalog.version && catalog.products.some((p, i) =>
        products[i].evidenceReady && products[i].archiveVerified && config.approvedTermsHash === p.terms?.sha256) };
}

async function main([action, first, second, third], app = projectCommerceHttp) {
  const config = app.config();
  if (action === 'preflight') return preflight(config, app);
  if (config.mode === 'off') return { available: false, reason: 'PROJECT_COMMERCE_DISABLED', metrics: null };
  const dep = app.getDependencies(config);
  if (action === 'report') return report({ db: dep.db, mode: config.mode }, first, second);
  if (action === 'order' && UUID.test(first || '')) {
    const order = (await dep.ledger.ref('orders', first).get()).data();
    if (!order) throw new Error('ORDER_NOT_FOUND');
    const events = await bounded(dep.ledger.ref('orders', first).collection('events').orderBy('at'));
    return { ...publicOrder(order), contactEmail: order.contactEmail, providerId: order.providerId, accessCount: order.accessCount,
      evidenceReferences: Object.fromEntries(Object.entries(order.product.evidence).map(([key, value]) => [key, value.reference])), events };
  }
  if (action === 'requests') {
    const snapshot = await dep.ledger.root.collection('requests').where('status', '==', 'received').limit(201).get();
    return { available: true, requests: snapshot.docs.slice(0, 200).map(doc => doc.data()),
      limited: snapshot.docs.length > 200, nextStep: 'Tratar no atendimento comercial, confirmar o fato no provedor e registrar a referência de conclusão.' };
  }
  if (action === 'resolve-request' && /^[a-f0-9]{64}$/.test(first || '') && second === '--reference' &&
      typeof third === 'string' && third.trim().length > 0 && third.length <= 500) {
    return dep.db.runTransaction(async tx => {
      const requestRef = dep.ledger.ref('requests', first);
      const request = (await tx.get(requestRef)).data();
      if (!request) throw new Error('REQUEST_NOT_FOUND');
      const orderRef = dep.ledger.ref('orders', request.orderId);
      const order = (await tx.get(orderRef)).data();
      if (!order) throw new Error('ORDER_NOT_FOUND');
      if (request.status === 'resolved') return { resolved: true, receiptId: first, alreadyResolved: true };
      const resolvedAt = Date.now();
      tx.update(requestRef, { status: 'resolved', resolutionReference: third.trim(), resolvedAt });
      tx.update(orderRef, { requests: (order.requests || []).map(r => r.receiptId === first ? { ...r, status: 'resolved', resolvedAt } : r) });
      tx.create(orderRef.collection('events').doc(`request-resolved-${first}`), {
        type: 'project_support_resolved', receiptId: first, at: resolvedAt, reference: third.trim() });
      return { resolved: true, receiptId: first, paymentStatus: order.status };
    });
  }
  if (action === 'reconcile' && providerIdValid(first) && (!second || second === '--apply')) {
    if (second) {
      const order = await app.reconcile(dep, first);
      return { applied: Boolean(order), orderId: order?.id || null, status: order?.status || null };
    }
    await dep.provider.verifySellerEnvironment();
    const fact = await dep.provider.getOrder(first);
    return { applied: false, providerId: fact.providerId, orderId: fact.reference, amountCents: fact.amountCents,
      currency: fact.currency, state: fact.state, providerStatus: fact.providerStatus };
  }
  throw new Error('INVALID_COMMAND');
}

if (require.main === module) main(process.argv.slice(2)).then(value => process.stdout.write(JSON.stringify(value, null, 2) + '\n')).catch(error => {
  process.stderr.write(`Operação não concluída: ${error.code || error.message || 'UNAVAILABLE'}\n`); process.exitCode = 1;
});
module.exports = { report, preflight, interval, main };
