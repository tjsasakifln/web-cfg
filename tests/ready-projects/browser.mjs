// Browser contract with the real intake handler and disposable local storage.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from '../../scripts/site/resolve_chrome.mjs';

const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'../..');
const publicRoot=fs.existsSync(path.join(root,'_site/projetos-prontos/index.html'))?path.join(root,'_site'):root;
process.env.NODE_ENV='test';
for(const key of ['TURNSTILE_SECRET_KEY','LEAD_REQUIRE_TURNSTILE','NTFY_URL','RESEND_API_KEY','OPS_WEBHOOK_URL','CONFENGE_INBOUND_WEBHOOK_URL','CONFENGE_INBOUND_WEBHOOK_SECRET'])delete process.env[key];
const lead=require('../../netlify/functions/lead.cjs');
const {MemoryStore}=require('../../netlify/functions/lib/lead-store.cjs');
const store=new MemoryStore();lead.setStoreForTests(store);
const reports=path.join(root,'build/reports/ready-projects');fs.mkdirSync(reports,{recursive:true});
const submissions=[],analytics=[],errors=[];
let rejectOnce=false;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/api/web/lead'){
    let body='';for await(const chunk of req)body+=chunk;
    const input=JSON.parse(body);submissions.push(input);
    if(rejectOnce){rejectOnce=false;res.writeHead(503,{'Content-Type':'application/json'});res.end('{"ok":false}');return;}
    const response=await lead.handler({httpMethod:req.method,headers:{...req.headers,origin:'https://confenge.com.br'},body});
    res.writeHead(response.statusCode,response.headers);res.end(response.body);return;
  }
  if(url.pathname.endsWith('/collect')){
    let body='';for await(const chunk of req)body+=chunk;analytics.push(body);res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return;
  }
  if(url.pathname.includes('/api/web/')||url.pathname.includes('/.netlify/functions/')){
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{"enabled":false}');return;
  }
  let file=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(publicRoot+path.sep)){res.writeHead(404);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await puppeteer.launch({executablePath:resolveChromePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.setRequestInterception(true);
  page.on('request',req=>req.url().startsWith(base)||req.url().startsWith('data:')?req.continue():req.abort());
  await page.evaluateOnNewDocument(()=>localStorage.setItem('confenge_google_analytics_consent','denied'));
  await page.goto(base+'/projetos-prontos/?utm_source=confenge&utm_medium=owned&utm_campaign=projetos_prontos_piloto',{waitUntil:'networkidle0'});
  await page.waitForSelector('[data-form-ready="true"]');
  assert.equal(await page.$$eval('h1',nodes=>nodes.length),1);
  assert.match(await page.$eval('main',node=>node.textContent),/no seu prazo e no seu orçamento/);
  const graph = await page.$$eval('script[type="application/ld+json"]',nodes=>nodes.flatMap(n=>JSON.parse(n.textContent)['@graph']||[]));
  const service = graph.find(node=>node['@type']==='Service');
  assert.equal(service.hasOfferCatalog.itemListElement.length,4);
  assert.deepEqual(service.hasOfferCatalog.itemListElement.map(o=>o.priceSpecification.minPrice),[1490,1290,690,690]);
  assert.doesNotMatch(JSON.stringify(graph),/InStock|aggregateRating|"@type":"Product"/);
  for(const[label,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewport({width,height});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,label);
    await page.screenshot({path:path.join(reports,label+'.png'),fullPage:true});
  }
  await page.setViewport({width:1365,height:1000});
  await page.click('#formulario-contato button[type="submit"]');assert.equal(submissions.length,0,'empty form must not reach server');
  await page.click('[data-project-interest="adaptation"]');
  assert.equal(await page.$eval('#project_kind',node=>node.value),'adaptation');
  await page.type('#nome','Pessoa de validação');await page.type('#email','residential-browser@example.com');
  await page.type('#city','Florianópolis');await page.select('#uf','SC');await page.click('#consentimento');
  rejectOnce=true;await page.click('#formulario-contato button[type="submit"]');
  await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('confirmação'));
  assert.equal((await store.list()).length,0);
  const failedKey=submissions[0].idempotency_key;
  await page.click('#formulario-contato button[type="submit"]');
  await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('Sua consulta foi registrada'));
  assert.equal(submissions[1].idempotency_key,failedKey,'same request retries once');
  const records=await store.list();assert.equal(records.length,1);
  assert.equal(records[0].project_interest.kind,'adaptation');assert.equal(records[0].project_interest.city,'Florianópolis');
  assert.equal(records[0].utm_campaign,'projetos_prontos_piloto');assert.equal(records[0].project_interest.lot_width_m,null);
  assert.equal(await page.$eval('#formulario-contato button[type="submit"]',el=>el.disabled),true);
  assert.match(await page.$eval('#form-status',el=>el.textContent),/Protocolo: lead-/);
  assert.equal(new URL(page.url()).pathname,'/projetos-prontos/');
  await page.screenshot({path:path.join(reports,'confirmed.png'),fullPage:true});
  assert.doesNotMatch(analytics.join('\n'),/residential-browser@|Pessoa de validação|Florianópolis|lot_width_m/);
  await page.goto(base+'/projetos-prontos/condicoes/',{waitUntil:'networkidle0'});
  assert.equal(await page.$$eval('h1',nodes=>nodes.length),1);
  assert.match(await page.$eval('main',node=>node.textContent),/não implica renúncia automática/);
  await page.screenshot({path:path.join(reports,'conditions.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const report={ok:true,source:publicRoot===root?'source':'public-artifact',checks:['truthful_offer','desktop_mobile_no_overflow','native_validation','interest_selection','server_failure_no_receipt','retry_same_key','actual_handler_persistence','utm_preserved','confirmed_receipt','no_pii_analytics','consumer_conditions','no_script_errors']};
  fs.writeFileSync(path.join(reports,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
