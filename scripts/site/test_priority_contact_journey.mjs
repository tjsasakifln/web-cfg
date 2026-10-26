/** Real pages and handlers, isolated storage (memory substitutes on Windows), no external I/O. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const site = resolve(root, process.env.SITE_ROOT || '_site');
const evidence = resolve(root, 'build/reports/priority-contact');
mkdirSync(evidence, { recursive: true });
const storage = mkdtempSync(join(tmpdir(), 'confenge-priority-test-'));
const memorySubstitute = process.platform === 'win32';
const storageProof = memorySubstitute ? 'isolated memory substitutes (Windows); filesystem tested separately on Linux' : 'isolated POSIX filesystem';
process.env.NODE_ENV = 'test';
process.env.CONFENGE_STORAGE_BACKEND = memorySubstitute ? 'memory' : 'filesystem';
process.env.CONFENGE_STORAGE_DIR = storage;
for (const key of ['LEAD_STORE', 'LEAD_STORE_DIR', 'LEAD_STORE_HTTP_URL', 'NTFY_URL', 'NTFY_TOKEN', 'NTFY_TOPIC', 'FORMSUBMIT_URL', 'RESEND_API_KEY', 'OPS_WEBHOOK_URL', 'CONFENGE_INBOUND_WEBHOOK_URL', 'CONFENGE_INBOUND_WEBHOOK_SECRET', 'TURNSTILE_SECRET_KEY', 'LEAD_REQUIRE_TURNSTILE']) delete process.env[key];
// The browser transport goes only to this process. Any accidental server export fails.
globalThis.fetch = async () => { throw new Error('external_network_disabled_in_test'); };
const require = createRequire(import.meta.url);
const lead = require('../../netlify/functions/lead.cjs');
const collect = require('../../netlify/functions/collect.cjs');
const { createStore, MemoryStore } = require('../../netlify/functions/lib/lead-store.cjs');
const { createHostBackend } = require('../../netlify/functions/lib/storage-config.cjs');
const memoryLeads = new MemoryStore();
const memoryAnalytics = new Map();
if (memorySubstitute) {
  lead.setStoreForTests(memoryLeads);
  collect._setBlobStoreForTests({
    async setJSON(key, value) { memoryAnalytics.set(key, value); },
    async set(key, value, options = {}) {
      if (options.onlyIfNew && memoryAnalytics.has(key)) return { modified: false };
      memoryAnalytics.set(key, JSON.parse(value));
      return { modified: true };
    },
  });
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const posts = [], collects = [], backendResponses = [];
let failAfterPersist = true;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/web/lead' || url.pathname === '/api/web/collect') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const isLead = url.pathname.endsWith('/lead');
      const input = { httpMethod: req.method, headers: { ...req.headers, origin: 'https://confenge.com.br', 'x-forwarded-for': '203.0.113.70' }, body };
      const result = await (isLead ? lead.handler : collect.handler)(input);
      if (isLead) {
        posts.push(JSON.parse(body));
        backendResponses.push(JSON.parse(result.body));
        // Simulate the important ambiguous failure: storage succeeded, proxy lost reply.
        if (failAfterPersist && result.statusCode === 201) {
          failAfterPersist = false;
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end('{"error":"upstream_reply_lost"}');
          return;
        }
      } else collects.push({ request: JSON.parse(body), response: JSON.parse(result.body), status: result.statusCode });
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
      return;
    }
    let path = resolve(site, `.${decodeURIComponent(url.pathname)}`);
    if (path !== site && !path.startsWith(site + sep)) { res.writeHead(403); res.end(); return; }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path) && existsSync(path + '.html')) path += '.html';
    if (!existsSync(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(readFileSync(path));
  } catch (error) { res.writeHead(500); res.end(String(error.message)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-background-networking', '--no-first-run'] });
const routes = [
  '/conteudos/aditivo-empreitada-por-preco-global/',
  '/conteudos/mobilizacao-desmobilizacao-orcamento-obra/',
  '/conteudos/bdi-diferenciado-obra-publica/',
  '/medicoes-glosas-obras-publicas/',
  '/conteudos/sinapi-desonerado-nao-desonerado/',
];
const checks = [], errors = [];
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(base + '/') || req.url().startsWith('data:') ? req.continue() : req.abort());
  page.on('pageerror', err => errors.push(err.message));
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle0' });
      assert.equal(response.status(), 200);
      const meta = await page.evaluate(() => ({
        title: document.title,
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        description: document.querySelector('meta[name="description"]')?.content,
        h1: document.querySelectorAll('h1').length,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        links: [...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')),
      }));
      assert.equal(meta.canonical, 'https://confenge.com.br' + route);
      assert.equal(meta.h1, 1);
      assert.ok(meta.title && meta.description);
      assert.equal(meta.overflow, false, `horizontal overflow: ${route} ${width}`);
      assert.ok(meta.links.some(href => /(?:#captura-pilar|#contato|wa\.me)/.test(href)), route);
      for (const href of meta.links.filter(href => href.startsWith('/') && !href.startsWith('//'))) {
        const target = new URL(href, base);
        let local = resolve(site, '.' + target.pathname);
        assert.ok(existsSync(local) || existsSync(local + '.html'), `missing contact/content link ${href}`);
      }
      const shot = `${route.split('/').filter(Boolean).at(-1)}-${width}.png`;
      await page.screenshot({ path: join(evidence, shot), fullPage: true });
      await page.screenshot({ path: join(evidence, shot.replace('.png', '-fold.png')) });
      const contactRegion = await page.$(route === '/medicoes-glosas-obras-publicas/' ? '#captura-pilar' : '.lead-inline');
      if (contactRegion) {
        await contactRegion.evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 100, behavior: 'instant' }));
        await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
        await page.screenshot({ path: join(evidence, shot.replace('.png', '-contact.png')) });
      }
      checks.push({ route, width, status: 'passed', screenshot: shot });
    }
  }
  // Start on the actual priority article and follow its existing specialist capture link.
  const entry = routes[0];
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(base + entry, { waitUntil: 'networkidle0' });
  const contactSelector = 'main a[href*="/aditivos-obras-publicas/#captura-pilar"]';
  await page.waitForSelector(contactSelector);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click(contactSelector)]);
  const form = 'form[data-receipt-required="true"]';
  await page.waitForSelector(`${form}[data-form-ready="true"]`);
  await page.click(`${form} button[type="submit"]`);
  assert.equal(posts.length, 0, 'invalid form must not post');
  await page.type(`${form} [name="nome"]`, 'QA Fluxo Isolado');
  await page.type(`${form} [name="email"]`, 'journey@example.test');
  await page.type(`${form} [name="mensagem"]`, 'Contexto reservado somente para teste local.');
  await page.click(`${form} [name="consentimento"]`);
  await page.evaluate(selector => {
    const f = document.querySelector(selector);
    f.requestSubmit(); f.requestSubmit();
  }, form);
  await page.waitForFunction(() => document.querySelector('.form-status')?.textContent.includes('confirmação'));
  assert.equal(posts.length, 1, 'double submit must make one request');
  const firstId = backendResponses[0].lead_id;
  assert.ok(firstId, 'real handler must confirm persisted receipt');
  const store = memorySubstitute ? memoryLeads : await createStore();
  assert.ok(await store.get(firstId), 'record must exist in selected isolated store despite lost reply');
  const persistedBeforeRetry = (await store.list()).length;
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click(`${form} button[type="submit"]`),
  ]);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].idempotency_key, posts[1].idempotency_key);
  assert.equal(backendResponses[1].lead_id, firstId);
  assert.equal((await store.list()).length, persistedBeforeRetry);
  const record = await store.get(firstId);
  assert.ok(JSON.stringify(record).includes(entry), 'article first-touch must survive contact');
  assert.ok(JSON.stringify(record).includes('aditivos-obras-publicas'), 'service context must survive');
  assert.ok(page.url().includes('/obrigado'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const analyticsText = JSON.stringify(collects.map(row => row.request));
  for (const personal of ['QA Fluxo Isolado', 'journey@example.test', 'Contexto reservado']) assert.equal(analyticsText.includes(personal), false);
  assert.ok(collects.some(row => row.status === 202 || row.status === 200), 'real collector must accept browser events');
  const analyticsRecords = memorySubstitute ? memoryAnalytics.size : createHostBackend(process.env).backend.namespace('analytics-events').list().length;
  assert.ok(analyticsRecords > 0, 'collector must write accepted events to the selected isolated store');
  assert.deepEqual(errors, [], 'browser JS errors');
  checks.push({ test: 'article_to_real_handler_isolated_storage', status: 'passed', assertions: ['validation', 'first_touch_and_service_context', 'double_submit', 'lost_reply_after_persistence', 'retry_same_receipt', 'no_duplicate', 'collector_receipt', 'no_pii_in_analytics'] });
  writeFileSync(join(evidence, 'result.json'), JSON.stringify({ status: 'passed', environment: storageProof, external_network: 'disabled', production_proven: false, checks, requests: { lead: posts.length, collect: collects.length }, browser_errors: errors }, null, 2));
  console.log('PRIORITY_CONTACT_JOURNEY_OK', JSON.stringify({ layouts: 10, leadRequests: posts.length, collectorBatches: collects.length }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  assert.ok(resolve(storage).startsWith(resolve(tmpdir()) + sep + 'confenge-priority-test-'), 'cleanup must stay inside this test temporary directory');
  rmSync(storage, { recursive: true, force: true });
}
