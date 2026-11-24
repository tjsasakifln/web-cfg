const { randomBytes } = require('node:crypto');
const { PACKAGES, TERMS, TERMS_HASH, CATALOG_VERSION, REFERRAL_LIMIT, ORDER_LIMIT, check, mac, sha, accountId, orderId, normalizeEmail } = require('./policy.cjs');

const { available, subscriptionSummary, BASIC, activeCycle, hasPaidPeriod } = require('./subscription-policy.cjs');
const consent = require('./export-consent.cjs');
const ORIGIN = 'CONFENGE_WEB';
const emptyInviteStats = () => ({ earned: 0, pending: 0, reversed: 0, month: '', grantedThisMonth: 0 });
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const day = t => {
  const parts = Object.fromEntries(calendar.formatToParts(t).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const month = t => day(t).slice(0, 7);
function endOfMonth(t) { const [y,m]=month(t).split('-').map(Number);return Date.UTC(y,m,1,3); }
const activeOrder = status => status === 'creating' || status === 'pending';
const recentSummary = order => ({ id: order.id, status: order.status, packageId: order.packageId });
const updateRecent = (wallet, order) => [recentSummary(order), ...wallet.recentOrders.filter(o => o.id !== order.id)].slice(0, 12);
const blocked = w => w.blocked || (w.disputeHolds || 0) > 0;
const publicAccount = (w, now = Date.now()) => ({ ...subscriptionSummary(w, now), paid: w.paid, promo: w.promo, freeAvailable: w.freeAvailable,
  blocked: blocked(w), referralCode: w.referralCode, invites: { earned: w.invites.earned, pending: w.invites.pending }, recentOrders: w.recentOrders });
const publicOrder = order => ({ ...recentSummary(order), amountCents: order.amountCents, credits: order.credits, currency: order.currency,
  paymentFlow: order.paymentFlow || 'pix',
  ...(activeOrder(order.status) ? order.checkout || order.pix || {} : {}) });

function createLedger({ db, mode, identityKey, clock = Date.now, experiment = null, requireConsent = false, economics = null }) {
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
      const experimentRef = experiment && (!old || !old.experimentGroup) ? doc('experiments','retention-v1') : null;
      const allocation = experimentRef ? await get(tx, experimentRef) || { treatment:0 } : null;
      const group = allocation ? parseInt(sha('retention-v1:'+id).slice(0,2),16)%2===1 && allocation.treatment<experiment.maxAccounts?'B':'A' : null;
      check(!owner || owner.accountId === id, 'ACCOUNT_LINK_REQUIRED', 409);
      if (old) {
        check(old.emailKey === emailKey, 'ACCOUNT_LINK_REQUIRED', 409);
        if(group) {
          if(group==='B') tx.set(experimentRef,{treatment:allocation.treatment+1});
          tx.update(wallet(id),{experimentGroup:group,experimentAssignedAt:now});
        }
        return publicAccount(group ? {...old,experimentGroup:group} : old, now);
      }
      const inviterId = referralCode && (await get(tx, doc('referralCodes', referralCode)))?.accountId;
      const inviter = inviterId && inviterId !== id && await get(tx, wallet(inviterId));
      const referredBy = inviter && !blocked(inviter) && inviter.emailKey !== emailKey ? inviterId : null;
      const account = { emailKey, freeAvailable: true, paid: 0, promo: 0, blocked: false, debt: 0,
        referralCode: code, referredBy, referralState: referredBy ? 'pending' : 'none', referralOrder: null,
        invites: emptyInviteStats(), lotIds: [], recentOrders: [], createdAt: now, orderDay: '', orderCount: 0 };
      if(group) {
        account.experimentGroup=group;account.experimentAssignedAt=now;
        if(group==='B') tx.set(experimentRef,{treatment:allocation.treatment+1});
      }
      tx.create(wallet(id), account);
      if (!owner) tx.create(emailRef, { accountId: id, createdAt: now });
      tx.create(codeRef, { accountId: id });
      append(tx, id, 'welcome', { type: 'welcome', bucket: 'free', delta: 1 }, now);
      if (referredBy) tx.update(wallet(referredBy), { invites: { ...inviter.invites, pending: inviter.invites.pending + 1 } });
      return publicAccount(account, now);
    });
  }

  function experimentEligible(w,now) {
    return w.experimentGroup==='B'&&!w.freeAvailable&&!hasPaidPeriod(w,now)&&
      (!w.subscriptionId||w.subscriptionStatus==='cancelled')&&w.experimentMonth!==month(now);
  }
  function experimentGranted(w,now) { return w.experimentGrantMonth===month(now)&&w.experimentGrantExpiresAt>now; }
  async function account(uid) {
    const now=clock(),w=requireWallet((await wallet(accountId(uid)).get()).data());
    const granted=experimentGranted(w,now);
    const eligible=experimentEligible(w,now);
    if(!w.experimentGroup&&!experiment&&!granted)return publicAccount(w,now);
    const budget=eligible&&experiment&&!granted?(await doc('experimentBudgets',month(now)).get()).data():null;
    const available=Boolean(eligible&&(granted||experiment&&((budget?.spentCents||0)+experiment.costCents<=experiment.budgetCents)));
    return {...publicAccount(w,now),experimental:{group:w.experimentGroup||null,eligible,available,
      consumed:w.experimentMonth===month(now),validUntil:endOfMonth(now),eligibleTools:granted?(w.experimentGrantOperations||BASIC.map(t=>t+':*')).map(o=>o.split(':')[0]):experiment?.eligibleOperations?.map(o=>o.split(':')[0])||[...BASIC],
      eligibleOperations:granted?(w.experimentGrantOperations||[]):experiment?.eligibleOperations||[],
      origin:'experiment',credits:available?1:0}};
  }
  async function selectBucket(tx,w,toolId,now,format) {
    const cycle=activeCycle(w,now),op=toolId+':'+(format||'*');
    if(available(cycle,now)>0) {
      const pinned=cycle.policyId?await get(tx,doc('subscriptionEconomicPolicies',cycle.policyId)):null;
      check(!cycle.policyId||pinned?.operationLimits,'COMMERCE_UNAVAILABLE',503);
      return {bucket:'subscription',source:cycle.cycleId,validUntil:cycle.expiresAt,cycle,
        limits:(pinned?.operationLimits||economics?.operationLimits)?.[op],
        limitsRequired:Boolean(pinned||economics?.approved)};
    }
    const eligibleOps=experimentGranted(w,now)?w.experimentGrantOperations:experiment?.eligibleOperations;
    if(experimentEligible(w,now)&&BASIC.includes(toolId)&&(!eligibleOps||eligibleOps.includes(op))) {
      if(experimentGranted(w,now))return {bucket:'experiment',source:month(now),validUntil:w.experimentGrantExpiresAt,granted:true,limits:w.experimentGrantLimits?.[op]||economics?.operationLimits?.[op],limitsRequired:Boolean(w.experimentGrantLimits||economics?.approved)};
      if(experiment) {
        const budgetRef=doc('experimentBudgets',month(now)),budget=await get(tx,budgetRef)||{spentCents:0};
        if(budget.spentCents+experiment.costCents<=experiment.budgetCents)
          return {bucket:'experiment',source:month(now),validUntil:endOfMonth(now),budgetRef,budget,limits:economics?.operationLimits?.[op],limitsRequired:Boolean(economics?.approved)};
      }
    }
    if(w.freeAvailable)return {bucket:'free',source:'welcome'};
    if(w.promo>0)return {bucket:'promo',source:'promo'};
    if(w.paid>0)return {bucket:'paid',source:w.lotIds[0]};
    return null;
  }
  function grantExperiment(tx,id,selection,now) {
    if(selection.bucket!=='experiment'||selection.granted)return {};
    tx.set(selection.budgetRef,{spentCents:selection.budget.spentCents+experiment.costCents});
    append(tx,id,'experiment-'+month(now),{type:'experiment_grant',bucket:'experiment',delta:1,expiresAt:selection.validUntil},now);
    return {experimentGrantMonth:month(now),experimentGrantExpiresAt:selection.validUntil,
      ...(experiment.eligibleOperations?{experimentGrantOperations:experiment.eligibleOperations,...(economics?.approved?{experimentGrantLimits:Object.fromEntries(experiment.eligibleOperations.map(op=>[op,economics.operationLimits[op]]))}:{})}:{})};
  }
  async function quoteExport({uid,toolId,requestId,digest,format,bytes}) {
    const id=accountId(uid), exportId=sha('export\0'+id+'\0'+requestId.toLowerCase()), now=clock();
    return db.runTransaction(async tx=>{
      const previousById=await get(tx,doc('exports',exportId));
      const index=previousById?null:await get(tx,doc('exportArtifacts',sha(id+'\0'+toolId+'\0'+digest)));
      const previous=previousById||(index?await get(tx,doc('exports',index.exportId)):null);
      check(!index||previous,'COMMERCE_UNAVAILABLE',503);
      if(previous) {
        check(previous.accountId===id&&previous.toolId===toolId&&previous.digest===digest,'REQUEST_CONFLICT',409);
        return consent.issue(identityKey,{accountId:id,exportId,toolId,digest,bucket:previous.bucket,source:previous.source||'recovery',now,recovery:true});
      }
      const w=requireWallet(await get(tx,wallet(id)));
      check(!blocked(w),'ACCOUNT_BLOCKED',409);
      const selection=await selectBucket(tx,w,toolId,now,format);
      check(selection,'NO_CREDITS',402);
      const limits=selection.limits;
      if(selection.limitsRequired)check(limits&&Number.isSafeInteger(bytes)&&bytes<=limits.maxPayloadBytes,'OPERATION_LIMIT',422);
      const grant=grantExperiment(tx,id,selection,now);
      if(Object.keys(grant).length)tx.update(wallet(id),grant);
      return consent.issue(identityKey,{accountId:id,exportId,toolId,digest,...selection,now});
    });
  }

  async function startOrder({ uid, packageId, requestId, termsVersion, paymentFlow = 'pix' }) {
    const pack = PACKAGES.find(p => p.id === packageId);
    check(pack, 'INVALID_PACKAGE', 422);
    check(paymentFlow === 'pix' || paymentFlow === 'checkout', 'INVALID_PAYMENT_METHOD', 422);
    const buyer = accountId(uid);
    const id = orderId(uid, requestId);
    const now = clock();
    return db.runTransaction(async tx => {
      const w = requireWallet(await get(tx, wallet(buyer)));
      const existing = await get(tx, orders(id));
      if (existing) {
        check(existing.accountId === buyer && existing.packageId === packageId &&
          existing.termsVersion === termsVersion && (existing.paymentFlow || 'pix') === paymentFlow, 'REQUEST_CONFLICT', 409);
        return { created: false, order: existing };
      }
      check(termsVersion === TERMS, 'TERMS_REQUIRED', 422);
      check(!blocked(w), 'ACCOUNT_BLOCKED', 409);
      const count = w.orderDay === day(now) ? w.orderCount : 0;
      check(count < ORDER_LIMIT, 'ORDER_LIMIT', 429);
      const order = { id, accountId: buyer, origin: ORIGIN, currency: 'BRL', packageId,
        catalogVersion: CATALOG_VERSION, termsVersion, termsHash: TERMS_HASH, termsAcceptedAt: now, createdAt: now,
        credits: pack.credits, amountCents: pack.amountCents, provider: 'mercado_pago', paymentFlow,
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
      const recover = !order.providerId && (order.reason === 'creation_uncertain' ||
        (order.status === 'creating' && now - order.createdAt > 60_000));
      if ((!recover && !(order.providerId && order.status === 'pending')) || order.nextPollAt > now) return { order, poll: false };
      tx.update(ref, { nextPollAt: now + (recover ? 30_000 : 7000) });
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

  async function observe(fact, { creation = false, sellerCreditConfirmed = false } = {}) {
    const now = clock();
    return db.runTransaction(async tx => {
      const orderRef = orders(fact.reference);
      const o = await get(tx, orderRef);
      if (!o) return null;
      const paymentFlow = o.paymentFlow || 'pix';
      check(o.amountCents === fact.amountCents && o.currency === fact.currency &&
        paymentFlow === (fact.paymentFlow || 'pix') &&
        (!o.providerId || o.providerId === fact.providerId), 'PAYMENT_MISMATCH', 422);
      const providerRef = doc('providerOrders', sha(fact.providerId));
      const binding = await get(tx, providerRef);
      check(!binding || binding.orderId === o.id, 'PAYMENT_MISMATCH', 422);
      const dispute = fact.state === 'review' && (fact.dispute === 'open' || fact.dispute === 'won');
      if (sellerCreditConfirmed) {
        check(!creation && dispute && fact.dispute === 'won' && o.credited && o.status === 'review' &&
          o.disputeHold === true, 'DISPUTE_NOT_RESOLVABLE', 409);
      }
      if (o.status === 'reversed') return o;
      if (o.providerUpdatedAt && fact.providerUpdatedAt && fact.providerUpdatedAt < o.providerUpdatedAt) return o;
      if (dispute && o.disputeResolvedAt &&
          (!fact.providerUpdatedAt || fact.providerUpdatedAt <= o.disputeResolvedAt)) return o;
      // A POST response can bind an order. Funding requires a verified GET.
      const state = creation && ['paid', 'reversed'].includes(fact.state) ? 'pending' : fact.state;
      if (o.credited && ['pending', 'failed', 'paid'].includes(state)) return o;
      const w = requireWallet(await get(tx, wallet(o.accountId)));
      const shouldRevokeReferral = state === 'reversed' && w.referralState === 'earned' && w.referralOrder === o.id;
      const inviter = shouldRevokeReferral && await get(tx, wallet(w.referredBy));
      const next = { ...o, providerId: fact.providerId, updatedAt: now };
      delete next.reason;
      if (fact.providerUpdatedAt) next.providerUpdatedAt = fact.providerUpdatedAt;
      const changes = {};
      if (!binding) tx.create(providerRef, { orderId: o.id, providerId: fact.providerId });

      if (state === 'paid') {
        next.status = 'paid'; next.credited = true; next.remaining = o.credits; next.paidAt = now;
        changes.paid = w.paid + o.credits;
        changes.lotIds = [...w.lotIds, o.id];
        append(tx, o.accountId, `purchase-${o.id}`, { type: `${paymentFlow}_paid`, orderId: o.id, bucket: 'paid', delta: o.credits,
          providerId: fact.providerId, amountCents: o.amountCents, currency: o.currency }, now);
      } else if (state === 'reversed') {
        next.status = 'reversed'; next.remaining = 0;
        if (o.credited) {
          const used = o.credits - o.remaining;
          changes.paid = w.paid - o.remaining;
          changes.lotIds = w.lotIds.filter(id => id !== o.id);
          changes.blocked = w.blocked || used > 0;
          changes.debt = w.debt + used;
          append(tx, o.accountId, `reverse-${o.id}`, { type: `${paymentFlow}_reversed`, orderId: o.id, bucket: 'paid',
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
        if (state === 'review' && o.credited) {
          if (dispute) next.disputeHold = true;
          else changes.blocked = true;
        }
      }
      if (sellerCreditConfirmed || state === 'reversed') {
        next.disputeHold = false;
        if (sellerCreditConfirmed) {
          next.status = 'paid';
          next.disputeResolvedAt = fact.providerUpdatedAt || now;
          append(tx, o.accountId, `dispute-release-${o.id}-${next.disputeResolvedAt}`,
            { type: 'dispute_released', orderId: o.id, providerId: fact.providerId }, now);
        }
      }
      if (Boolean(next.disputeHold) !== Boolean(o.disputeHold)) {
        changes.disputeHolds = (w.disputeHolds || 0) + (next.disputeHold ? 1 : -1);
        check(changes.disputeHolds >= 0, 'COMMERCE_UNAVAILABLE', 503);
      }
      if (next.status === 'pending') {
        // No payer or raw provider payload is stored. QR expires with the order.
        const fields = paymentFlow === 'checkout' ? ['checkoutUrl', 'expiresAt'] : ['qrCode', 'qrImage', 'checkoutUrl', 'expiresAt'];
        next[paymentFlow] = {};
        for (const key of fields) {
          if (fact[key] != null) next[paymentFlow][key] = fact[key];
          else if (o[paymentFlow]?.[key] != null) next[paymentFlow][key] = o[paymentFlow][key];
        }
      } else {
        delete next.pix;
        delete next.checkout;
      }
      tx.set(orderRef, next);
      tx.update(wallet(o.accountId), { ...changes, recentOrders: updateRecent(w, next) });
      return next;
    });
  }

  async function completeExport({ uid, toolId, requestId, digest, authorization, format, bytes }) {
    const id = accountId(uid);
    const exportId = sha(`export\0${id}\0${requestId.toLowerCase()}`);
    const exportRef = doc('exports', exportId);
    const now = clock();
    return db.runTransaction(async tx => {
      const previousById=await get(tx,exportRef);
      const artifactRef=doc('exportArtifacts',sha(id+'\0'+toolId+'\0'+digest));
      const indexed=Boolean(authorization||requireConsent);
      const index=previousById||!indexed?null:await get(tx,artifactRef);
      const previous=previousById||(index?await get(tx,doc('exports',index.exportId)):null);
      check(!index||previous,'COMMERCE_UNAVAILABLE',503);
      if (previous) {
        check(previous.accountId === id && previous.toolId === toolId && previous.digest === digest, 'REQUEST_CONFLICT', 409);
        return previous;
      }
      const w = requireWallet(await get(tx, wallet(id)));
      check(!blocked(w), 'ACCOUNT_BLOCKED', 409);
      const selection=await selectBucket(tx,w,toolId,now,format);
      check(selection,'NO_CREDITS',402);
      const {bucket,source,cycle}=selection;
      const opKey=toolId+':'+(format||'*');
      const limits=selection.limits;
      // Only enforce new measured commercial limits on new hybrid benefits.
      // Never silently reduce established legacy entitlements.
      if(selection.limitsRequired) {
        check(limits&&Number.isSafeInteger(bytes)&&bytes<=limits.maxPayloadBytes,'OPERATION_LIMIT',422);
        const daily=w.operationUsage?.day===day(now)?w.operationUsage.counts||{}:{};
        check((daily[opKey]||0)<limits.maxDailyExports,'OPERATION_LIMIT',429);
      }
      // Legacy clients are accepted only while hybrid benefits are disabled.
      // The upgraded client always sends a quote, even for conventional credits.
      if(requireConsent||authorization||w.subscriptionId||experimentGranted(w,now)||bucket==='experiment')
        consent.verify(identityKey,authorization,{accountId:id,exportId,toolId,digest,bucket,source},now);
      const proRef=cycle?doc('subscriptionCycles',cycle.cycleId):null;
      const proLot=proRef&&await get(tx,proRef);
      if(cycle)check(proLot?.accountId===id&&proLot.status==='paid'&&proLot.remaining===cycle.remaining,'COMMERCE_UNAVAILABLE',503);
      const lotId = bucket === 'paid' ? w.lotIds[0] : null;
      const lot = lotId && await get(tx, orders(lotId));
      if (bucket === 'paid') check(lot?.accountId === id && lot.status === 'paid' && lot.remaining > 0, 'COMMERCE_UNAVAILABLE', 503);
      const pendingRef = bucket === 'paid' && w.referralState === 'pending';
      const inviter = pendingRef && await get(tx, wallet(w.referredBy));
      const event = { exportId, accountId: id, toolId, digest, bucket, source, at: now, orderId: lotId, origin: ORIGIN };
      const updates = {};
      if(selection.limitsRequired&&limits) {
        const daily=w.operationUsage?.day===day(now)?w.operationUsage.counts||{}:{};
        updates.operationUsage={day:day(now),counts:{...daily,[opKey]:(daily[opKey]||0)+1}};
      }
      if(bucket==='experiment') {
        Object.assign(updates,grantExperiment(tx,id,selection,now));
        updates.experimentMonth=month(now);
      }
      if(bucket==='subscription') {
        const next={...cycle,remaining:cycle.remaining-1};
        if(w.proCycles)updates.proCycles={...w.proCycles,[cycle.cycleId]:next};
        else updates.proCycle=next;
        tx.update(proRef,{remaining:proLot.remaining-1});
      }
      if (bucket === 'free') updates.freeAvailable = false;
      if (bucket === 'promo') updates.promo = w.promo - 1;
      if (lot) {
        updates.paid = w.paid - 1;
        if (lot.remaining === 1) updates.lotIds = w.lotIds.slice(1);
        tx.update(orders(lotId), { remaining: lot.remaining - 1 });
      }
      if (inviter) {
        const count = inviter.invites.month === month(now) ? inviter.invites.grantedThisMonth : 0;
        const grant = !blocked(inviter) && count < REFERRAL_LIMIT;
        updates.referralState = grant ? 'earned' : 'ineligible';
        updates.referralOrder = lotId;
        tx.update(wallet(w.referredBy), { promo: inviter.promo + Number(grant), invites: { ...inviter.invites,
          pending: inviter.invites.pending - 1, earned: inviter.invites.earned + Number(grant),
          month: month(now), grantedThisMonth: count + Number(grant) } });
        if (grant) append(tx, w.referredBy, `referral-${id}`, { type: 'referral_earned', orderId: lotId,
          exportId, bucket: 'promo', delta: 1 }, now);
      }
      if(indexed)tx.create(artifactRef,{exportId,createdAt:now});
      tx.create(exportRef, event);
      append(tx, id, `export-${exportId}`, { type: 'export', toolId, exportId, orderId: lotId, bucket, source, delta: -1 }, now);
      tx.update(wallet(id), updates);
      return event;
    });
  }

  return { register, account, startOrder, getOrder, markCreationUnknown, observe, quoteExport, completeExport };
}

module.exports = { createLedger, publicOrder };
