// Development contract: real page, service handler and HostFileBackend.
// The payment provider is an in-process fixture. External requests are blocked.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from '../../scripts/site/resolve_chrome.mjs';

const require = createRequire(import.meta.url);
const { createServiceHttp } = require('../../runtime/project-commerce/service-http.cjs');
const { readOffer, quote } = require('../../runtime/project-commerce/service-policy.cjs');
const { createMercadoPago } = require('../../runtime/tools-commerce/mercado-pago.cjs');
const root = path.resolve(import.meta.dirname, '../..');
const publicRoot = fs.existsSync(path.join(root, '_site/projetos-prontos/index.html')) ? path.join(root, '_site') : root;
const reports = path.join(root, 'build/reports/project-services');
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'confenge-project-service-browser-'));
fs.chmodSync(storageRoot, 0o700);
const downloads = path.join(storageRoot, 'downloads');
fs.mkdirSync(downloads, { mode: 0o700 });
fs.mkdirSync(reports, { recursive: true });
const STORAGE_KEY = 'confenge.project-services.receipts.v1';
const offer = readOffer();
const calls = [], analytics = [], errors = [], incidents = [], accessibility = [], screenshots = [], checks = [], receiptRestorations = [];
const facts = new Map();
let time = Date.now(), creates = 0, providerResponseLost = false, clientResponseLost = false, statusTransportUnavailable = false;
let app, base, browser, currentPage;
const config = { mode: 'sandbox', configured: true, purchasesEnabled: true,
  origin: '', storageRoot, accessToken: 'local-fixture-never-a-real-token',
  webhookSecret: 'local-fixture-webhook-secret-only', sellerId: '123', sandboxPayerEmail: 'payer@example.test' };
