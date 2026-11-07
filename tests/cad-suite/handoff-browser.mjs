// Serve the public artifact with the pinned app bundles, then run CHROME_PATH=/path/to/chromium node tests/cad-suite/handoff-browser.mjs http://localhost:8080
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://127.0.0.1:8080';
const sample = fileURLToPath(new URL('../../cad/exemplo.dwg', import.meta.url));
const dir = await mkdtemp(path.join(tmpdir(),'confenge-handoff-'));
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH, defaultViewport:{width:1440,height:960},
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage();
  const dev = await browser.target().createCDPSession();
  await dev.send('Browser.setDownloadBehavior', {behavior:'allow',downloadPath:dir,eventsEnabled:true});
  page.on('dialog', dialog => dialog.accept());
  await page.goto(new URL('/cad/aplicativos/',base).href);
  await page.click('#suite-instructions summary');
  await page.waitForFunction(() => document.querySelector('#suite-instructions [data-script]')?.value.includes('IFC') ||
    document.querySelector('#suite-instructions [data-script]')?.value.includes('ifc'));
  const total = await page.evaluate(() => {
    const area = document.querySelector('#suite-instructions [data-area]');
    const task = document.querySelector('#suite-instructions [data-task]');
    let count = 0;
    for (let i=0; i<area.options.length; i++) {
      area.selectedIndex=i; area.dispatchEvent(new Event('change')); count+=task.options.length;
    }
    return count;
  });
  assert.equal(total,50);
  await page.$eval('#suite-instructions [data-script]', el => { el.value='Texto local de conferência.'; });
  await page.click('#suite-instructions [data-copy]');
  await page.waitForFunction(()=>document.querySelector('#suite-instructions [role=status]').textContent.includes('Texto'));
  await page.click('#suite-instructions summary');
  const form = '#suite-file-form';
  const input = await page.waitForSelector(form+' input[type=file]');
  const bad = path.join(dir,'invalido.dwg');
  await writeFile(bad,'plain text');
  await input.uploadFile(bad);
  await page.click(form+' [data-open-file]');
  await page.waitForFunction(()=>document.querySelector('#suite-file-form [role=status]').textContent.includes('extensão'));
  assert.equal(await page.$('#suite-frame iframe'), null);

  const receive = async (filename, app, text) => {
    await input.uploadFile(filename);
    await page.select(form+' select', app);
    await page.click(form+' [data-open-file]');
    await page.waitForFunction(expected => {
      const doc = document.querySelector('#suite-frame iframe')?.contentDocument;
      return doc?.body?.innerText.includes(expected);
    }, {timeout:90000, polling:200}, text);
    const frame = await (await page.$('#suite-frame iframe')).contentFrame();
    const count = await page.evaluate(() => new Promise((resolve,reject) => {
      const open = indexedDB.open('cadcraft-handoff',1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db=open.result, req=db.transaction('files').objectStore('files').count();
        req.onsuccess=()=>{db.close();resolve(req.result)};
      };
    }));
    assert.equal(count,0,'The receiving app must dispose of its handoff file.');
    return frame;
  };
  const cad = await receive(sample,'cadcraft','30 objects on 5 layers');
  assert.equal(await cad.evaluate(() => document.fullscreenEnabled), false);
  assert.ok(await page.$eval('[data-dwg-note]', el => !el.hidden));
  await page.click('#suite-workspace [data-expand]');
  await page.waitForFunction(() => document.fullscreenElement?.id === 'suite-workspace' &&
    document.querySelector('.suite-signature')?.getBoundingClientRect().width > 0);
  await page.click('#suite-workspace [data-expand]');
  await page.waitForFunction(() => !document.fullscreenElement);
  const canvas = await cad.$('canvas[data-over]');
  await cad.click('[data-cmd=LINE]');
  await canvas.scrollIntoView();
  const bounds = await canvas.boundingBox();
  for (const [x,y] of [[.43,.46],[.53,.58]]) {
    await page.mouse.click(bounds.x+bounds.width*x,bounds.y+bounds.height*y);
    await cad.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  }
  await page.keyboard.press('Enter');
  const complete = new Promise((yes,no)=>{
    const timer=setTimeout(()=>no(new Error('Download timed out')),30000);
    dev.on('Browser.downloadProgress',e=>{
      if(e.state==='completed'){clearTimeout(timer);yes()}
      if(e.state==='canceled'){clearTimeout(timer);no(new Error('Download canceled'))}
    });
  });
  await cad.click('[data-cmd=SAVE]');
  await complete;
  const output=path.join(dir,path.basename(sample));
  assert.equal((await readFile(output)).subarray(0,6).toString(),'AC1015');

  await page.click('#suite-workspace [data-catalog]');
  const reopened = await receive(output,'cadcraft','31 objects on 5 layers');
  assert.match(reopened.url(),/\/cadcraft\//);
  await page.setViewport({width:390,height:844});
  await reopened.click('canvas[data-over]');
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.press('s');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await reopened.waitForSelector('dialog[open] [data-dwg-version]', {visible:true});
  await page.waitForFunction(() => document.querySelector('#suite-frame iframe')
    .getBoundingClientRect().bottom <= innerHeight + 1);
  await page.keyboard.press('Escape');
  await page.setViewport({width:1440,height:960});
  await page.click('#suite-workspace [data-catalog]');
  await receive(output,'modelcraft','edges on the ground');
  console.log('DWG received, edited, downloaded and reopened in two distinct apps; handoff records consumed.');
} finally { await browser.close(); await rm(dir,{recursive:true,force:true}); }
