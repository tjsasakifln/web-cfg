// CHROME_PATH=/path/to/chromium node tests/cad-suite/graphics-fallback.mjs http://localhost:8080
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const base = process.argv[2] || 'http://127.0.0.1:8080';
const sample = fileURLToPath(new URL('../../cad/exemplo.dwg', import.meta.url));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  defaultViewport: {width: 1440, height: 960},
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-webgl', '--disable-webgpu', '--disable-software-rasterizer']
});
try {
  for (const blockStorage of [false, true]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    if (blockStorage) await page.evaluateOnNewDocument(() => {
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, ...args) {
        if (name === 'cadcraft-handoff') throw new DOMException('Blocked', 'SecurityError');
        return open.call(this, name, ...args);
      };
    });
    await page.goto(new URL('/cad/', base).href);
    await (await page.waitForSelector('#cad-editor input[type=file]')).uploadFile(sample);
    await page.waitForSelector('[data-open-2d]', {visible: true});
    assert.match(await page.$eval('.cad-status', el => el.textContent), /área gráfica/);
    await page.click('[data-open-2d]');
    if (blockStorage) {
      const manual = await page.waitForSelector('[data-manual-2d]', {visible: true});
      assert.equal(await manual.evaluate(el => el.getAttribute('href')), '/cad/aplicativos/#cadcraft');
      assert.match(await page.$eval('.cad-status', el => el.textContent), /selecione o arquivo novamente/);
    } else {
      await page.waitForFunction(() => location.hash === '#cadcraft' &&
        document.querySelector('#suite-frame iframe')?.contentDocument?.querySelector('[data-history]')?.textContent.includes('Opened exemplo.dwg: 30 objects on 5 layers'),
        {timeout: 90000});
      assert.equal(await page.$eval('[data-dwg-note]', el => el.hidden), false);
    }
    await context.close();
  }
  console.log('CadCraft 2D abre o desenho sem WebGL. Armazenamento bloqueado oferece seleção manual.');
} finally {
  await browser.close();
}
