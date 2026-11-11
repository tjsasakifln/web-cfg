import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import puppeteer from 'puppeteer-core';
import {resolveChromePath} from '../scripts/site/resolve_chrome.mjs';

const publicRoot=resolve(process.argv[2]||'_site');
const screenshots=process.env.REPORT_TOOLS_SCREENSHOTS;
const routes=['quantitativos-dxf','epanet-inp','comparador-cronogramas','radier-solo-elastico'];
for(const slug of routes)await stat(resolve(publicRoot,'ferramentas',slug,'index.html'));
const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.inp':'text/plain','.dxf':'text/plain'};
let failDxfExample=true;
const server=createServer(async(request,response)=>{
  const path=new URL(request.url,'http://localhost').pathname;
  if(path==='/api/web/tool-credits')return response.writeHead(200,{'Content-Type':'application/json'}).end('{"enabled":false}');
  if(path==='/ferramentas/quantitativos-dxf/exemplo.dxf'&&failDxfExample){failDxfExample=false;return response.writeHead(503).end('controlled example failure');}
  if(path.startsWith('/api/')||path.startsWith('/.netlify/'))return response.writeHead(404).end();
  try{
    let file=resolve(publicRoot,'.'+decodeURIComponent(path));
    if(file!==publicRoot&&!file.startsWith(publicRoot+sep))return response.writeHead(403).end();
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    response.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(await readFile(file));
  }catch{response.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const numeric=value=>Number(String(value).replaceAll('.','').replace(',','.'));
const near=(actual,expected,tolerance=0.0002)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
let browser;
try{
  browser=await puppeteer.launch({executablePath:resolveChromePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.setRequestInterception(true);
  page.on('request',request=>request.url().startsWith(origin)||request.url().startsWith('data:')?request.continue():request.abort());
  if(screenshots)await mkdir(screenshots,{recursive:true});
  const paint=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const load=async path=>{const response=await page.goto(origin+path,{waitUntil:'load',timeout:30000});assert.equal(response.status(),200,path);};
  const visible=()=>page.$eval('#resultado',node=>!node.hidden);
  const rows=id=>page.$$eval('#'+id+' tbody tr',nodes=>nodes.map(row=>[...row.cells].map(cell=>cell.textContent)));
  const finished=async()=>{
    await page.waitForFunction(()=>!document.querySelector('#resultado').hidden||document.querySelector('#estado').classList.contains('is-error'),{timeout:65000});
    assert.equal(await visible(),true,await page.$eval('#estado',node=>node.textContent));
  };
  const layout=async slug=>{
    for(const width of [390,1280]){
      await page.setViewport({width,height:900});await paint();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${slug}: page overflow at ${width}px`);
      if(screenshots)await page.screenshot({path:resolve(screenshots,slug+'-'+width+'.png'),fullPage:true});
    }
  };
  const fromCatalog=async slug=>{
    await load('/ferramentas/');
    const selector=`a[href="/ferramentas/${slug}/"]`;
    const query={'quantitativos-dxf':'quantitativos de DXF','epanet-inp':'redes EPANET','comparador-cronogramas':'comparador de cronogramas','radier-solo-elastico':'radier sobre solo elástico'}[slug];
    await page.waitForSelector('#ts-query',{visible:true});await page.type('#ts-query',query);
    await page.waitForSelector(selector,{visible:true});
    await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.click(selector)]);
    assert.equal(new URL(page.url()).pathname,`/ferramentas/${slug}/`);
  };

  // Use both navigation modes before the actual calculation journeys.
  for(const width of [390,1280]){
    await page.setViewport({width,height:900});await load('/');
    const nav=width<900?'.mobile-nav':'.desktop-nav';
    if(width<900)await page.click('.menu-toggle');
    const link=nav+' a[href="/ferramentas/"]';await page.waitForSelector(link,{visible:true});
    await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.click(link)]);
    assert.equal(new URL(page.url()).pathname,'/ferramentas/');
  }

  await fromCatalog('quantitativos-dxf');
  await page.click('#exemplo');
  await page.waitForFunction(()=>document.querySelector('#estado').classList.contains('is-error'));
  assert.equal(await visible(),false,'failed example must not expose a result');
  await page.click('#exemplo');await finished();
  let walls=(await rows('camadas')).find(row=>row[0]==='PAREDES');assert.ok(walls);
  near(numeric(walls[2]),26);near(numeric(walls[3]),40);
  const pipes=(await rows('camadas')).find(row=>row[0]==='TUBOS');assert.ok(pipes);near(numeric(pipes[2]),Math.PI);
  await layout('quantitativos-dxf');
  await page.select('#unidade','0.01');assert.equal(await visible(),false,'unit edits invalidate DXF quantities');
  await (await page.$('#arquivo')).uploadFile(resolve(publicRoot,'ferramentas/quantitativos-dxf/exemplo.dxf'));
  await page.click('#analisar');await finished();walls=(await rows('camadas')).find(row=>row[0]==='PAREDES');
  // The source rectangle is 8,000 × 5,000 drawing units. Interpreting each
  // unit as 0.01 m yields 260 m of perimeter and 4,000 m² of enclosed area.
  near(numeric(walls[2]),260);near(numeric(walls[3]),4000);
  console.log('PASS DXF: example retry, real worker, geometry, unit override and invalidation');

  await fromCatalog('epanet-inp');await page.click('#exemplo');await finished();
  assert.equal(await page.$$eval('#instante option',options=>options.length),7);
  const nodeA=(await rows('nos')).find(row=>row[0]==='A');assert.ok(nodeA);near(numeric(nodeA[3]),5);
  assert.ok(numeric(nodeA[1])>0,'pressure must remain physically finite and positive for this fixture');
  await page.select('#instante','6');assert.ok((await rows('nos')).some(row=>row[0]==='A'));
  await layout('epanet-inp');
  await page.$eval('#vazao',input=>{input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await visible(),false,'demand edits invalidate EPANET results');
  await (await page.$('#arquivo')).uploadFile(resolve(publicRoot,'ferramentas/epanet-inp/exemplo.inp'));
  await page.click('#executar');await finished();near(numeric((await rows('nos')).find(row=>row[0]==='A')[3]),3.5);
  console.log('PASS EPANET: actual WASM worker, seven time steps, physical demand and invalidation');

  await fromCatalog('comparador-cronogramas');
  await page.click('#comparar');assert.equal(await visible(),false,'comparison requires a confirmed baseline');
  await page.click('#fixar');assert.equal(await page.$eval('#base',node=>node.readOnly),true);
  await page.click('#comparar');await finished();
  assert.match(await page.$eval('#resumo',node=>node.textContent),/Baseline: 11 dias.*atual: 12 dias.*\+1 dias/);
  const baseline=await page.$eval('#base',node=>node.value);
  await page.$eval('#dias',input=>{input.value='1';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await visible(),false,'event edits invalidate the previous comparison');
  await page.click('#evento');await finished();
  assert.match(await page.$eval('#resumo',node=>node.textContent),/Variação do término: 0 dias/);
  assert.equal(await page.$eval('#base',node=>node.value),baseline,'the event must preserve the confirmed baseline');
  await layout('comparador-cronogramas');
  // Resolve the earlier file first. Only the latest selection may become state.
  await page.evaluate(async()=>{
    const input=document.querySelector('#abrir'),original=File.prototype.text,pending={};
    File.prototype.text=function(){if(this.name.startsWith('race-'))return new Promise(resolve=>{pending[this.name]=async()=>resolve(await original.call(this));});return original.call(this);};
    const select=(name,label)=>{const file=new File([JSON.stringify({schema:'confenge.schedule-project/v1',baseline:`A;${label};4;`,current:`A;${label};5;`})],name,{type:'application/json'});const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
    try{select('race-earlier.json','Seleção anterior');select('race-latest.json','Última seleção');await pending['race-earlier.json']();await new Promise(done=>requestAnimationFrame(done));await pending['race-latest.json']();await new Promise(done=>requestAnimationFrame(done));}finally{File.prototype.text=original;}
  });
  assert.match(await page.$eval('#base',node=>node.value),/Última seleção/);
  assert.equal(await visible(),false);assert.equal(await page.$eval('#base',node=>node.readOnly),false);
  await page.click('#fixar');await page.click('#comparar');await finished();
  assert.match(await page.$eval('#resumo',node=>node.textContent),/Baseline: 4 dias.*atual: 5 dias/);
  console.log('PASS CPM: float, baseline immutability, invalidation and latest-file import');
  await fromCatalog('radier-solo-elastico');await page.click('#exemplo');await finished();
  const soil=await rows('nos');assert.ok(soil.length>100);
  for(const n of soil){near(numeric(n[4]),1);near(numeric(n[6]),20);}
  assert.match(await page.$eval('#resumo',node=>node.textContent),/1[.]600/);
  await layout('radier-solo-elastico');
  await page.$eval('#pressure',input=>{input.value='30';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await visible(),false,'load edits invalidate the previous raft result');
  await page.click('#calcular');await finished();near(numeric((await rows('nos'))[0][4]),1.5);
  console.log('PASS raft: real MITC4 worker, q/ks settlement, reactions and stale result guard');
  assert.deepEqual(errors,[],'unexpected JavaScript errors');
  console.log('PASS published artifact: four real tools, desktop/mobile navigation and no page overflow');
}finally{
  await browser?.close();await new Promise(done=>server.close(done));
}
