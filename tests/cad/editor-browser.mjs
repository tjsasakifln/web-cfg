// Exercises the actual hosted OpenCAD WASM under the artifact's real CSP.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { serveCad } from './server.mjs';

const requested = process.argv[2];
const local = requested?.startsWith('http') ? null : await serveCad(requested || '_site');
const base = local?.base || requested;
const output = path.resolve(process.env.CAD_EVIDENCE || 'build/reports/cad');
await mkdir(output, { recursive:true });
const downloads = await mkdtemp(path.join(tmpdir(), 'confenge-opencad-'));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  defaultViewport:{width:1440,height:1000},
});
const passed = [];
const pass = name => { passed.push(name); console.log('CAD PASS: ' + name); };
let page;
const errors = [], violations = [], external = [], consoleMessages = [];
try {
  page = await browser.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (['error','warn'].includes(message.type())) consoleMessages.push(message.text());
    if (/panicked|Buffer is not mapped/.test(message.text())) errors.push(message.text());
  });
  await page.exposeFunction('cadViolation', v => violations.push(v));
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('securitypolicyviolation', e => window.cadViolation({ directive:e.effectiveDirective, blocked:e.blockedURI }));
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/api/web/tool-credits' && url.searchParams.get('op') === 'config') {
      // Explicit local fixture: validate the actual wallet's disabled/free branch.
      request.respond({ status:200, contentType:'application/json', body:'{"enabled":false}' });
    } else {
      if (request.frame()?.url().includes('/cad/editor/') && /^https?:/.test(url.protocol) && url.origin !== new URL(base).origin) external.push(url.origin);
      request.continue();
    }
  });
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:downloads, eventsEnabled:true});
  assert.equal((await page.goto(new URL('/cad/',base).href)).status(),200);
  const input = await page.waitForSelector('[data-file]');
  const invalid = path.join(downloads,'invalido.dwg');
  await writeFile(invalid,'not a DWG');
  const corrupt = path.join(downloads,'corrompido.dwg');
  const damaged = Buffer.alloc(128);
  damaged.write('AC1032');
  await writeFile(corrupt,damaged);
  await input.uploadFile(invalid);
  await page.waitForSelector('.cad-status[data-error="true"]');
  assert.equal(await page.$('#cad-editor iframe'),null);
  pass('invalid DWG refused before loading the engine');
  await input.uploadFile(path.resolve('cad/exemplo.dwg'));
  await page.waitForFunction(() => !document.querySelector('[data-save]').hidden && document.querySelector('#cad-editor').getAttribute('aria-busy')==='false', {timeout:240000});
  const frame = await (await page.$('#cad-editor iframe')).contentFrame();
  const raw = request => frame.evaluate(request => window.ocsControl.request(request), request);
  const state = () => raw({op:'state'});
  const active = data => data.documents.find(d=>d.id===data.document_id);
  const act = async request => {
    const before = await state();
    const reply = await raw({...request,request_id:crypto.randomUUID(),document_id:before.document_id,revision:before.revision});
    assert.equal(reply.ok,true,JSON.stringify(reply)); return reply;
  };
  const initial = await state();
  assert.equal(path.basename(active(initial).path),'exemplo.dwg');
  assert.equal(await page.$eval('.cad-name',element=>element.textContent),'exemplo.dwg');
  const count = (await raw({op:'entities'})).total;
  assert(count>0);
  assert.equal(await frame.evaluate(()=>document.fullscreenEnabled),false);
  const identity = await page.$eval('.cad-brand',img=>({alt:img.alt,loaded:img.naturalWidth>0}));
  assert(identity.loaded); assert.match(identity.alt,/CONFENGE/);
  pass('real DWG opens in branded local OpenCAD');

  // The CI browser explicitly uses SwiftShader. Acknowledge its real warning
  // before interacting with the drawing, without changing visitor preferences.
  await frame.waitForFunction(async()=>{
    const state=await window.ocsControl.request({op:'state'});
    return state.modal==='GpuWarning'||state.tool_windows?.includes('GpuWarning');
  },{timeout:15000});
  await act({op:'action',name:'close_modal'});
  const afterWarning=await state();
  assert.notEqual(afterWarning.modal,'GpuWarning');
  assert(!afterWarning.tool_windows.includes('GpuWarning'));
  pass('software-rendering warning acknowledged in the test browser');

  await act({op:'run',cmd:'LINE 6500,1000 7200,1900'});
  assert.equal((await raw({op:'entities'})).total,count+1);
  const currentId=(await state()).document_id;
  await input.uploadFile(corrupt);
  await page.waitForSelector('.cad-status[data-error="true"]');
  assert.equal((await state()).document_id,currentId);
  assert.equal((await raw({op:'entities'})).total,count+1);
  assert.equal(active(await state()).dirty,true);
  pass('native parser rejection of a corrupted second DWG preserves edited drawing');

  const canvas=await frame.waitForSelector('canvas');
  // Await the actual fit operation so its camera change cannot masquerade as pan.
  await act({op:'action',name:'zoom_extents'});
  const bounds=await canvas.boundingBox();
  const x=bounds.x+bounds.width*.52,y=bounds.y+bounds.height*.56;
  const scroll=await page.evaluate(()=>window.scrollY);
  const camera=(await state()).camera;
  await page.mouse.move(x,y); await page.mouse.down({button:'middle'});
  await page.mouse.move(x+85,y+65,{steps:8}); await page.mouse.up({button:'middle'});
  await page.waitForFunction(()=>document.querySelector('#cad-editor').classList.contains('cad-working'));
  assert.equal(await page.evaluate(()=>window.scrollY),scroll);
  assert.notDeepEqual((await state()).camera,camera);
  pass('middle-button pan moves drawing without scrolling the page');
  await page.click('[data-expand]');
  await page.keyboard.type('L'); await page.keyboard.press('Escape');
  assert(await page.$eval('#cad-editor',el=>el.classList.contains('cad-expanded')));
  assert.equal((await raw({op:'entities'})).total,count+1);
  await page.screenshot({path:path.join(output,'desktop-editor.png')});
  await page.click('[data-expand]'); await page.click('[data-page]');
  assert.equal(await page.$eval('[data-page]',el=>el.textContent),'Retomar edição');
  await page.click('[data-page]');
  assert.equal((await state()).document_id,currentId);
  pass('Escape, expanded view and return to page preserve the drawing');

  const completed = new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('DWG download did not complete')),120000);
    cdp.on('Browser.downloadProgress',event=>{
      if(event.state==='completed'){clearTimeout(timer);resolve();}
      else if(event.state==='canceled'){clearTimeout(timer);reject(new Error('DWG download canceled'));}
    });
  });
  await act({op:'run',cmd:'QSAVE'});
  await completed;
  const names=(await readdir(downloads)).filter(name=>name.endsWith('.dwg')&&!['invalido.dwg','corrompido.dwg'].includes(name));
  assert.equal(names.length,1);
  const saved=await readFile(path.join(downloads,names[0]));
  assert.match(saved.subarray(0,6).toString(),/^AC10\d{2}$/);
  assert.equal(active(await state()).dirty,false);
  await input.uploadFile(path.join(downloads,names[0]));
  await page.waitForFunction(()=>document.querySelector('#cad-editor').getAttribute('aria-busy')==='false');
  const after=await state();
  assert.notEqual(after.document_id,currentId);
  assert.equal((await raw({op:'entities'})).total,count+1);
  const lines=await raw({op:'query',type:'Line',detail:'geometry'});
  assert(lines.entities.some(line=>JSON.stringify(line.start)===JSON.stringify([6500,1000,0]) &&
    JSON.stringify(line.end)===JSON.stringify([7200,1900,0])),'Edited line endpoints changed after DWG reopen');
  pass('actual wallet delivery, saved DWG download and reopen keep the added line');

  await page.setViewport({width:390,height:844});
  await page.screenshot({path:path.join(output,'mobile-editor.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  pass('page stays within narrow viewport');
  assert.deepEqual(external,[],'Editor requested external resources');
  assert.deepEqual(violations,[],'Actual CSP blocked required resources');
  assert.deepEqual(errors,[]);
  assert.equal((await frame.evaluate(()=>navigator.serviceWorker?.getRegistrations().then(r=>r.length)))||0,0);
  pass('no external requests, service workers, CSP violations or runtime errors');
  await writeFile(path.join(output,'browser-result.json'),JSON.stringify({ok:true,base,passed,download:names[0],bytes:saved.length,entityCount:count+1},null,2)+'\n');
} catch(error) {
  let state;
  if (page) {
    await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
    state=await page.evaluate(async()=>({status:document.querySelector('.cad-status')?.textContent,
      busy:document.querySelector('#cad-editor')?.getAttribute('aria-busy'),
      frames:await Promise.all([...document.querySelectorAll('iframe')].map(async frame=>({src:frame.src,
        text:frame.contentDocument?.body?.innerText,canvas:!!frame.contentDocument?.querySelector('canvas'),
        control:await frame.contentWindow?.ocsControl?.request({op:'state'},{timeoutMs:3000}).catch(error=>({error:String(error)}))})))})).catch(()=>null);
  }
  await writeFile(path.join(output,'browser-result.json'),JSON.stringify({ok:false,base,passed,error:String(error),stack:error.stack,
    state,errors,violations,external,consoleMessages},null,2)+'\n');
  throw error;
} finally { await browser.close(); local?.server.close(); }
