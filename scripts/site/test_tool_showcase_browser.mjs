import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './resolve_chrome.mjs';

const root = resolve(process.argv[2] || '_site');
const shots = process.env.TOOL_SHOWCASE_SCREENSHOTS;
const events = [];
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/.netlify/functions/') || url.pathname.startsWith('/api/web/')) {
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      events.push({ path: url.pathname, body });
    }
    return res.writeHead(404).end();
  }
  try {
    let file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + sep) && file !== root) return res.writeHead(403).end();
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
const require = createRequire(import.meta.url);
try {
  browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ['--no-sandbox'] });
  if (shots) await mkdir(shots, { recursive: true });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(base) || req.url().startsWith('data:')
    ? req.continue() : req.abort());
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const load = async (route) => {
    const res = await page.goto(base + route, { waitUntil: 'load', timeout: 25000 });
    assert.equal(res.status(), 200, route);
  };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 880 });
    await load('/');
    const nav = width > 900 ? '.desktop-nav' : '.mobile-nav';
    if (width <= 900) {
      await page.waitForSelector('.menu-toggle', { visible: true });
      await page.click('.menu-toggle');
    }
    await page.waitForSelector(nav + ' a[href="/ferramentas/"]', { visible: true });
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click(nav + ' a[href="/ferramentas/"]')]);
    assert.equal(new URL(page.url()).pathname, '/ferramentas/');
    assert.equal(await overflow(), false, 'catalogue viewport ' + width);
    assert.equal(await page.$eval(nav + ' a[href="/ferramentas/"]', el => el.getAttribute('aria-current')), 'page');
    if (shots && [390, 1440].includes(width)) {
      await page.screenshot({ path: resolve(shots, 'catalogue-' + width + '.png') });
    }
  }

  const count = await page.$$eval('[data-tool-card]', cards => cards.length);
  assert.ok(count >= 25, count);
  await page.waitForSelector('[data-tool-search]', { visible: true });
  await page.type('#ts-query', '  REEQUILIBRIO  ');
  assert.deepEqual(await page.$$eval('[data-tool-card]:not([hidden])', nodes => nodes.map(n => n.dataset.toolCard)), ['reequilibrio']);
  await page.click('[data-search-clear]');
  assert.equal(await page.$$eval('[data-tool-card]:not([hidden])', nodes => nodes.length), count);
  await page.$eval('#ts-query', el => {
    el.value = '<img src=x onerror=alert(1)>';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.match(await page.$eval('[data-search-status]', el => el.textContent), /Nenhuma ferramenta/);
  assert.equal(await page.$$eval('[data-tool-card]:not([hidden])', nodes => nodes.length), 0);
  await page.click('[data-search-clear]');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await window.axe.run('.tool-showcase', {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
  assert.deepEqual(violations, [], JSON.stringify(violations));

  // Declining/accepting analytics is not required to copy or share. A denied
  // clipboard must expose a selectable static URL with neither input nor ref.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } });
    Object.defineProperty(navigator, 'share', { value: undefined });
  });
  await load('/ferramentas/?ref=first_______0001&cnpj=private-example#ferramenta-ifc-excel');
  assert.equal(await page.evaluate(() => new URL(location.href).searchParams.has('ref')), false);
  const key = 'confenge-tool-referral-v1';
  assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).ref, key), 'first_______0001');
  await page.click('[data-tool-card="ifc-excel"] [data-card-share]');
  const safe = new URL(await page.$eval('.ts-card-share-url', el => el.value));
  assert.equal(safe.hash, '#ferramenta-ifc-excel');
  assert.equal(safe.hostname, 'confenge.com.br');
  assert.equal(safe.searchParams.has('ref') || safe.searchParams.has('cnpj'), false);
  assert.equal(await page.evaluate(() => document.activeElement.className), 'ts-card-share-url');

  await page.click('[data-share-copy]');
  assert.equal(await page.$eval('.tool-share-manual', el => el.hidden), false);
  assert.match(await page.$eval('.tool-share-status', el => el.textContent), /copie/);
  const wa = await page.$eval('.tool-share-social a[href^="https://wa.me"]', el => {
    const before = el.href;
    el.addEventListener('click', event => event.preventDefault(), { once: true });
    el.click();
    return [before, el.href];
  });
  assert.equal(wa[0], wa[1], 'a share must not gain a contact protocol');
  assert.match(new URL(wa[1]).searchParams.get('text'), /utm_source=whatsapp/);
  const trackedShare = await page.evaluate(() => window.dataLayer?.filter(event => event.cta_id === 'tool-share-wa-catalogo'));
  assert.equal(trackedShare?.length, 1, JSON.stringify(trackedShare));
  assert.equal(trackedShare[0].event, 'cta_click');
  assert.equal(trackedShare[0].destination_type, 'external');
  assert.doesNotMatch(JSON.stringify(trackedShare), /private-example|first_______0001/);
  await load('/ferramentas/?ref=other_______0002');
  assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).ref, key), 'first_______0001');
  await page.evaluate(k => localStorage.removeItem(k), key);
  await load('/ferramentas/?ref=first_______0001&ref=other_______0002');
  assert.equal(await page.evaluate(k => localStorage.getItem(k), key), null, 'ambiguous referral must be ignored');
  assert.equal(await page.evaluate(() => location.search), '');
  assert.ok(events.every(e => !/private-example|first_______0001|other_______0002/.test(e.body)),
    'share and referral traffic must not leak query data to analytics');

  await load('/ferramentas/?utm_medium=referral&utm_campaign=ferramentas&utm_source=whatsapp&cnpj=private-example');
  const landing = await page.evaluate(() => window.dataLayer?.find(e => e.event === 'page_view'));
  assert.equal(landing?.source_asset_id, 'tool-share-wa');
  assert.doesNotMatch(JSON.stringify(landing), /private-example|utm_source/);
  await load('/avaliacao-imoveis-urbanos/inferencia/');
  if (shots) await page.screenshot({ path: resolve(shots, 'modela-1440.png') });
  assert.equal(await overflow(), false);
  assert.equal(await page.$eval('link[rel="canonical"]', el => el.href), 'https://confenge.com.br/avaliacao-imoveis-urbanos/inferencia/');
  assert.deepEqual(errors, []);

  await page.setJavaScriptEnabled(false);
  await page.setViewport({ width: 320, height: 800 });
  await load('/');
  await page.waitForSelector('.mobile-nav a[href="/ferramentas/"]', { visible: true });
  await load('/ferramentas/');
  assert.equal(await overflow(), false);
  assert.equal(await page.$$eval('.ts-card-action[href]', nodes => nodes.length), count);
  assert.equal(await page.$eval('[data-tool-search]', el => el.hidden), true);
  assert.equal(await page.$$eval('.tool-share-social a[href]', nodes => nodes.length), 2);
  console.log('Browser catalogue: desktop/mobile menu, no-JS, axe, search, referral and share fallback OK.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
