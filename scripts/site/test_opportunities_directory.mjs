/** Native browser pagination, filters, announcements, full-link and JS-off parity. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './resolve_chrome.mjs';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const fixture=execFileSync(process.env.PYTHON_EXECUTABLE||'python3',['-c',`
from scripts.live_intelligence.render import render_opportunities_index_html
rows=[{'opportunity_id':f'test-only-{i:03}', 'orgao':{'nome':f'Órgão de São Paulo {i}'}, 'local':{'municipio':'São Paulo' if i%2 else 'Florianópolis','uf':'SP' if i%2 else 'SC'}, 'prazo':{'status':'UNKNOWN'},'source_kind':'test_only_fixture'} for i in range(49)]
print(render_opportunities_index_html(rows,projection_kind='test_only_fixture'))
`],{cwd:ROOT,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/oportunidades/'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(fixture);return;}
  const file=join(ROOT,path);
  if(!file.startsWith(ROOT+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':({'.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise(r=>server.listen(8823,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:resolveChromePath(),headless:true,args:['--no-sandbox','--disable-gpu']});
const page=await browser.newPage();
const visibleLinks=()=>page.$$eval('[data-opportunity-card]:not([hidden]) a',nodes=>nodes.map(n=>n.getAttribute('href')));
const status=()=>page.$eval('[data-opportunity-result]',e=>e.textContent);
let checks=0;
try{
  for(const width of [320,390,1240,1440]){
    await page.setViewport({width,height:844,deviceScaleFactor:1});await page.goto('http://127.0.0.1:8823/oportunidades/',{waitUntil:'networkidle0'});
    assert.equal(await page.$$eval('[data-opportunity-card] a',n=>n.length),49);
    assert.equal(await page.$eval('#proximo-passo',e=>e.querySelector('h2').textContent),'Próximo passo');
    assert.equal(await page.evaluate(()=>Boolean(document.querySelector('#proximo-passo').compareDocumentPosition(document.querySelector('#lista')) & Node.DOCUMENT_POSITION_FOLLOWING)),true);
    assert.equal(await page.$eval('#proximo-passo',e=>e.querySelectorAll('.journey-next a').length),2);
    assert.equal(await page.$eval('#outras-ferramentas h2',e=>e.textContent),'Outras ferramentas');
    assert.equal((await visibleLinks()).length,24);
    const firstAnnouncement=await status();const seen=[...await visibleLinks()];
    await page.click('[data-opportunity-next]');assert.notEqual(await status(),firstAnnouncement,'page change must be announced');seen.push(...await visibleLinks());
    await page.click('[data-opportunity-next]');seen.push(...await visibleLinks());assert.equal(seen.length,49);assert.equal(new Set(seen).size,49);
    assert.equal(await page.$eval('[data-opportunity-next]',e=>e.disabled),true);
    await page.select('#opportunity-state','SC');assert.equal((await visibleLinks()).length,24);
    assert.match(await status(),/25 oportunidades/);
    await page.type('#opportunity-search','florianopolis');assert.match(await status(),/25 oportunidades/);
    await page.$eval('#opportunity-search',e=>{e.value='nada-que-exista';e.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal((await visibleLinks()).length,0);assert.equal(await page.$eval('[data-opportunity-empty]',e=>e.hidden),false);
    await page.$eval('#opportunity-search',e=>{e.value='test-only-003';e.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.select('#opportunity-state','all');assert.deepEqual(await visibleLinks(),['/oportunidades/test-only-003/']);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    const links=await page.$$eval('[data-opportunity-card] a',n=>n.map(a=>a.getAttribute('href')));assert.equal(new Set(links).size,49);
    checks++;
  }
  const noJs=await browser.newPage();await noJs.setJavaScriptEnabled(false);await noJs.goto('http://127.0.0.1:8823/oportunidades/');
  assert.equal(await noJs.$$eval('[data-opportunity-card]',n=>n.filter(e=>getComputedStyle(e).display!=='none').length),49);
  assert.match(await noJs.$eval('meta[name="robots"]',e=>e.content),/noindex.*follow/);
  assert.equal(await noJs.$eval('link[rel="canonical"]',e=>e.href),'https://confenge.com.br/oportunidades/');
}finally{await browser.close();server.close();}
console.log(`OPPORTUNITIES_DIRECTORY_PASS fixture_only=true widths=${checks} unique_ids=49 pagination=complete filters=pass live_announcements=pass js_off=49`);
