const test = require('node:test');
const assert = require('node:assert/strict');
const { usage } = require('../../runtime/tools-commerce/ops.cjs');

const doc = (path, value) => ({ id: path.split('/').at(-1), ref: { path }, get(key) { return key.split('.').reduce((current, part) => current?.[part], value); } });
const query = docs => {
  const filters = [];
  return {
    where(key, op, value) { filters.push([key, op, value]); return this; },
    async get() {
      const selected = docs.filter(item => filters.every(([key, op, value]) =>
        op === '>=' ? item.get(key) >= value : op === '<' ? item.get(key) < value : op === '>' ? item.get(key) > value : false));
      return { docs: selected, size: selected.length };
    }
  };
};
const fakeDb = ({ accounts = [], exports = [], orders = [], ledger = [], ledgerRunner = operation => operation() }) => ({
  collection(name) {
    assert.equal(name, 'toolsCommerce');
    return { doc(id) {
      const path = `toolsCommerce/${id}`;
      return { path, collection(kind) {
        const rows = { accounts, exports, orders }[kind];
        const collection = query(rows);
        if (kind === 'accounts') collection.doc = accountId => ({ collection(leaf) {
          assert.equal(leaf, 'ledger');
          const ledgerQuery = query(ledger.filter(item => item.ref.path.startsWith(`${path}/accounts/${accountId}/ledger/`)));
          const read = ledgerQuery.get.bind(ledgerQuery);
          ledgerQuery.get = () => ledgerRunner(read);
          return ledgerQuery;
        } });
        return collection;
      } };
    } };
  },
  collectionGroup() { throw new Error('collection-group indexes must not be required'); }
});

test('usage preserves the registration cohort and separately counts later referral events once', async () => {
  const december = value => Date.parse(`${value}T12:00:00-03:00`);
  const oldAccount = doc('toolsCommerce/v1-live/accounts/old', { createdAt: Date.parse('2026-11-30T12:00:00-03:00'), referredBy: 'inviter', referralState: 'reversed' });
  const beforeLocalMidnight = doc('toolsCommerce/v1-live/accounts/before', { createdAt: Date.parse('2026-12-01T02:59:59Z') });
  const atLocalMidnight = doc('toolsCommerce/v1-live/accounts/boundary', { createdAt: Date.parse('2026-12-01T03:00:00Z') });
  const currentAccount = doc('toolsCommerce/v1-live/accounts/current', { createdAt: december('2026-12-02'), referredBy: 'inviter', referralState: 'pending' });
  const inviter = doc('toolsCommerce/v1-live/accounts/inviter', { createdAt: Date.parse('2026-10-01T12:00:00-03:00'), invites: { earned: 0, reversed: 1 } });
  const earned = doc('toolsCommerce/v1-live/accounts/inviter/ledger/referral-old', { at: december('2026-12-05'), type: 'referral_earned' });
  const reversed = doc('toolsCommerce/v1-live/accounts/inviter/ledger/referral-reverse-old', { at: december('2026-12-10'), type: 'referral_reversed' });
  const foreignMode = doc('toolsCommerce/v1-emulator/accounts/inviter/ledger/referral-foreign', { at: december('2026-12-06'), type: 'referral_earned' });
  const db = fakeDb({ accounts: [oldAccount, beforeLocalMidnight, atLocalMidnight, currentAccount, inviter], ledger: [earned, earned, reversed, foreignMode] });

  const result = await usage(db, 'live', '2026-12-01', '2027-01-01');

  assert.deepEqual(result.referralCohort, { linked: 1, firstPaidUse: 0, rewardActive: 0, rewardReversed: 0 });
  assert.equal(result.newAccounts, 2, 'the interval starts at midnight in America/Sao_Paulo');
  assert.deepEqual(result.referralEvents, { earned: 1, reversed: 1, net: 0 });
  assert.match(result.referralMeasurement.cohortDenominator, /criadas no intervalo/);
  assert.match(result.referralMeasurement.maturity, /após o cadastro/);
  assert.match(result.referralMeasurement.queryPlan, /20 consultas concorrentes/);
});

test('usage queries only referral-active account ledgers and never depends on a collection-group index', async () => {
  const at = Date.parse('2026-12-05T12:00:00-03:00');
  const active = doc('toolsCommerce/v1-live/accounts/active', { createdAt: at, invites: { earned: 1, reversed: 0 } });
  const inactive = doc('toolsCommerce/v1-live/accounts/inactive', { createdAt: at, invites: { earned: 0, reversed: 0 } });
  const event = doc('toolsCommerce/v1-live/accounts/active/ledger/referral-new', { at, type: 'referral_earned' });
  const ignored = doc('toolsCommerce/v1-live/accounts/inactive/ledger/referral-impossible', { at, type: 'referral_earned' });
  const result = await usage(fakeDb({ accounts: [active, inactive], ledger: [event, ignored] }), 'live', '2026-12-01', '2027-01-01');
  assert.deepEqual(result.referralEvents, { earned: 1, reversed: 0, net: 1 });
});

test('usage bounds per-inviter ledger reads to twenty concurrent operations', async () => {
  let active = 0, maximum = 0;
  const ledgerRunner = async operation => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    try { return await operation(); } finally { active--; }
  };
  const createdAt = Date.parse('2026-10-01T12:00:00-03:00');
  const accounts = Array.from({ length: 45 }, (_, index) =>
    doc(`toolsCommerce/v1-live/accounts/inviter-${index}`, { createdAt, invites: { earned: 1, reversed: 0 } }));
  await usage(fakeDb({ accounts, ledgerRunner }), 'live', '2026-12-01', '2027-01-01');
  assert.equal(maximum, 20);
});

test('usage fails the report when a referral ledger cannot be read', async () => {
  const createdAt = Date.parse('2026-10-01T12:00:00-03:00');
  const inviter = doc('toolsCommerce/v1-live/accounts/inviter', { createdAt, invites: { earned: 1, reversed: 0 } });
  const db = fakeDb({ accounts: [inviter], ledgerRunner: async () => { throw new Error('ledger-read-failed'); } });
  await assert.rejects(usage(db, 'live', '2026-12-01', '2027-01-01'), /ledger-read-failed/);
});

test('usage rejects ambiguous or overlong reporting windows', async () => {
  const db = fakeDb({});
  await assert.rejects(usage(db, 'live', '2026-12-01', '2026-12-01'), /INVALID_INTERVAL/);
  await assert.rejects(usage(db, 'live', '2026-12-01', '2027-02-01'), /INVALID_INTERVAL/);
  await assert.rejects(usage(db, 'live', '01-12-2026', '2027-01-01'), /INVALID_INTERVAL/);
});
