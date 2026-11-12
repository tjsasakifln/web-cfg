const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
for (const key of ['TURNSTILE_SECRET_KEY','LEAD_REQUIRE_TURNSTILE','RESEND_API_KEY','NTFY_URL','OPS_WEBHOOK_URL','CONFENGE_INBOUND_WEBHOOK_URL','CONFENGE_INBOUND_WEBHOOK_SECRET']) delete process.env[key];
const core = require('../../netlify/functions/lib/lead-core.cjs');
const { MemoryStore } = require('../../netlify/functions/lib/lead-store.cjs');
const { mapLeadToInboundV1 } = require('../../netlify/functions/lib/inbound-handoff.cjs');
const endpoint = require('../../netlify/functions/lead.cjs');
const limiter = require('../../netlify/functions/lib/lead-rate-limit.cjs');
const payload = (extra = {}) => ({ nome:'Teste Controlado', email:'fixture@example.com', consentimento:true,
  intent:'ready_project_interest', estagio:'projetos-prontos', jornada:'projeto', route_family:'ready_projects',
  asset_id:'ready-projects', source_asset_id:'ready-projects', cta_id:'ready-projects-interest-submit',
  origem:'/projetos-prontos/', landing_page:'/projetos-prontos/', utm_source:'confenge',
  utm_medium:'owned', utm_campaign:'projetos_prontos_piloto', project_kind:'license', city:'Florianópolis',
  uf:'SC', lot_width_m:'10', lot_depth_m:'25', lot_status:'owned', bedrooms:'2', build_when:'unknown', ...extra });
const event = body => ({httpMethod:'POST',headers:{origin:'https://confenge.com.br','content-type':'application/json','x-forwarded-for':'192.0.2.54'},body:JSON.stringify(body)});
let store;
beforeEach(() => { store=new MemoryStore(); endpoint.setStoreForTests(store); limiter._reset(); });

test('pre-launch requests keep their stored material hash and can resume after deployment', async () => {
  const old={nome:'Legacy validation',email:'legacy@example.com',consentimento:true,
    estagio:'projeto, revisão ou compatibilização',jornada:'projeto',
    idempotency_key:'fe-44444444-4444-4444-8444-444444444444'};
  assert.equal((await endpoint.handler(event(old))).statusCode,201);
  // Snapshot computed by the original 277aaca handler for this exact request.
  const hash='b35bd83b55b4afc38c4e2ca1a8c2ab0eaf152d0166fde83441f5282135c498c1';
  assert.equal((await store.list())[0].idempotency_material_hash,hash);
  assert.equal((await endpoint.handler(event(old))).statusCode,200);
  assert.equal((await store.list()).length,1);
});

test('minimal inquiry, one contact and optional dimensions accepted without qualifying it as a sale', () => {
  const result=core.validateAndNormalize(payload({email:'',telefone:'48988887777',lot_width_m:'',lot_depth_m:'',lot_status:'',bedrooms:'',build_when:''}));
  assert.equal(result.ok,true);
  assert.equal(result.lead.project_interest.lot_width_m,null);
  assert.equal(result.lead.project_interest.product_id,null);
  assert.equal(result.lead.qualification_state,'NEEDS_CONTEXT');
  assert.equal(result.lead.marketing_opt_in,false);
  assert.equal(result.lead.auto_send,false);
  assert.equal(result.lead.jornada,'projeto');
});
test('server rejects missing location, fabricated product, bad enum and dimension', () => {
  for(const bad of [{city:''},{uf:'ZZ'},{city:'<script>alert(1)</script>'},{project_kind:'paid'},
    {lot_width_m:'-1'},{lot_depth_m:'Infinity'},{product_id:'invented-model'},{project_interest:[]},
    {project_interest:'hello'},{adaptive_intake:true},{need_code:'building-project'},
    {offer_id:'another-offer'},{deliverable_id:'SERV-PROJETO'},{consentimento:false},{email:''}]) {
    assert.equal(core.validateAndNormalize(payload(bad)).ok,false,JSON.stringify(bad));
  }
});
test('actual handler persists once, preserves qualification and never exposes personal data in receipt', async () => {
  const input=payload({idempotency_key:'fe-11111111-1111-4111-8111-111111111111'});
  const first=await endpoint.handler(event(input));
  assert.equal(first.statusCode,201,first.body);
  const receipt=JSON.parse(first.body);
  assert.ok(receipt.lead_id);
  assert.doesNotMatch(first.body,/fixture@example|Florianópolis|Teste Controlado|lot_width/);
  const retry=await endpoint.handler(event(input));
  assert.equal(retry.statusCode,200);
  assert.equal(JSON.parse(retry.body).lead_id,receipt.lead_id);
  const records=await store.list();
  assert.equal(records.length,1);
  assert.equal(records[0].project_interest.city,'Florianópolis');
  assert.equal(records[0].utm_campaign,'projetos_prontos_piloto');
  const wire=mapLeadToInboundV1(records[0]);
  assert.equal(wire.source,'CONFENGE_WEB');
  assert.equal(wire.outbound_eligible,false);
  assert.equal(wire.auto_send,false);
  assert.match(wire.message,/município do terreno=Florianópolis/);
  assert.match(wire.message,/frente em metros=10/);
  assert.match(wire.message,/interesse residencial=license/);
});
test('edited qualification with an old request key cannot silently replay an earlier receipt', async () => {
  const input=payload({idempotency_key:'fe-22222222-2222-4222-8222-222222222222'});
  assert.equal((await endpoint.handler(event(input))).statusCode,201);
  const changed=await endpoint.handler(event({...input,project_kind:'adaptation',city:'Joinville'}));
  assert.equal(changed.statusCode,409,changed.body);
  assert.equal((await store.list()).length,1);
});
test('real storage failure and invalid submission do not claim a persisted contact', async () => {
  const bad=await endpoint.handler(event(payload({uf:'XX'})));
  assert.equal(bad.statusCode,422);
  assert.equal((await store.list()).length,0);
  store.put=async()=>{throw new Error('controlled disk failure');};
  endpoint.setStoreForTests(store);
  const failure=await endpoint.handler(event(payload({idempotency_key:'fe-33333333-3333-4333-8333-333333333333'})));
  assert.ok(failure.statusCode>=500);
  assert.equal(JSON.parse(failure.body).ok,false);
  assert.ok(!JSON.parse(failure.body).lead_id);
});
