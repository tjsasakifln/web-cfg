const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {PRO,configSubscriptions,publicPlans,available,nextMonth,cents}=require('../../runtime/tools-commerce/subscription-policy.cjs');
const {createSubscriptionProvider,parseSubscriptionWebhook}=require('../../runtime/tools-commerce/subscription-provider.cjs');
test('offer hidden by default, even with old purchase flags',()=>{
  const cfg={accessToken:'x',webhookSecret:'x',sellerId:'12',sharedExportsEnabled:true};
  assert.equal(configSubscriptions({},cfg).visible,false);
  const env={TOOLS_COMMERCE_PRO_READY:'1',TOOLS_COMMERCE_PRO_TERMS_APPROVED:PRO.termsVersion,TOOLS_COMMERCE_PRO_MAX_VARIABLE_CENTS:'1497',
    TOOLS_COMMERCE_PRO_NEW:'1',TOOLS_COMMERCE_PRO_PUBLIC:'1',TOOLS_COMMERCE_PRO_HOMOLOGATED:'1'};
  const flags=configSubscriptions(env,cfg);
  assert.equal(flags.visible,true);
  assert.equal(publicPlans(flags,[{credits:1,amountCents:1490}]).pro.savingPercent,44);
  assert.equal(configSubscriptions({...env,TOOLS_COMMERCE_PRO_MAX_VARIABLE_CENTS:'1498'},cfg).visible,false);
  assert.equal(configSubscriptions(env,{...cfg,exportsPaused:true}).visible,false);
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
const sub={id:'sub1',external_reference:'ref',collector_id:12,status:'authorized',auto_recurring:{currency_id:'BRL',transaction_amount:49.9,frequency:1,frequency_type:'months'}};
const invoice={id:1,preapproval_id:'sub1',currency_id:'BRL',transaction_amount:49.9,date_created:'2026-11-01T10:00:00-03:00',last_modified:'2026-11-01T10:05:00-03:00',payment:{id:2}};
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
