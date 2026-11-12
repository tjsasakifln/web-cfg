// Controlled UI fixtures only. No provider calls, emails, products or money.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from '../../scripts/site/resolve_chrome.mjs';
import projectPolicy from '../../runtime/project-commerce/policy.cjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const publicRoot = existsSync(resolve(root, '_site/projetos-prontos/pedidos/index.html')) ? resolve(root, '_site') : root;
const reportDir = resolve(root, 'build/reports/project-orders');
const calls = [], creations = [], supportCalls = [], errors = [];
const fixtureSupplier = {legalName:'Fornecedor de ensaio sem oferta comercial',registrationType:'CNPJ',registration:'11222333000181',address:{street:'Rua de ensaio',number:'100',neighborhood:'Área de testes',city:'Município de ensaio',state:'SC',postalCode:'88000000',country:'BR'},email:'supplier@controlled.example.test',phone:'+5548999999999'};
const fixtureTerms = `${projectPolicy.supplierText(fixtureSupplier)}\n\nCondições exclusivas de ensaio. Não representam produto disponível nem aprovação comercial.`;
const fixtureProduct = { id:'controlled-fixture',slug:'controlled-fixture',title:'Projeto de ensaio controlado',version:'fixture-r1',amountCents:119000,currency:'BRL',description:'Somente fixture local, sem oferta pública.',terms:{version:'fixture-v1',sha256:projectPolicy.sha(fixtureTerms),url:'/projetos-prontos/condicoes/',text:fixtureTerms,supplier:fixtureSupplier} };
const fixtureOrderId = '11111111-1111-4111-8111-111111111111';
let enabled = false, purchasesEnabled = true, configFailure = false, createFailOnce = false, invalidReceipt = false, resolvedReceipt = false, orders = [], downloadDelay = 0;
const fixtureAuth = `let listener;
const auth={currentUser:null,authStateReady:async()=>{}};
const make=(email,verified)=>({uid:'controlled-user',email,emailVerified:verified,reload:async()=>{},getIdToken:async()=> 'controlled-token'});
const set=user=>{auth.currentUser=user;listener?.(user)};
export const getApps=()=>[];export const initializeApp=()=>({});export const getAuth=()=>auth;export const initializeAuth=()=>auth;export const browserLocalPersistence={};export const connectAuthEmulator=()=>{};
export const onAuthStateChanged=(a,fn)=>{listener=fn;fn(a.currentUser);return()=>{listener=undefined}};
export const signInWithEmailAndPassword=async(a,email)=>{set(make(email,true));return{user:a.currentUser}};
export const createUserWithEmailAndPassword=async(a,email)=>{set(make(email,false));return{user:a.currentUser}};
export const sendEmailVerification=async()=>{};export const sendPasswordResetEmail=async()=>{};export const signOut=async()=>set(null);
globalThis.__projectAuthFixture={verify(){auth.currentUser.emailVerified=true},signOut(){set(null)}};`;
const send = (res,value,status=200) => { res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value)); };
const server = createServer(async (req,res) => {
  const url = new URL(req.url,'http://local'); calls.push({path:url.pathname,op:url.searchParams.get('op'),method:req.method,authorization:req.headers.authorization||null});
  if(url.pathname==='/assets/tools-commerce/firebase-auth.mjs'){res.setHeader('content-type','text/javascript');return res.end(fixtureAuth);}
  if(url.pathname==='/api/web/project-orders'){
    const op=url.searchParams.get('op');let body='';for await(const chunk of req)body+=chunk;
    if(op==='config')return send(res,configFailure?{error:'UNAVAILABLE'}:enabled?{enabled:true,purchasesEnabled,firebase:{apiKey:'fixture',projectId:'controlled-hml',appId:'controlled-app'},products:[fixtureProduct]}:{enabled:false,purchasesEnabled:false,products:[],contactUrl:'/projetos-prontos/#contato-projetos'},configFailure?503:200);
    if(req.headers.authorization!=='Bearer controlled-token')return send(res,{error:'AUTH_REQUIRED'},401);
    if(op==='orders'&&req.method==='GET')return send(res,{orders});
    if(op==='orders'&&req.method==='POST'){
      const data=JSON.parse(body);creations.push(data);if(createFailOnce){createFailOnce=false;return send(res,{error:'CONTROLLED_TRANSIENT_FAILURE'},503);}
      const order={id:fixtureOrderId,productId:fixtureProduct.id,productVersion:fixtureProduct.version,title:fixtureProduct.title,amountCents:fixtureProduct.amountCents,currency:'BRL',status:'pending',createdAt:'2026-11-12T17:00:00Z',termsVersion:fixtureProduct.terms.version,termsHash:fixtureProduct.terms.sha256,terms:fixtureProduct.terms,deliveryAvailable:false,requests:[],payment:{qrCode:'controlled-pix-code',checkoutUrl:'https://malicious.invalid/ignore'}};
      orders=[order];return send(res,order,201);
    }
    if(op==='order')return send(res,orders.find(x=>x.id===url.searchParams.get('id'))||{error:'ORDER_NOT_FOUND'});
    if(op==='download'){
      const order=orders.find(x=>x.id===url.searchParams.get('id'));if(order?.status!=='paid')return send(res,{error:'PAYMENT_NOT_CONFIRMED'},403);
      if(downloadDelay)await new Promise(resolve=>setTimeout(resolve,downloadDelay));res.setHeader('content-type','application/zip');res.setHeader('cache-control','no-store');return res.end('controlled-zip-bytes');
    }
    if(op==='support'){
      const data=JSON.parse(body);supportCalls.push(data);if(invalidReceipt)return send(res,{ok:true},201);
      const receipt={receiptId:`controlled-receipt-${data.requestId}`,kind:data.kind,status:resolvedReceipt?'resolved':'received',createdAt:'2026-11-12T17:05:00Z',...(resolvedReceipt?{resolvedAt:'2026-11-12T17:06:00Z'}:{})};orders[0].requests.push(receipt);return send(res,{ok:true,...receipt},resolvedReceipt?200:201);
    }
    return send(res,{error:'UNKNOWN'},400);
  }
  const pathname=url.pathname.endsWith('/')?`${url.pathname}index.html`:url.pathname;
  const path=resolve(publicRoot,`.${pathname}`);if(!path.startsWith(publicRoot+sep)){res.statusCode=403;return res.end();}
  try {const contents=await readFile(path);res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(contents);}catch{res.statusCode=404;res.end();}
});
let browser;
const text = page=>page.$eval('#project-orders-app',node=>node.textContent);
const clickText = async(page,label)=>{
  const target=await page.evaluateHandle(label=>[...document.querySelectorAll('button')].find(node=>node.textContent===label),label);assert(await target.asElement(),`Button ${label}`);await target.asElement().click();await target.dispose();
};
const waitText=(page,label)=>page.waitForFunction(label=>document.querySelector('#project-orders-app')?.textContent.includes(label),{},label);
const waitNotice=(page,label)=>page.waitForFunction(label=>document.querySelector('#project-orders-notice')?.textContent.includes(label),{},label);
const login = async(page)=>{await page.type('#project-email','buyer@controlled.example.test');await page.type('#project-password','Controlled-Fixture-Only-94!');await clickText(page,'Entrar');await waitText(page,'Nenhum pedido registrado');};
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  browser=await puppeteer.launch({executablePath:resolveChromePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.setViewport({width:1280,height:900});
  await page.goto(`${base}/projetos-prontos/pedidos/?enabled=true&status=approved&product=controlled-fixture`,{waitUntil:'networkidle0'});
  assert.match(await text(page),/Compras online ainda não disponíveis/);
  assert.equal(await page.$('#project-email'),null);
  assert.equal(calls.filter(x=>x.path.includes('firebase-auth')).length,0,'off never downloads authentication SDK');
  assert.equal(calls.filter(x=>x.op&&x.op!=='config').length,0,'off never queries account or checkout');
  assert.equal(await page.$eval('meta[name="robots"]',node=>node.content),'noindex,nofollow,noarchive');
  assert.equal(await page.$eval('meta[name="referrer"]',node=>node.content),'no-referrer');
  await mkdir(reportDir,{recursive:true});await page.screenshot({path:resolve(reportDir,'orders-off-desktop.png'),fullPage:true});
  await page.setViewport({width:390,height:844});await page.screenshot({path:resolve(reportDir,'orders-off-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow on mobile');
  await page.addScriptTag({path:resolve(root,'node_modules/axe-core/axe.min.js')});
  const accessibility=await page.evaluate(async()=>{const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.map(({id,impact,description,nodes})=>({id,impact,description,targets:nodes.map(node=>node.target)}));});
  assert.deepEqual(accessibility,[],'default area accessible');
  configFailure=true;await page.reload({waitUntil:'networkidle0'});await waitText(page,'temporariamente indisponível');assert.equal(await page.$('#project-email'),null);
  configFailure=false;enabled=true;await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#project-email');
  await page.type('#project-email','register@controlled.example.test');await page.type('#project-password','Controlled-Fixture-Only-94!');const beforeVerification=calls.length;await clickText(page,'Criar conta');await waitText(page,'Confirme seu e-mail');
  assert.equal(calls.slice(beforeVerification).some(x=>x.op==='orders'),false,'unverified account cannot access orders');
  await page.evaluate(()=>window.__projectAuthFixture.verify());await clickText(page,'Já confirmei meu e-mail');await waitText(page,'Nenhum pedido registrado');
  assert.match(await text(page),/R\$\s*1\.190,00/);
  assert.match(await page.$eval('.po-supplier',node=>node.textContent),/Fornecedor de ensaio sem oferta comercial/);
  assert.match(await page.$eval('.po-supplier',node=>node.textContent),/11\.222\.333\/0001-81/);
  assert.match(await page.$eval('.po-supplier',node=>node.textContent),/Rua de ensaio/);
  assert(await page.evaluate(()=>Boolean(document.querySelector('.po-supplier').compareDocumentPosition(document.querySelector('#project-accept-controlled-fixture'))&Node.DOCUMENT_POSITION_FOLLOWING)),'supplier identity and address precede acceptance');
  await clickText(page,'Continuar para o pagamento');assert.equal(creations.length,0,'terms required before creation');
  await page.click('#project-accept-controlled-fixture');createFailOnce=true;await clickText(page,'Continuar para o pagamento');await waitNotice(page,'Não recebemos a confirmação');
  await clickText(page,'Continuar para o pagamento');await waitText(page,'Aguardando pagamento');
  assert.equal(creations.length,2);assert.equal(creations[0].requestId,creations[1].requestId,'indeterminate attempt is retried idempotently');
  assert.deepEqual(Object.keys(creations[1]).sort(),['acceptedTerms','productId','productVersion','requestId','termsHash','termsVersion'].sort());
  assert.equal(creations[1].termsHash,fixtureProduct.terms.sha256);assert.equal(creations[1].acceptedTerms,true);
  assert.equal(await page.$('a[href*="malicious.invalid"]'),null,'checkout URL restricted to payment provider');
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(node=>node.textContent==='Baixar arquivos do projeto')),false,'pending has no download');
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('a')].some(node=>(node.getAttribute('href')||'').includes('op=download'))),false,'delivery never uses public permanent URL');
  await page.waitForFunction(title=>document.activeElement?.textContent===title,{},fixtureProduct.title);
  orders[0]={...orders[0],status:'paid',paidAt:'2026-11-12T17:03:00Z',deliveryAvailable:true,deliveryVersion:'fixture-r1'};
  await clickText(page,'Atualizar situação');await waitText(page,'Pagamento confirmado');
  const client=await page.createCDPSession();await client.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:reportDir});
  await clickText(page,'Baixar arquivos do projeto');await waitNotice(page,'Arquivo preparado para download');
  assert(calls.some(x=>x.op==='download'&&x.authorization==='Bearer controlled-token'));
  await page.evaluate(()=>{const summary=[...document.querySelectorAll('summary')].find(node=>node.textContent==='Atendimento e cancelamento');summary.parentElement.open=true;});
  await page.select(`#support-kind-${fixtureOrderId}`,'cancellation');invalidReceipt=true;await clickText(page,'Enviar solicitação');await waitNotice(page,'Não foi possível concluir');
  assert.equal((await page.$eval('#project-orders-notice',node=>node.textContent)).includes('recebida'),false,'no receipt means no success claim');
  invalidReceipt=false;await clickText(page,'Enviar solicitação');await waitNotice(page,'Solicitação de cancelamento recebida');
  assert.equal(supportCalls[0].requestId,supportCalls[1].requestId,'support retries retain identity');assert.equal(supportCalls[1].message,'','cancellation needs no justification');
  assert.match(await page.$eval('#project-orders-notice',node=>node.textContent),/reembolso ainda não está confirmado/);
  await waitText(page,'Pagamento confirmado');assert.equal(orders[0].status,'paid','support does not pretend refund');
  await page.evaluate(()=>{const summary=[...document.querySelectorAll('summary')].find(node=>node.textContent==='Atendimento e cancelamento');summary.parentElement.open=true;});
  await page.select(`#support-kind-${fixtureOrderId}`,'cancellation');invalidReceipt=true;await clickText(page,'Enviar solicitação');await waitNotice(page,'Não foi possível concluir');
  invalidReceipt=false;resolvedReceipt=true;await clickText(page,'Enviar solicitação');await waitNotice(page,'já foi registrada e tratada');
  assert.equal(supportCalls.at(-2).requestId,supportCalls.at(-1).requestId,'a resolved replay retains the same request');assert.equal(orders[0].status,'paid','resolved support is not financial reversal');resolvedReceipt=false;
  for (const status of ['failed','cancelled','refunded','review','creating']) {orders[0].status=status;orders[0].deliveryAvailable=false;await clickText(page,'Atualizar pedidos');await page.waitForSelector(`[data-status="${status}"]`);}
  orders[0].status='paid';orders[0].deliveryAvailable=true;await clickText(page,'Atualizar pedidos');await page.waitForSelector('[data-status="paid"]');
  await page.screenshot({path:resolve(reportDir,'orders-enabled-fixture-mobile.png'),fullPage:true});
  await page.addScriptTag({path:resolve(root,'node_modules/axe-core/axe.min.js')});const enabledAccessibility=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(({id,impact})=>({id,impact})));assert.deepEqual(enabledAccessibility,[],'enabled fixture area accessible');
  downloadDelay=1000;await clickText(page,'Baixar arquivos do projeto');await page.evaluate(()=>window.__projectAuthFixture.signOut());await waitText(page,'Entre para acessar');await new Promise(resolve=>setTimeout(resolve,1100));assert.equal((await page.$eval('#project-orders-notice',node=>node.textContent)).includes('Arquivo preparado'),false,'logout invalidates pending download');
  purchasesEnabled=false;orders=[];await page.reload({waitUntil:'networkidle0'});await login(page);await waitText(page,'Novas compras pausadas');assert.equal(await page.$('[data-product-id]'),null,'pause preserves account and orders without purchase controls');
  purchasesEnabled=true;delete fixtureProduct.terms.supplier;await page.reload({waitUntil:'networkidle0'});await login(page);await waitText(page,'Não há um projeto disponível');assert.equal(await page.$('[data-product-id]'),null,'missing supplier closes the purchase UI');fixtureProduct.terms.supplier=fixtureSupplier;
  assert.deepEqual(errors,[],'no uncaught browser errors');
  const report={schema:'confenge.project-orders.browser/v1',source:publicRoot===root?'source':'public-artifact',environment:'controlled-local-fixtures',realPayments:false,realEmails:false,checks:['off-no-sdk','query-cannot-enable-or-pay','config-failure-closed','verified-email-required','server-product-price-terms','supplier-before-acceptance','supplier-required','explicit-terms-consent','request-idempotency','pending-not-downloadable','authenticated-delivery','safe-checkout-origin','support-real-receipt-only','cancellation-without-reason','support-idempotency','resolved-support-replay','distinct-order-states','logout-invalidates-delivery','purchase-pause-preserves-orders','mobile-no-overflow','wcag-axe'],accessibility,enabledAccessibility,uncaughtErrors:errors};
  await writeFile(resolve(reportDir,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
