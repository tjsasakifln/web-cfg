const test=require('node:test');const assert=require('node:assert/strict');
const {applyAction,validateRequest,validateProfile,publicRequest,TERMS}=require('../config/domain.cjs');
const now='2026-11-12T17:00:00.000Z';
const provider={role:'provider',id:'mem_one',sellerId:'sel_one',commissionBps:1000,providerProfile:{id:'sel_one',name:'Prestador de teste',registration_board:'CREA',registration:'TESTE-000'}};
const customer={role:'customer',id:'cus_one'};
const base=()=>({id:'engr_one',customer_id:'cus_one',seller_id:'sel_one',status:'requested',revision:0,events:{entries:[]}});
const proposal={action:'quote',amount_cents:123456,scope:'Projeto de instalações com entregáveis, limites e responsabilidade definidos.',deadline:'2026-12-12',expected_commission_bps:1000};
function quoted(){let r=base();return {...r,...applyAction(r,provider,proposal,now)}}
function accepted(){let r=quoted();return {...r,...applyAction(r,customer,{action:'accept',revision:1},now)}}
test('only the assigned provider can quote; another buyer/provider cannot act',()=>{
  for(const who of [customer,{...provider,sellerId:'sel_other'},{...customer,id:'cus_other'}])assert.throws(()=>applyAction(base(),who,proposal,now));
  assert.equal(applyAction(base(),provider,proposal,now).status,'quoted');
});
test('a quote snapshots integer amounts and commission; no client status/fee injection',()=>{
  const r=quoted();assert.equal(r.proposal.fee_cents,12345);assert.equal(r.proposal.commission_bps,1000);
  for(const input of [{...proposal,amount_cents:1.5},{...proposal,fee_cents:0},{...proposal,status:'paid'},{...proposal,deadline:'2027-02-31'}])assert.throws(()=>applyAction(base(),provider,input,now));
  assert.throws(()=>applyAction(base(),{...provider,commissionBps:null},proposal,now));
  assert.throws(()=>applyAction(base(),provider,{...proposal,expected_commission_bps:500},now),/COMMISSION_CHANGED/);
  assert.throws(()=>applyAction(base(),provider,{...proposal,expected_commission_bps:undefined},now),/COMMISSION_CHANGED/);
});
test('a stale or missing quote revision cannot be accepted',()=>{
  const r=quoted();for(const revision of [undefined,0,2])assert.throws(()=>applyAction(r,customer,{action:'accept',revision},now));
  const next={...r,...applyAction(r,provider,{...proposal,amount_cents:130000},now)};
  assert.equal(next.revision,2);assert.notEqual(next.proposal.hash,r.proposal.hash);
  assert.throws(()=>applyAction(next,customer,{action:'accept',revision:1},now));
  assert.throws(()=>applyAction(r,customer,{action:'accept',revision:1},'2026-12-14T03:00:00Z'),/PROPOSAL_EXPIRED/);
  assert.equal(applyAction(r,customer,{action:'accept',revision:1},'2026-12-13T01:00:00Z').status,'accepted');
});
test('accepted scope is immutable and neither browser actor can mark it paid',()=>{
  const r=accepted();assert.throws(()=>applyAction(r,provider,proposal,now));
  for(const action of ['paid','pay','observe','refund'])for(const who of [customer,provider])assert.throws(()=>applyAction(r,who,{action},now));
  assert.throws(()=>applyAction(r,provider,{action:'deliver',note:'Entrega concluída.'},now));
});
test('delivery, completion and unique review require the correct actor and actual payment',()=>{
  let r=accepted();r={...r,status:'paid',payment:{status:'paid',account_id:'private-account',session_id:'private-session'}};
  assert.throws(()=>applyAction(r,customer,{action:'deliver',note:'Arquivos entregues pelo canal acordado.'},now));
  r={...r,...applyAction(r,provider,{action:'deliver',note:'Arquivos entregues pelo canal acordado.'},now)};
  assert.throws(()=>applyAction(r,provider,{action:'complete'},now));
  assert.throws(()=>applyAction(r,customer,{action:'review',rating:5,note:'O trabalho atendeu ao escopo.'},now));
  r={...r,...applyAction(r,customer,{action:'complete'},now)};
  for(const rating of [0,6,2.5,'5'])assert.throws(()=>applyAction(r,customer,{action:'review',rating,note:'O trabalho atendeu ao escopo.'},now));
  const patch=applyAction(r,customer,{action:'review',rating:4,note:'O trabalho atendeu ao escopo.'},now);
  assert.throws(()=>applyAction({...r,...patch},customer,{action:'review',rating:5,note:'Outra avaliação indevida.'},now));
  const visible=publicRequest(r);assert.equal(visible.payment.account_id,undefined);assert.equal(visible.payment.session_id,undefined);
});
test('refund/dispute prevents review and pending checkout cannot be cancelled as unpaid',()=>{
  for(const status of ['refunded','disputed','partially_refunded'])assert.throws(()=>applyAction({...accepted(),status:'completed',payment:{status}},customer,{action:'review',rating:5,note:'Avaliação não elegível.'},now));
  for(const status of ['creating','pending','paid'])assert.throws(()=>applyAction({...accepted(),payment:{status}},customer,{action:'cancel'},now));
});
test('requests use existing service families, consent and bounded scope',()=>{
  const input={seller_id:'sel_one',title:'Projeto estrutural',description:'Preciso de projeto para uma edificação de dois pavimentos.',location:'Florianópolis, SC',intent_family:'projetar_revisar_compatibilizar',consent:true,terms_version:TERMS};
  assert.equal(validateRequest(input).intent_family,input.intent_family);
  for(const patch of [{consent:false},{terms_version:'old'},{intent_family:'invented'},{price:1},{seller_id:'../admin'}])assert.throws(()=>validateRequest({...input,...patch}));
});
test('professional profile cannot self-verify, inject metadata or unsafe portfolio URLs',()=>{
  const input={name:'Profissional de teste',description:'Atuação em projetos estruturais e coordenação técnica de edificações.',consent:true,terms_version:TERMS,profile:{city:'Florianópolis',uf:'SC',registration_board:'CREA',registration:'000000-TESTE',modalities:['remoto'],specialties:['projetar_revisar_compatibilizar'],portfolio_url:'https://example.com/portfolio'}};
  assert.equal(validateProfile(input).profile.uf,'SC');
  for(const patch of [{verified:true},{metadata:{engineering_verified:true}}])assert.throws(()=>validateProfile({...input,...patch}));
  for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com/'])assert.throws(()=>validateProfile({...input,profile:{...input.profile,portfolio_url:url}}));
});
