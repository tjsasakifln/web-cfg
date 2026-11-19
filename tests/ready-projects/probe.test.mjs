import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { READY_PROJECT_CONTEXT as context, READY_PROJECT_INTEREST as interest,
  readyProjectFormMatches } from '../../scripts/site/ready_project_probe_contract.mjs';

const hidden = Object.entries({ ...context, origem: '/projetos-prontos/', project_kind: 'license' })
  .map(([name,value]) => `<input type="hidden" name="${name}" value="${value}">`).join('');
const html = `<form id="formulario-contato" name="diagnostico-confenge" method="post" action="/.netlify/functions/lead"
 data-capture-form data-intent="ready_project_interest" data-asset-id="ready-projects" data-route-family="ready_projects"
 data-cta-id="ready-projects-interest-submit">${hidden}
 ${['nome','email','consentimento','city','uf','lot_width_m','lot_depth_m','lot_status','bedrooms','build_when'].map(name=>`<input name="${name}">`).join('')}</form>`;
const sha = 'a'.repeat(40), id = 'synthetic:ready-projects:fixture';
const counts = Object.fromEntries(['visitor','cta_triggered','form_started','lead_persisted','contacted','qualified','meeting','proposal','won','lost'].map(key=>[key,0]));

test('served form contract rejects unavailable and ambiguous qualification', () => {
  assert.equal(readyProjectFormMatches(html), true);
  assert.equal(readyProjectFormMatches(html.replace('name="city"', 'name="missing_city"')), false);
  assert.equal(readyProjectFormMatches(html.replace('</form>', '<input name="uf"></form>')), false);
  assert.equal(readyProjectFormMatches(html.replace('name="bedrooms"', 'disabled name="bedrooms"')), false);
});

const safeGate = { ok:true, contract:'READY', status:'READY', auto_send_off:true, dispatch_attempted:false };
const blockedGate = { ok:false, contract:'BLOCKED', status:'UNKNOWN', auto_send_off:false,
  dispatch_attempted:false, reason:'destination_safety_gate_failed' };

