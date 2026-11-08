const { randomBytes } = require('node:crypto');
const { PACKAGES, TERMS, TERMS_HASH, CATALOG_VERSION, REFERRAL_LIMIT, ORDER_LIMIT, check, mac, sha, accountId, orderId, normalizeEmail } = require('./policy.cjs');

const ORIGIN = 'CONFENGE_WEB';
const emptyInviteStats = () => ({ earned: 0, pending: 0, reversed: 0, month: '', grantedThisMonth: 0 });
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const day = t => {
  const parts = Object.fromEntries(calendar.formatToParts(t).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const month = t => day(t).slice(0, 7);
const activeOrder = status => status === 'creating' || status === 'pending';
const recentSummary = order => ({ id: order.id, status: order.status, packageId: order.packageId });
const updateRecent = (wallet, order) => [recentSummary(order), ...wallet.recentOrders.filter(o => o.id !== order.id)].slice(0, 12);
const publicAccount = w => ({ paid: w.paid, promo: w.promo, freeAvailable: w.freeAvailable,
  blocked: w.blocked, referralCode: w.referralCode, invites: { earned: w.invites.earned, pending: w.invites.pending }, recentOrders: w.recentOrders });
const publicOrder = order => ({ ...recentSummary(order), amountCents: order.amountCents, credits: order.credits, currency: order.currency,
  ...(activeOrder(order.status) && order.pix ? order.pix : {}) });

function createLedger({ db, mode, identityKey, clock = Date.now }) {
  const root = db.collection('toolsCommerce').doc(`v1-${mode}`);
  const doc = (kind, id) => root.collection(kind).doc(id);
  const wallet = id => doc('accounts', id);
  const orders = id => doc('orders', id);
  const get = async (tx, ref) => (await tx.get(ref)).data();
  const append = (tx, uid, eventId, details, now) => tx.create(wallet(uid).collection('ledger').doc(eventId),
    { origin: ORIGIN, at: now, ...details });
  const requireWallet = w => { check(w, 'ACCOUNT_REQUIRED', 409); return w; };

  async function register({ uid, email, referralCode }) {
    const id = accountId(uid);
    const emailKey = mac(identityKey, 'verified-email', normalizeEmail(email));
    const emailRef = doc('identities', emailKey);
    // Stable within a transaction retry, and independent of the account UID.
    const code = randomBytes(12).toString('base64url');
    const codeRef = doc('referralCodes', code);
    const now = clock();
    return db.runTransaction(async tx => {
      const old = await get(tx, wallet(id));
      const owner = await get(tx, emailRef);
      check(!owner || owner.accountId === id, 'ACCOUNT_LINK_REQUIRED', 409);
      if (old) {
        check(old.emailKey === emailKey, 'ACCOUNT_LINK_REQUIRED', 409);
        return publicAccount(old);
      }
      const inviterId = referralCode && (await get(tx, doc('referralCodes', referralCode)))?.accountId;
      const inviter = inviterId && inviterId !== id && await get(tx, wallet(inviterId));
      const referredBy = inviter && !inviter.blocked && inviter.emailKey !== emailKey ? inviterId : null;
      const account = { emailKey, freeAvailable: true, paid: 0, promo: 0, blocked: false, debt: 0,
        referralCode: code, referredBy, referralState: referredBy ? 'pending' : 'none', referralOrder: null,
        invites: emptyInviteStats(), lotIds: [], recentOrders: [], createdAt: now, orderDay: '', orderCount: 0 };
      tx.create(wallet(id), account);
      if (!owner) tx.create(emailRef, { accountId: id, createdAt: now });
      tx.create(codeRef, { accountId: id });
      append(tx, id, 'welcome', { type: 'welcome', bucket: 'free', delta: 1 }, now);
      if (referredBy) tx.update(wallet(referredBy), { invites: { ...inviter.invites, pending: inviter.invites.pending + 1 } });
      return publicAccount(account);
    });
  }

  async function account(uid) { return publicAccount(requireWallet((await wallet(accountId(uid)).get()).data())); }

  async function startOrder({ uid, packageId, requestId, termsVersion }) {
    const pack = PACKAGES.find(p => p.id === packageId);
    check(pack, 'INVALID_PACKAGE', 422);
    check(termsVersion === TERMS, 'TERMS_REQUIRED', 422);
    const buyer = accountId(uid);
    const id = orderId(uid, requestId);
    const now = clock();
    return db.runTransaction(async tx => {
      const w = requireWallet(await get(tx, wallet(buyer)));
      const existing = await get(tx, orders(id));
      if (existing) {
        check(existing.accountId === buyer && existing.packageId === packageId && existing.termsVersion === termsVersion, 'REQUEST_CONFLICT', 409);
        return { created: false, order: existing };
      }
      check(!w.blocked, 'ACCOUNT_BLOCKED', 409);
      const count = w.orderDay === day(now) ? w.orderCount : 0;
      check(count < ORDER_LIMIT, 'ORDER_LIMIT', 429);
      const order = { id, accountId: buyer, origin: ORIGIN, currency: 'BRL', packageId,
        catalogVersion: CATALOG_VERSION, termsVersion, termsHash: TERMS_HASH, termsAcceptedAt: now, createdAt: now,
        credits: pack.credits, amountCents: pack.amountCents, provider: 'mercado_pago',
        providerId: null, status: 'creating', remaining: 0, nextPollAt: 0, credited: false };
      tx.create(orders(id), order);
      tx.update(wallet(buyer), { orderDay: day(now), orderCount: count + 1, recentOrders: updateRecent(w, order) });
      return { created: true, order };
    });
  }

  async function getOrder(uid, id, poll = false) {
    const buyer = accountId(uid);
    const ref = orders(id);
    const now = clock();
    const owned = value => {
      check(value?.accountId === buyer, 'ORDER_NOT_FOUND', 404);
      return value;
    };
    if (!poll) return { order: owned((await ref.get()).data()), poll: false };
    return db.runTransaction(async tx => {
      const order = owned(await get(tx, ref));
      if (!order.providerId || order.status !== 'pending' || order.nextPollAt > now) return { order, poll: false };
      tx.update(ref, { nextPollAt: now + 7000 });
      return { order, poll: true };
    });
  }

  async function markCreationUnknown(id) {
    const now = clock();
    return db.runTransaction(async tx => {
      const o = await get(tx, orders(id));
      if (!o || o.status !== 'creating') return o;
      const w = requireWallet(await get(tx, wallet(o.accountId)));
      const update = { status: 'review', reason: 'creation_uncertain', updatedAt: now };
      const next = { ...o, ...update };
      tx.update(orders(id), update);
      tx.update(wallet(o.accountId), { recentOrders: updateRecent(w, next) });
      return next;
    });
  }

  async function observe(fact, { creation = false } = {}) {
    const now = clock();
    return db.runTransaction(async tx => {
      const orderRef = orders(fact.reference);
      const o = await get(tx, orderRef);
      if (!o) return null;
      check(o.amountCents === fact.amountCents && o.currency === fact.currency &&
        (!o.providerId || o.providerId === fact.providerId), 'PAYMENT_MISMATCH', 422);
      const providerRef = doc('providerOrders', sha(fact.providerId));
      const binding = await get(tx, providerRef);
      check(!binding || binding.orderId === o.id, 'PAYMENT_MISMATCH', 422);
      if (o.status === 'reversed') return o;
      // A POST response can bind a QR/order, never fund a wallet. GET is required.
      const state = creation && ['paid', 'reversed'].includes(fact.state) ? 'pending' : fact.state;
      if (o.credited && ['pending', 'failed', 'paid'].includes(state)) return o;
      const w = requireWallet(await get(tx, wallet(o.accountId)));
      const shouldRevokeReferral = state === 'reversed' && w.referralState === 'earned' && w.referralOrder === o.id;
      const inviter = shouldRevokeReferral && await get(tx, wallet(w.referredBy));
      const next = { ...o, providerId: fact.providerId, updatedAt: now };
      const changes = {};
      if (!binding) tx.create(providerRef, { orderId: o.id, providerId: fact.providerId });

      if (state === 'paid') {
        next.status = 'paid'; next.credited = true; next.remaining = o.credits; next.paidAt = now;
        changes.paid = w.paid + o.credits;
        changes.lotIds = [...w.lotIds, o.id];
        append(tx, o.accountId, `purchase-${o.id}`, { type: 'pix_paid', orderId: o.id, bucket: 'paid', delta: o.credits,
          providerId: fact.providerId, amountCents: o.amountCents, currency: o.currency }, now);
      } else if (state === 'reversed') {
        next.status = 'reversed'; next.remaining = 0;
        if (o.credited) {
          const used = o.credits - o.remaining;
          changes.paid = w.paid - o.remaining;
          changes.lotIds = w.lotIds.filter(id => id !== o.id);
          changes.blocked = w.blocked || used > 0;
          changes.debt = w.debt + used;
          append(tx, o.accountId, `reverse-${o.id}`, { type: 'pix_reversed', orderId: o.id, bucket: 'paid',
            delta: -o.remaining, debt: used, providerId: fact.providerId }, now);
        }
        if (inviter) {
          const delta = inviter.promo > 0 ? -1 : 0;
          tx.update(wallet(w.referredBy), { promo: inviter.promo + delta,
            debt: inviter.debt + Number(delta === 0), blocked: inviter.blocked || delta === 0,
            invites: { ...inviter.invites,
            earned: inviter.invites.earned - 1, reversed: inviter.invites.reversed + 1 } });
          changes.referralState = 'reversed';
          append(tx, w.referredBy, `referral-reverse-${o.accountId}`, { type: 'referral_reversed', orderId: o.id,
            bucket: 'promo', delta, alreadyUsed: delta === 0 }, now);
        }
      } else {
        next.status = state;
        if (state === 'review' && o.credited) changes.blocked = true;
      }
      if (next.status === 'pending') {
        // No payer or raw provider payload is stored. QR expires with the order.
        next.pix = {};
        for (const key of ['qrCode', 'qrImage', 'checkoutUrl', 'expiresAt']) {
          if (fact[key] != null) next.pix[key] = fact[key];
          else if (o.pix?.[key] != null) next.pix[key] = o.pix[key];
        }
      } else delete next.pix;
      tx.set(orderRef, next);
      tx.update(wallet(o.accountId), { ...changes, recentOrders: updateRecent(w, next) });
      return next;
    });
  }

  async function completeExport({ uid, toolId, requestId, digest }) {
    const id = accountId(uid);
    const exportId = sha(`export\0${id}\0${requestId.toLowerCase()}`);
    const exportRef = doc('exports', exportId);
    const now = clock();
    return db.runTransaction(async tx => {
      const previous = await get(tx, exportRef);
      if (previous) {
        check(previous.accountId === id && previous.toolId === toolId && previous.digest === digest, 'REQUEST_CONFLICT', 409);
        return previous;
      }
      const w = requireWallet(await get(tx, wallet(id)));
      check(!w.blocked, 'ACCOUNT_BLOCKED', 409);
      const bucket = w.freeAvailable ? 'free' : w.promo > 0 ? 'promo' : w.paid > 0 ? 'paid' : null;
      check(bucket, 'NO_CREDITS', 402);
      const lotId = bucket === 'paid' ? w.lotIds[0] : null;
      const lot = lotId && await get(tx, orders(lotId));
      if (bucket === 'paid') check(lot?.accountId === id && lot.status === 'paid' && lot.remaining > 0, 'COMMERCE_UNAVAILABLE', 503);
      const pendingRef = bucket === 'paid' && w.referralState === 'pending';
      const inviter = pendingRef && await get(tx, wallet(w.referredBy));
      const event = { exportId, accountId: id, toolId, digest, bucket, at: now, orderId: lotId, origin: ORIGIN };
      const updates = {};
      if (bucket === 'free') updates.freeAvailable = false;
      if (bucket === 'promo') updates.promo = w.promo - 1;
      if (lot) {
        updates.paid = w.paid - 1;
        if (lot.remaining === 1) updates.lotIds = w.lotIds.slice(1);
        tx.update(orders(lotId), { remaining: lot.remaining - 1 });
      }
      if (inviter) {
        const count = inviter.invites.month === month(now) ? inviter.invites.grantedThisMonth : 0;
        const grant = !inviter.blocked && count < REFERRAL_LIMIT;
        updates.referralState = grant ? 'earned' : 'ineligible';
        updates.referralOrder = lotId;
        tx.update(wallet(w.referredBy), { promo: inviter.promo + Number(grant), invites: { ...inviter.invites,
          pending: inviter.invites.pending - 1, earned: inviter.invites.earned + Number(grant),
          month: month(now), grantedThisMonth: count + Number(grant) } });
        if (grant) append(tx, w.referredBy, `referral-${id}`, { type: 'referral_earned', orderId: lotId,
          exportId, bucket: 'promo', delta: 1 }, now);
      }
      tx.create(exportRef, event);
      append(tx, id, `export-${exportId}`, { type: 'export', toolId, exportId, orderId: lotId, bucket, delta: -1 }, now);
      tx.update(wallet(id), updates);
      return event;
    });
  }

  return { register, account, startOrder, getOrder, markCreationUnknown, observe, completeExport };
}

module.exports = { createLedger, publicOrder };
