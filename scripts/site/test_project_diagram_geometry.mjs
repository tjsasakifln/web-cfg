/** Rendered legibility and containment for every generated engineering diagram. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './resolve_chrome.mjs';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const PORT=Number(process.env.PROJECT_DIAGRAM_PORT||8821);
const pages=JSON.parse(readFileSync(join(ROOT,'data/projects/project-pages.v1.json'),'utf8')).pages;
const MIME={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  let path=new URL(req.url,'http://localhost').pathname;if(path.endsWith('/'))path+='index.html';
  const file=join(ROOT,path);
  if(!file.startsWith(ROOT+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':MIME[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:resolveChromePath(),headless:true,args:['--no-sandbox','--disable-gpu']});
const page=await browser.newPage();let checks=0;
async function metrics(){return page.evaluate(async()=>{
  const problems=[];const diagrams=[];
  for(const copy of document.querySelectorAll('.pp-hero__copy,.pp-hero__visual figcaption')){
    const rect=copy.getBoundingClientRect();if(rect.left<0||rect.right>innerWidth+1)problems.push('hero_copy_clipped');
  }
  for(const figure of document.querySelectorAll('.pp-hero__visual,.pp-demo figure')){
    const canvas=figure.querySelector('.pp-hero__canvas,.pp-demo__canvas');const image=canvas?.querySelector('img');
    if(!canvas||!image){problems.push('diagram_canvas_missing');continue;}
    const svg=await fetch(image.getAttribute('src')).then(r=>r.text());
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml');const box=doc.documentElement.getAttribute('viewBox')?.split(/\s+/).map(Number);
    const sizes=[...svg.matchAll(/font(?:-size)?\s*:\s*(?:\d+\s+)?([\d.]+)px/g)].map(m=>Number(m[1]));
    sizes.push(...[...doc.querySelectorAll('text[font-size]')].map(t=>Number(t.getAttribute('font-size'))));
    const scale=image.getBoundingClientRect().width/(box?.[2]||0);const font=sizes.length?Math.min(...sizes)*scale:null;
    if(doc.querySelector('text')&&(!font||font<11.9))problems.push('diagram_text_below_12px');
    const rect=canvas.getBoundingClientRect();
    if(rect.left<0||rect.right>innerWidth+1||document.documentElement.scrollWidth>innerWidth+1)problems.push('diagram_document_overflow');
    if(canvas.scrollWidth>canvas.clientWidth+1){
      const hint=figure.querySelector('.pp-hero__pan-hint,.pp-demo__pan-hint');
      if(!hint||getComputedStyle(hint).display==='none'||canvas.tabIndex!==0)problems.push('diagram_scroll_not_discoverable');
      canvas.scrollLeft=80;if(canvas.scrollLeft<40)problems.push('diagram_cannot_scroll');canvas.scrollLeft=0;
    }
    const pseudo=getComputedStyle(figure,'::before');
    if(!['none','normal'].includes(pseudo.content)&&pseudo.display!=='none')problems.push('diagram_displaced_frame');
    diagrams.push({src:image.getAttribute('src'),min_font_px:font,width:image.getBoundingClientRect().width});
  }
  if(diagrams.length!==2)problems.push('diagram_census_changed');
  return {problems,diagrams};
});}
try{
  for(const width of [320,390,901,1240,1440]){
    await page.setViewport({width,height:1000,deviceScaleFactor:1});
    for(const item of pages){
      const r=await page.goto(`http://127.0.0.1:${PORT}${item.route}`,{waitUntil:'networkidle0'});assert.equal(r.status(),200);
      const result=await metrics();assert.deepEqual(result.problems,[],`${item.route} ${width}: ${JSON.stringify(result)}`);checks++;
      if(width===320){
        for(const canvas of await page.$$('.pp-hero__canvas,.pp-demo__canvas')){
          const scrollable=await canvas.evaluate(e=>e.scrollWidth>e.clientWidth+1);
          if(!scrollable)continue;
          await canvas.evaluate(e=>{e.scrollLeft=0;e.focus();});
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(e=>e.scrollLeft>0,{timeout:2500},canvas);
          assert.equal(await page.evaluate(()=>window.scrollX),0,`${item.route}: keyboard displaced page`);
        }
      }
    }
  }
  const shrink=await page.addStyleTag({content:'.pp-hero__canvas img,.pp-demo__canvas img{min-width:0!important;width:240px!important}'});
  assert.ok((await metrics()).problems.includes('diagram_text_below_12px'),'shrunk SVG text regression must fail');await shrink.evaluate(n=>n.remove());
  const offset=await page.addStyleTag({content:'.pp-hero__visual::before{content:"";position:absolute;inset:-20px 20px 20px -20px;border:1px solid navy}'});
  assert.ok((await metrics()).problems.includes('diagram_displaced_frame'),'offset frame regression must fail');
  await offset.evaluate(n=>n.remove());
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  const expand=await page.addStyleTag({content:'.pp-hero__visual{min-width:auto!important}'});
  assert.ok((await metrics()).problems.some(p=>['diagram_document_overflow','hero_copy_clipped'].includes(p)),'missing min-width containment must fail');
  await expand.evaluate(n=>n.remove());
}finally{await browser.close();server.close();}
console.log(`PROJECT_DIAGRAM_GEOMETRY_PASS routes=${pages.length} widths=5 checks=${checks} negative_regressions=3`);
