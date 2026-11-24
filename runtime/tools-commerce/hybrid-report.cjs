const { check }=require('./policy.cjs');
const {activeCycle}=require('./subscription-policy.cjs');
function interval(from,to) {
  check(/^\d{4}-\d{2}-\d{2}$/.test(from||'')&&/^\d{4}-\d{2}-\d{2}$/.test(to||''),'INVALID_INTERVAL');
  const first=Date.parse(from+'T00:00:00-03:00'),last=Date.parse(to+'T00:00:00-03:00');
  check(Number.isFinite(first)&&last>first&&last-first<=31*86400000,'INVALID_INTERVAL');
  return {first,last};
}
async function hybridUsage(db,mode,from,to,now=Date.now()) {
  const {first,last}=interval(from,to),root=db.collection('toolsCommerce').doc('v1-'+mode);
  const within=(name,key,a=first,b=last)=>root.collection(name).where(key,'>=',a).where(key,'<',b).get();
  const [newAccounts,allAccounts,cycles,reversals,exports,orders,contracts]=await Promise.all([
    within('accounts','createdAt'),root.collection('accounts').get(),within('subscriptionCycles','paidAt'),
    within('subscriptionCycles','reversalAt'),within('exports','at'),within('orders','paidAt'),
    root.collection('subscriptions').get()
  ]);
  const rows=cycles.docs.map(d=>d.data()), purchases=orders.docs.map(d=>d.data()), contractRows=contracts.docs.map(d=>d.data());
  const subscriptionGrossCents=rows.reduce((sum,c)=>sum+c.amountCents,0);
  const providerReleasedNetCents=rows.filter(c=>c.status==='paid'&&c.moneyReleaseStatus==='released'&&Number.isSafeInteger(c.providerNetCents)).reduce((sum,c)=>sum+c.providerNetCents,0);
  const unresolvedNetCount=rows.filter(c=>c.status==='paid'&&(c.moneyReleaseStatus!=='released'||!Number.isSafeInteger(c.providerNetCents))).length;
  const refundsObservedCents=reversals.docs.map(d=>d.data()).reduce((sum,c)=>sum+(c.refundedCents||0),0);
  const accountRows=allAccounts.docs.map(d=>d.data());
  const byContract=new Map(contractRows.map(s=>[s.id,s]));
  const active=accountRows.filter(w=>activeCycle(w,now)&&
    byContract.get(w.subscriptionId)?.status==='authorized');
  const mrrSnapshotCents=active.reduce((sum,w)=>sum+byContract.get(w.subscriptionId).offer.amountCents,0);
  const byTool={}, exportUsers=new Set(), experiment={A:{accounts:0,exports:0},B:{accounts:0,exports:0}};
  for(const d of allAccounts.docs){const g=d.data().experimentGroup;if(g==='A'||g==='B')experiment[g].accounts++;}
  const accountById=new Map(allAccounts.docs.map(d=>[d.id,d.data()]));
  for(const d of exports.docs){
    const e=d.data();exportUsers.add(e.accountId);
    const t=byTool[e.toolId]??={free:0,promo:0,paid:0,subscription:0,experiment:0};
    if(Object.hasOwn(t,e.bucket))t[e.bucket]++;
    const g=accountById.get(e.accountId)?.experimentGroup;if(g==='A'||g==='B')experiment[g].exports++;
  }
  const activated=newAccounts.docs.filter(d=>exportUsers.has(d.id)).length;
  // Retention uses verified export activity, not unauthenticated visits.
  // Only mature registration cohorts enter each denominator.
  const dayMs=86400000, retainedExports=await within('exports','at',first,Math.min(now+1,last+31*dayMs));
  const timestamps=new Map();
  const cohort=new Map(newAccounts.docs.map(d=>[d.id,d.data().createdAt]));
  for(const d of retainedExports.docs) {
    const e=d.data();if(!cohort.has(e.accountId))continue;
    const list=timestamps.get(e.accountId)||[];list.push(e.at);timestamps.set(e.accountId,list);
  }
  function retention(days) {
    let eligible=0,returned=0;
    for(const [id,created] of cohort) {
      if(created+(days+1)*dayMs>now)continue;
      const events=timestamps.get(id)||[];
      if(!events.some(t=>t>=created&&t<created+dayMs))continue;
      eligible++;
      if(events.some(t=>t>=created+days*dayMs&&t<created+(days+1)*dayMs))returned++;
    }
    return {eligible,returned,rate:eligible?returned/eligible:null,definition:'account exported in first 24h; returned to export on day '+days};
  }
  const purchasers=new Set(purchases.map(p=>p.accountId)), subscribers=new Set(rows.map(c=>c.accountId));
  return {from,toExclusive:to,asOf:new Date(now).toISOString(),newAccounts:newAccounts.size,
    exportActivationInInterval:{accounts:activated,denominator:newAccounts.size,rate:newAccounts.size?activated/newAccounts.size:null},
    activePaidRecurringAccounts:active.length,mrrSnapshotCents,subscriptionGrossCents,
    oneOffGrossCents:purchases.reduce((sum,p)=>sum+p.amountCents,0),oneOffBuyers:purchasers.size,subscriptionPayers:subscribers.size,
    subscriptionProviderReleasedNetCents:providerReleasedNetCents,unresolvedSubscriptionNetCount:unresolvedNetCount,
    subscriptionRefundsObservedCents:refundsObservedCents,byTool,experiment,
    bankReceiptsCents:null,contributionMargin:null,retention7d:retention(7),retention30d:retention(30),visitorConversion:null,
    limitations:'Export activation is an interval cohort, not task completion. MRR is a point-in-time confirmed-cycle recurring estimate, excludes cancelled contracts and all one-off purchases. Provider release is not bank receipt. Refund field is latest cumulative amount for cycles with reversal observed in interval, not net movement; reconcile against provider statement. Retention refers only to mature activated export cohorts. Missing visitor, cost and bank data are null. Pilot queries all accounts/contracts; replace with incremental aggregates before scaling.'};
}
async function warmblyHandoff(db,mode,from,to) {
  const {first,last}=interval(from,to),root=db.collection('toolsCommerce').doc('v1-'+mode);
  const snapshot=await root.collection('subscriptionCycles').where('paidAt','>=',first).where('paidAt','<',last).get();
  return {schema:'confenge.tools-commerce.financial-handoff/v1',mode,readOnly:true,
    records:snapshot.docs.map(d=>{const c=d.data();return {idempotencyKey:'tools-pro:'+mode+':'+d.id,
      invoiceId:c.invoiceId,paymentId:c.paymentId,amountCents:c.amountCents,currency:c.currency,status:c.status,
      approvedAt:c.paidAt,refundedCents:c.refundedCents||0,providerNetCents:c.providerNetCents??null,
      moneyReleaseStatus:c.moneyReleaseStatus??null,bankReconciled:false};}),
    instruction:'Warmbly is financial owner. Reconcile by stable key and provider payment before recognizing receipt; do not create a second invoice or bank receipt. This is a read-only export, not an ingest endpoint.'};
}
module.exports={hybridUsage,warmblyHandoff};
