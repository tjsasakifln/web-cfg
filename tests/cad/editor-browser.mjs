// Start a built site, then run CHROME_PATH=/path/to/chromium node tests/cad/editor-browser.mjs http://localhost:8080
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const base = new URL(process.argv[2] || process.env.CAD_BASE_URL || 'http://127.0.0.1:8080');
if (!process.env.CHROME_PATH) throw new Error('Defina CHROME_PATH com o executável do Chromium.');
const sample = fileURLToPath(new URL('../../cad/exemplo.dwg', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'confenge-cad-e2e-'));
const browser = await puppeteer.launch({
  executablePath:process.env.CHROME_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  defaultViewport:{width:1440,height:960}
});
try {
  const page = await browser.newPage();
  const devtools = await browser.target().createCDPSession();
  await devtools.send('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:directory, eventsEnabled:true});
  const response = await page.goto(new URL('/cad/', base).href);
  assert.equal(response.status(), 200);
  const input = await page.waitForSelector('#cad-editor input[type=file]');
  const waitForDrawing = name => page.waitForFunction(expected =>
    document.querySelector('.cad-name')?.textContent === expected &&
    document.querySelector('#cad-editor')?.getAttribute('aria-busy') === 'false' &&
    !document.querySelector('[data-save]').hidden, {timeout:120000}, name);

  // Reject forged file extensions without starting the editor.
  const invalid = path.join(directory,'invalido.dwg');
  await writeFile(invalid,'not a DWG');
  await input.uploadFile(invalid);
  await page.waitForSelector('.cad-status[data-error="true"]');
  assert.equal(await page.$('#cad-editor iframe'), null);

  await input.uploadFile(sample);
  await waitForDrawing(path.basename(sample));
  assert.equal(await page.$eval('[data-format]', el => el.value), 'dwg');
  const saveLabel = () => page.$eval('[data-save]', el => el.textContent.trim());
  assert.equal(await saveLabel(), 'Baixar DWG');
  await page.select('[data-format]', 'dxf');
  assert.equal(await saveLabel(), 'Baixar DXF');
  await page.select('[data-format]', 'dwg');
  assert.equal(await saveLabel(), 'Baixar DWG');
  const iframe = await page.$('#cad-editor iframe');
  const frame = await iframe.contentFrame();
  assert.equal(await frame.evaluate(() => document.fullscreenEnabled), false);
  const canvas = await frame.waitForSelector('canvas');
  // The page stays put during a real middle-button drag. Pixels from model space
  // must change as well, so swallowing the pan cannot make this test pass.
  const position = () => page.evaluate(() => Math.round(window.scrollY));
  const rect = await canvas.boundingBox();
  const x = Math.round(rect.x + rect.width*.48), y = Math.round(rect.y + rect.height*.50);
  const clip = {x:Math.round(rect.x + rect.width*.49), y:Math.round(rect.y + rect.height*.32) + await position(),
    width:Math.round(rect.width*.18), height:Math.round(rect.height*.26)};
  const paint = () => frame.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.mouse.move(x, y);
  await paint();
  const scrollBefore = await position();
  const beforePan = await page.screenshot({clip});
  // Linux CI has no Windows autoscroll. Verify its cancelable trigger as well as the real drag.
  assert(await canvas.evaluate(el => !el.dispatchEvent(new MouseEvent('mousedown', {
    button:1, bubbles:true, cancelable:true
  }))), 'O botão do meio deve cancelar a rolagem automática do navegador.');
  await page.mouse.down({button:'middle'});
  await paint();
  await page.mouse.move(x + 85, y + 65, {steps:8});
  await paint();
  await page.mouse.up({button:'middle'});
  await page.mouse.move(x, y);
  await paint();
  const afterPan = await page.screenshot({clip});
  assert(!beforePan.equals(afterPan), 'A vista do desenho precisa se deslocar.');
  assert.equal(await position(), scrollBefore, 'A página não pode acompanhar o arraste.');
  await page.mouse.move(4,100);
  await page.mouse.wheel({deltaY:460});
  await paint();
  assert.equal(await position(), scrollBefore, 'A rolagem deve permanecer travada durante a edição.');

  await page.click('[data-expand]');
  await page.waitForSelector('#cad-editor.cad-expanded');
  await page.keyboard.type('l');
  await page.keyboard.press('Escape');
  // Cancel a line after its first point. The next pick must not create geometry.
  // The decoded download below checks exactly how many lines were added.
  const enlarged = await canvas.boundingBox();
  const pick = (x, y) => page.mouse.click(enlarged.x + enlarged.width*x, enlarged.y + enlarged.height*y);
  await page.keyboard.type('l');
  await page.keyboard.press('Enter');
  await paint();
  await pick(.39, .46);
  await paint();
  await page.keyboard.press('Escape');
  await paint();
  await pick(.55, .58);
  await paint();
  assert(await page.$eval('[data-expand]', el => el.getAttribute('aria-pressed') === 'true'));
  assert.equal(await page.evaluate(() => document.fullscreenElement), null);
  assert(await frame.evaluate(() => document.activeElement?.id === 'cadcraft_canvas'));
  await page.click('[data-expand]');
  await page.click('[data-page]');
  assert.equal(await page.$eval('[data-page]', el => el.textContent), 'Retomar edição');
  const releasedAt = await position();
  await page.mouse.move(4,100);
  await page.mouse.wheel({deltaY:460});
  await page.waitForFunction(previous => window.scrollY > previous + 10, {}, releasedAt);
  await page.click('[data-page]');
  assert(await page.$eval('#cad-editor', el => el.classList.contains('cad-working')));
  // A reader can also return by clicking the drawing. Reflow only after the pick
  // so an active command receives the coordinates that were actually clicked.
  await page.click('[data-page]');
  const readBounds = await canvas.boundingBox();
  await page.mouse.click(readBounds.x + readBounds.width*.46, readBounds.y + readBounds.height*.4);
  await page.waitForSelector('#cad-editor.cad-working');
  assert(await page.evaluate(() => document.documentElement.classList.contains('cad-page-locked')));
  assert.equal(await page.$eval('.cad-name', el => el.textContent), path.basename(sample));
  await page.click('[data-fit]');
  await paint();
  await canvas.scrollIntoView();
  const bounds = await canvas.boundingBox();
  const clickDrawing = (x, y) => page.mouse.click(bounds.x + bounds.width*x, bounds.y + bounds.height*y);
  await clickDrawing(.40,.42);
  await page.keyboard.press('Escape');
  await page.keyboard.press('l');
  await page.keyboard.press('Enter');
  // Separate paint frames so the canvas receives two independent picks.
  const nextPaint = () => frame.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await nextPaint();
  await clickDrawing(.37,.44);
  await nextPaint();
  await clickDrawing(.50,.58);
  await nextPaint();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('.cad-caption')?.textContent.includes('Alterações'));

  const completed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('O navegador não concluiu o download do DWG.')), 30000);
    devtools.on('Browser.downloadProgress', event => {
      if (event.state === 'completed') { clearTimeout(timer); resolve(); }
      if (event.state === 'canceled') { clearTimeout(timer); reject(new Error('Download cancelado.')); }
    });
  });
  await page.click('[data-save]');
  await completed;
  const edited = path.join(directory,'exemplo-editado.dwg');
  const originalBytes = await readFile(sample), editedBytes = await readFile(edited);
  assert.equal(editedBytes.subarray(0,6).toString('ascii'), 'AC1015');

  // Parse both real DWG files. Every original line must still be present, plus one new line.
  const drawings = await page.evaluate(async (original, saved) => {
    const { DwgReader } = await import('/bim/web/vendor-cad/acad.mjs');
    const xy = p => [p.x,p.y].map(v => +v.toFixed(5));
    return [original,saved].map(bytes => {
      const doc = DwgReader.readFromStream(Uint8Array.from(bytes).buffer);
      const entities = Array.from(doc.modelSpace.entities);
      const lines = entities.filter(e => e.objectName === 'LINE')
        .map(e => [xy(e.startPoint), xy(e.endPoint)]);
      return { count:entities.length, lines };
    });
  }, [...originalBytes], [...editedBytes]);
  const [before, after] = drawings;
  assert.equal(after.count, before.count + 1);
  const remaining = after.lines.map(line => JSON.stringify(line));
  for (const line of before.lines) {
    const i = remaining.indexOf(JSON.stringify(line));
    assert.notEqual(i, -1, 'Uma linha original foi alterada ou removida.');
    remaining.splice(i,1);
  }
  assert.equal(remaining.length, 1);
  const [start,end] = JSON.parse(remaining[0]);
  assert(Math.hypot(start[0]-end[0], start[1]-end[1]) > 0, 'A linha criada precisa de comprimento positivo.');
  await input.uploadFile(edited);
  await waitForDrawing(path.basename(edited));
  assert.equal(await page.$eval('[data-format]', el => el.value), 'dwg');
  console.log(`DWG editado e reaberto: ${before.count} → ${after.count} entidades, nova linha ${remaining[0]}.`);
} finally {
  await browser.close();
  await rm(directory, {recursive:true,force:true});
}