const signatureParser = createMercadoPago({ ...config, fetchImpl: () => { throw Error('EXTERNAL_NETWORK_FORBIDDEN'); } });
const provider = {
  async verifySellerEnvironment() {},
  parseWebhook: signatureParser.parseWebhook,
  async createCheckoutOrder(input) {
    creates++;
    const browserReceipt = await activeReceipt(currentPage);
    assert.equal(browserReceipt?.id, input.id, 'the buyer keeps private recovery access before the provider is contacted');
    assert.match(browserReceipt?.receiptToken || '', /^[A-Za-z0-9_-]{43}$/);
    const stored = app.dependencies(config).ledger.orders.get(input.id);
    assert.equal(stored.status, 'creating', 'the real durable record precedes any provider call');
    assert.equal(stored.quote.amountCents, input.amountCents);
    assert.equal(input.items.reduce((sum, item) => sum + item.amountCents, 0), input.amountCents);
    assert.equal(input.returnUrl, `https://confenge.com.br/projetos-prontos/?pedido=${input.id}#pedido`);
    const providerId = `ORD${String(creates).padStart(12, '0')}`;
    const fact = { providerId, reference: input.id, amountCents: input.amountCents,
      currency: 'BRL', state: 'pending', paymentFlow: 'checkout', providerStatus: 'created',
      providerUpdatedAt: time, checkoutUrl: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture-${creates}` };
    facts.set(providerId, fact);
    if (providerResponseLost) { providerResponseLost = false; throw Error('SIMULATED_PROVIDER_RESPONSE_LOST'); }
    return structuredClone(fact);
  },
  async getOrder(id) { return structuredClone(facts.get(id)); },
  async findOrderId({ reference }) { return [...facts.values()].find(fact => fact.reference === reference)?.providerId || null; },
};
const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/api/web/project-orders') {
      let body = ''; for await (const chunk of req) body += chunk;
      const q = Object.fromEntries(url.searchParams);
      const event = { httpMethod: req.method, queryStringParameters: q,
        multiValueQueryStringParameters: Object.fromEntries([...new Set(url.searchParams.keys())].map(key => [key, url.searchParams.getAll(key)])),
        headers: req.headers, requestContext: { identity: { sourceIp: '192.0.2.21' } }, ...(body ? { body } : {}) };
      let result = await app.api(event);
      if (q.op === 'service-status' && statusTransportUnavailable) {
        result = { ...result, statusCode: 503, body: JSON.stringify({ error: 'PAYMENT_UNAVAILABLE' }) };
      }
      calls.push({ op: q.op, status: result.statusCode, body: body ? JSON.parse(body) : null,
        response: JSON.parse(result.body), hasAuthorization: Boolean(req.headers.authorization), url: req.url });
      if (q.op === 'service-checkout' && clientResponseLost && result.statusCode < 300) {
        clientResponseLost = false; req.socket.destroy(); return;
      }
      res.writeHead(result.statusCode, result.headers); res.end(result.body); return;
    }
    if (url.pathname.endsWith('/collect')) {
      let body = ''; for await (const chunk of req) body += chunk;
      analytics.push(body); send(res, 200, { ok: true }); return;
    }
    if (url.pathname.includes('/api/web/') || url.pathname.includes('/.netlify/functions/')) {
      send(res, 200, { enabled: false }); return;
    }
    let file = path.resolve(publicRoot, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(publicRoot + path.sep)) { res.writeHead(404); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(file).pipe(res);
  } catch (error) { errors.push(`fixture-server:${error.message}`); if (!res.headersSent) send(res, 500, { error: 'FIXTURE_FAILED' }); else res.end(); }
});

const contents = (page, selector) => page.$eval(selector, node => node.textContent);
const waitText = (page, selector, value) => page.waitForFunction((selector, value) => document.querySelector(selector)?.textContent.includes(value), {}, selector, value);
const responseFor = (page, op) => page.waitForResponse(response => new URL(response.url()).pathname === '/api/web/project-orders' && new URL(response.url()).searchParams.get('op') === op);
async function setInput(page, selector, value) {
  await page.focus(selector); await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace'); await page.type(selector, String(value));
}
async function newPage(suffix = '') {
  const page = await browser.newPage(); currentPage = page;
  page.setDefaultTimeout(15000);
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const allowed = request.url().startsWith(base + '/') || /^(?:data:|blob:)/.test(request.url());
    (allowed ? request.continue() : request.abort()).catch(() => {});
  });
  await page.evaluateOnNewDocument(() => localStorage.setItem('confenge_google_analytics_consent', 'denied'));
  await page.goto(base + '/projetos-prontos/' + suffix, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !document.querySelector('#rp-config-fields').disabled && !document.querySelector('#rp-payment-availability').textContent.includes('Conferindo'));
  return page;
}
async function configureAndReview(page, { area = 100, deadline = 60, structure = false } = {}) {
  await setInput(page, '#rp-area', area);
  await page.select('#rp-terrain', 'flat-or-gentle');
  if (structure) await page.click('#rp-estrutura');
  await page.click(`[data-deadline="${deadline}"]`);
  const response = responseFor(page, 'service-quote');
  await page.click('#rp-review-button');
  assert.equal((await response).status(), 200);
  await page.waitForSelector('#rp-purchase-details:not([hidden])');
  await page.waitForFunction(() => !document.querySelector('#rp-review-button').disabled);
}
async function fillBuyer(page, name = 'Comprador de ensaio') {
  await setInput(page, '#rp-customer-name', name);
  await setInput(page, '#rp-customer-email', 'browser-project@example.test');
  await setInput(page, '#rp-customer-phone', '48999999999');
  await setInput(page, '#rp-customer-city', 'Florianópolis');
  await page.select('#rp-customer-state', 'SC');
  await page.select('#rp-condominium', 'Não');
  await setInput(page, '#rp-lot-measures', '10 x 25 m');
  await setInput(page, '#rp-reference', 'Rascunho próprio de ensaio para a casa.');
}
async function accept(page) {
  for (const selector of ['#rp-accept-terms', '#rp-accept-privacy']) {
    if (!await page.$eval(selector, node => node.checked)) await page.click(selector);
  }
}
async function activeReceipt(page) {
  return page.evaluate(key => { const records = JSON.parse(sessionStorage.getItem(key) || '{}'); return records[records.active] || null; }, STORAGE_KEY);
}
async function screenshot(page, label, selector = null) {
  const file = `${label}.png`;
  if (selector) await (await page.$(selector)).screenshot({ path: path.join(reports, file) });
  else await page.screenshot({ path: path.join(reports, file), fullPage: true });
  screenshots.push(file);
}
async function audit(page, label, width, height) {
  await page.setViewport({ width, height });
  const overflow = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('main *')].filter(node => {
      const rect = node.getBoundingClientRect(); return rect.width && (rect.right > innerWidth + 1 || rect.left < -1);
    }).slice(0, 12).map(node => ({ tag: node.tagName, id: node.id, class: node.className })) }));
  assert(overflow.content <= overflow.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(overflow)}`);
  if (!await page.evaluate(() => Boolean(globalThis.axe))) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const findings = await page.evaluate(async () => {
    const result = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
    return result.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help,
      nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })) }));
  });
  accessibility.push({ label, width, height, overflow, violations: findings });
  await screenshot(page, label);
  assert.deepEqual(findings.filter(finding => ['serious', 'critical'].includes(finding.impact)), [], `${label}: serious accessibility regressions`);
}
async function importReceipt(page, file) {
  const expectedId = JSON.parse(fs.readFileSync(file, 'utf8')).id;
  const restoration = { expectedOrderId: expectedId, visibilityBefore: await page.evaluate(() => document.visibilityState) };
  receiptRestorations.push(restoration);
  // Switching back from the other buyer tab is a real UI action. Puppeteer's
  // default waitForFunction uses animation frames, which pause in hidden tabs.
  await page.bringToFront();
  restoration.visibilityAfter = await page.evaluate(() => document.visibilityState);
  assert.equal(restoration.visibilityAfter, 'visible', 'recovery is exercised in the active buyer tab');
  await page.$eval('#rp-restore-details', node => { node.open = true; });
  const response = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/web/project-orders' && url.searchParams.get('op') === 'service-status' && url.searchParams.get('id') === expectedId;
  });
  await (await page.$('#rp-restore-file')).uploadFile(file);
  restoration.apiStatus = (await response).status();
  assert.equal(restoration.apiStatus, 200, 'the imported order is authorized by the actual handler');
  await waitText(page, '#rp-restore-message', 'Acesso recuperado');
  restoration.recoveredOrderId = (await activeReceipt(page))?.id;
  assert.equal(restoration.recoveredOrderId, expectedId, 'the imported order replaces the previous active receipt');
  assert((await contents(page, '#rp-order-facts')).includes(expectedId), 'the displayed order matches the imported receipt');
}
async function authoritativePaid(id) {
  time += 20_000;
  const fact = [...facts.values()].find(fact => fact.reference === id);
  Object.assign(fact, { state: 'paid', providerStatus: 'processed', providerUpdatedAt: time });
  const requestId = randomUUID(), ts = String(Math.floor(time / 1000));
  const signature = createHmac('sha256', config.webhookSecret).update(`id:${fact.providerId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
  const response = await app.webhook({ httpMethod: 'POST', body: '{}', queryStringParameters: { 'data.id': fact.providerId },
    headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` } });
  assert.equal(response.statusCode, 200);
}