async function exercise({ brokenForm=false, lostField=false, email=false, scenario='ready-projects',
  safety=blockedGate, inboundHttp=200, inboundOk=true, configuration={}, mutateReceipt,
  ignorePersistOnly=false, readbackOk=true, readbackId=id, expectedSha=sha, probeSecret='p'.repeat(32) }={}) {
  let created=0, posts=0, saved, persistOnly=false, externalTransports=0;
  const postHeaders=[];
  const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://local');
    if(url.pathname==='/.well-known/build-info.json') return json(res,{commit:sha});
    if(url.pathname==='/projetos-prontos/') {res.writeHead(200,{'Content-Type':'text/html'});res.end(brokenForm?html.replace('name="city"','name="missing_city"'):html);return;}
    if(url.pathname==='/.netlify/functions/ops') {
      if(req.headers.authorization !== `Bearer ${'o'.repeat(32)}`) return json(res,{ok:false},401);
      const action=url.searchParams.get('action');
      if(action==='analytics_summary') return json(res,{ok:true,events_loaded:0,aggregate:{generated_at:new Date().toISOString(),daily:[]}});
      if(action==='funnel') return json(res,{ok:true,commercial_only:true,funnel:{counts,pipeline_value:0,revenue:0}});
      if(action==='system_health') return json(res,{ok:true,counts_by_kind:{real:0,synthetic:created,qa:0}});
      if(action==='weekly_report') return json(res,{ok:true,commercial_only:true,leads_total:0,leads_new_7d:0,leads_excluded_non_real:created,system_health:{pipeline_real:0,revenue_real:0}});
      if(action==='lead') return json(res,{ok:readbackOk,lead:{lead_id:readbackId,record_kind:'synthetic',intent:'ready_project_interest',
        project_interest:lostField?{...interest,city:null}:saved?.project_interest}});
      if(action==='inbound_handoff') {
        const receipt=created?{lead_id:id,receipt_id:id,record_kind:'synthetic',authenticated_probe:true,
          persist_only_probe:persistOnly,source:'CONFENGE_WEB',next_action:'exclude_from_commercial',...context,
          handoff:persistOnly?{status:'SKIPPED',reason:'persist_only_probe',attempts:0,next_attempt_at:null,delivered_at:null,downstream:null}:
            {status:'DELIVERED',attempts:1,downstream:{http:201,duplicate:false,downstream_receipt:id}},
          delivery:{notify_status:'skipped',email_status:'skipped',qa_email_status:null,qa_email_provider_id:null}}:null;
        if(receipt && mutateReceipt) mutateReceipt(receipt);
        return json(res,{ok:inboundOk,
          counters:{persisted_leads:created,pending:0,delivered:persistOnly?0:created,retryable:0,retries:0,
            permanent_failures:0,skipped:persistOnly?created:0,blocked:0,dead:0},
          configuration:{contract:'READY',destination_fingerprint:'WARMBLY_PRODUCTION_V1',...configuration},
          safety_gate:safety,receipt},inboundHttp);
      }
    }
    if(url.pathname==='/.netlify/functions/lead'&&req.method==='POST') {
      posts++;postHeaders.push(req.headers);let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
        saved=JSON.parse(raw);const duplicate=Boolean(created);
        if(!duplicate) {
          persistOnly=!ignorePersistOnly && req.headers['x-confenge-probe-persist-only']==='1';
          if(!persistOnly) externalTransports++;
          created=1;
        }
        json(res,{ok:true,lead_id:id,idempotent:duplicate,notify_status:'skipped',email_status:'skipped'},duplicate?200:201);
      });return;
    }
    json(res,{},404);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[fileURLToPath(new URL('../../scripts/site/synthetic_lead_probe.mjs',import.meta.url)),`http://127.0.0.1:${server.address().port}`],{
        env:{...process.env,LEAD_PROBE_SECRET:probeSecret,OPS_TOKEN:'o'.repeat(32),EXPECTED_SHA:expectedSha,
          PROBE_SCENARIO:scenario,PROBE_PAGE_PATH:'/projetos-prontos/',PROBE_VERIFY_EMAIL:email?'1':'0',PROBE_BROWSER_CONTEXT_FILE:''}});
      let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);
      child.on('close',code=>resolve({code,out,err}));
    });
    return {...result,report:JSON.parse(result.out),posts,postHeaders,externalTransports};
  } finally {await new Promise(resolve=>server.close(resolve));}
}

test('residential proof persists qualification without transport when destination safety is unknown',async()=>{
  const r=await exercise();
  assert.equal(r.code,0,r.out);assert.equal(r.posts,2);
  assert.equal(r.externalTransports,0);
  for(const headers of r.postHeaders) {
    assert.equal(headers['x-confenge-probe-persist-only'],'1');
    assert.equal(headers['x-confenge-qa-email'],undefined);
  }
  assert.equal(r.report.state,'CAPTURE_PERSISTENCE_READY');
  assert.equal(r.report.proof_scope,'capture_persistence_only');
  assert.equal(r.report.checks.project_private_readback_matches,true);
  assert.equal(Object.values(r.report.checks).every(Boolean),true);
  assert.equal(r.report.warmbly.contract,'BLOCKED');
  assert.equal(r.report.warmbly.status,'UNKNOWN');
  assert.equal(r.report.warmbly.transport_tested,false);
  assert.equal(r.report.warmbly.auto_send,null);
  assert.equal(r.report.warmbly.dispatch_attempted,null);
  assert.equal(r.report.checks.warmbly_delivered,undefined);
  assert.doesNotMatch(r.out,/Florianópolis|probe@example|pppppppppppppppp|oooooooooooooooo/);
});

