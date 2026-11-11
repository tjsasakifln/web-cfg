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
let slow=false;
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/web/science-tools'){let body='';for await(const c of req)body+=c;const r=await handler({httpMethod:req.method,headers:{...req.headers,'client-ip':'127.0.0.1'},body});if(slow)await new Promise(r=>setTimeout(r,800));res.writeHead(r.statusCode,r.headers).end(r.body);return;}
 if(url.pathname==='/api/web/tool-credits'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({enabled:false}));return;}
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/')){res.writeHead(404).end();return;}
 let file=resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+sep))return res.writeHead(403).end();if((await stat(file)).isDirectory())file=resolve(file,'index.html');res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
try{browser=await puppeteer.launch({executablePath:resolveChromePath(),headless:true,args:['--no-sandbox']});const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',req=>req.url().startsWith(base)||req.url().startsWith('data:')?req.continue():req.abort());const errors=[];page.on('pageerror',e=>errors.push(String(e)));await mkdir(resolve(root,'build/science-screenshots'),{recursive:true});
 for(const slug of slugs){await page.setViewport({width:1280,height:900});await page.goto(base+'/ferramentas/'+slug+'/',{waitUntil:'load'});await page.waitForSelector('[data-science-tool] form');await page.click('button[type=submit]');await page.waitForFunction(()=>!document.querySelector('#resultado').hidden||document.querySelector('.science-status').dataset.error==='true',{timeout:28000});const status=await page.$eval('.science-status',n=>n.textContent);assert.equal(await page.$eval('#resultado',n=>n.hidden),false,slug+': '+status);assert.ok(await page.$$eval('.science-metric',n=>n.length)>0);await page.screenshot({path:resolve(root,'build/science-screenshots/'+slug+'.png'),fullPage:true});await page.setViewport({width:390,height:880});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'mobile overflow '+slug);console.log('browser passed',slug);}
 if(slugs.includes('memorial-de-calculo')){await page.goto(base+'/ferramentas/memorial-de-calculo/',{waitUntil:'load'});slow=true;await page.click('button[type=submit]');await page.$eval('#science-length',n=>{n.value='6';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>!document.querySelector('button[type=submit]').disabled,{timeout:26000});assert.equal(await page.$eval('#resultado',n=>n.hidden),true);assert.match(await page.$eval('.science-status',n=>n.textContent),/alterados durante/);console.log('stale-result guard passed');}
 assert.deepEqual(errors,[]);console.log('No page errors; available real endpoints and narrow layouts passed.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
