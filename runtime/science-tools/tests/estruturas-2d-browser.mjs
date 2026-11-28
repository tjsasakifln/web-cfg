import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveChromePath } from '../../../scripts/site/resolve_chrome.mjs';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const route='/ferramentas/trelicas-e-porticos/';
const require=createRequire(import.meta.url);
const {localArtifact}=require('../../tools-commerce/exports.cjs');
const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    let file=resolve(root,'.'+decodeURIComponent(path));
    if(!file.startsWith(root+sep))return res.writeHead(403).end();
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'}).end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const errors=[],debits=[];
let quoteBarrier=null, quoteStarted=null, browser, scienceRequests=0;
const fakeAuth=`const user={uid:'fixture',email:'fixture@example.test',emailVerified:true,providerData:[{providerId:'password'}],reload:async()=>{},getIdToken:async()=> 'fixture'};
  const auth={currentUser:user,authStateReady:async()=>{}};
  export const getApps=()=>[], initializeApp=x=>x, getAuth=()=>auth, initializeAuth=()=>auth;
  export const browserLocalPersistence={}, browserPopupRedirectResolver={}, connectAuthEmulator=()=>{};
  export const onAuthStateChanged=(_a,fn)=>{fn(user);return()=>{}};`;
async function open(options={}) {
  const p=await browser.newPage(options);
  p.on('pageerror',e=>errors.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.route('**/*',async r=>{
    const u=new URL(r.request().url());
    if(u.origin!==base)return r.abort();
    if(u.pathname==='/api/web/science-tools'){scienceRequests++;return r.abort();}
    if(u.pathname==='/assets/tools-commerce/firebase-auth.mjs')return r.fulfill({contentType:'text/javascript',body:fakeAuth});
    if(u.pathname!=='/api/web/tool-credits')return r.continue();
    const answer=json=>r.fulfill({json}), op=u.searchParams.get('op');
    if(op==='config')return answer({enabled:true,sharedExportsEnabled:true,purchasesEnabled:false,exportAuthorization:true,tools:['trelicas-e-porticos'],firebase:{apiKey:'fixture'},authProviders:[]});
    if(op==='account')return answer({paid:2,promo:0,freeAvailable:2,referralCode:'fixture_______01',invites:{},recentOrders:[]});
    const body=r.request().postDataJSON();
    if(op==='export-quote'){
      quoteStarted?.(); if(quoteBarrier)await quoteBarrier;
      return answer({bucket:'free',credits:1,token:'fixture-token',recovery:false,expiresAt:Date.now()+300000});
    }
    if(op==='export-local'){
      debits.push(body);
      return answer(localArtifact(body.toolId,body.payload,'testing').receipt({exportId:'a'.repeat(64),at:0}));
    }
    return r.fulfill({status:404,json:{error:'FIXTURE_UNKNOWN'}});
  });
  await p.goto(base+route,{waitUntil:'domcontentloaded'});
  await p.locator('[data-s2d-canvas]').waitFor();
  return p;
}
const count=p=>p.locator('[data-s2d-count]').textContent();
const coords=(p,x,y)=>p.locator('[data-s2d-canvas]').evaluate((svg,[x0,y0])=>{
  const pt=new DOMPoint(x0,-y0).matrixTransform(svg.getScreenCTM()); return [pt.x,pt.y];
},[x,y]);
const solve=p=>p.locator('[data-do=solve]').click();
try{
  browser=await chromium.launch({executablePath:resolveChromePath(),headless:true,args:['--no-sandbox']});
  const p=await open({viewport:{width:1366,height:900}});
  await p.locator('[data-s2d-example]').selectOption('grillage');
  await solve(p);
  await p.locator('[data-s2d-results] select[name=diagram]').selectOption('T');
  assert.match(await p.locator('[data-s2d-results]').textContent(),/30 kN·m/);
  for(const [format,name] of [['svg','Baixar todos os diagramas em SVG'],['csv','Baixar resultados em CSV']]){
    const got=p.waitForEvent('download');
    await p.getByRole('button',{name}).click();
    const dl=await got;
    assert.equal(dl.suggestedFilename(),'estrutura-2d-resultados.'+format);
    const file=await readFile(await dl.path(),'utf8');
    assert.match(file,format==='svg'?/Momento torsor T/:/Giro torsional local/);
    assert.deepEqual(Object.keys(debits.at(-1).payload).sort(),['bytes','format','sha256']);
  }
  let release;
  quoteBarrier=new Promise(r=>{release=r;});
  const waiting=new Promise(r=>{quoteStarted=r;});
  await p.getByRole('button',{name:'Baixar todos os diagramas em SVG'}).click();
  await waiting;
  await p.locator('[data-s2d-selection]').selectOption('N1');
  await p.locator('[data-s2d-inspector] input[name=x]').fill('1');
  assert.equal(await p.locator('[data-s2d-results]').isVisible(),false);
  release();
  await p.getByText('O modelo mudou. Calcule novamente para exportar o resultado atual.').waitFor();
  assert.equal(debits.length,2);
  await p.locator('#formulario-p-delta summary').click();
  assert.equal(await p.locator('[data-science-tool] select').filter({has:p.locator('[value=pdelta]')}).count(),1);
  await p.locator('[data-s2d-example]').selectOption('grillage');
  await p.locator('input[name=combine]').check();
  await p.locator('input[name=C1]').fill('1.5');
  await p.locator('[data-estrutura-2d] > details summary').click();
  const save=p.waitForEvent('download');
  await p.getByRole('button',{name:'Salvar modelo JSON'}).click();
  const model=await readFile(await (await save).path());
  assert.deepEqual(JSON.parse(model).analysis,{case:'C1',combination:true,factors:{C1:1.5}});
  await p.locator('[data-s2d-example]').selectOption('frame');
  await p.locator('[data-s2d-project] input[type=file]').setInputFiles({name:'estrutura.json',mimeType:'application/json',buffer:model});
  await p.locator('input[name=C1]').waitFor();
  assert.equal(await p.locator('input[name=C1]').inputValue(),'1.5');
  assert.equal(debits.length,2,'O JSON de trabalho não consome crédito.');
  await p.close();

  const mobile=await open({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await mobile.locator('[data-estrutura-2d] > details summary').click();
  await mobile.getByRole('button',{name:'Novo pórtico ou treliça'}).click();
  await mobile.locator('button[data-mode=draw]').click();
  await mobile.locator('[data-s2d-canvas]').scrollIntoViewIfNeeded();
  for(const [x,y] of [[0,0],[2,0],[2,0],[3,1]])await mobile.touchscreen.tap(...await coords(mobile,x,y));
  assert.match(await count(mobile),/3 nós · 2 barras/);
  await mobile.locator('[data-do=undo]').click();
  assert.match(await count(mobile),/2 nós · 1 barras/);
  await solve(mobile);
  assert.match(await mobile.locator('[data-s2d-status]').textContent(),/instável/);
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.equal(scienceRequests,0,'O editor não envia o modelo a um serviço de cálculo.');
  assert.deepEqual(errors,[]);
  console.log('Editor 2D: grelha, créditos SVG/CSV, resultado obsoleto, P-Delta preservado, emenda por toque e rejeição de mecanismo.');
}finally{
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
}