const report = { schema: 'confenge.project-services.browser/v1', ok: false,
  source: publicRoot === root ? 'source' : 'public-artifact', environment: 'local-real-handler-fake-provider',
  realPayments: false, externalNetwork: false, analyticsConsent: 'denied', checks, screenshots, accessibility, receiptRestorations, uncaughtErrors: errors,
  pageSha256: createHash('sha256').update(fs.readFileSync(path.join(publicRoot, 'projetos-prontos/index.html'))).digest('hex') };
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`; config.origin = base;
  app = createServiceHttp({ config, offerLoader: () => offer, providerFactory: () => provider, clock: () => time,
    onIncident: code => incidents.push(code) });
  browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  const page = await newPage();
  await audit(page, 'offer-desktop', 1440, 1000);
  await audit(page, 'offer-mobile', 390, 844);
  await page.setViewport({ width: 1440, height: 1000 });
  checks.push('desktop-mobile-usable-and-accessible');

  await configureAndReview(page, { area: 120, deadline: 30, structure: true });
  const reviewed = calls.filter(call => call.op === 'service-quote').at(-1).response;
  assert.equal(reviewed.amountCents, 433680);
  assert.equal(reviewed.amountCents, quote({ areaM2: 120, deadlineDays: 30, disciplines: ['arquitetura', 'estrutura'],
    floors: 1, buildingType: 'new-residential', terrain: 'flat-or-gentle' }, offer).amountCents);
  assert.match(await contents(page, '#rp-total'), /4\.336,80/);
  assert.match(await contents(page, '#rp-confirmed-summary'), /4\.336,80/);
  await fillBuyer(page, ' a ');
  assert.equal(await page.$eval('#rp-accept-terms', node => node.checked), false);
  assert.equal(await page.$eval('#rp-accept-privacy', node => node.checked), false);
  await page.click('#rp-pay-button');
  assert.equal(calls.filter(call => call.op === 'service-checkout').length, 0, 'missing consent must not reach checkout');
  await accept(page);
  let result = responseFor(page, 'service-checkout'); await page.click('#rp-pay-button');
  assert.equal((await result).status(), 422, 'server checks trimmed name');
  await waitText(page, '#rp-checkout-message', 'Confira os dados');
  assert.equal(await activeReceipt(page), null, 'a definitive initial refusal does not trap a new attempt');
  assert.equal(creates, 0);
  await setInput(page, '#rp-customer-name', 'Comprador de ensaio');
  result = responseFor(page, 'service-checkout'); await page.click('#rp-pay-button');
  assert.equal((await result).status(), 201);
  await waitText(page, '#rp-order-state', 'Pagamento ainda não confirmado');
  const receiptA = await activeReceipt(page);
  const storedA = app.dependencies(config).ledger.orders.get(receiptA.id);
  assert.equal(storedA.status, 'pending'); assert.equal(storedA.quote.amountCents, reviewed.amountCents);
  assert.equal(storedA.quote.quoteHash, reviewed.quoteHash);
  assert(!JSON.stringify(storedA).includes(receiptA.receiptToken), 'durable server record stores only a hash of the credential');
  assert.equal(creates, 1);
  assert.match(await page.$eval('#rp-order-pay', node => node.href), /^https:\/\/www\.mercadopago\.com\.br\/checkout\//);
  checks.push('server-priced-disciplines-and-deadline', 'explicit-consent', 'correctable-first-422', 'durable-pending-before-payment');
  await screenshot(page, 'pending-order-desktop', '#pedido');

  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await page.click('#rp-order-download');
  const accessFile = path.join(downloads, `confenge-acesso-pedido-${receiptA.id}.json`);
  for (let attempt = 0; !fs.existsSync(accessFile) && attempt < 60; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert(fs.existsSync(accessFile), 'the real download creates the recovery file');
  const access = JSON.parse(fs.readFileSync(accessFile, 'utf8'));
  assert.deepEqual(access, { schema: 'confenge.project-service-receipt/1', id: receiptA.id, receiptToken: receiptA.receiptToken });
  const wrong = await page.evaluate(async ({ id, token }) => {
    const response = await fetch(`/api/web/project-orders?op=service-status&id=${id}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, value: await response.json() };
  }, { id: receiptA.id, token: randomBytes(32).toString('base64url') });
  assert.equal(wrong.status, 404, 'wrong credentials get the non-enumerating denial');
  assert.equal(wrong.value.error, 'ORDER_NOT_FOUND');
  await page.goto(`${base}/projetos-prontos/?pedido=${receiptA.id}&status=approved&collection_status=approved#pedido`, { waitUntil: 'networkidle0' });
  await waitText(page, '#rp-order-state', 'Pagamento ainda não confirmado');
  assert.equal((await activeReceipt(page)).id, receiptA.id);
  assert.equal(app.dependencies(config).ledger.orders.get(receiptA.id).status, 'pending');
  checks.push('download-private-access-file', 'wrong-token-denied', 'reload-restores-session', 'forged-approved-return-does-not-pay');

  await page.$eval('#rp-order-support', node => { node.open = true; });
  await page.select('#rp-support-kind', 'cancellation');
  result = responseFor(page, 'service-support'); await page.click('#rp-support-submit');
  assert.equal((await result).status(), 201);
  await waitText(page, '#rp-support-status', 'O registro não confirma o estorno');
  assert.equal(app.dependencies(config).ledger.orders.get(receiptA.id).requests.length, 1);
  assert.equal(app.dependencies(config).ledger.orders.get(receiptA.id).requests[0].message, '');
  assert.equal(app.dependencies(config).ledger.orders.get(receiptA.id).status, 'pending');
  result = responseFor(page, 'service-support'); await page.click('#rp-support-submit');
  assert.equal((await result).status(), 200);
  assert.equal(app.dependencies(config).ledger.orders.get(receiptA.id).requests.length, 1, 'repeating support is idempotent');
  checks.push('cancellation-without-reason', 'support-real-idempotent-receipt-not-refund');
  await page.evaluate(key => sessionStorage.removeItem(key), STORAGE_KEY);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#pedido', node => node.hidden), true);
  await importReceipt(page, accessFile);
  await waitText(page, '#rp-order-state', 'Pagamento ainda não confirmado');
  assert.equal((await activeReceipt(page)).id, receiptA.id);
  checks.push('recovery-file-restores-real-server-order');

  await authoritativePaid(receiptA.id);
  await page.click('#rp-order-refresh');
  await waitText(page, '#rp-order-state', 'Pagamento confirmado pelo Mercado Pago');
  assert.equal(await page.$eval('#rp-order-pay', node => node.hidden), true);
  await audit(page, 'paid-order-mobile', 390, 844);
  checks.push('signed-webhook-and-server-confirm-payment');

  const uncertain = await newPage();
  await configureAndReview(uncertain); await fillBuyer(uncertain); await accept(uncertain);
  providerResponseLost = true;
  result = responseFor(uncertain, 'service-checkout'); await uncertain.click('#rp-pay-button');
  assert.equal((await result).status(), 202);
  await waitText(uncertain, '#rp-order-state', 'precisa de conferência');
  const receiptB = await activeReceipt(uncertain);
  assert.equal(creates, 2);
  assert.equal(await uncertain.$eval('#rp-order-pay', node => node.hidden), true);
  await accept(uncertain); await uncertain.click('#rp-pay-button');
  await waitText(uncertain, '#rp-checkout-message', 'já iniciou um pedido');
  assert.equal(creates, 2, 'uncertain creation cannot start a second charge');
  time += 20_000;
  await uncertain.waitForFunction(() => !document.querySelector('#rp-order-refresh').disabled);
  await uncertain.click('#rp-order-refresh');
  await waitText(uncertain, '#rp-order-state', 'Pagamento ainda não confirmado');
  assert.equal(creates, 2);
  checks.push('202-preserves-order', 'uncertain-retry-never-charges-twice', 'reference-reconciliation-recovers-checkout');
  await screenshot(uncertain, 'reconciled-order-desktop', '#pedido');

  // A different imported order cannot inherit the previous order's support receipt.
  const accessB = path.join(storageRoot, 'access-b.json');
  fs.writeFileSync(accessB, JSON.stringify({ schema: 'confenge.project-service-receipt/1', id: receiptB.id, receiptToken: receiptB.receiptToken }), { mode: 0o600 });
  currentPage = page;
  await importReceipt(page, accessB);
  assert.equal(await contents(page, '#rp-support-status'), '');
  assert.equal(await page.$eval('#rp-support-kind', node => node.value), 'support');
  checks.push('import-does-not-leak-previous-support-state');

  // A response lost after the durable checkout must keep the same private access,
  // even when a later corrected form is invalid before server persistence lookup.
  const lost = await newPage();
  await configureAndReview(lost); await fillBuyer(lost); await accept(lost);
  clientResponseLost = true; await lost.click('#rp-pay-button');
  await waitText(lost, '#rp-checkout-message', 'Não foi possível conferir a resposta');
  const receiptC = await activeReceipt(lost); assert(receiptC);
  assert.equal(creates, 3);
  statusTransportUnavailable = true;
  await lost.reload({ waitUntil: 'networkidle0' });
  await waitText(lost, '#rp-order-state', 'temporariamente indisponível');
  await configureAndReview(lost); await fillBuyer(lost, ' a '); await accept(lost);
  result = responseFor(lost, 'service-checkout'); await lost.click('#rp-pay-button');
  assert.equal((await result).status(), 422);
  await waitText(lost, '#rp-checkout-message', 'Confira os dados');
  assert.equal((await activeReceipt(lost)).id, receiptC.id, 'validation after an earlier uncertain creation keeps the original access');
  assert.equal((await activeReceipt(lost)).receiptToken, receiptC.receiptToken);
  assert.equal(creates, 3);
  statusTransportUnavailable = false;
  await lost.click('#rp-order-refresh');
  await waitText(lost, '#rp-order-state', 'Pagamento ainda não confirmado');
  assert.equal((await activeReceipt(lost)).id, receiptC.id);
  assert.equal(creates, 3);
  checks.push('lost-client-response-keeps-access-and-recovers-without-recharge', '422-after-uncertainty-keeps-original-private-access');

  config.purchasesEnabled = false;
  const unavailable = await newPage();
  await waitText(unavailable, '#rp-payment-availability', 'temporariamente indisponível');
  await configureAndReview(unavailable);
  assert.equal(await unavailable.$eval('#rp-pay-button', node => node.disabled), true);
  assert.equal(creates, 3);
  assert.match(await contents(unavailable, '#rp-confirmed-summary'), /1\.601,75/);
  await screenshot(unavailable, 'payment-unavailable-desktop', '#monte-seu-projeto');
  checks.push('unavailable-allows-quote-without-charge');

  await unavailable.goto(base + '/projetos-prontos/condicoes/', { waitUntil: 'networkidle0' });
  await audit(unavailable, 'conditions-mobile', 390, 844);
  assert.match(await contents(unavailable, 'main'), /terceiro dia útil/);
  assert.deepEqual(errors, [], 'no uncaught page or fixture errors');
  const sensitive = [receiptA.receiptToken, receiptB.receiptToken, receiptC.receiptToken, 'browser-project@example.test', 'Comprador de ensaio'];
  for (const value of sensitive) {
    assert(!analytics.join('\n').includes(value), 'private data cannot enter analytics');
    assert(!calls.some(call => call.url.includes(value)), 'private data cannot enter an API URL');
  }
  checks.push('private-data-absent-from-analytics-with-consent-denied-and-from-urls', 'consumer-conditions-mobile-accessible', 'no-script-errors');
  report.ok = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  if (currentPage && !currentPage.isClosed()) {
    try { await screenshot(currentPage, 'failure-current-state'); } catch {}
  }
  throw error;
} finally {
  report.providerCreations = creates;
  report.incidents = incidents;
  // Reports contain outcomes and synthetic IDs only, never secret access files or full customer payloads.
  report.apiOutcomes = calls.map(({ op, status, body, hasAuthorization }) => ({ op, status, hasAuthorization,
    ...(body?.requestId ? { requestId: body.requestId } : {}) }));
  fs.writeFileSync(path.join(reports, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, checks, providerCreations: creates, reports: 'build/reports/project-services', failure: report.failure?.message }));
  await browser?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  fs.rmSync(storageRoot, { recursive: true, force: true });
}
