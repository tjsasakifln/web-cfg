const { commerceHttp } = require('./http.cjs');

const REFERRAL_QUERY_CONCURRENCY = 20;

async function batches(items, size, operation) {
  const output = [];
  for (let offset = 0; offset < items.length; offset += size) {
    output.push(...await Promise.all(items.slice(offset, offset + size).map(operation)));
  }
  return output;
}

async function usage(db, mode, from, to) {
  const interval = /^\d{4}-\d{2}-\d{2}$/;
  if (!interval.test(from || '') || !interval.test(to || '')) throw new Error('INVALID_INTERVAL');
  const first = Date.parse(`${from}T00:00:00-03:00`);
  const last = Date.parse(`${to}T00:00:00-03:00`);
  if (!Number.isFinite(first) || !(last > first) || last - first > 31 * 86400000) throw new Error('INVALID_INTERVAL');
  const root = db.collection('toolsCommerce').doc(`v1-${mode}`);
  const within = (collection, key) => root.collection(collection).where(key, '>=', first).where(key, '<', last).get();
  // Firestore does not maintain collection-group indexes by default. Select
  // only accounts that can have referral ledger entries using automatic,
  // collection-scoped indexes, then query their ledgers with bounded fan-out.
  const [accounts, exports, orders, activeInviters, reversedInviters] = await Promise.all([
    within('accounts', 'createdAt'), within('exports', 'at'), within('orders', 'paidAt'),
    root.collection('accounts').where('invites.earned', '>', 0).get(),
    root.collection('accounts').where('invites.reversed', '>', 0).get()
  ]);
  const inviterById = new Map([...activeInviters.docs, ...reversedInviters.docs].map(doc => [doc.id, doc]));
  if (inviterById.has(undefined)) throw new Error('INVALID_ACCOUNT_SNAPSHOT');
  const ledgerSnapshots = await batches([...inviterById.keys()], REFERRAL_QUERY_CONCURRENCY, accountId =>
    root.collection('accounts').doc(accountId).collection('ledger')
      .where('at', '>=', first).where('at', '<', last).get());
  const kinds = { free: 0, promo: 0, paid: 0 };
  for (const doc of exports.docs) kinds[doc.get('bucket')]++;
  const invited = accounts.docs.filter(doc => doc.get('referredBy'));
  const purchases = {};
  for (const doc of orders.docs) {
    const id = doc.get('packageId');
    const pack = purchases[id] ??= { confirmed: 0, grossCents: 0, reversed: 0, review: 0 };
    pack.confirmed++;
    pack.grossCents += doc.get('amountCents');
    if (doc.get('status') === 'reversed') pack.reversed++;
    if (doc.get('status') === 'review') pack.review++;
  }
  const seenEvents = new Set();
  const referralEvents = { earned: 0, reversed: 0, net: 0 };
  for (const ledger of ledgerSnapshots) for (const doc of ledger.docs) {
    const path = doc.ref?.path || '';
    if (!path) throw new Error('INVALID_LEDGER_SNAPSHOT');
    if (seenEvents.has(path)) continue;
    seenEvents.add(path);
    if (doc.get('type') === 'referral_earned') referralEvents.earned++;
    if (doc.get('type') === 'referral_reversed') referralEvents.reversed++;
  }
  referralEvents.net = referralEvents.earned - referralEvents.reversed;
  return { from, toExclusive: to, timezone: 'America/Sao_Paulo', newAccounts: accounts.size, exports: kinds, purchases,
    referralCohort: { linked: invited.length, firstPaidUse: invited.filter(doc => ['earned', 'ineligible', 'reversed'].includes(doc.get('referralState'))).length,
      rewardActive: invited.filter(doc => doc.get('referralState') === 'earned').length,
      rewardReversed: invited.filter(doc => doc.get('referralState') === 'reversed').length },
    referralEvents,
    referralMeasurement: {
      cohortDenominator: 'referralCohort.linked = contas vinculadas criadas no intervalo; estados são o retrato no momento da consulta',
      eventNumerator: 'referralEvents = lançamentos únicos por ledger.at no intervalo, inclusive de coortes anteriores',
      maturity: 'a ativação ocorre somente na primeira exportação paga e pode acontecer após o cadastro; estornos podem ocorrer ainda depois',
      rates: 'não calculadas sem denominadores agregados consentidos de exibição, compartilhamento e visita',
      queryPlan: `ledgers das contas com recompensa ativa ou revertida, em lotes de até ${REFERRAL_QUERY_CONCURRENCY} consultas concorrentes`
    } };
}

async function main([action, first, second]) {
  const config = commerceHttp.config();
  if (config.mode === 'off') throw new Error('FEATURE_DISABLED');
  const dep = commerceHttp.getDependencies(config);
  if (action === 'usage') return usage(dep.db, config.mode, first, second);
  if (action === 'resolve-dispute' && /^ORD[A-Z0-9]{8,70}$/i.test(first || '') && second === '--seller-credit-confirmed' && dep.provider) {
    const order = await commerceHttp.reconcile(dep, first.toUpperCase(), { sellerCreditConfirmed: true });
    return { applied: order?.status === 'paid', orderId: order?.id, status: order?.status };
  }
  if (action === 'reconcile' && /^ORD[A-Z0-9]{8,70}$/i.test(first || '') && (!second || second === '--apply') && dep.provider) {
    const id = first.toUpperCase();
    if (second) {
      const order = await commerceHttp.reconcile(dep, id);
      return { applied: Boolean(order), orderId: order?.id, status: order?.status };
    }
    const fact = await dep.provider.getOrder(id);
    return { applied: false, providerId: fact.providerId, orderId: fact.reference, amountCents: fact.amountCents, currency: fact.currency, state: fact.state };
  }
  throw new Error('INVALID_COMMAND');
}

if (require.main === module) main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(() => {
  console.error('tool_commerce_ops:failed — verifique comando, ambiente e acesso aos serviços');
  process.exitCode = 1;
});

module.exports = { usage, main };
