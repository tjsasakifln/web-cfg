const { randomUUID } = require('node:crypto');
const { check, sha, accountId } = require('./policy.cjs');
const { PRO, available } = require('./subscription-policy.cjs');
const { createSubscriptionProvider } = require('./subscription-provider.cjs');

function createSubscriptions({db, cfg, provider=createSubscriptionProvider(cfg), verifySeller=async()=>{}, accountActive=null, clock=Date.now}) {
  const root=db.collection('toolsCommerce').doc('v1-'+cfg.mode);
  const doc=(kind,id)=>root.collection(kind).doc(id);
  const wallet=id=>doc('accounts',id), sub=id=>doc('subscriptions',id);
  const get=async(tx,ref)=>(await tx.get(ref)).data();
  const entry=(tx,id,key,details)=>tx.create(wallet(id).collection('ledger').doc(key),{origin:'CONFENGE_WEB',at:clock(),...details});
  const view=s=>s?{id:s.id,status:s.status,providerStatus:s.providerStatus||null,
    nextPaymentAt:s.nextPaymentAt||null,cancelRequested:Boolean(s.cancelRequested),offer:s.offer,
    ...(s.status==='pending'&&s.checkoutUrl?{checkoutUrl:s.checkoutUrl}:{})}:null;
  async function start(user,input) {
    check(input.offerId===PRO.id && input.termsVersion===PRO.termsVersion && input.accepted===true,'TERMS_REQUIRED',422);
    const aid=accountId(user.uid), id=randomUUID(), now=clock();
    await verifySeller();
    const started=await db.runTransaction(async tx=>{
      const w=await get(tx,wallet(aid)); check(w && !w.blocked && !(w.disputeHolds>0),'ACCOUNT_BLOCKED',409);
      const prior=w.subscriptionId?await get(tx,sub(w.subscriptionId)):null;
      if(prior && prior.status!=='cancelled') return {s:prior,created:false};
      // Never overlap paid periods from different subscriptions.
      check(!(w.proCycle && w.proCycle.expiresAt>now && ['paid','review'].includes(w.proCycle.status)),'CYCLE_STILL_ACTIVE',409);
      const s={id,accountId:aid,authUid:user.uid,offer:{...PRO},status:'requested',createdAt:now,termsAcceptedAt:now,
        providerId:null,cancelRequested:false,lastSweepAt:0};
      tx.create(sub(id),s);tx.update(wallet(aid),{subscriptionId:id,subscriptionStatus:s.status});
      return {s,created:true};
    });
    if(!started.created) return view(started.s);
    try {
      const {raw,url}=await provider.create({ref:id,offer:PRO,email:user.email,
        returnUrl:cfg.subscriptions.returnOrigin+'/ferramentas/#meus-creditos'});
      return view(await bind(raw,id,url));
    } catch {
      await db.runTransaction(async tx=>{
        const s=await get(tx,sub(id)); const w=await get(tx,wallet(aid));
        if(s.status==='requested' && !s.providerId) {
          tx.update(sub(id),{status:'creation_uncertain'});
          if(w?.subscriptionId===id) tx.update(wallet(aid),{subscriptionStatus:'creation_uncertain'});
        }
      });
      return view((await sub(id).get()).data());
    }
  }
  async function bind(raw,id,url) {
    return db.runTransaction(async tx=>{
      const s=await get(tx,sub(id)); if(!s) return null;
      provider.verifyContract(raw,s.offer,id);
      const binding=doc('providerSubscriptions',sha(raw.id));
      const b=await get(tx,binding),w=await get(tx,wallet(s.accountId));
      check((!b||b.id===id)&&(!s.providerId||s.providerId===raw.id),'SUBSCRIPTION_MISMATCH',422);
      if(s.status==='cancelled'&&raw.status!=='cancelled') return s;
      const modified=Date.parse(raw.last_modified||raw.date_created);
      check(Number.isFinite(modified),'SUBSCRIPTION_MISMATCH',422);
      if(s.providerUpdatedAt && modified<s.providerUpdatedAt) return s;
      const status=raw.status==='cancelled'?'cancelled':s.cancelRequested?'cancel_requested':raw.status;
      const next={...s,providerId:raw.id,providerStatus:raw.status,providerUpdatedAt:modified,status,
        nextPaymentAt:Number.isFinite(Date.parse(raw.next_payment_date))?Date.parse(raw.next_payment_date):null,
        checkoutUrl:status==='pending'?(url||s.checkoutUrl||provider.checkoutUrl(raw)):null};
      if(!b) tx.create(binding,{id});
      tx.set(sub(id),next);
      if(w?.subscriptionId===id) tx.update(wallet(s.accountId),{subscriptionStatus:status,subscriptionNextPaymentAt:next.nextPaymentAt});
      return next;
    });
  }
  async function observeInvoice(invoice,raw) {
    const ref=raw.external_reference;
    if(typeof ref!=='string'||!/^[a-f0-9-]{36}$/i.test(ref)) return null;
    const s0=(await sub(ref).get()).data(); if(!s0) return null;
    const s=await bind(raw,ref);
    const f=await provider.invoiceFact(invoice,raw,s.offer);
    const key=sha('invoice:'+f.invoiceId), cr=doc('subscriptionCycles',key);
    const now=clock();
    return db.runTransaction(async tx=>{
      const saved=await get(tx,sub(ref)), w=await get(tx,wallet(saved.accountId)), old=await get(tx,cr);
      const pRef=f.paymentId?doc('subscriptionPayments',sha(f.paymentId)):null;
      const binding=pRef?await get(tx,pRef):null;
      check(!binding||binding.cycleId===key,'PAYMENT_MISMATCH',422);
      if(old) {
        check(old.subscriptionId===ref,'PAYMENT_MISMATCH',422);
        if(old.invoiceUpdatedAt>f.invoiceUpdatedAt || old.paymentId===f.paymentId &&
          old.paymentUpdatedAt && old.paymentUpdatedAt>(f.paymentUpdatedAt||0)) return old;
        if(old.status==='reversed') return old;
        if(old.granted && (old.paymentId!==f.paymentId || ['pending','failed'].includes(f.state))) return old;
      }
      const c={...old,...f,subscriptionId:ref,accountId:saved.accountId,status:f.state,
        remaining:old?.remaining||0,granted:Boolean(old?.granted),observedAt:now};
      // Immutable cycle period for retries. Reject overlaps, including late
      // out-of-order invoices, rather than silently creating another allowance.
      if(old) {c.startsAt=old.startsAt;c.expiresAt=old.expiresAt;}
      check(w,'ACCOUNT_REQUIRED',409);
      const active=w.proCycle;
      if(f.state==='paid'&&!c.granted) {
        check(f.approvedAt!==null && f.approvedAt<=now,'PAYMENT_MISMATCH',422);
        if(c.expiresAt<=now || active && active.invoiceId!==c.invoiceId &&
          active.expiresAt>c.startsAt && c.expiresAt>active.startsAt || w?.subscriptionId!==ref) {
          c.status='review';c.reason='cycle_overlap_or_expired';
        } else {
          c.granted=true;c.remaining=saved.offer.credits;c.grantedAt=now;c.paidAt=f.approvedAt;
          entry(tx,saved.accountId,'subscription-grant-'+key,{type:'subscription_paid',bucket:'subscription',
            invoiceId:c.invoiceId,paymentId:c.paymentId,delta:c.remaining,amountCents:c.amountCents,currency:c.currency});
        }
      }
      if((c.status==='reversed'||c.status==='review')&&c.granted&&old?.status!==c.status) {
        // Partial refunds/disputes hold only the affected cycle. Keep its
        // unused quantity for operator review; a full reversal removes it.
        const delta=c.status==='reversed'?-c.remaining:0;
        c.reversalAt=now;
        if(c.status==='reversed') c.remaining=0;
        entry(tx,saved.accountId,'subscription-'+c.status+'-'+key+'-'+(f.paymentUpdatedAt||f.invoiceUpdatedAt),
          {type:'subscription_'+c.status,bucket:'subscription',invoiceId:c.invoiceId,delta,
            used:saved.offer.credits-(old?.remaining||0),refundedCents:f.refundedCents||0});
      }
      if(!binding&&pRef) tx.create(pRef,{cycleId:key});
      tx.set(cr,c);
      if(w && (active?.invoiceId===c.invoiceId || c.granted && c.status==='paid' &&
        w.subscriptionId===ref && (!active || c.startsAt>=active.expiresAt))) {
        tx.update(wallet(saved.accountId),{proCycle:{invoiceId:c.invoiceId,cycleId:key,startsAt:c.startsAt,
          expiresAt:c.expiresAt,remaining:c.remaining,status:c.status}});
      }
      return c;
    });
  }
  async function reconcile(id) {
    let s=(await sub(id).get()).data(); if(!s) return null;
    await verifySeller();
    let raw;
    if(s.providerId) raw=await provider.getSubscription(s.providerId);
    else {
      const candidates=(await provider.findSubscriptions(id)).filter(r=>r.external_reference===id);
      check(candidates.length<=1,'SUBSCRIPTION_DUPLICATE_REVIEW',409);
      if(!candidates.length) return view(s);
      raw=await provider.getSubscription(candidates[0].id);
    }
    s=await bind(raw,id);
    if (accountActive && s.authUid && s.status!=='cancelled' && !await accountActive(s.authUid) && !s.cancelRequested) {
      await requestCancel(s); s=(await sub(id).get()).data();
    }
    if(s.cancelRequested&&s.status!=='cancelled') {
      await provider.cancel(raw.id);raw=await provider.getSubscription(raw.id);s=await bind(raw,id);
    }
    const invoices=await provider.findInvoices(raw.id);
    invoices.sort((a,b)=>Date.parse(a.date_created)-Date.parse(b.date_created));
    for(const invoice of invoices) await observeInvoice(await provider.getInvoice(invoice.id),raw);
    return view(s);
  }
  async function owned(user) {
    const w=(await wallet(accountId(user.uid)).get()).data();
    return w?.subscriptionId?(await sub(w.subscriptionId).get()).data():null;
  }
  async function status(user,{refresh=false}={}) {
    const s=await owned(user); if(!s) return null;
    if(refresh) await reconcile(s.id);
    const current=(await sub(s.id).get()).data();
    const rows=await root.collection('subscriptionCycles').where('accountId','==',s.accountId).get();
    const history=rows.docs.map(d=>d.data()).sort((a,b)=>b.startsAt-a.startsAt).slice(0,24).map(c=>({
      invoiceId:c.invoiceId, status:c.status, amountCents:c.amountCents, startsAt:c.startsAt, expiresAt:c.expiresAt,
      remaining:c.remaining, refundedCents:c.refundedCents||0 }));
    return {...view(current),history};
  }
  async function requestCancel(s) {
    await db.runTransaction(async tx=>{
      const old=await get(tx,sub(s.id)),w=await get(tx,wallet(s.accountId));
      if(old.status==='cancelled') return;
      tx.update(sub(s.id),{cancelRequested:true,status:'cancel_requested',cancelRequestedAt:clock()});
      if(w.subscriptionId===s.id) tx.update(wallet(s.accountId),{subscriptionStatus:'cancel_requested'});
    });
  }
  async function cancel(user) {
    const s=await owned(user);check(s,'SUBSCRIPTION_NOT_FOUND',404);
    if(s.status==='cancelled') return view(s);
    await requestCancel(s);
    try { return await reconcile(s.id); } catch { return view((await sub(s.id).get()).data()); }
  }
  async function webhook(event) {
    const key=sha(event.type+':'+event.id+':'+event.requestId), ref=doc('subscriptionEvents',key);
    const existing=await db.runTransaction(async tx=>{
      const old=await get(tx,ref);if(old?.state==='done') return true;
      if(!old) tx.create(ref,{type:event.type,resourceId:event.id,state:'pending',createdAt:clock()});
      return false;
    });
    if(existing) return;
    await processEvent(event.type,event.id);
    await ref.update({state:'done',processedAt:clock()});
  }
  async function processEvent(type,id) {
    await verifySeller();
    if(type==='subscription_preapproval') {
      const raw=await provider.getSubscription(id);
      if(typeof raw.external_reference==='string'&&/^[a-f0-9-]{36}$/i.test(raw.external_reference)) {
        const s=(await sub(raw.external_reference).get()).data();
        if(s) {await bind(raw,s.id);await reconcile(s.id);}
      }
    } else if(type==='subscription_authorized_payment') {
      const i=await provider.getInvoice(id);
      await observeInvoice(i,await provider.getSubscription(i.preapproval_id));
    } else if(type==='payment') {
      for(const i of await provider.findInvoicesByPayment(id)) {
        const invoice=await provider.getInvoice(i.id);
        if(String(invoice.payment?.id)===String(id)) await observeInvoice(invoice,await provider.getSubscription(invoice.preapproval_id));
      }
    }
  }
  async function sweep() {
    // Bounded per run. Last-attempt ordering allows repeated sweeps to make progress.
    const all=await root.collection('subscriptions').orderBy('lastSweepAt').limit(25).get();
    const pending=all.docs.map(d=>d.data());
    let failed=0;
    for(const s of pending) {
      try {await reconcile(s.id);}catch{failed++;}
      await sub(s.id).update({lastSweepAt:clock()});
    }
    const events=await root.collection('subscriptionEvents').where('state','==','pending').limit(50).get();
    for(const d of events.docs) {
      const e=d.data();
      try {await processEvent(e.type,e.resourceId);await d.ref.update({state:'done',processedAt:clock()});}catch{failed++;}
    }
    return {subscriptions:pending.length,events:events.size,failed};
  }
  return {start,status,cancel,webhook,reconcile,sweep,observeInvoice};
}
module.exports={createSubscriptions};