test('residential proof still prohibits transport when destination safety is ready',async()=>{
  const r=await exercise({safety:safeGate});
  assert.equal(r.code,0,r.out);assert.equal(r.externalTransports,0);
  assert.equal(r.report.state,'CAPTURE_PERSISTENCE_READY');
  assert.equal(r.report.warmbly.transport_tested,false);
  assert.equal(r.report.warmbly.auto_send,false);
  assert.equal(r.report.warmbly.dispatch_attempted,false);
});

test('changed form blocks before POST',async()=>{const r=await exercise({brokenForm:true});assert.equal(r.posts,0);assert.equal(r.report.reason,'ready_project_form_contract_mismatch');});
test('lost qualification fails the production proof',async()=>{const r=await exercise({lostField:true});assert.equal(r.code,1);assert.equal(r.report.state,'CAPTURE_PERSISTENCE_FAILED');assert.equal(r.report.checks.project_private_readback_matches,false);});
test('email activation is rejected before POST',async()=>{const r=await exercise({email:true});assert.equal(r.posts,0);assert.equal(r.report.reason,'ready_project_email_forbidden');});

test('persistence-only does not weaken identity or authenticated operations prerequisites',async t=>{
  for(const [name,options,reason] of [
    ['missing probe credential',{probeSecret:''},'lead_probe_secret_missing_or_short'],
    ['missing release SHA',{expectedSha:''},'ready_project_exact_sha_required'],
    ['different live release',{expectedSha:'b'.repeat(40)},'live_build_identity_mismatch'],
    ['unavailable private operations',{inboundHttp:401},'operational_baseline_metrics_invalid'],
    ['unsuccessful private operations',{inboundOk:false},'operational_baseline_metrics_invalid'],
  ]) await t.test(name,async()=>{
    const r=await exercise(options);assert.equal(r.code,1);assert.equal(r.posts,0);assert.equal(r.report.reason,reason);
  });
});

test('a server ignoring persist-only cannot yield successful capture evidence',async()=>{
  const r=await exercise({ignorePersistOnly:true});
  assert.equal(r.code,1);assert.equal(r.report.state,'CAPTURE_PERSISTENCE_FAILED');
  assert.equal(r.report.checks.project_persist_only_record,false);
  assert.equal(r.report.checks.project_handoff_never_attempted,false);
  assert.equal(r.report.checks.project_no_downstream_receipt,false);
});

test('durable receipt must prove explicit terminal suppression and no delivery',async t=>{
  const cases=[
    ['marker absent',r=>delete r.persist_only_probe,'project_persist_only_record'],
    ['marker false',r=>r.persist_only_probe=false,'project_persist_only_record'],
    ['marker is not a boolean',r=>r.persist_only_probe='true','project_persist_only_record'],
    ['unauthenticated synthetic',r=>r.authenticated_probe=false,'authenticated_synthetic_record'],
    ['real classification',r=>r.record_kind='real','authenticated_synthetic_record'],
    ['reason absent',r=>delete r.handoff.reason,'project_handoff_skipped'],
    ['generic skipped integration',r=>r.handoff.reason='not_configured','project_handoff_skipped'],
    ['pending transport',r=>r.handoff.status='PENDING','project_handoff_skipped'],
    ['attempt already made',r=>r.handoff.attempts=1,'project_handoff_never_attempted'],
    ['attempt count absent',r=>delete r.handoff.attempts,'project_handoff_never_attempted'],
    ['scheduled transport',r=>r.handoff.next_attempt_at=new Date().toISOString(),'project_handoff_not_scheduled'],
    ['schedule field absent',r=>delete r.handoff.next_attempt_at,'project_handoff_not_scheduled'],
    ['downstream exists',r=>r.handoff.downstream={},'project_no_downstream_receipt'],
    ['downstream field absent',r=>delete r.handoff.downstream,'project_no_downstream_receipt'],
    ['delivery timestamp exists',r=>r.handoff.delivered_at=new Date().toISOString(),'project_no_downstream_receipt'],
    ['delivery absent',r=>delete r.delivery,'project_delivery_persisted_skipped'],
    ['notification pending',r=>r.delivery.notify_status='pending','project_delivery_persisted_skipped'],
    ['email delivered',r=>r.delivery.email_status='ok','project_delivery_persisted_skipped'],
    ['QA email pending',r=>r.delivery.qa_email_status='pending','project_email_never_requested'],
    ['QA provider receipt exists',r=>r.delivery.qa_email_provider_id='controlled-provider','project_email_never_requested'],
    ['different persistence receipt',r=>r.receipt_id='synthetic:different:receipt','project_persisted_receipt_matches'],
  ];
  for(const [name,mutateReceipt,check] of cases) await t.test(name,async()=>{
    const r=await exercise({mutateReceipt});
    assert.equal(r.code,1,r.out);assert.equal(r.report.state,'CAPTURE_PERSISTENCE_FAILED');
    assert.equal(r.report.checks[check],false);assert.equal(r.externalTransports,0);
  });
});

