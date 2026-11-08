// Exercise save, reopen and recomputation on a public browser, with synthetic data only.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const base=process.argv[2] || 'https://confenge.com.br';
const url=new URL('/avaliacao-imoveis-urbanos/inferencia/',base);
const directory=await mkdtemp(join(tmpdir(),'modela-projeto-'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const pg=await browser.newPage();
  pg.setDefaultTimeout(90000);
  const posts=[];
  pg.on('request',r=>{if(r.method()==='POST' && r.postData()?.includes('br.com.confenge.modelapro'))posts.push(r.url());});
  await pg.goto(url.href);
  const client=await pg.createCDPSession();
  await client.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
  await pg.click('#example');await pg.waitForSelector('#model-form:not([hidden])');
  await pg.evaluate(()=>{
    document.querySelector('#project-save').closest('details').open=true;
    const area=document.querySelector('#subject input[name="area_m2"]');area.value='83.5';area.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await pg.select('#unit','BRL/m²');
  await pg.select('#target-scale','log');
  await pg.select('#subject select[name="area_m2"]','log');
  await pg.click('#project-save');
  const file=join(directory,'modela-pro-projeto.json');
  let saved;
  for(let attempt=0;attempt<100&&!saved;attempt++){
    try { saved=JSON.parse(await readFile(file,'utf8')); } catch { await delay(100); }
  }
  assert(saved,'O download precisa concluir e ser JSON válido.');
  assert.equal(saved.rows.length,24);assert.deepEqual(saved.settings.features,['area_m2','vagas']);
  assert.equal(saved.settings.subject[0],83.5);assert.equal(saved.settings.unit,'BRL/m²');
  assert(!Object.hasOwn(saved,'resultado'));
  assert.deepEqual(saved.settings.logFeatures,['area_m2']);assert.equal(saved.settings.targetScale,'log');
  const reopen=async doc=>{
    await pg.evaluate(data=>{
      const input=document.querySelector('#project-file');
      assertPicker(input);
      function assertPicker(node){ if(!node.hasAttribute('data-leitura-local')||node.name||node.form)throw Error('Leitor de arquivo local inválido.'); }
      const reader=new DataTransfer();
      reader.items.add(new File([JSON.stringify(data)],'projeto.json',{type:'application/json'}));
      input.files=reader.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    },doc);
  };
  await pg.reload();
  await reopen({...saved,resultado:{point:9e15}});
  await pg.waitForFunction(()=>document.querySelector('#project-status').textContent.includes('Projeto reaberto'));
  assert.equal(await pg.$eval('#resultado',x=>x.hidden),true);
  assert.equal(await pg.$eval('#subject input[name="area_m2"]',i=>i.value),'83.5');
  assert.equal(await pg.$eval('#unit',i=>i.value),'BRL/m²');
  assert.equal(await pg.$eval('#target-scale',i=>i.value),'log');
  assert.equal(await pg.$eval('#subject select[name="area_m2"]',i=>i.value),'log');
  await pg.click('#run');
  await pg.waitForSelector('#resultado:not([hidden])');
  assert.match(await pg.$eval('.mp-equation',n=>n.textContent),/ln\(area_m2\)/);
  assert.match(await pg.$eval('.mp-equation',n=>n.textContent),/^ln\(/);
  assert.match(await pg.$eval('#results',n=>n.textContent),/mediana condicional/);
  assert(!await pg.$eval('#results',node=>node.textContent.includes('9.000.000.000.000.000')));
  await reopen({...saved,columns:['constructor',...saved.columns.slice(1)]});
  await pg.waitForFunction(()=>document.querySelector('#project-status').textContent.includes('inválido'));
  assert.equal(await pg.$eval('#resultado',x=>x.hidden),false,'Um arquivo inválido deve preservar o projeto aberto.');
  await reopen(saved);
  await pg.waitForFunction(()=>document.querySelector('#project-status').textContent.includes('Projeto reaberto'));
  assert.equal(await pg.$eval('#resultado',x=>x.hidden),true,'Reabrir exige novo cálculo.');
  const logarithm=await pg.evaluate(async()=>{
    const {calculate}=await import('./engine/client.mjs');
    // Balanced residuals cancel at every ln(area). The exact geometric centre is known.
    const rows=Array.from({length:30},(_,i)=>{
      const z=2+Math.floor(i/6);
      return {area:Math.exp(z),preco:Math.exp(8+1.3*z+(i%2?0.04:-0.04))};
    });
    const model={rows,features:['area'],target:'preco',subject:{area:Math.exp(4.2)},targetScale:'log',logFeatures:['area'],unit:'BRL'};
    const good=await calculate(model);
    const errors=[];
    for(const col of ['area','preco']){
      const bad=rows.map((row,i)=>i?row:{...row,[col]:0});
      try{await calculate({...model,rows:bad});}catch(e){errors.push(e.message);}
    }
    try{await calculate({...model,subject:{area:0}});}catch(e){errors.push(e.message);}
    const xOnly=await calculate({...model,targetScale:'identity'});
    return {point:good.point,ci:good.meanCI,pi:good.predictionInterval,precision:good.precision,
      validated:good.originalIntervalsValidated,estimand:good.estimand,errors,xOnlyCi:xOnly.meanCI};
  });
  assert(Math.abs(logarithm.point-Math.exp(8+1.3*4.2))<1e-6,JSON.stringify(logarithm));
  assert.equal(logarithm.validated,false);assert.equal(logarithm.ci,null);
  assert.equal(logarithm.pi,null);assert.equal(logarithm.precision,null);assert.equal(logarithm.errors.length,3);
  for(const error of logarithm.errors)assert.match(error,/positiv/);
  assert(logarithm.xOnlyCi.every(Number.isFinite));
  assert.equal(posts.length,0);
  console.log('Escalas logarítmicas conferidas:',JSON.stringify(logarithm));
  console.log('Projeto local conferido: download, 24 imóveis, atributos, unidade, JSON inválido, invalidação e recálculo no Chrome.');
} finally {
  await browser.close();
  await rm(directory,{recursive:true,force:true});
}
