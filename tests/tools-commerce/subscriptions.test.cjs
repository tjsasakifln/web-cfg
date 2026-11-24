const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {PRO,configSubscriptions,publicPlans,available,nextMonth,cents}=require('../../runtime/tools-commerce/subscription-policy.cjs');
const {createSubscriptionProvider,parseSubscriptionWebhook}=require('../../runtime/tools-commerce/subscription-provider.cjs');
test('offer hidden by default, even with old purchase flags',()=>{
  const cfg={mode:'live',accessToken:'x',webhookSecret:'x',sellerId:'12',sharedExportsEnabled:true};
  assert.equal(configSubscriptions({},cfg).visible,false);
  const env={TOOLS_COMMERCE_PRO_INTEGRATION:'1',TOOLS_COMMERCE_PRO_READY:'1',TOOLS_COMMERCE_PRO_TERMS_APPROVED:PRO.termsVersion,TOOLS_COMMERCE_PRO_TERMS_HASH:PRO.termsHash,TOOLS_COMMERCE_PRO_MAX_VARIABLE_CENTS:'1497',
    TOOLS_COMMERCE_PRO_NEW:'1',TOOLS_COMMERCE_PRO_PUBLIC:'1',TOOLS_COMMERCE_PRO_HOMOLOGATED:'1',TOOLS_COMMERCE_PRO_CALENDAR_VERIFIED:'1'};
  assert.equal(configSubscriptions(env,cfg).visible,false,'a manually entered margin is not proof');
  const proof={economicEvidence:{approved:true,worstCaseCents:1497,operationLimits:{}}};
  const flags=configSubscriptions(env,cfg,proof);
  assert.equal(flags.visible,true);
  assert.equal(publicPlans(flags,[{credits:1,amountCents:1490}]).pro.savingPercent,44);
  assert.equal(configSubscriptions({...env,TOOLS_COMMERCE_PRO_MAX_VARIABLE_CENTS:'1498'},cfg,proof).visible,false);
  assert.equal(configSubscriptions(env,{...cfg,exportsPaused:true},proof).visible,false);
});
test('calendar month clamps month end and expired credits cannot be used',()=>{
  const start=Date.parse('2026-01-31T10:00:00-03:00');
  assert.equal(nextMonth(start),Date.parse('2026-02-28T10:00:00-03:00'));
  const c={startsAt:start,expiresAt:nextMonth(start),remaining:6,status:'paid'};
  assert.equal(available(c,start),6);assert.equal(available(c,c.expiresAt),0);assert.equal(available({...c,status:'review'},start),0);
  assert.equal(cents('49.90'),4990);assert.throws(()=>cents('49.901'));
});
test('signed notification required; tampered resource rejected',()=>{
  const secret='secret',id='123',requestId='abc',ts='1760000000';
  const sig=createHmac('sha256',secret).update('id:'+id+';request-id:'+requestId+';ts:'+ts+';').digest('hex');
  const event={body:JSON.stringify({type:'subscription_authorized_payment',data:{id}}),queryStringParameters:{'data.id':id},
    headers:{'x-request-id':requestId,'x-signature':'ts='+ts+',v1='+sig}};
  assert.equal(parseSubscriptionWebhook(event,secret).id,id);
  assert.throws(()=>parseSubscriptionWebhook({...event,queryStringParameters:{'data.id':'124'}},secret));
});
const sub={id:'sub1',external_reference:'ref',collector_id:12,status:'authorized',auto_recurring:{currency_id:'BRL',transaction_amount:49.9,frequency:1,frequency_type:'months',start_date:'2026-11-01T10:00:00-03:00'}};
const invoice={id:1,preapproval_id:'sub1',currency_id:'BRL',transaction_amount:49.9,date_created:'2026-10-29T10:00:00-03:00',debit_date:'2026-11-01T10:00:00-03:00',retry_attempt:0,last_modified:'2026-11-01T10:05:00-03:00',payment:{id:2}};
const payment={id:2,collector_id:12,live_mode:true,currency_id:'BRL',transaction_amount:49.9,status:'approved',status_detail:'accredited',date_last_updated:'2026-11-01T10:05:00-03:00',date_approved:'2026-11-01T10:05:00-03:00'};
function provider(p=payment){return createSubscriptionProvider({accessToken:'token',mode:'live',sellerId:'12',fetchImpl:async()=>({ok:true,json:async()=>p})});}
test('financial fact requires authenticated payment and matching seller, environment and amount',async()=>{
  assert.equal((await provider().invoiceFact(invoice,sub,PRO)).state,'paid');
  assert.equal((await provider({...payment,status:'pending'}).invoiceFact(invoice,sub,PRO)).state,'pending');
  assert.equal((await provider({...payment,status:'rejected'}).invoiceFact(invoice,sub,PRO)).state,'failed');
  assert.equal((await provider({...payment,transaction_amount_refunded:10}).invoiceFact(invoice,sub,PRO)).state,'review');
  assert.equal((await provider({...payment,status:'refunded'}).invoiceFact(invoice,sub,PRO)).state,'reversed');
  for(const p of [{...payment,collector_id:13},{...payment,live_mode:false},{...payment,transaction_amount:1}])
    await assert.rejects(()=>provider(p).invoiceFact(invoice,sub,PRO));
  await assert.rejects(()=>provider().invoiceFact({...invoice,preapproval_id:'wrong'},sub,PRO));
});

