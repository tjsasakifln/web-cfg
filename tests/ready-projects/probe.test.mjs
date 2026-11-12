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

async function exercise({ brokenForm=false, lostField=false, email=false }={}) {
  let created=0, posts=0, saved;
  const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://local');
    if(url.pathname==='/.well-known/build-info.json') return json(res,{commit:sha});
    if(url.pathname==='/projetos-prontos/') {res.writeHead(200,{'Content-Type':'text/html'});res.end(brokenForm?html.replace('name="city"','name="missing_city"'):html);return;}
    if(url.pathname==='/.netlify/functions/ops') {
      const action=url.searchParams.get('action');
      if(action==='analytics_summary') return json(res,{ok:true,events_loaded:0,aggregate:{generated_at:new Date().toISOString(),daily:[]}});
      if(action==='funnel') return json(res,{ok:true,commercial_only:true,funnel:{counts,pipeline_value:0,revenue:0}});
      if(action==='system_health') return json(res,{ok:true,counts_by_kind:{real:0,synthetic:created,qa:0}});
      if(action==='weekly_report') return json(res,{ok:true,commercial_only:true,leads_total:0,leads_new_7d:0,leads_excluded_non_real:created,system_health:{pipeline_real:0,revenue_real:0}});
      if(action==='lead') return json(res,{ok:true,lead:{record_kind:'synthetic',intent:'ready_project_interest',project_interest:lostField?{...interest,city:null}:saved?.project_interest}});
      if(action==='inbound_handoff') return json(res,{ok:true,
        counters:{persisted_leads:created,pending:0,delivered:created,retryable:0,retries:0,permanent_failures:0,skipped:0,blocked:0,dead:0},
        configuration:{contract:'READY',destination_fingerprint:'WARMBLY_PRODUCTION_V1'},
        safety_gate:{ok:true,contract:'READY',auto_send_off:true,dispatch_attempted:false},
        receipt:created?{lead_id:id,record_kind:'synthetic',authenticated_probe:true,source:'CONFENGE_WEB',next_action:'exclude_from_commercial',...context,
          handoff:{status:'DELIVERED',attempts:1,downstream:{http:201,duplicate:false,downstream_receipt:id}}}:null});
    }
    if(url.pathname==='/.netlify/functions/lead'&&req.method==='POST') {
      posts++;let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
        saved=JSON.parse(raw);const duplicate=Boolean(created);created=1;
        json(res,{ok:true,lead_id:id,idempotent:duplicate,notify_status:'skipped',email_status:'skipped'},duplicate?200:201);
      });return;
    }
    json(res,{},404);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[fileURLToPath(new URL('../../scripts/site/synthetic_lead_probe.mjs',import.meta.url)),`http://127.0.0.1:${server.address().port}`],{
        env:{...process.env,LEAD_PROBE_SECRET:'p'.repeat(32),OPS_TOKEN:'o'.repeat(32),EXPECTED_SHA:sha,
          PROBE_SCENARIO:'ready-projects',PROBE_PAGE_PATH:'/projetos-prontos/',PROBE_VERIFY_EMAIL:email?'1':'0',PROBE_BROWSER_CONTEXT_FILE:''}});
      let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);
      child.on('close',code=>resolve({code,out,err}));
    });
    return {...result,report:JSON.parse(result.out),posts};
  } finally {await new Promise(resolve=>server.close(resolve));}
}
test('new scenario proves persisted qualification and idempotency without messages',async()=>{
  const r=await exercise();assert.equal(r.code,0,r.out);assert.equal(r.posts,2);assert.equal(r.report.checks.project_private_readback_matches,true);
  assert.doesNotMatch(r.out,/Florianópolis|test@example/);
});
test('changed form blocks before POST',async()=>{const r=await exercise({brokenForm:true});assert.equal(r.posts,0);assert.equal(r.report.reason,'ready_project_form_contract_mismatch');});
test('lost qualification fails the production proof',async()=>{const r=await exercise({lostField:true});assert.equal(r.code,1);assert.equal(r.report.checks.project_private_readback_matches,false);});
test('email activation is rejected before POST',async()=>{const r=await exercise({email:true});assert.equal(r.posts,0);assert.equal(r.report.reason,'ready_project_email_forbidden');});
