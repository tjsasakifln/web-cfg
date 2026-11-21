// Renderiza o pacote real e valida IFC em Chrome sem simular o motor 3D/STEP.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {serveCad} from '../cad/server.mjs';

const candidate=process.argv[2]||'_site';
const server=await serveCad(candidate);
const errors=[],responses=[],violations=[];
const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',
 headless:true,
 args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
 defaultViewport:{width:1440,height:970}
});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('response',r=>{if(new URL(r.url()).origin===new URL(server.base).origin && r.status()>=400 && !r.url().includes('tool-credits'))responses.push(r.url()+':'+r.status());});
 await page.exposeFunction('recordIfcViolation',v=>violations.push(v));
 await page.evaluateOnNewDocument(()=>window.addEventListener('securitypolicyviolation',e=>
   window.recordIfcViolation({directive:e.effectiveDirective,blocked:e.blockedURI,source:e.sourceFile,line:e.lineNumber,column:e.columnNumber,sample:e.sample})));
 const url=new URL('/ferramentas/editor-ifc/',server.base).href;
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 assert.equal(response.status(),200);
 await page.waitForFunction(()=>{const logo=document.querySelector('.brand img');return logo?.complete && logo.naturalWidth>0;},{timeout:10000});
 assert.equal(await page.$eval('h1',node=>node.textContent.includes('IFC')),true);
 await page.click('#ifce-sample');
 await page.waitForFunction(()=>document.querySelectorAll('#ifce-tree .ifce-entity').length>=3,{timeout:60000});
 await page.waitForFunction(()=>document.querySelector('#ifce-busy').hidden,{timeout:60000});
 const preview=await page.evaluate(()=>({
  canvas:!!document.querySelector('#ifce-viewport canvas'),
  elements:document.querySelectorAll('#ifce-tree .ifce-entity').length,
  visible:document.querySelector('#ifce-empty').hidden,
  status:document.querySelector('#ifce-status').textContent
 }));
 assert(preview.canvas,JSON.stringify(preview));
 assert(preview.visible,'Modelo de exemplo nao apareceu em 3D: '+JSON.stringify(preview));
 assert(preview.elements>=3);
 const wall=await page.$('#ifce-tree [data-id="27"]');
 assert(wall,'Parede de exemplo ausente da arvore');
 await wall.click();
 assert.match(await page.$eval('#ifce-selection',node=>node.textContent),/Parede norte/);
 const fields=await page.$$('#ifce-fields input');
 assert(fields.length>=2,'Editor nao montou os campos basicos');
 await fields[0].click({clickCount:3});await fields[0].type('Parede revisada');
 await fields[0].press('Tab');
 assert.match(await page.$eval('#ifce-selection',node=>node.textContent),/Parede revisada/);
 assert.equal(await page.$eval('#ifce-save',node=>node.disabled),false);
 await page.click('#ifce-undo');
 assert.match(await page.$eval('#ifce-selection',node=>node.textContent),/Parede norte/);
 await page.click('#ifce-redo');
 assert.match(await page.$eval('#ifce-selection',node=>node.textContent),/Parede revisada/);
 const roundtrip=await page.evaluate(async()=>{
  const response=await fetch('/bim/examples/inventario-piloto.ifc');
  const source=await response.text();
  const {IfcDocument}=await import('/ferramentas/editor-ifc/ifc-document.mjs');
  const before=new IfcDocument(source);
  before.setName(27,'Parede revisada');
  before.setProperty(27,100,'Fabricante do teste');
  const edited=before.exportText();
  const {IfcAPI}=await import('/bim/web/vendor/web-ifc/web-ifc-api.js');
  const api=new IfcAPI();let model=-1;
  try {
   await api.Init(name=>new URL('/bim/web/vendor/web-ifc/'+name,location.origin).href,true);
   model=api.OpenModel(new TextEncoder().encode(edited),{COORDINATE_TO_ORIGIN:true,MEMORY_LIMIT:512*1024*1024});
   if(model<0)throw Error('Motor IFC nao reabriu a copia editada');
   const reread=new IfcDocument(edited);
   return {elements:reread.elements().length,name:reread.elements().find(e=>e.id===27)?.name,manufacturer:reread.properties(27).find(p=>p.id===100)?.value,valid:true};
  } finally {if(model>=0)api.CloseModel(model);api.Dispose();}
 });
 assert(roundtrip.valid,JSON.stringify(roundtrip));
 assert.equal(roundtrip.name,'Parede revisada');
 assert.equal(roundtrip.manufacturer,'Fabricante do teste');
 assert.deepEqual(responses,[]);
 if(violations.length){
  const inline=await page.evaluate(()=>[...document.querySelectorAll('script:not([src])')].map(x=>({type:x.type||'classic',body:x.textContent||''})));
  const policy=response.headers()['content-security-policy']||'';
  const tokens=(policy.match(/'sha256-[A-Za-z0-9+/=]+'/g)||[]);
  const diagnostic=inline.map(x=>({
   type:x.type,
   sha256:"'sha256-"+createHash('sha256').update(x.body).digest('base64')+"'",
   allowed:tokens.includes("'sha256-"+createHash('sha256').update(x.body).digest('base64')+"'")
  }));
  assert.fail('Editor IFC CSP violations: '+JSON.stringify({violations,inline:diagnostic,directives:policy.split(';').filter(x=>x.includes('script-src'))}));
 }
 assert.deepEqual(violations,[]);
 assert.deepEqual(errors,[]);
 const mobile=await browser.newPage();
 for(const width of [360,390]){
  await mobile.setViewport({width,height:844,isMobile:true,hasTouch:true});
  await mobile.goto(url,{waitUntil:'domcontentloaded'});
  const geometry=await mobile.evaluate(async()=>{
   const label=document.querySelector('#ifce-model');
   label.textContent='Arquivo_de_referencia_de_engenharia_com_nome_extenso_IFC.ifc';
   await document.fonts.ready;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const range=document.createRange();
   range.selectNodeContents(label);
   const labelRect=label.getBoundingClientRect();
   const textRects=Array.from(range.getClientRects());
   return {
    scroll:document.documentElement.scrollWidth,
    view:innerWidth,
    labelWidth:label.clientWidth,
    labelScrollWidth:label.scrollWidth,
    textFullyVisible:textRects.every(rect=>rect.left>=labelRect.left-1&&rect.right<=labelRect.right+1),
    overflowX:getComputedStyle(label).overflowX
   };
  });
  assert(geometry.scroll<=geometry.view+2,'Estouro horizontal no mobile: '+JSON.stringify({width,...geometry}));
  assert(geometry.labelScrollWidth<=geometry.labelWidth+1&&geometry.textFullyVisible,
   'Nome IFC cortado no mobile: '+JSON.stringify({width,...geometry}));
 }
 console.log('PASS editor IFC: rota, identidade, carregamento WASM, 3D, edicao, desfazer, refazer, reabertura e mobile sem corte');
} finally {await browser.close();await new Promise(ok=>server.server.close(ok));}
