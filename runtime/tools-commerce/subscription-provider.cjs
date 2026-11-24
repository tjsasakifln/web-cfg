const { createHmac, timingSafeEqual } = require('node:crypto');
const { check } = require('./policy.cjs');
const { cents, instant } = require('./subscription-policy.cjs');
const {calendarPeriod}=require('./subscription-calendar.cjs');
const ROOT = 'https://api.mercadopago.com';
const idOk = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id);
const numeric = id => /^\d{1,20}$/.test(String(id));
const topics = new Set(['subscription_preapproval','subscription_authorized_payment','subscription_preapproval_plan','payment']);
function parseSubscriptionWebhook(event, secret) {
  const q = event.queryStringParameters || {};
  const h = name => Object.entries(event.headers || {}).find(([k]) => k.toLowerCase() === name)?.[1];
  let body; try { body = JSON.parse(event.body || '{}'); } catch { if(topics.has(q.type)) check(false,'INVALID_WEBHOOK',401); return null; }
  if(!body || typeof body!=='object') return null;
  const type = body.type || q.type;
  if (!topics.has(type)) return null;
  const id = q['data.id'];
  const requestId = h('x-request-id');
  const sig = h('x-signature');
  check(idOk(id) && (!body.data?.id || String(body.data.id).toLowerCase() === id.toLowerCase()) &&
    (!q.type || q.type === type) && typeof requestId === 'string' && requestId.length <= 200 &&
    typeof sig === 'string' && sig.length <= 512 && (event.multiValueQueryStringParameters?.['data.id'] || []).length <= 1, 'INVALID_WEBHOOK',401);
  const parts = sig.split(',').map(s => s.trim().split('='));
  const ts = parts.filter(p => p[0] === 'ts'), v = parts.filter(p => p[0] === 'v1');
  check(ts.length === 1 && v.length === 1 && /^\d{10,16}$/.test(ts[0][1]) && /^[a-f0-9]{64}$/i.test(v[0][1]), 'INVALID_WEBHOOK',401);
  const expected = createHmac('sha256',secret).update('id:'+id.toLowerCase()+';request-id:'+requestId+';ts:'+ts[0][1]+';').digest();
  check(timingSafeEqual(expected,Buffer.from(v[0][1],'hex')),'INVALID_WEBHOOK',401);
  return { type,id,requestId };
}
function createSubscriptionProvider({ accessToken, mode, sellerId, sandboxPayerEmail, subscriptions, fetchImpl=globalThis.fetch }) {
  const headers={ Authorization:'Bearer '+accessToken, 'Content-Type':'application/json' };
  async function req(path,method='GET',body) {
    const response=await fetchImpl(ROOT+path,{method,headers, ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000),redirect:'error'});
    if(!response.ok) throw new Error('SUBSCRIPTION_PROVIDER_UNAVAILABLE');
    return response.json();
  }
  const getSubscription=async id=>{check(idOk(id),'INVALID_SUBSCRIPTION',422);const raw=await req('/preapproval/'+encodeURIComponent(id));return raw.status==='canceled'?{...raw,status:'cancelled'}:raw;};
  const getInvoice=id=>{check(numeric(id),'INVALID_INVOICE',422);return req('/authorized_payments/'+encodeURIComponent(id));};
  const getPayment=id=>{check(numeric(id),'INVALID_PAYMENT',422);return req('/v1/payments/'+encodeURIComponent(id));};
  function verifyContract(raw, offer, ref) {
    const auto=raw.auto_recurring || {};
    if(raw.status==='canceled')raw={...raw,status:'cancelled'};
    check(idOk(raw.id) && raw.external_reference===ref && String(raw.collector_id)===String(sellerId) &&
      (!subscriptions?.applicationId||String(raw.application_id)===subscriptions.applicationId) &&
      auto.currency_id===offer.currency && cents(auto.transaction_amount)===offer.amountCents &&
      auto.frequency===offer.frequency && auto.frequency_type===offer.frequencyType &&
      (!auto.free_trial || auto.free_trial.frequency === 0) && !auto.end_date && ['pending','authorized','paused','cancelled'].includes(raw.status),
      'SUBSCRIPTION_MISMATCH',422);
    return raw;
  }
  function checkoutUrl(raw) {
    let u; try {u=new URL(raw.init_point);} catch {check(false,'SUBSCRIPTION_MISMATCH',422);}
    check(u.protocol==='https:' && u.host==='www.mercadopago.com.br' && !u.username && !u.password &&
      u.pathname.startsWith('/subscriptions/') && u.searchParams.get('preapproval_id')===raw.id,'SUBSCRIPTION_MISMATCH',422);
    return u.href;
  }
  async function create({ref,offer,email,returnUrl}) {
    // Official pending-payment subscription without a provider plan, with a
    // unique external_reference. Never retry an ambiguous POST.
    const raw=await req('/preapproval','POST',{reason:offer.name,external_reference:ref,
      payer_email:mode==='sandbox'?sandboxPayerEmail:email,back_url:returnUrl,status:'pending',
      auto_recurring:{frequency:offer.frequency,frequency_type:offer.frequencyType,
        transaction_amount:offer.amountCents/100,currency_id:offer.currency}});
    verifyContract(raw,offer,ref);
    return {raw,url:checkoutUrl(raw)};
  }
  async function searchPage(path,filters,offset=0,limit=10) {
    check(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=20,'INVALID_PAGE',422);
    const q=new URLSearchParams({...filters,limit:String(limit),offset:String(offset)});
    const response=await req(path+'?'+q),rows=response.results,paging=response.paging;
    check(Array.isArray(rows)&&rows.length<=limit&&Number.isSafeInteger(paging?.total)&&paging.total>=0&&
      (!Number.isSafeInteger(paging.offset)||paging.offset===offset),'SUBSCRIPTION_SEARCH_MISMATCH',422);
    check(new Set(rows.map(r=>String(r.id))).size===rows.length,'SUBSCRIPTION_SEARCH_MISMATCH',422);
    const next=offset+rows.length;
    return {rows,nextOffset:rows.length>0&&next<paging.total?next:null,total:paging.total};
  }
  async function search(path,filters) {
    const all=[];let offset=0;const deadline=Date.now()+15000;
    do {
      if(Date.now()>deadline)throw new Error('SUBSCRIPTION_SEARCH_TIMEOUT');
      const page=await searchPage(path,filters,offset,20);all.push(...page.rows);offset=page.nextOffset;
    }while(offset!==null);
    return all;
  }
  const findSubscriptions=ref=>search('/preapproval/search',{external_reference:ref});
  const findInvoicesPage=(id,offset=0,limit=5)=>searchPage('/authorized_payments/search',{preapproval_id:id},offset,limit);
  const findInvoices=id=>search('/authorized_payments/search',{preapproval_id:id});
  const findInvoicesByPayment=id=>search('/authorized_payments/search',{payment_id:id});
  async function invoiceFact(invoice, subscription, offer, previous=null) {
    verifyContract(subscription,offer,subscription.external_reference);
    check(numeric(invoice.id) && invoice.preapproval_id===subscription.id &&
      invoice.currency_id===offer.currency && cents(invoice.transaction_amount)===offer.amountCents &&
      (!invoice.external_reference || String(invoice.external_reference)===subscription.external_reference),
      'PAYMENT_MISMATCH',422);
    const period=calendarPeriod(subscription,invoice,previous);
    const common={invoiceId:String(invoice.id),subscriptionId:subscription.id,reference:subscription.external_reference,
      startsAt:period.startsAt??null,expiresAt:period.expiresAt??null,cycleIndex:period.cycleIndex??null,calendarAnchor:period.calendarAnchor??null,
      calendarIssue:period.reason||null,amountCents:offer.amountCents,currency:offer.currency,invoiceUpdatedAt:instant(invoice.last_modified),
      providerDebitAt:typeof invoice.debit_date==='string'&&Number.isFinite(Date.parse(invoice.debit_date))?Date.parse(invoice.debit_date):null};
    if(!invoice.payment?.id) return {...common,state:'pending',paymentId:null};
    const payment=await getPayment(invoice.payment.id);
    check(String(payment.id)===String(invoice.payment.id) && String(payment.collector_id)===String(sellerId) &&
      payment.live_mode===(mode==='live') && payment.currency_id===offer.currency &&
      cents(payment.transaction_amount)===offer.amountCents &&
      (!payment.external_reference || payment.external_reference===subscription.external_reference) &&
      (!subscription.payer_id || String(payment.payer?.id)===String(subscription.payer_id)),
      'PAYMENT_MISMATCH',422);
    const refund=cents(payment.transaction_amount_refunded ?? 0);
    check(refund<=offer.amountCents,'PAYMENT_MISMATCH',422);
    const state=payment.status==='refunded'||refund===offer.amountCents||payment.status==='charged_back'&&payment.status_detail==='settled'?'reversed':
      refund>0||payment.status_detail==='partially_refunded'||['in_mediation','charged_back'].includes(payment.status)?'review':
      payment.status==='approved' && payment.status_detail==='accredited'?'paid':
      ['rejected','cancelled'].includes(payment.status)?'failed':'pending';
    const net=payment.transaction_details?.net_received_amount;
    return {...common,paymentId:String(payment.id),paymentUpdatedAt:instant(payment.date_last_updated),state,
      refundedCents:refund,dispute:payment.status==='charged_back'?payment.status_detail||'unknown':null,approvedAt:payment.date_approved?instant(payment.date_approved):null,
      providerNetCents:net==null?null:cents(net), moneyReleaseStatus:typeof payment.money_release_status==='string'?payment.money_release_status:null};
  }
  return {create,getSubscription,getInvoice,getPayment,verifyContract,checkoutUrl,findSubscriptions,findInvoices,findInvoicesPage,findInvoicesByPayment,invoiceFact,
    cancel:id=>req('/preapproval/'+encodeURIComponent(id),'PUT',{status:'cancelled'})};
}
module.exports={createSubscriptionProvider,parseSubscriptionWebhook};