test('private readback must be successful and tied to the exact persisted receipt',async t=>{
  for(const [name,options] of [['unsuccessful read',{readbackOk:false}],['different record',{readbackId:'synthetic:another:lead'}]]) {
    await t.test(name,async()=>{const r=await exercise(options);assert.equal(r.code,1);assert.equal(r.report.checks.project_private_readback_matches,false);});
  }
});

test('every transport scenario remains blocked before POST without destination safety',async t=>{
  for(const [name,options] of [
    ['standard',{scenario:''}],['legacy-sst',{scenario:'legacy-sst'}],
    ['priority-aditivo',{scenario:'priority-aditivo'}],['QA email',{scenario:'legacy-sst',email:true}],
  ]) await t.test(name,async()=>{
    const r=await exercise(options);assert.equal(r.code,1);assert.equal(r.posts,0);
    assert.equal(r.report.reason,'warmbly_safety_gate_not_ready');
  });
});

test('all existing transport safety predicates remain mandatory',async t=>{
  const cases=[
    ['OPS HTTP',{inboundHttp:503}],['OPS success',{inboundOk:false}],
    ['configured contract',{configuration:{contract:'BLOCKED'}}],
    ['canonical destination',{configuration:{destination_fingerprint:'UNEXPECTED'}}],
    ['safety success',{safety:{...safeGate,ok:false}}],
    ['safety contract',{safety:{...safeGate,contract:'BLOCKED'}}],
    ['auto-send off',{safety:{...safeGate,auto_send_off:false}}],
    ['no dispatch',{safety:{...safeGate,dispatch_attempted:true}}],
  ];
  for(const [name,options] of cases) await t.test(name,async()=>{
    const r=await exercise({scenario:'',safety:safeGate,...options});
    assert.equal(r.code,1);assert.equal(r.posts,0);assert.equal(r.report.reason,'warmbly_safety_gate_not_ready');
  });
});

test('ordinary transport retains its receipt assertions and success state',async()=>{
  const r=await exercise({scenario:'',safety:safeGate});
  assert.equal(r.code,0,r.out);assert.equal(r.posts,2);assert.equal(r.externalTransports,1);
  assert.equal(r.report.state,'TRANSPORT_READY');assert.equal(r.report.proof_scope,'capture_and_transport');
  assert.equal(r.report.warmbly.transport_tested,true);
  assert.equal(r.report.checks.warmbly_delivered,true);
  assert.equal(r.report.checks.exactly_one_handoff_attempt,true);
  assert.equal(r.report.checks.downstream_receipt_matches,true);
  assert.equal(r.report.checks.downstream_created_not_duplicate,true);
  assert.equal(r.report.checks.downstream_action_absent,true);
  for(const headers of r.postHeaders) assert.equal(headers['x-confenge-probe-persist-only'],undefined);
});
