const { randomUUID } = require('node:crypto');
const { check, sha, accountId } = require('./policy.cjs');
const { PRO, cycles, hasPaidPeriod } = require('./subscription-policy.cjs');
const { acquireSweepLease, releaseSweepLease, retryAt }=require('./subscription-ops.cjs');
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
    check(input.offerId===PRO.id && input.termsVersion===PRO.termsVersion && input.termsHash===PRO.termsHash && input.accepted===true,'TERMS_REQUIRED',422);
    const aid=accountId(user.uid), id=randomUUID(), now=clock();
    await verifySeller();
    const started=await db.runTransaction(async tx=>{
      const w=await get(tx,wallet(aid)); check(w && !w.blocked && !(w.disputeHolds>0),'ACCOUNT_BLOCKED',409);
      const prior=w.subscriptionId?await get(tx,sub(w.subscriptionId)):null;
      if(prior && prior.status!=='cancelled') return {s:prior,created:false};
      // Never overlap paid periods from different subscriptions.
      check(!hasPaidPeriod(w,now),'CYCLE_STILL_ACTIVE',409);
      const limits=cfg.subscriptions.economics?.approved?cfg.subscriptions.economics.operationLimits:null;
      const policyId=limits?sha(JSON.stringify(limits)):null;
      if(policyId){
        const policyRef=doc('subscriptionEconomicPolicies',policyId);
        const oldPolicy=await get(tx,policyRef);
        if(!oldPolicy)tx.create(policyRef,{operationLimits:limits,createdAt:now});
      }
      check(cfg.mode!=='live'||policyId,'ECONOMICS_REQUIRED',503);
      const s={id,accountId:aid,authUid:user.uid,offer:{...PRO},policyId,status:'requested',createdAt:now,termsAcceptedAt:now,
        providerId:null,cancelRequested:false,lastSweepAt:0,nextSweepAt:now,scanOffset:0,sweepAttempts:0};
      tx.create(sub(id),s);tx.update(wallet(aid),{subscriptionId:id,subscriptionStatus:s.status,subscriptionLatestInvoiceAt:0,subscriptionLatestInvoiceState:null});
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
      check((!b||b.id===id)&&(!s.providerId||s.providerId===raw.id)&&
        (!s.providerPayerId||!raw.payer_id||s.providerPayerId===String(raw.payer_id)), 'SUBSCRIPTION_MISMATCH',422);
      if(s.status==='cancelled'&&raw.status!=='cancelled') return s;
      const modified=Date.parse(raw.last_modified||raw.date_created);
      check(Number.isFinite(modified),'SUBSCRIPTION_MISMATCH',422);
      if(s.providerUpdatedAt && modified<s.providerUpdatedAt) return s;
      const status=raw.status==='cancelled'?'cancelled':s.cancelRequested?'cancel_requested':raw.status;
      const next={...s,providerId:raw.id,providerPayerId:raw.payer_id?String(raw.payer_id):s.providerPayerId||null,providerStatus:raw.status,providerUpdatedAt:modified,status,
        nextPaymentAt:Number.isFinite(Date.parse(raw.next_payment_date))?Date.parse(raw.next_payment_date):null,
        checkoutUrl:status==='pending'?(url||s.checkoutUrl||provider.checkoutUrl(raw)):null,
        ...(status==='cancelled'?{cancelConfirmedAt:s.cancelConfirmedAt||modified}:{})};
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
    const key=sha('invoice:'+String(invoice.id)), cr=doc('subscriptionCycles',key);
    const before=(await cr.get()).data();
    const f=await provider.invoiceFact(invoice,raw,s.offer,before||null);
    const now=clock();
    return db.runTransaction(async tx=>{
      const saved=await get(tx,sub(ref)), w=await get(tx,wallet(saved.accountId)), old=await get(tx,cr);
      const pRef=f.paymentId?doc('subscriptionPayments',sha(f.paymentId)):null;
      const binding=pRef?await get(tx,pRef):null;
      const periodRef=f.cycleIndex!=null?doc('subscriptionPeriods',sha(ref+':'+f.cycleIndex)):null;
      const periodBinding=periodRef?await get(tx,periodRef):null;
      check(!binding||binding.cycleId===key,'PAYMENT_MISMATCH',422);
      if(old) {
        check(old.subscriptionId===ref,'PAYMENT_MISMATCH',422);
        if(old.invoiceUpdatedAt>f.invoiceUpdatedAt || old.paymentId===f.paymentId &&
          old.paymentUpdatedAt && old.paymentUpdatedAt>(f.paymentUpdatedAt||0)) return old;
        if(old.status==='reversed') return old;
        if(old.granted && old.paymentId!==f.paymentId) {
          if(f.paymentId&&['paid','review','reversed'].includes(f.state)){
            const exceptionRef=doc('subscriptionPaymentExceptions',sha(f.paymentId));
            const exception=await get(tx,exceptionRef);
            if(!exception||f.paymentUpdatedAt>=(exception.paymentUpdatedAt||0)){
              if(!binding)tx.create(pRef,{cycleId:key});
              tx.set(exceptionRef,{...f,accountId:saved.accountId,subscriptionId:ref,reason:'additional_payment_same_invoice',observedAt:now});
            }
          }
          return old;
        }
        if(old.granted && ['pending','failed'].includes(f.state)) return old;
      }
      const c={...old,...f,subscriptionId:ref,accountId:saved.accountId,status:f.state,
        remaining:old?.remaining||0,granted:Boolean(old?.granted),observedAt:now};
      // An already-proven period cannot be rewritten by later provider data.
      // For first-seen ambiguous invoices preserve the payment fact and flag.
      if(old?.startsAt!=null) {
        if(f.startsAt!==old.startsAt||f.expiresAt!==old.expiresAt)c.calendarIssue=f.calendarIssue||'period_changed';
        c.startsAt=old.startsAt;c.expiresAt=old.expiresAt;c.cycleIndex=old.cycleIndex??null;c.calendarAnchor=old.calendarAnchor??null;
      }
      if(periodBinding&&periodBinding.cycleId!==key)c.calendarIssue='duplicate_contract_period';
      if(f.state==='paid'&&c.calendarIssue){c.status='review';c.reason=c.calendarIssue;}
      // The financial fact is not conditional on entitlement. A paid invoice
      // requiring manual review must still be visible to finance.
      if (['paid','review','reversed'].includes(f.state) && Number.isFinite(f.approvedAt) && f.approvedAt<=now) c.paidAt=old?.paidAt||f.approvedAt;
      check(w,'ACCOUNT_REQUIRED',409);
      const all=cycles(w),other=all.filter(x=>x.cycleId!==key);
      if(c.status==='paid'&&!c.granted) {
        check(f.approvedAt!==null && f.approvedAt<=now,'PAYMENT_MISMATCH',422);
        if(!Number.isSafeInteger(c.startsAt)||!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=c.startsAt||
          c.expiresAt<=now || saved.cancelConfirmedAt && f.approvedAt>saved.cancelConfirmedAt ||
          other.some(x=>['paid','review'].includes(x.status)&&x.expiresAt>c.startsAt&&c.expiresAt>x.startsAt) ||
          w.subscriptionId!==ref) {
          c.status='review';c.reason='cycle_overlap_or_expired';
        } else {
          c.granted=true;c.remaining=saved.offer.credits;c.grantedAt=now;
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
      if(periodRef&&!periodBinding&&!c.calendarIssue)tx.create(periodRef,{cycleId:key,startsAt:c.startsAt,expiresAt:c.expiresAt});
      tx.set(cr,c);
      if(w.subscriptionId===ref && c.startsAt!=null && (!w.subscriptionLatestInvoiceAt || c.startsAt>=w.subscriptionLatestInvoiceAt)) {
        tx.update(wallet(saved.accountId),{subscriptionLatestInvoiceAt:c.startsAt,subscriptionLatestInvoiceState:c.status});
      }
      // Keep concurrent present and future paid cycles separately. Expired
      // grants remain in subscriptionCycles; never delete historical records.
      const live=Object.fromEntries(other.filter(x=>x.expiresAt>now&&['paid','review'].includes(x.status)).map(x=>[x.cycleId,x]));
      if(c.granted&&c.expiresAt>now&&['paid','review'].includes(c.status))live[key]={invoiceId:c.invoiceId,cycleId:key,startsAt:c.startsAt,
        expiresAt:c.expiresAt,remaining:c.remaining,status:c.status,policyId:saved.policyId||null};
      if(w.subscriptionId===ref||all.some(x=>x.cycleId===key))tx.update(wallet(saved.accountId),{proCycles:live});
      return c;
    });
  }
  async function reconcile(id,{deadline=clock()+15000}={}) {
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
    // Durable cursor: no fixed lifetime invoice limit. A completed pass starts
    // again at offset zero to recheck changed/reversed historic invoices.
    const offset=s.scanOffset||0;
    if(clock()>=deadline)return {...view(s),scanPending:true};
    const page=provider.findInvoicesPage?await provider.findInvoicesPage(raw.id,offset,5):
      {rows:await provider.findInvoices(raw.id),nextOffset:null};
    let processed=0;
    for(const invoice of page.rows) {
      if(clock()>=deadline&&processed>0)break;
      try {await observeInvoice(await provider.getInvoice(invoice.id),raw);}
      catch {
        // Persist the individual failed invoice before moving the cursor.
        await enqueue({type:'subscription_authorized_payment',id:String(invoice.id),requestId:'reconciliation'});
      }
      processed++;
    }
    const completePage=processed===page.rows.length;
    const next=completePage?(page.nextOffset||0):offset+processed;
    await db.runTransaction(async tx=>{
      const current=await get(tx,sub(id));
      if(current&&(current.scanOffset||0)===offset)tx.update(sub(id),{scanOffset:next,
        scanLastPageAt:clock(),...(completePage&&page.nextOffset===null?{scanCompletedAt:clock()}:{})});
    });
    return {...view(s),scanPending:next!==0};
  }
  async function owned(user) {
    const w=(await wallet(accountId(user.uid)).get()).data();
    return w?.subscriptionId?(await sub(w.subscriptionId).get()).data():null;
  }
  async function status(user,{refresh=false}={}) {
    const s=await owned(user); if(!s) return null;
    if(refresh) {
      const allowed=await db.runTransaction(async tx=>{
        const current=await get(tx,sub(s.id));
        if((current.nextUserPollAt||0)>clock()) return false;
        tx.update(sub(s.id),{nextUserPollAt:clock()+60000});return true;
      });
      if(allowed) await reconcile(s.id);
    }
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
      tx.update(sub(s.id),{cancelRequested:true,status:'cancel_requested',cancelRequestedAt:clock(),nextSweepAt:clock()});
      if(w.subscriptionId===s.id) tx.update(wallet(s.accountId),{subscriptionStatus:'cancel_requested'});
    });
  }
  async function cancel(user) {
    const s=await owned(user);check(s,'SUBSCRIPTION_NOT_FOUND',404);
    if(s.status==='cancelled') return view(s);
    await requestCancel(s);
    try { return await reconcile(s.id); } catch { return view((await sub(s.id).get()).data()); }
  }
  async function enqueue(event) {
    // Use a bounded resource key for internal retries; provider notification
    // request IDs are kept separately to deduplicate delivery retries.
    const key=sha(event.type+':'+event.id+':'+event.requestId), ref=doc('subscriptionEvents',key),
      queue=doc('subscriptionEventQueue',key);
    return db.runTransaction(async tx=>{
      const old=await get(tx,ref),pending=await get(tx,queue);
      if(old?.state==='done'&&event.requestId!=='reconciliation')return null;
      if(!old)tx.create(ref,{type:event.type,resourceId:event.id,state:'pending',createdAt:clock()});
      else if(old.state==='done')tx.update(ref,{state:'pending',reopenedAt:clock()});
      if(!pending)tx.create(queue,{type:event.type,resourceId:event.id,nextAttemptAt:clock(),attempts:0,createdAt:clock()});
      return key;
    });
  }
  async function processQueued(key) {
    const queue=doc('subscriptionEventQueue',key),ref=doc('subscriptionEvents',key),token=randomUUID();
    const item=await db.runTransaction(async tx=>{
      const current=await get(tx,queue);
      if(!current||current.nextAttemptAt>clock()||current.leaseUntil>clock())return null;
      tx.update(queue,{leaseToken:token,leaseUntil:clock()+120000});return current;
    });
    if(!item)return {skipped:true};
    try{
      await processEvent(item.type,item.resourceId);
      await db.runTransaction(async tx=>{
        const pending=await get(tx,queue);
        if(pending?.leaseToken!==token)return;
        tx.delete(queue);tx.update(ref,{state:'done',processedAt:clock()});
      });
      return {success:true};
    }catch{
      await db.runTransaction(async tx=>{
        const pending=await get(tx,queue);
        if(pending?.leaseToken!==token)return;
        const attempts=(pending.attempts||0)+1;
        tx.update(queue,{attempts,nextAttemptAt:retryAt(clock(),attempts),leaseToken:null,leaseUntil:0,lastError:'PROVIDER_OR_RECONCILIATION'});
        tx.update(ref,{state:'pending',attempts,lastFailureAt:clock()});
      });
      return {failed:true};
    }
  }
  async function webhook(event) {
    // Acknowledge only after durable persistence. The periodic worker drains
    // the queue even if the process dies between acknowledgement and handling.
    const key=await enqueue(event);
    if(key)await processQueued(key);
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
  async function sweep({budgetMs=180000}={}) {
    const owner=randomUUID(),lock=doc('subscriptionOps','sweep'),started=clock();
    const acquired=await acquireSweepLease(db,lock,owner,started,budgetMs+120000);
    if(!acquired)return {skipped:true,reason:'lease_held'};
    const summary={subscriptions:0,events:0,failed:0,startedAt:started,finishedAt:null};
    const deadline=started+budgetMs;
    try {
      const eventPage=await root.collection('subscriptionEventQueue').where('nextAttemptAt','<=',clock()).orderBy('nextAttemptAt').limit(30).get();
      for(const item of eventPage.docs) {
        if(clock()>=deadline-20000)break;
        const r=await processQueued(item.id);
        if(!r.skipped)summary.events++;
        if(r.failed)summary.failed++;
      }
      const due=await root.collection('subscriptions').where('nextSweepAt','<=',clock()).orderBy('nextSweepAt').limit(25).get();
      for(const item of due.docs) {
        if(clock()>=deadline-20000)break;
        const saved=item.data();let failed=false,pending=false;
        try {const r=await reconcile(saved.id,{deadline:Math.min(deadline-10000,clock()+20000)});
          pending=Boolean(r?.scanPending);}
        catch{failed=true;summary.failed++;}
        summary.subscriptions++;
        const attempts=failed?(saved.sweepAttempts||0)+1:0;
        const urgent=['cancel_requested','creation_uncertain','requested','pending'].includes(saved.status);
        await item.ref.update({lastSweepAt:clock(),sweepAttempts:attempts,
          nextSweepAt:failed?retryAt(clock(),attempts):clock()+(pending||urgent?60000:saved.status==='cancelled'?3600000:900000),
          ...(failed?{lastSweepFailureAt:clock()}:{lastSweepSuccessAt:clock()})});
      }
      return summary;
    }catch{
      summary.failed++;return summary;
    }finally {
      summary.finishedAt=clock();
      await releaseSweepLease(db,lock,owner,summary);
    }
  }
  async function health() {
    const ops=(await doc('subscriptionOps','sweep').get()).data();
    const oldest=await root.collection('subscriptionEventQueue').orderBy('createdAt').limit(1).get();
    const event=oldest.docs[0]?.data();
    const lastSuccess=ops?.lastSuccessAt||null;
    return {lastSuccessAt:lastSuccess,lastAttemptAt:ops?.lastAttemptAt||null,
      oldestPendingEventAt:event?.createdAt||null,healthy:Boolean(lastSuccess&&clock()-lastSuccess<=30*60000&&
        (!event||clock()-event.createdAt<=30*60000))};
  }
  return {start,status,cancel,webhook,reconcile,sweep,health,observeInvoice};
}
module.exports={createSubscriptions};
