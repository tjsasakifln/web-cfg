/** Exercise professional project criteria and deliverable links, including without page scripts. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
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

async function expectLocation(expected) {
  const deadline = Date.now() + 3000;
  let actual;
  do {
    actual = await page.evaluate(() => location.href);
    if (actual === expected) return;
    await sleep(40);
  } while (Date.now() < deadline);
  assert.equal(actual, expected);
}

function problems() {
  const errors = new Set();
  const width = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > width + 1) errors.add('page overflows');
  for (const figure of document.querySelectorAll('.pp-hero__visual,.pp-record')) {
    const bounds = figure.getBoundingClientRect();
    if (bounds.left < -1 || bounds.right > width + 1) errors.add('technical panel exceeds viewport');
    for (const el of [figure, ...figure.querySelectorAll('*')]) {
      if (el.clientWidth && el.scrollWidth > el.clientWidth + 1) errors.add('technical panel needs horizontal scrolling');
    }
    const terms = [...figure.querySelectorAll('dt,dd')];
    const links = [...figure.querySelectorAll('a[href]')];
    if (!terms.length || !links.length) errors.add('missing readable technical criteria or action');
    const lines = [];
    for (const el of [...terms, ...links]) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || !el.innerText.trim() || !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) {
        errors.add('technical criteria or action hidden');
      }
      if (parseFloat(getComputedStyle(el).fontSize) < 16) errors.add('text smaller than 16px');
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const line of range.getClientRects()) {
        if (!line.width || !line.height) continue;
        if (line.left < bounds.left - 1 || line.right > bounds.right + 1) errors.add('technical criteria text clipped');
        for (const other of lines) {
          if (other.el !== el && Math.min(other.line.right, line.right) - Math.max(other.line.left, line.left) > 2 &&
              Math.min(other.line.bottom, line.bottom) - Math.max(other.line.top, line.top) > 2) errors.add('overlapping readings');
        }
        lines.push({ el, line });
      }
    }
  }
  if (document.querySelectorAll('.pp-hero__visual,.pp-record').length !== 2) errors.add('missing technical panel');
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
      if (width === 320) {
        for (const nav of ['.pp-nav', '.pp-mobile nav']) {
          assert.equal(await page.$$eval(`${nav} a[href="/ferramentas/"]`, links => links.length), 1, item.route);
        }
        const link = '.pp-hero__visual a[href="#criterios-tecnicos"]';
        await page.focus(link);
        await page.keyboard.press('Enter');
        await expectLocation(origin + item.route + '#criterios-tecnicos');
        const top = await page.$eval('#criterios-tecnicos', el => el.getBoundingClientRect().top);
        assert.ok(top >= -1 && top < 900, `keyboard link did not reach the technical criteria on ${item.route}`);
        assert.equal(await page.evaluate(() => scrollX), 0);
      }
    }
  }
  await page.setViewport({ width: 320, height: 900, deviceScaleFactor: 1 });
  for (const scripts of [false, true]) {
    await page.setJavaScriptEnabled(scripts);
    for (const item of pages) {
      await page.goto(origin + item.route, { waitUntil: 'load' });
      // Both links are native anchors and must work with page scripts disabled.
      await page.focus('.pp-hero__visual a[href="#criterios-tecnicos"]');
      await page.keyboard.press('Enter');
      await expectLocation(origin + item.route + '#criterios-tecnicos');
      await page.focus('.pp-record a[href="#entregaveis"]');
      await page.keyboard.press('Enter');
      await expectLocation(origin + item.route + '#entregaveis');
      const deliverablesTop = await page.$eval('#entregaveis', el => el.getBoundingClientRect().top);
      assert.ok(deliverablesTop >= -1 && deliverablesTop < 900, `keyboard link did not reach deliverables on ${item.route}`);
      assert.deepEqual(await page.evaluate(problems), [], item.route + ' criteria to deliverables');
      assert.equal(await page.$eval('#contato-projetos .pp-button', el => el.getAttribute('href')), '/#contato');
    }
  }
  await page.setJavaScriptEnabled(true);
  await page.setViewport({ width: 320, height: 900 });
  await page.goto(origin + '/como-trabalhamos/', { waitUntil: 'load' });
  for (const [css, expected] of [
    ['.pp-record{min-width:680px!important}', 'technical panel exceeds viewport'],
    ['.pp-hero__visual{overflow:auto!important}.pp-hero__visual dl{width:700px!important}', 'technical panel needs horizontal scrolling'],
    ['.pp-record dd{font-size:8px!important}', 'text smaller than 16px'],
    ['.pp-record{position:relative!important}.pp-record dd{position:absolute!important;top:35px!important;left:16px!important}', 'overlapping readings'],
    ['.pp-hero__visual a{display:none!important}', 'technical criteria or action hidden'],
  ]) {
    const style = await page.addStyleTag({ content: css });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const observed = await page.evaluate(problems);
    assert.ok(observed.includes(expected), `missed regression: ${expected} (observed: ${observed.join(', ')})`);
    await style.evaluate(el => el.remove());
  }
  // Technical criteria remain semantic HTML; image or script loading is not required.
  await page.setJavaScriptEnabled(false);
  await page.reload({ waitUntil: 'load' });
  assert.equal(await page.$$eval('.pp-hero__visual img,.pp-record img', images => images.length), 0);
  assert.deepEqual(await page.evaluate(problems), []);
} finally {
  await browser.close();
  server.close();
}
console.log(`PROJECT_TECHNICAL_CRITERIA_GEOMETRY_PASS routes=${pages.length} widths=${widths.length} checks=${pages.length * widths.length} mutations=5`);
