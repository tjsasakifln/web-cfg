/** Exercise the project examples in the shipped pages, including without page scripts. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './resolve_chrome.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const pages = JSON.parse(readFileSync(join(root, 'data/projects/project-pages.v1.json'), 'utf8')).pages;
const mime = { '.html': 'text/html;charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
});

await new Promise(done => server.listen(Number(process.env.PROJECT_DIAGRAM_PORT || 0), '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setJavaScriptEnabled(false);
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const widths = [320, 390, 901, 1240, 1440];

function problems() {
  const errors = new Set();
  const width = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > width + 1) errors.add('page overflows');
  for (const figure of document.querySelectorAll('.pp-hero__visual,.pp-record')) {
    const bounds = figure.getBoundingClientRect();
    if (bounds.left < -1 || bounds.right > width + 1) errors.add('figure exceeds viewport');
    for (const el of [figure, ...figure.querySelectorAll('*')]) {
      if (el.clientWidth && el.scrollWidth > el.clientWidth + 1) errors.add('figure needs horizontal scrolling');
    }
    const terms = [...figure.querySelectorAll('dt,dd')];
    const links = [...figure.querySelectorAll('a[href]')];
    if (!terms.length || !links.length) errors.add('missing readable example or action');
    const lines = [];
    for (const el of [...terms, ...links]) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || !el.innerText.trim() || !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) {
        errors.add('example or action hidden');
      }
      if (parseFloat(getComputedStyle(el).fontSize) < 12) errors.add('text smaller than 12px');
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const line of range.getClientRects()) {
        if (!line.width || !line.height) continue;
        if (line.left < bounds.left - 1 || line.right > bounds.right + 1) errors.add('example text clipped');
        for (const other of lines) {
          if (other.el !== el && Math.min(other.line.right, line.right) - Math.max(other.line.left, line.left) > 2 &&
              Math.min(other.line.bottom, line.bottom) - Math.max(other.line.top, line.top) > 2) errors.add('overlapping readings');
        }
        lines.push({ el, line });
      }
    }
  }
  if (document.querySelectorAll('figure.pp-hero__visual,figure.pp-record').length !== 2) errors.add('missing example');
  return [...errors];
}

try {
  for (const width of widths) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    for (const item of pages) {
      const result = await page.goto(origin + item.route, { waitUntil: 'load' });
      assert.equal(result.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      assert.deepEqual(await page.evaluate(problems), [], `${item.route} at ${width}px`);
      const artLoaded = await page.$eval('.pp-hero__visual img', img => img.complete && img.naturalWidth > 0);
      assert.ok(artLoaded, `missing graphic on ${item.route}`);
      if (width === 320) {
        const link = '.pp-hero__visual a[href="#demonstracao"]';
        await page.focus(link);
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => location.hash), '#demonstracao');
        const top = await page.$eval('#demonstracao', el => el.getBoundingClientRect().top);
        assert.ok(top >= -1 && top < 900, `keyboard link did not reach the example on ${item.route}`);
        assert.equal(await page.evaluate(() => scrollX), 0);
      }
    }
  }
  await page.setJavaScriptEnabled(true);
  await page.setViewport({ width: 320, height: 900 });
  await page.goto(origin + '/como-trabalhamos/', { waitUntil: 'load' });
  for (const [css, expected] of [
    ['.pp-record{min-width:680px!important}', 'figure exceeds viewport'],
    ['.pp-hero__visual{overflow:auto!important}.pp-hero__visual dl{width:700px!important}', 'figure needs horizontal scrolling'],
    ['.pp-record dd{font-size:8px!important}', 'text smaller than 12px'],
    ['.pp-record{position:relative!important}.pp-record dd{position:absolute!important;top:35px!important;left:16px!important}', 'overlapping readings'],
    ['.pp-hero__visual a{display:none!important}', 'example or action hidden'],
  ]) {
    const style = await page.addStyleTag({ content: css });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const observed = await page.evaluate(problems);
    assert.ok(observed.includes(expected), `missed regression: ${expected} (observed: ${observed.join(', ')})`);
    await style.evaluate(el => el.remove());
  }
  // A failed illustration must leave the readings and native action available.
  await page.setJavaScriptEnabled(false);
  await page.reload({ waitUntil: 'load' });
  await page.$eval('.pp-hero__visual img', img => img.remove());
  assert.deepEqual(await page.evaluate(problems), []);
} finally {
  await browser.close();
  server.close();
}
console.log(`PROJECT_DIAGRAM_GEOMETRY_PASS routes=${pages.length} widths=${widths.length} checks=${pages.length * widths.length} mutations=5`);
