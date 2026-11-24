const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { createLedger } = require('../../runtime/tools-commerce/ledger.cjs');
const { accountId } = require('../../runtime/tools-commerce/policy.cjs');
const { FREE } = require('../../runtime/tools-commerce/subscription-policy.cjs');

// Minimal in-memory Firestore: serializable transactions (one at a time), enough for the ledger.
function memoryDb() {
  const store = new Map();
  let queue = Promise.resolve();
  const clone = value => (value === undefined ? undefined : structuredClone(value));
  const ref = path => ({
    path,
    collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }),
    async get() { const v = store.get(path); return { exists: v !== undefined, data: () => clone(v) }; },
    async update(data) { assert.ok(store.has(path), 'missing ' + path); store.set(path, { ...store.get(path), ...clone(data) }); },
    async set(data) { store.set(path, clone(data)); },
  });
  const db = {
    collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    runTransaction(fn) {
      const run = queue.then(async () => {
        const writes = [];
        const tx = {
          async get(r) { return r.get(); },
          create(r, data) { writes.push(() => { assert.ok(!store.has(r.path), 'exists ' + r.path); store.set(r.path, clone(data)); }); },
          set(r, data) { writes.push(() => store.set(r.path, clone(data))); },
          update(r, data) { writes.push(() => { assert.ok(store.has(r.path), 'missing ' + r.path); store.set(r.path, { ...store.get(r.path), ...clone(data) }); }); },
        };
        const result = await fn(tx);
        writes.forEach(w => w());
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return { db, store };
}

const june = Date.parse('2029-06-15T12:00:00-03:00');
function setup(start = june) {
  const { db, store } = memoryDb();
  let now = start;
  const ledger = createLedger({ db, mode: 'emulator', identityKey: randomBytes(32), clock: () => now });
  const walletRef = user => db.collection('toolsCommerce').doc('v1-emulator').collection('accounts').doc(accountId(user.uid));
  const newUser = async () => { const u = { uid: randomUUID(), email: randomUUID() + '@example.test' }; await ledger.register(u); return u; };
  const exp = (user, extra = {}) => ({ uid: user.uid, toolId: 'calculadora-bdi', requestId: randomUUID(), digest: randomUUID(), ...extra });
  const spend = async (user, extra) => ledger.completeExport(exp(user, extra));
  return { ledger, store, walletRef, newUser, exp, spend, setNow: t => { now = t; } };
}

test('Free tem duas cortesias por mes', () => assert.equal(FREE.monthlyCourtesy, 2));

test('conta nova recebe duas cortesias e a terceira exportacao exige credito', async () => {
  const { ledger, newUser, spend } = setup();
  const user = await newUser();
  let account = await ledger.account(user.uid);
  assert.equal(account.freeRemaining, 2);
  assert.equal(account.freeMonthlyLimit, 2);
  assert.equal(account.freeAvailable, true);
  assert.equal(account.freeResetsAt, Date.UTC(2029, 6, 1, 3));
  const first = await spend(user), second = await spend(user);
  assert.equal(first.bucket, 'free'); assert.equal(second.bucket, 'free');
  assert.equal(first.source, 'courtesy-2029-06');
  account = await ledger.account(user.uid);
  assert.equal(account.freeRemaining, 0); assert.equal(account.freeAvailable, false);
  await assert.rejects(() => spend(user), /NO_CREDITS/);
});

test('cortesias renovam no mes seguinte (America/Sao_Paulo) e nao acumulam', async () => {
  const { ledger, newUser, spend, setNow } = setup();
  const used = await newUser(), idle = await newUser();
  await spend(used); await spend(used);
  await assert.rejects(() => spend(used), /NO_CREDITS/);
  setNow(Date.parse('2029-06-30T23:59:00-03:00'));
  assert.equal((await ledger.account(used.uid)).freeRemaining, 0, 'ainda junho em Sao Paulo');
  setNow(Date.parse('2029-07-01T00:00:00-03:00'));
  assert.equal((await ledger.account(used.uid)).freeRemaining, 2, 'renova na virada do mes');
  assert.equal((await ledger.account(idle.uid)).freeRemaining, 2, 'sem acumulo: nao usadas em junho nao somam');
  assert.equal((await spend(used)).source, 'courtesy-2029-07');
  assert.equal((await ledger.account(used.uid)).freeRemaining, 1);
});

test('conta legada que ja gastou a cortesia vitalicia ganha as duas do mes', async () => {
  const { ledger, newUser, walletRef, spend } = setup();
  const user = await newUser();
  await walletRef(user).update({ freeAvailable: false, courtesyMonth: undefined, courtesyUsed: undefined });
  const legacy = await ledger.account(user.uid);
  assert.equal(legacy.freeRemaining, 2); assert.equal(legacy.freeAvailable, true);
  assert.equal((await spend(user)).bucket, 'free');
});

test('duas exportacoes simultaneas disputando a ultima cortesia: so uma passa', async () => {
  const { ledger, newUser, spend } = setup();
  const user = await newUser();
  await spend(user);
  const results = await Promise.allSettled([spend(user), spend(user)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && /NO_CREDITS/.test(String(r.reason))).length, 1);
  assert.equal((await ledger.account(user.uid)).freeRemaining, 0);
});

test('repetir a mesma exportacao nao consome outra cortesia', async () => {
  const { ledger, newUser, exp } = setup();
  const user = await newUser();
  const request = exp(user);
  const a = await ledger.completeExport(request), b = await ledger.completeExport(request);
  assert.equal(a.exportId, b.exportId);
  assert.equal((await ledger.account(user.uid)).freeRemaining, 1);
});

test('apos as cortesias do mes o saldo promocional e usado em seguida', async () => {
  const { ledger, newUser, walletRef, spend } = setup();
  const user = await newUser();
  await walletRef(user).update({ promo: 1 });
  assert.equal((await spend(user)).bucket, 'free');
  assert.equal((await spend(user)).bucket, 'free');
  assert.equal((await spend(user)).bucket, 'promo');
  await assert.rejects(() => spend(user), /NO_CREDITS/);
  assert.equal((await ledger.account(user.uid)).freeRemaining, 0);
});
