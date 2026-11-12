'use strict';
const { createHash } = require('node:crypto');
const intents = require('./intents.json').intents.map(item => item.intent_family);
const TERMS = 'marketplace-engenharia-v1';
class DomainError extends Error { constructor(code, status = 422) { super(code); this.status = status; } }
function check(condition, code, status) { if (!condition) throw new DomainError(code, status); }
function text(value, min, max) { return typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value); }
function keys(obj, allowed) { check(obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).every(k => allowed.includes(k)), 'INVALID_FIELDS'); }
function consent(input) { check(input.consent === true && input.terms_version === TERMS, 'TERMS_REQUIRED'); }
function validateRequest(input) {
  keys(input, ['seller_id','title','description','location','intent_family','consent','terms_version']); consent(input);
  check(typeof input.seller_id === 'string' && /^sel_[A-Za-z0-9]+$/.test(input.seller_id), 'INVALID_PROVIDER');
  check(text(input.title, 6, 160) && text(input.description, 30, 6000) && text(input.location, 2, 200), 'INVALID_SCOPE');
  check(intents.includes(input.intent_family), 'INVALID_SPECIALTY');
  return { seller_id:input.seller_id, title:input.title.trim(), description:input.description.trim(), location:input.location.trim(), intent_family:input.intent_family, terms_version:TERMS };
}
function validateProfile(input) {
  keys(input,['name','description','website_url','phone','profile','consent','terms_version']); consent(input);
  check(text(input.name,3,120) && text(input.description,30,3000), 'INVALID_PROFILE');
  const p=input.profile; keys(p,['city','uf','modalities','registration','registration_board','specialties','portfolio_url']);
  check(text(p.city,2,100) && /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(p.uf), 'INVALID_LOCATION');
  check(['CREA','CAU'].includes(p.registration_board) && text(p.registration,3,40), 'INVALID_REGISTRATION');
  check(Array.isArray(p.modalities) && p.modalities.length>0 && p.modalities.length<=2 && p.modalities.every(m=>['remoto','presencial'].includes(m)), 'INVALID_MODALITY');
  check(Array.isArray(p.specialties) && p.specialties.length>0 && p.specialties.length<=8 && p.specialties.every(s=>intents.includes(s)), 'INVALID_SPECIALTY');
  for(const url of [input.website_url,p.portfolio_url]) if(url) { let parsed; try {parsed=new URL(url);} catch {} check(parsed && parsed.protocol==='https:' && !parsed.username && !parsed.password && url.length<=500,'INVALID_URL'); }
  check(!input.phone || text(input.phone,8,40), 'INVALID_PHONE');
  return { name:input.name.trim(), description:input.description.trim(), website_url:input.website_url||null, phone:input.phone||null,
    profile:{city:p.city.trim(),uf:p.uf,modalities:[...new Set(p.modalities)],registration:p.registration.trim(),registration_board:p.registration_board,specialties:[...new Set(p.specialties)],portfolio_url:p.portfolio_url||null} };
}
function hashProposal(record, proposal, revision) {
  return createHash('sha256').update(JSON.stringify([record.id,record.customer_id,record.seller_id,revision,proposal.scope,proposal.amount_cents,proposal.deadline,proposal.commission_bps,proposal.fee_cents,proposal.provider,TERMS])).digest('hex');
}
function businessDate(now = new Date().toISOString()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function ensureDeadline(proposal, now = new Date().toISOString()) { check(proposal?.deadline >= businessDate(now), 'PROPOSAL_EXPIRED', 409); }
function configuredCommission(value) { return typeof value==='string'&&/^\d{1,4}$/.test(value)&&Number(value)<=5000?Number(value):null; }
function applyAction(record, actor, input, now = new Date().toISOString()) {
  keys(input,['action','amount_cents','scope','deadline','note','rating','revision','expected_commission_bps']);
  const customer=actor.role==='customer' && actor.id===record.customer_id;
  const provider=actor.role==='provider' && actor.sellerId===record.seller_id;
  check(customer||provider,'NOT_FOUND',404);
  const action=input.action;
  const patch={};
  if(action==='quote') {
    check(provider,'FORBIDDEN',403); check(['requested','quoted'].includes(record.status),'INVALID_TRANSITION',409);
    check(Number.isSafeInteger(input.amount_cents) && input.amount_cents>=1000 && input.amount_cents<=99999999, 'INVALID_AMOUNT');
    check(text(input.scope,30,6000) && /^\d{4}-\d{2}-\d{2}$/.test(input.deadline||'') && input.deadline>=businessDate(now) && !Number.isNaN(Date.parse(input.deadline)) && new Date(input.deadline).toISOString().slice(0,10)===input.deadline, 'INVALID_PROPOSAL');
    check(Number.isInteger(actor.commissionBps)&&actor.commissionBps>=0&&actor.commissionBps<=5000,'COMMISSION_UNCONFIGURED',503);
    check(Number.isInteger(input.expected_commission_bps)&&input.expected_commission_bps===actor.commissionBps,'COMMISSION_CHANGED',409);
    check(actor.providerProfile?.id===record.seller_id&&text(actor.providerProfile?.name,3,160),'PROVIDER_UNAVAILABLE',409);
    patch.revision=record.revision+1; patch.status='quoted';
    patch.proposal={scope:input.scope.trim(),amount_cents:input.amount_cents,currency:'brl',deadline:input.deadline,provider_accepted_at:now,commission_bps:actor.commissionBps,fee_cents:Math.floor(input.amount_cents*actor.commissionBps/10000),provider:{...actor.providerProfile}};
    patch.proposal.hash=hashProposal(record,patch.proposal,patch.revision); patch.acceptance=null;
  } else if(action==='accept') {
    check(customer,'FORBIDDEN',403); check(record.status==='quoted','INVALID_TRANSITION',409);
    check(Number.isInteger(input.revision) && input.revision===record.revision,'QUOTE_CHANGED',409);
    ensureDeadline(record.proposal,now);
    patch.status='accepted'; patch.acceptance={revision:record.revision,proposal_hash:record.proposal.hash,accepted_at:now,terms_version:TERMS};
  } else if(action==='deliver') {
    check(provider,'FORBIDDEN',403); check(record.status==='paid' && record.payment?.status==='paid','PAYMENT_REQUIRED',409);
    check(text(input.note,10,4000),'DELIVERY_REQUIRED'); patch.status='delivered'; patch.delivery={note:input.note.trim(),delivered_at:now};
  } else if(action==='complete') {
    check(customer,'FORBIDDEN',403); check(record.status==='delivered' && record.payment?.status==='paid','INVALID_TRANSITION',409);
    patch.status='completed'; patch.delivery={...record.delivery,accepted_at:now};
  } else if(action==='review') {
    check(customer,'FORBIDDEN',403); check(record.status==='completed' && record.payment?.status==='paid','COMPLETION_REQUIRED',409);
    check(!record.review,'ALREADY_REVIEWED',409); check(Number.isInteger(input.rating) && input.rating>=1 && input.rating<=5 && text(input.note,10,2000),'INVALID_REVIEW');
    patch.review={rating:input.rating,note:input.note.trim(),created_at:now,status:'published'};
  } else if(action==='cancel') {
    check(['requested','quoted','accepted'].includes(record.status) && !record.payment,'CANCELLATION_REQUIRES_SUPPORT',409); patch.status='cancelled';
  } else { throw new DomainError('INVALID_ACTION'); }
  patch.events={entries:[...(record.events?.entries||[]),{action,role:actor.role,at:now}]};
  return patch;
}
function publicRequest(r) {
  return {id:r.id,customer_id:r.customer_id,seller_id:r.seller_id,title:r.title,description:r.description,location:r.location,intent_family:r.intent_family,status:r.status,revision:r.revision,proposal:r.proposal,acceptance:r.acceptance,delivery:r.delivery,review:r.review,
    payment:r.payment?{status:r.payment.status,amount_cents:r.payment.amount_cents,fee_cents:r.payment.fee_cents}:null,created_at:r.created_at,terms_version:r.terms_version};
}
module.exports={TERMS,DomainError,check,text,keys,consent,validateRequest,validateProfile,hashProposal,businessDate,ensureDeadline,configuredCommission,applyAction,publicRequest};
