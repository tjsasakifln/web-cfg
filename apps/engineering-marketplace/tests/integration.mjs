import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This suite writes only to an explicitly disposable, local test database.
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const db=new URL(process.env.DATABASE_URL||'http://invalid');
assert.equal(process.env.NODE_ENV,'test');
assert.equal(process.env.MARKETPLACE_INTEGRATION_TEST,'1');
assert.ok(['127.0.0.1','localhost'].includes(db.hostname)&&db.pathname.endsWith('_test'),'Disposable local *_test database required');
assert.equal(process.env.MARKETPLACE_PAYMENTS_ENABLED,'false');
assert.ok(!process.env.STRIPE_SECRET_KEY,'No real payment credential is accepted in this suite');
const require=createRequire(import.meta.url);
const {Client}=require('pg');
const {createMarketplaceGateway,TERMS_VERSION}=require('../../../runtime/marketplace/gateway.cjs');
const apiUrl='http://127.0.0.1:19050';
const origin='http://127.0.0.1:8795';
const environment={...process.env,PORT:'19050',MARKETPLACE_PUBLIC_ORIGIN:origin,MARKETPLACE_COMMISSION_BPS:'1000',MEDUSA_DISABLE_TELEMETRY:'true',MERCUR_DISABLE_TELEMETRY:'true',DO_NOT_TRACK:'1'};
const cli=resolve(app,'scripts/medusa.cjs');
const children=[];
function command(args,extra={}){
  const child=spawn(process.execPath,[cli,...args],{cwd:app,env:{...environment,...extra},stdio:['ignore','pipe','pipe']});children.push(child);
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-300000)});
  return {child,output:()=>output,done:new Promise((ok,no)=>{
    const timer=setTimeout(()=>{child.kill('SIGTERM');no(new Error('CLI timeout: '+args.join(' ')))},120000);
    child.once('error',no);child.once('exit',code=>{clearTimeout(timer);code===0?ok(output):no(new Error(args.join(' ')+' failed\n'+output.slice(-9000)))})})};
}
let server;
async function start(){
  server=command(['start','--host','127.0.0.1','--port','19050']);
  // Observe errors immediately while readiness is being polled.
  server.done.catch(()=>{});
  for(let n=0;n<180;n++){
    if(server.child.exitCode!==null)throw new Error('Server stopped\n'+server.output().slice(-9000));
    try{const result=await fetch(apiUrl+'/health',{signal:AbortSignal.timeout(1500)});if(result.ok)return}catch{}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw new Error('Server readiness timeout\n'+server.output().slice(-9000));
}
async function stop(){if(!server||server.child.exitCode!==null)return;server.child.kill('SIGINT');await Promise.race([server.done.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,5000))]);}
let checks=0;
const pass=name=>{checks++;console.log('PASS '+name)};
try{
  await command(['db:migrate']).done;pass('native Mercur and engineering migrations');
  const setup=async()=>{const output=await command(['exec','./src/scripts/setup.ts']).done;const line=output.split('\n').find(line=>line.startsWith('MARKETPLACE_SETUP '));assert.ok(line,'setup receipt missing');return JSON.parse(line.slice('MARKETPLACE_SETUP '.length))};
  const initial=await setup();assert.deepEqual(await setup(),initial);pass('idempotent BRL setup and dedicated publishable key');
  await start();
  const gateway=createMarketplaceGateway({env:{ENGINEERING_MARKETPLACE_MODE:'sandbox',ENGINEERING_MARKETPLACE_URL:apiUrl,ENGINEERING_MARKETPLACE_PUBLISHABLE_KEY:initial.publishable_key,ENGINEERING_MARKETPLACE_SESSION_KEY:randomBytes(32).toString('base64url'),ENGINEERING_MARKETPLACE_GATEWAY_KEY:environment.MARKETPLACE_GATEWAY_KEY,ENGINEERING_MARKETPLACE_SANDBOX_ORIGIN:origin}});
  let source=1;
  async function call(op,{body,cookie,query={}}={}){
    const response=await gateway.api({httpMethod:body===undefined?'GET':'POST',queryStringParameters:{op,...query},headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),requestContext:{identity:{sourceIp:'192.0.2.'+(source++)}}});
    return {status:response.statusCode,data:JSON.parse(response.body),cookie:response.headers['Set-Cookie']?.split(';')[0]};
  }
  const config=await call('config');assert.equal(config.status,200);assert.equal(config.data.enabled,true);assert.equal(config.data.paymentsEnabled,false);assert.equal(config.data.commission_bps,1000);
  assert.equal((await fetch(apiUrl+'/store/engineering/config',{headers:{'x-publishable-api-key':initial.publishable_key}})).status,403);pass('real availability and private upstream boundary');
  const baseline=await call('providers');assert.equal(baseline.status,200,JSON.stringify(baseline.data));assert.ok(Number.isSafeInteger(baseline.data.count));const baselineCount=baseline.data.count;
  const consent={consent:true,terms_version:TERMS_VERSION};
  const password=randomBytes(24).toString('base64url');
  const registration=role=>({role,email:role+'-'+randomBytes(4).toString('hex')+'@example.test',password,first_name:'Teste',last_name:'Integração',...(role==='provider'?{name:'Profissional de teste isolado'}:{}),...consent});
  const customerBody=registration('customer'),providerBody=registration('provider');
  const customer=await call('register',{body:customerBody});assert.equal(customer.status,201,JSON.stringify(customer.data));assert.equal(customer.data.role,'customer');assert.ok(customer.cookie);
  const recovered=await call('register',{body:{...customerBody,first_name:'Não deve sobrescrever'}});assert.equal(recovered.status,200);assert.equal(recovered.data.user.first_name,'Teste');
  const professional=await call('register',{body:providerBody});assert.equal(professional.status,201,JSON.stringify(professional.data));assert.ok(professional.data.seller?.id);assert.ok(professional.cookie);pass('native customer/provider signup, cookie sessions and safe retry');
  const profile={name:'Profissional de teste isolado '+randomBytes(6).toString('hex'),description:'Atuação de teste em projetos de engenharia dentro de ambiente descartável.',website_url:'https://example.test',phone:'48999990000',profile:{city:'Florianópolis',uf:'SC',registration_board:'CREA',registration:'TESTE-000',modalities:['remoto'],specialties:['projetar_revisar_compatibilizar'],portfolio_url:'https://example.test/portfolio'},...consent};
  const updated=await call('vendor-profile',{cookie:professional.cookie,body:profile});assert.equal(updated.status,200,JSON.stringify(updated.data));
  const unpublished=await call('providers');assert.equal(unpublished.data.count,baselineCount);assert.ok(!unpublished.data.providers.some(item=>item.id===professional.data.seller.id));pass('profile saved without automatic professional approval');
  const request={seller_id:professional.data.seller.id,title:'Projeto de teste local',description:'Necessidade de engenharia utilizada somente para verificar o fluxo de contratação.',location:'Florianópolis, SC',intent_family:'projetar_revisar_compatibilizar',...consent};
  assert.equal((await call('request',{cookie:customer.cookie,body:request})).status,409);
  await stop();
  await command(['exec','./src/scripts/review-provider.ts'],{MARKETPLACE_REVIEW_SELLER_ID:professional.data.seller.id,MARKETPLACE_REVIEW_DECISION:'approve',MARKETPLACE_REVIEW_OPERATOR:'integration-test',MARKETPLACE_REVIEW_EVIDENCE:'Registro fictício restrito ao banco descartável de teste'}).done;
  await start();
  assert.equal((await call('providers')).data.count,baselineCount+1);
  const listed=await call('providers',{query:{q:profile.name}});assert.equal(listed.status,200,JSON.stringify(listed.data));assert.equal(listed.data.providers.length,1,JSON.stringify(listed.data));assert.equal(listed.data.count,1);assert.equal(listed.data.providers[0].rating,null);assert.equal(listed.data.providers[0].review_count,0);assert.equal(listed.data.providers[0].email,undefined);assert.equal(listed.data.providers[0].website_url,'https://example.test/');
  const descriptionMatch=await call('providers',{query:{q:'descartável'}});assert.equal(descriptionMatch.status,200,JSON.stringify(descriptionMatch.data));assert.ok(descriptionMatch.data.providers.some(item=>item.id===professional.data.seller.id),'Provider must be found by description as well as name');
  pass('approved profile, correct pagination and no invented reviews');
  const created=await call('request',{cookie:customer.cookie,body:request});assert.equal(created.status,201,JSON.stringify(created.data));const id=created.data.request.id;
  assert.equal((await call('requests',{cookie:professional.cookie})).data.requests.length,1);
  const outsider=await call('register',{body:registration('customer')});assert.equal((await call('requests',{cookie:outsider.cookie})).data.requests.length,0);
  const deadline=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const quote={id,action:'quote',amount_cents:123456,scope:'Projeto de teste com escopo, entregáveis e responsabilidade técnica definidos.',deadline,expected_commission_bps:1000};
  assert.equal((await call('request-action',{cookie:customer.cookie,body:quote})).status,403);
  const staleFee=await call('request-action',{cookie:professional.cookie,body:{...quote,expected_commission_bps:500}});assert.equal(staleFee.status,409);
  const quoted=await call('request-action',{cookie:professional.cookie,body:quote});assert.equal(quoted.status,200,JSON.stringify(quoted.data));assert.equal(quoted.data.request.proposal.fee_cents,12345);
  assert.equal((await call('request-action',{cookie:outsider.cookie,body:{id,action:'accept',revision:1}})).status,404);
  assert.equal((await call('request-action',{cookie:customer.cookie,body:{id,action:'accept',revision:0}})).status,409);
  const accepted=await call('request-action',{cookie:customer.cookie,body:{id,action:'accept',revision:1}});assert.equal(accepted.status,200,JSON.stringify(accepted.data));assert.equal(accepted.data.request.status,'accepted');
  assert.equal((await call('request-action',{cookie:professional.cookie,body:quote})).status,409);pass('participant permissions, immutable amount, fee and revision acceptance');
  assert.equal((await call('checkout',{cookie:customer.cookie,body:{id}})).status,503);
  assert.equal((await call('request-action',{cookie:professional.cookie,body:{id,action:'deliver',note:'Entrega simulada sem pagamento'}})).status,409);
  assert.equal((await call('request-action',{cookie:customer.cookie,body:{id,action:'review',rating:5,note:'Não pode ser publicada antes da conclusão'}})).status,409);
  pass('payments disabled and reviews blocked before paid completion');
  const cancelled=await call('request-action',{cookie:customer.cookie,body:{id,action:'cancel'}});assert.equal(cancelled.status,200);assert.equal(cancelled.data.request.status,'cancelled');
  const deliveryRequest=await call('request',{cookie:customer.cookie,body:{...request,title:'Entrega e avaliação em banco descartável'}});assert.equal(deliveryRequest.status,201,JSON.stringify(deliveryRequest.data));
  const deliveryId=deliveryRequest.data.request.id;
  const deliveryQuote=await call('request-action',{cookie:professional.cookie,body:{...quote,id:deliveryId}});assert.equal(deliveryQuote.status,200,JSON.stringify(deliveryQuote.data));
  const deliveryAccepted=await call('request-action',{cookie:customer.cookie,body:{id:deliveryId,action:'accept',revision:deliveryQuote.data.request.revision}});assert.equal(deliveryAccepted.status,200,JSON.stringify(deliveryAccepted.data));
  // Payment state fixture only. This does not exercise Stripe or prove that
  // money was charged, transferred or paid out. It changes only the newly
  // created contract in the guarded, disposable local *_test database.
  const fixtureDb=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:1500,statement_timeout:5000,application_name:'confenge-marketplace-integration-fixture'});
  await fixtureDb.connect();
  try{
    const database=await fixtureDb.query('select current_database() as name');assert.ok(database.rows[0].name.endsWith('_test'),'Fixture database guard');
    const fixturePayment={status:'paid',amount_cents:deliveryQuote.data.request.proposal.amount_cents,fee_cents:deliveryQuote.data.request.proposal.fee_cents,source:'disposable-database-fixture'};
    const injected=await fixtureDb.query('update engineering_request set status=$1,payment=$2::jsonb,updated_at=now() where id=$3 and customer_id=$4 and seller_id=$5 and status=$6 and deleted_at is null returning id',
      ['paid',JSON.stringify(fixturePayment),deliveryId,customer.data.user.id,professional.data.seller.id,'accepted']);assert.equal(injected.rowCount,1,'Only this run\'s accepted contract receives the fixture');
    const delivered=await call('request-action',{cookie:professional.cookie,body:{id:deliveryId,action:'deliver',note:'Relatório técnico e memorial entregues apenas para verificar este ambiente de teste.'}});assert.equal(delivered.status,200,JSON.stringify(delivered.data));assert.equal(delivered.data.request.status,'delivered');
    const completed=await call('request-action',{cookie:customer.cookie,body:{id:deliveryId,action:'complete'}});assert.equal(completed.status,200,JSON.stringify(completed.data));assert.equal(completed.data.request.status,'completed');
    const review={id:deliveryId,action:'review',rating:4,note:'Avaliação exclusiva de teste após conferência da entrega no ambiente descartável.'};
    const reviewed=await call('request-action',{cookie:customer.cookie,body:review});assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));assert.equal(reviewed.data.request.review.rating,4);
    assert.equal((await call('request-action',{cookie:customer.cookie,body:review})).status,409,'One review per completed contract');
    const publicProfile=await call('provider',{query:{id:professional.data.seller.id}});assert.equal(publicProfile.status,200,JSON.stringify(publicProfile.data));assert.equal(publicProfile.data.provider.review_count,1);assert.equal(publicProfile.data.provider.rating,4);assert.equal(publicProfile.data.provider.reviews[0].note,review.note);
    pass('real HTTP delivery, completion and unique public review using only a local payment state fixture');
    const refunded=await fixtureDb.query('update engineering_request set status=$1,payment=$2::jsonb,updated_at=now() where id=$3 and customer_id=$4 and seller_id=$5 and status=$6 and deleted_at is null returning id',
      ['refunded',JSON.stringify({...fixturePayment,status:'refunded'}),deliveryId,customer.data.user.id,professional.data.seller.id,'completed']);assert.equal(refunded.rowCount,1);
    const historicalReview=await call('provider',{query:{id:professional.data.seller.id}});assert.equal(historicalReview.status,200,JSON.stringify(historicalReview.data));assert.equal(historicalReview.data.provider.review_count,1);assert.equal(historicalReview.data.provider.rating,4);assert.equal(historicalReview.data.provider.reviews[0].note,review.note);
    const historicalList=await call('providers',{query:{q:profile.name}});assert.equal(historicalList.status,200);assert.equal(historicalList.data.providers[0].review_count,1);assert.equal(historicalList.data.providers[0].rating,4);
    pass('a later simulated refund preserves the historical public review and average');
  }finally{await fixtureDb.end();}
  const loggedOut=await call('logout',{cookie:customer.cookie,body:{}});assert.equal(loggedOut.status,200);assert.equal((await call('session',{cookie:loggedOut.cookie})).data.authenticated,false);pass('cancellation before payment and session logout');
  console.log(JSON.stringify({suite:'real-mercur-postgres-integration',checks,payments:'disabled; disposable SQL payment fixture only; no processor E2E or bank transfer claimed'}));
}finally{await stop();for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');}
