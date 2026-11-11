import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import puppeteer from 'puppeteer-core';
import {resolveChromePath} from '../../../scripts/site/resolve_chrome.mjs';
const root=resolve(new URL('../../../',import.meta.url).pathname);
const require=createRequire(import.meta.url);const {handler}=require('../../../netlify/functions/science-tools.cjs');
const candidates=['memorial-de-calculo','propriedades-de-secoes','secao-de-concreto-armado','trelicas-e-porticos','geotecnia-cpt-estacas','conforto-termico','energia-solar-fotovoltaica'];
const slugs=[];for(const slug of candidates){try{await stat(resolve(root,'ferramentas',slug,'index.html'));slugs.push(slug);}catch{}}
const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
let slow=false,scienceRequests=0;
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/web/science-tools'){scienceRequests++;let body='';for await(const c of req)body+=c;const r=await handler({httpMethod:req.method,headers:{...req.headers,'client-ip':'127.0.0.1'},body});if(slow)await new Promise(r=>setTimeout(r,800));res.writeHead(r.statusCode,r.headers).end(r.body);return;}
 if(url.pathname==='/api/web/tool-credits'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({enabled:false}));return;}
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/')){res.writeHead(404).end();return;}
 let file=resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+sep))return res.writeHead(403).end();if((await stat(file)).isDirectory())file=resolve(file,'index.html');res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
async function csvImportLifecycle(page) {
 const beforeRequests=scienceRequests;
 const state=await page.evaluate(async()=>{
  const upload=document.querySelector('input[type=file]'),input=document.querySelector('#science-weather'),output=document.querySelector('#resultado');
  const original=File.prototype.text,pending=new Map(),initial=input.value;
  const old='2026-01-15T12:00:00-03:00;600;500;100;25;2';
  const latest='2026-01-15T12:00:00-03:00;700;600;100;26;2';
  const manual='2026-01-15T12:00:00-03:00;800;650;150;27;2';
  File.prototype.text=function(){
   if(!this.name.startsWith('science-race-'))return original.call(this);
   return new Promise((resolve,reject)=>{pending.set(this.name,()=>original.call(this).then(resolve,reject));});
  };
  const select=(name,text)=>{const transfer=new DataTransfer();transfer.items.add(new File([text],name,{type:'text/csv'}));upload.files=transfer.files;upload.dispatchEvent(new Event('change',{bubbles:true}));};
  const release=async name=>{await pending.get(name)();await new Promise(done=>setTimeout(done,0));};
  try {
   const visibleBeforeSelection=!output.hidden;
   select('science-race-earlier.csv',old);const hiddenOnSelection=output.hidden;
   select('science-race-latest.csv',latest);
   await release('science-race-earlier.csv');const whileLatestPending=input.value;
   document.querySelector('button[type=submit]').click();
   await release('science-race-latest.csv');const afterLatest=input.value;
   // Also resolve the newest read first, then let the older read arrive late.
   select('science-race-late.csv',old);select('science-race-current.csv',latest);
   await release('science-race-current.csv');await release('science-race-late.csv');const afterLateRead=input.value;
   select('science-race-manual.csv',old);input.value=manual;input.dispatchEvent(new Event('input',{bubbles:true}));
   await release('science-race-manual.csv');
   return {visibleBeforeSelection,hiddenOnSelection,initial,whileLatestPending,latest,afterLatest,afterLateRead,manual,afterManual:input.value,hiddenAfterReads:output.hidden};
  } finally {File.prototype.text=original;}
 });
 assert.equal(state.visibleBeforeSelection,true,'a real previous solar result must exist');
 assert.equal(state.hiddenOnSelection,true,'selection must hide the result before file.text completes');
 assert.equal(state.whileLatestPending,state.initial,'an earlier read cannot become the selected input');
 assert.equal(state.afterLatest,state.latest,'the latest selection must populate the textarea');
 assert.equal(state.afterLateRead,state.latest,'a late earlier read must not replace the latest file');
 assert.equal(state.afterManual,state.manual,'a delayed file must not replace a later manual edit');
 assert.equal(state.hiddenAfterReads,true,'imports and manual edits require a new calculation');
 assert.equal(scienceRequests,beforeRequests,'calculation must wait for the selected file to finish reading');
 console.log('CSV import lifecycle passed: immediate invalidation, both read orders and manual edit');
}
try{browser=await puppeteer.launch({executablePath:resolveChromePath(),headless:true,args:['--no-sandbox']});const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',req=>req.url().startsWith(base)||req.url().startsWith('data:')?req.continue():req.abort());const errors=[];page.on('pageerror',e=>errors.push(String(e)));await mkdir(resolve(root,'build/science-screenshots'),{recursive:true});
 for(const slug of slugs){await page.setViewport({width:1280,height:900});await page.goto(base+'/ferramentas/'+slug+'/',{waitUntil:'load'});await page.waitForSelector('[data-science-tool] form');await page.click('button[type=submit]');await page.waitForFunction(()=>!document.querySelector('#resultado').hidden||document.querySelector('.science-status').dataset.error==='true',{timeout:28000});const status=await page.$eval('.science-status',n=>n.textContent);assert.equal(await page.$eval('#resultado',n=>n.hidden),false,slug+': '+status);assert.ok(await page.$$eval('.science-metric',n=>n.length)>0);await page.screenshot({path:resolve(root,'build/science-screenshots/'+slug+'.png'),fullPage:true});await page.setViewport({width:390,height:880});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'mobile overflow '+slug);console.log('browser passed',slug);}
 if(slugs.includes('energia-solar-fotovoltaica'))await csvImportLifecycle(page);
 if(slugs.includes('memorial-de-calculo')){await page.goto(base+'/ferramentas/memorial-de-calculo/',{waitUntil:'load'});slow=true;await page.click('button[type=submit]');await page.$eval('#science-length',n=>{n.value='6';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>!document.querySelector('button[type=submit]').disabled,{timeout:26000});assert.equal(await page.$eval('#resultado',n=>n.hidden),true);assert.match(await page.$eval('.science-status',n=>n.textContent),/alterados durante/);console.log('stale-result guard passed');}
 assert.deepEqual(errors,[]);console.log('No page errors; available real endpoints and narrow layouts passed.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