test('subscription terms are byte-bound and do not replace the existing credits terms',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const {html,termsHash}=require('../../runtime/tools-commerce/subscription-terms.cjs');
  const source=fs.readFileSync(path.join(__dirname,'../../termos-de-uso/index.html'),'utf8').replace(/\r\n?/g,'\n');
  const start=source.indexOf('<h2 id="assinatura-ferramentas">'),end=source.indexOf('<h2',start+4);
  assert.equal(source.slice(start,end).trim(),html);
  assert.equal(PRO.termsHash,termsHash);
});

test('provider calendar: explicit anchor survives leap years, month ends and year boundary',()=>{
  const {periodAt,calendarPeriod}=require('../../runtime/tools-commerce/subscription-calendar.cjs');
  const anchor=Date.parse('2028-01-31T10:00:00-03:00');
  assert.equal(periodAt(anchor,1),Date.parse('2028-02-29T10:00:00-03:00'));
  assert.equal(periodAt(anchor,2),Date.parse('2028-03-31T10:00:00-03:00'));
  assert.equal(periodAt(anchor,3),Date.parse('2028-04-30T10:00:00-03:00'));
  assert.equal(periodAt(anchor,12),Date.parse('2029-01-31T10:00:00-03:00'));
  const raw={auto_recurring:{start_date:new Date(anchor).toISOString()}};
  const invoice={date_created:'2028-02-20T10:00:00-03:00',debit_date:'2028-02-29T10:00:00-03:00',retry_attempt:0};
  const c=calendarPeriod(raw,invoice);
  assert.equal(c.startsAt,periodAt(anchor,1));assert.equal(c.expiresAt,periodAt(anchor,2));
  assert.equal(calendarPeriod(raw,{...invoice,debit_date:'2028-03-03T10:00:00-03:00',retry_attempt:1},c).startsAt,c.startsAt);
  assert.equal(calendarPeriod(raw,{...invoice,retry_attempt:1}).reason,'first_seen_retry_or_unknown');
  assert.equal(calendarPeriod(raw,{...invoice,debit_date:'2028-03-01T10:00:00-03:00'}).reason,'schedule_mismatch');
  assert.equal(calendarPeriod({},invoice).reason,'contract_anchor_missing');
  assert.equal(calendarPeriod({auto_recurring:{start_date:'2028-01-30T10:00:00-03:00'}},invoice,c).reason,'contract_anchor_changed');
});
test('future and past grants cannot replace the present cycle',()=>{
  const {activeCycle,hasPaidPeriod}=require('../../runtime/tools-commerce/subscription-policy.cjs');
  const w={proCycles:{a:{status:'paid',cycleId:'a',startsAt:100,expiresAt:200,remaining:2},b:{status:'paid',cycleId:'b',startsAt:200,expiresAt:300,remaining:6}}};
  assert.equal(activeCycle(w,150).cycleId,'a');assert.equal(activeCycle(w,200).cycleId,'b');
  assert.equal(activeCycle(w,300),undefined);assert.equal(hasPaidPeriod(w,199),true);
});
test('export consent binds exact artifact, source, account and expiry',()=>{
  const {issue,verify}=require('../../runtime/tools-commerce/export-consent.cjs'),key=Buffer.alloc(32,4);
  const claim={accountId:'a',exportId:'b',toolId:'c',digest:'d',bucket:'free',source:'welcome',now:1000,validUntil:2000};
  const q=issue(key,claim);assert.equal(verify(key,q.token,claim,1500).bucket,'free');
  assert.throws(()=>verify(key,q.token,{...claim,bucket:'paid',source:'order'},1500),/EXPORT_CONFIRMATION_CHANGED/);
  assert.throws(()=>verify(key,q.token,{...claim,accountId:'other'},1500),/EXPORT_CONFIRMATION_REQUIRED/);
  assert.throws(()=>verify(key,q.token,claim,2000),/EXPORT_CONFIRMATION_CHANGED/);
  assert.throws(()=>verify(key,q.token.slice(0,-1)+'!',claim,1500),/EXPORT_CONFIRMATION_REQUIRED/);
});

test('economic evidence covers every operation and full six-credit worst case',()=>{
  const {operations,verifyEvidence,VERSION}=require('../../runtime/tools-commerce/economics.cjs');
  const now=Date.parse('2026-11-24T12:00:00Z');
  const sample={schema:VERSION,offerId:PRO.id,amountCents:PRO.amountCents,credits:PRO.credits,observedAt:now,
    approvedBy:'test operator',sourceRef:'fixture evidence only',cycleCosts:{},
    operations:Object.fromEntries(Object.keys(operations).map(k=>[k,{upperVariableCents:100,sourceRef:'fixture cost record',basis:'observed',
      cpuMs:1,peakMemoryBytes:1,storageBytes:0,transferBytes:1,externalApiCents:0,maxPayloadBytes:100000,maxDailyExports:20}]))};
  for(const k of ['recurringPaymentFees','taxes','refundProvision','support','fixedVariableInfrastructure'])
    sample.cycleCosts[k]={upperCents:100,sourceRef:'fixture cost record',basis:'contracted'};
  assert.equal(verifyEvidence(sample,PRO,now).worstCaseCents,1100);
  assert.equal(verifyEvidence(sample,PRO,now).approved,true);
  const key=Object.keys(sample.operations)[0];
  sample.operations[key].upperVariableCents=200;
  assert.equal(verifyEvidence(sample,PRO,now).approved,false);
  delete sample.operations[key];
  assert.equal(verifyEvidence(sample,PRO,now).worstCaseCents,null);
  assert.equal(verifyEvidence(sample,PRO,now).approved,false);
});
