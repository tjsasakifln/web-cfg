const { check }=require('./policy.cjs');
const {activeCycle}=require('./subscription-policy.cjs');
function interval(from,to) {
  check(/^\d{4}-\d{2}-\d{2}$/.test(from||'')&&/^\d{4}-\d{2}-\d{2}$/.test(to||''),'INVALID_INTERVAL');
  const first=Date.parse(from+'T00:00:00-03:00'),last=Date.parse(to+'T00:00:00-03:00');
  check(Number.isFinite(first)&&last>first&&last-first<=31*86400000,'INVALID_INTERVAL');
  return {first,last};
}
function cohortConversions(cohort,purchases,cycles) {
  const ids=new Set(cohort);
  const oneOff=new Set(purchases.filter(x=>ids.has(x.accountId)).map(x=>x.accountId));
  const recurring=new Set(cycles.filter(x=>ids.has(x.accountId)).map(x=>x.accountId));
  const buyers=new Set([...oneOff,...recurring]);
  const metric=set=>({accounts:set.size,denominator:ids.size,rate:ids.size?set.size/ids.size:null});
  return {oneOff:metric(oneOff),subscription:metric(recurring),anyPayment:metric(buyers)};
}
function repeatedPurchases(rows) {
  const counts=new Map();
  for(const x of rows) counts.set(x.accountId,(counts.get(x.accountId)||0)+1);
  const repeated=[...counts.values()].filter(x=>x>1).length;
  return {accounts:repeated,denominator:counts.size,rate:counts.size?repeated/counts.size:null,definition:'two or more approved one-off purchases in the same interval'};
}
function experimentOutcomes(accounts,purchases,cycles,first,last) {
  const groups={A:{assigned:0,buyers:0,grossCents:0},B:{assigned:0,buyers:0,grossCents:0}};
  const eligible=new Map(accounts.filter(a=>['A','B'].includes(a.experimentGroup)&&a.experimentAssignedAt>=first&&a.experimentAssignedAt<last).map(a=>[a.id,a]));
  const buyers={A:new Set(),B:new Set()};
  for(const a of eligible.values())groups[a.experimentGroup].assigned++;
  for(const x of [...purchases,...cycles]){
    const a=eligible.get(x.accountId);
    if(!a||x.paidAt<a.experimentAssignedAt)continue;
    groups[a.experimentGroup].grossCents+=x.amountCents;
    buyers[a.experimentGroup].add(x.accountId);
  }
  for(const g of ['A','B']){
    const r=groups[g];r.buyers=buyers[g].size;r.revenuePerAssignedCents=r.assigned?r.grossCents/r.assigned:null;
    r.conversion=r.assigned?r.buyers/r.assigned:null;
  }
  return {...groups,deltaGrossPerAssignedCents:groups.A.assigned&&groups.B.assigned?groups.B.revenuePerAssignedCents-groups.A.revenuePerAssignedCents:null,
    interpretation:'descriptive assigned-account cohort, unequal follow-up possible; not causal lift or net contribution'};
}
function aggregateWorkflow(input,from,to) {
  if(!input)return null;
  check(input.from===from&&input.toExclusive===to&&Array.isArray(input.rows),'ANALYTICS_INTERVAL_MISMATCH',422);
  const totals={view:0,started:0,ready:0,failed:0,edited:0,exported:0},byTool={};
  for(const row of input.rows){
    check(typeof row.tool_id==='string'&&/^[a-z0-9-]{1,100}$/.test(row.tool_id)&&Object.hasOwn(totals,row.step)&&Number.isSafeInteger(row.count)&&row.count>=0,'INVALID_ANALYTICS_AGGREGATE',422);
    totals[row.step]+=row.count;
    const t=byTool[row.tool_id]??={view:0,started:0,ready:0,failed:0,edited:0,exported:0};t[row.step]+=row.count;
  }
  return {totals,byTool,measurement:'observed consented workflow events on instrumented tools; not unique people or a matched funnel',uniqueVisitors:null,visitorConversion:null};
}
async function hybridUsage(db,mode,from,to,now=Date.now(),analytics=null) {
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
  const accountRows=allAccounts.docs.map(d=>({...d.data(),id:d.id}));
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
  const cancelledInInterval=contractRows.filter(s=>s.cancelConfirmedAt>=first&&s.cancelConfirmedAt<last).length;
  const cancelPending=contractRows.filter(s=>s.status==='cancel_requested').length;
  const failedLatestInvoice=accountRows.filter(a=>a.subscriptionLatestInvoiceState==='failed'&&['authorized','pending','paused'].includes(a.subscriptionStatus)).length;
  const paidInReview=rows.filter(c=>c.status==='review').length;
  return {from,toExclusive:to,asOf:new Date(now).toISOString(),newAccounts:newAccounts.size,
    exportActivationInInterval:{accounts:activated,denominator:newAccounts.size,rate:newAccounts.size?activated/newAccounts.size:null},
    activePaidRecurringAccounts:active.length,mrrSnapshotCents,subscriptionGrossCents,
    oneOffGrossCents:purchases.reduce((sum,p)=>sum+p.amountCents,0),oneOffBuyers:purchasers.size,subscriptionPayers:subscribers.size,
    subscriptionProviderReleasedNetCents:providerReleasedNetCents,unresolvedSubscriptionNetCount:unresolvedNetCount,
    subscriptionRefundsObservedCents:refundsObservedCents,byTool,experiment,
    cohortConversions:cohortConversions(newAccounts.docs.map(d=>d.id),purchases,rows),repurchase:repeatedPurchases(purchases),
    cancellation:{confirmedInInterval:cancelledInInterval,pendingSnapshot:cancelPending},delinquency:{failedLatestInvoiceSnapshot:failedLatestInvoice,paidInReview},
    experimentOutcomes:experimentOutcomes(accountRows,purchases,rows,first,last),workflow:aggregateWorkflow(analytics,from,to),
    bankReceiptsCents:null,contributionMargin:null,retention7d:retention(7),retention30d:retention(30),visitorConversion:null,
    limitations:'Export activation is an interval cohort, not task completion. MRR is a point-in-time confirmed-cycle recurring estimate, excludes cancelled contracts and all one-off purchases. Provider release is not bank receipt. Refund field is latest cumulative amount for cycles with reversal observed in interval, not net movement; reconcile against provider statement. Retention refers only to mature activated export cohorts. Missing visitor, cost and bank data are null. Pilot queries all accounts/contracts; replace with incremental aggregates before scaling.'};
}
async function warmblyHandoff(db,mode,from,to) {
  const {first,last}=interval(from,to),root=db.collection('toolsCommerce').doc('v1-'+mode);
  const within=(collection,key)=>root.collection(collection).where(key,'>=',first).where(key,'<',last).get();
  const [snapshot,reversals,exceptions]=await Promise.all([within('subscriptionCycles','paidAt'),within('subscriptionCycles','reversalAt'),within('subscriptionPaymentExceptions','observedAt')]);
  const unique=new Map([...snapshot.docs,...reversals.docs].map(d=>[d.id,d]));
  return {schema:'confenge.tools-commerce.financial-handoff/v1',mode,readOnly:true,
    records:[...unique.values()].map(d=>{const c=d.data();return {idempotencyKey:'tools-pro:'+mode+':'+d.id,
      invoiceId:c.invoiceId,paymentId:c.paymentId,amountCents:c.amountCents,currency:c.currency,status:c.status,
      approvedAt:c.paidAt,refundedCents:c.refundedCents||0,providerNetCents:c.providerNetCents??null,
      moneyReleaseStatus:c.moneyReleaseStatus??null,bankReconciled:false};}),
    exceptions:exceptions.docs.map(d=>{const c=d.data();return {idempotencyKey:'tools-pro-exception:'+mode+':'+d.id,
      invoiceId:c.invoiceId,paymentId:c.paymentId,amountCents:c.amountCents,currency:c.currency,status:c.state,reason:c.reason,
      approvedAt:c.approvedAt??null,refundedCents:c.refundedCents||0,bankReconciled:false};}),
    instruction:'Warmbly is financial owner. Reconcile by stable key and provider payment before recognizing receipt; do not create a second invoice or bank receipt. This is a read-only export, not an ingest endpoint.'};
}
module.exports={hybridUsage,warmblyHandoff,cohortConversions,repeatedPurchases,experimentOutcomes,aggregateWorkflow};
