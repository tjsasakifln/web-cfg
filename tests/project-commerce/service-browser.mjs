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
const calls = [], analytics = [], errors = [], incidents = [], accessibility = [], screenshots = [], checks = [], receiptRestorations = [], reviewGeometry = [], deadlineTouchTargets = [];
const facts = new Map();
let time = Date.now(), creates = 0, providerResponseLost = false, clientResponseLost = false, statusTransportUnavailable = false;
let configTransportUnavailable = false, quoteTransportUnavailable = false, configResponseGate = null;
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
      if (q.op === 'service-config' && configTransportUnavailable) {
        result = { ...result, statusCode: 503, body: JSON.stringify({ error: 'PAYMENT_UNAVAILABLE' }) };
      }
      if (q.op === 'service-quote' && quoteTransportUnavailable) {
        result = { ...result, statusCode: 503, body: JSON.stringify({ error: 'NETWORK_ERROR' }) };
      }
      calls.push({ op: q.op, status: result.statusCode, body: body ? JSON.parse(body) : null,
        response: JSON.parse(result.body), hasAuthorization: Boolean(req.headers.authorization), url: req.url });
      if (q.op === 'service-checkout' && clientResponseLost && result.statusCode < 300) {
        // Keep the transport unavailable through Chromium's automatic retry.
        // The scenario clears this only after the buyer observes the failure.
        req.socket.destroy(); return;
      }
      if (q.op === 'service-config' && configResponseGate) await configResponseGate;
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
const callCount = op => calls.filter(call => call.op === op).length;
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
async function assertPurchaseButtonRecovery() {
  const analyticsBeforeGuidance = analytics.length;
  const guidance = await newPage();
  const posts = [];
  guidance.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  const initialQuotes = callCount('service-quote'), initialCheckouts = callCount('service-checkout');
  assert.equal(await guidance.$eval('#rp-terrain', node => node.value), '');
  assert.equal(await guidance.$eval('#rp-review-button', node => node.disabled), false);
  assert.match(await contents(guidance, '#rp-review-button'), /Revisar minha contratação/);
  await guidance.click('#rp-review-button');
  await guidance.waitForFunction(() => document.activeElement?.id === 'rp-terrain');
  assert.match(await contents(guidance, '#rp-eligibility'), /terreno/i);
  assert.equal(await guidance.$eval('#rp-eligibility', node => !node.hidden && Boolean(node.closest('.rp-summary'))), true,
    'the missing-field explanation stays beside the review action');
  assert.equal(callCount('service-quote'), initialQuotes, 'missing terrain must not request a quote');
  assert.equal(callCount('service-checkout'), initialCheckouts);
  checks.push('missing-terrain-click-guides-buyer-without-requesting-quote');

  await guidance.select('#rp-building-type', 'other');
  await guidance.select('#rp-terrain', 'other');
  await guidance.$eval('#rp-deadline', node => { node.value = '52'; node.dispatchEvent(new Event('input', { bubbles: true })); });
  const selectedConditions = await guidance.evaluate(() => ['#rp-building-type', '#rp-terrain']
    .map(selector => document.querySelector(selector).selectedOptions[0].textContent.trim()));
  assert.match(await contents(guidance, '#rp-review-button'), /Solicitar proposta para meu caso/);
  assert.equal(await guidance.$eval('#rp-review-button', node => node.disabled), false);
  assert.equal((await contents(guidance, '#rp-total')).trim(), 'Sob proposta');
  assert.equal(await guidance.$$eval('[data-discipline-price]', nodes => nodes.length > 0 && nodes.every(node => node.textContent.trim() === 'Sob proposta')), true,
    'out-of-scope inputs do not retain prices offered only for the standard scope');
  assert.equal(await guidance.$eval('#rp-summary-deadline', node => node.previousElementSibling.textContent.trim()), 'Prazo desejado');
  assert.equal(await guidance.$eval('#rp-payment-availability', node => node.hidden), true,
    'a specific proposal must not imply that its payment is already available');
  const privateProposalNote = 'Referência privada de ensaio: proposta-privada@example.test, telefone 48912345678.';
  await guidance.$eval('#mensagem', (node, value) => { node.value = value; }, privateProposalNote);
  await audit(guidance, 'proposal-mobile', 390, 844);
  await screenshot(guidance, 'proposal-summary-mobile', '.rp-summary');
  await guidance.click('#rp-review-button');
  await guidance.waitForFunction(() => document.activeElement?.id === 'nome');
  await guidance.waitForNetworkIdle({ idleTime: 100 });
  const proposalMessage = await guidance.$eval('#mensagem', node => node.value);
  assert.match(proposalMessage, /100\s*m²/);
  assert.match(proposalMessage, /52\s*dias/);
  assert(proposalMessage.includes(privateProposalNote), 'preparing a proposal preserves the buyer\'s existing private context');
  for (const condition of selectedConditions) assert(proposalMessage.includes(condition), `proposal context retains the selected condition: ${condition}`);
  assert.equal(await guidance.$eval('#nome', node => Boolean(node.closest('#contato-projetos'))), true);
  assert.equal(callCount('service-quote'), initialQuotes, 'a specific proposal must not use the standard quote');
  assert.equal(callCount('service-checkout'), initialCheckouts);
  assert.deepEqual(posts.filter(url => url !== `${base}/api/web/collect`), [],
    'guidance must not send a contact form, quote, checkout or any other non-collector POST');
  // Focusing the contact form emits lead_form_start. First-party metadata may
  // flush here, while Google Analytics remains denied. Inspect both sent and
  // queued events so batching cannot hide a false submission or private data.
  const collectedGuidance = analytics.slice(analyticsBeforeGuidance).flatMap(body => {
    const batch = JSON.parse(body);
    assert(Array.isArray(batch.events), 'collector requests use the event batch contract');
    return batch.events;
  });
  const queuedGuidance = await guidance.evaluate(() => (window.dataLayer || []).filter(entry => entry && typeof entry.event === 'string'));
  assert.equal(queuedGuidance.filter(entry => entry.event === 'lead_form_start').length, 1,
    'focusing the buyer name records only one form start');
  const guidanceEvents = [...collectedGuidance, ...queuedGuidance.map(entry => ({ event: entry.event, props: entry }))];
  assert.deepEqual(guidanceEvents.filter(entry => /^(?:lead_|form_|pseo_form_)/.test(entry.event) && entry.event !== 'lead_form_start'), [],
    'proposal guidance cannot claim a form submission, success, persistence or another form advance');
  const privateKey = /(?:^|_)(?:name|nome|email|phone|telefone|tel|whatsapp|message|mensagem|reference|customer|address|endereco|cpf|cnpj|comment|description|text|note)(?:$|_)/i;
  for (const entry of guidanceEvents) {
    assert.equal(entry.props?.source, 'CONFENGE_WEB');
    assert.equal(entry.props?.pii_policy, 'aggregate_allowlist_empty');
    for (const [key, value] of Object.entries(entry.props)) {
      assert(!privateKey.test(key), `form data must not enter aggregate metadata: ${key}`);
      assert(['string', 'number', 'boolean'].includes(typeof value), 'aggregate metadata cannot contain a nested form payload');
    }
  }
  const serializedGuidance = JSON.stringify(guidanceEvents);
  for (const value of [proposalMessage, privateProposalNote, 'proposta-privada@example.test', '48912345678']) {
    assert(!serializedGuidance.includes(value), 'private proposal context must not enter sent or queued analytics');
  }
  report.proposalGuidance = { collectorRequests: posts.length,
    collectedEvents: [...new Set(collectedGuidance.map(entry => entry.event))],
    queuedEvents: [...new Set(queuedGuidance.map(entry => entry.event))],
    submissionRequests: 0, privateMarkersAbsent: true };
  checks.push('out-of-scope-click-prepares-proposal-without-price-or-submission');
  await guidance.close();

  configTransportUnavailable = true;
  let retry;
  try { retry = await newPage(); } finally { configTransportUnavailable = false; }
  assert.equal(calls.filter(call => call.op === 'service-config').at(-1).status, 503);
  assert.equal(await retry.$eval('#rp-review-button', node => node.disabled), false,
    'an unavailable initial config must leave a way to retry');
  assert.match(await contents(retry, '#rp-payment-availability'), /Revisar minha contratação.*tentar novamente/);
  assert.equal(await retry.$eval('#rp-payment-availability', node => !node.hidden && Boolean(node.textContent.trim()) && Boolean(node.closest('.rp-summary'))), true,
    'the initial availability error is visible beside the review action');
  await retry.select('#rp-terrain', 'flat-or-gentle');
  const documentStartedAt = await retry.evaluate(() => performance.timeOrigin);
  const configCallsBeforeRetry = callCount('service-config'), quotesBeforeRetry = callCount('service-quote');
  let releaseConfigResponse;
  configResponseGate = new Promise(resolve => { releaseConfigResponse = resolve; });
  const retryRequest = retry.waitForRequest(request => new URL(request.url()).pathname === '/api/web/project-orders' && new URL(request.url()).searchParams.get('op') === 'service-config');
  const retryConfigResponse = responseFor(retry, 'service-config'), retryQuoteResponse = responseFor(retry, 'service-quote');
  try {
    await retry.click('#rp-review-button');
    await retryRequest;
    assert.equal(await retry.$eval('#rp-review-button', node => node.disabled), true,
      'the retry enters its busy state before the config request completes');
    await retry.click('#rp-review-button');
    assert.equal(callCount('service-quote'), quotesBeforeRetry, 'a quote waits for the authoritative config');
  } finally {
    releaseConfigResponse();
    configResponseGate = null;
  }
  assert.equal((await retryConfigResponse).status(), 200);
  assert.equal((await retryQuoteResponse).status(), 200);
  await retry.waitForSelector('#rp-purchase-details:not([hidden])');
  await retry.waitForNetworkIdle({ idleTime: 100 });
  assert.equal(callCount('service-config'), configCallsBeforeRetry + 1, 'repeated clicks share one config retry');
  assert.equal(callCount('service-quote'), quotesBeforeRetry + 1);
  assert.equal(callCount('service-checkout'), initialCheckouts);
  assert.equal(await retry.evaluate(() => performance.timeOrigin), documentStartedAt, 'recovery does not reload the document');
  checks.push('initial-config-failure-recovers-with-one-busy-retry-without-reload');
  await retry.close();

  const changed = await newPage();
  await configureAndReview(changed);
  await fillBuyer(changed);
  await accept(changed);
  const quotesBeforeEdit = callCount('service-quote');
  await setInput(changed, '#rp-area', 120);
  await changed.click('[data-deadline="30"]');
  assert.equal(await changed.$eval('#rp-pay-button', node => node.disabled), false,
    'editing a reviewed selection keeps an actionable path to a fresh summary');
  assert.match(await contents(changed, '#rp-pay-button'), /Atualizar resumo/);
  assert.equal(await changed.$eval('#rp-accept-terms', node => node.checked), false);
  assert.equal(callCount('service-quote'), quotesBeforeEdit, 'editing does not silently accept another quote');
  quoteTransportUnavailable = true;
  try {
    const failedQuoteResponse = responseFor(changed, 'service-quote');
    await changed.click('#rp-pay-button');
    assert.equal((await failedQuoteResponse).status(), 503);
    await waitText(changed, '#rp-checkout-message', 'Não foi possível conferir a resposta');
    assert.equal(await changed.$eval('#rp-checkout-message', node => !node.hidden), true,
      'a failed summary update explains the error beside the final action');
    assert.equal(await contents(changed, '#rp-checkout-message'), await contents(changed, '#rp-review-message'),
      'both review actions expose the failed request instead of retaining stale guidance');
    await changed.waitForFunction(() => !document.querySelector('#rp-pay-button').disabled);
    assert.match(await contents(changed, '#rp-pay-button'), /Atualizar resumo/);
    assert.equal(callCount('service-checkout'), initialCheckouts);
  } finally { quoteTransportUnavailable = false; }
  const updatedQuoteResponse = responseFor(changed, 'service-quote');
  await changed.click('#rp-pay-button');
  assert.equal((await updatedQuoteResponse).status(), 200);
  await waitText(changed, '#rp-pay-button', 'Criar pedido para pagar');
  await changed.waitForFunction(() => !document.querySelector('#rp-pay-button').disabled);
  const updatedQuote = calls.filter(call => call.op === 'service-quote').at(-1);
  assert.equal(updatedQuote.response.amountCents, quote({ areaM2: 120, deadlineDays: 30, disciplines: ['arquitetura'],
    floors: 1, buildingType: 'new-residential', terrain: 'flat-or-gentle' }, offer).amountCents);
  assert.match(await contents(changed, '#rp-confirmed-summary'), /2\.324,40/);
  assert.equal(callCount('service-quote'), quotesBeforeEdit + 2, 'a failed update can be retried from the final action');
  assert.equal(callCount('service-checkout'), initialCheckouts, 'updating a summary never falls through to checkout');
  assert.equal((await contents(changed, '#rp-checkout-message')).trim(), '', 'a successful update clears the checkout error');
  assert.equal((await contents(changed, '#rp-review-message')).trim(), '', 'a successful update clears the review error');
  assert.equal(await changed.$eval('#rp-accept-terms', node => node.checked), false, 'the new quote needs a new acceptance');
  await changed.click('#rp-pay-button');
  await changed.waitForFunction(() => document.activeElement?.id === 'rp-accept-terms');
  await changed.waitForNetworkIdle({ idleTime: 100 });
  assert.equal(callCount('service-checkout'), initialCheckouts, 'previous acceptance cannot authorize the revised quote');
  assert.equal(await activeReceipt(changed), null);
  assert.equal(creates, 0, 'button recovery scenarios must not create any provider order');
  checks.push('edited-quote-final-button-updates-summary-and-requires-new-acceptance');
  await changed.close();
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
async function assertDeadlineTouchTargets(page) {
  const expected = ['#rp-deadline', ...[15, 30, 45, 60, 90].map(days => `[data-deadline="${days}"]`)];
  for (const width of [360, 390]) {
    await page.setViewport({ width, height: 844 });
    const measurement = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      controls: [...document.querySelectorAll('#rp-deadline, .rp-deadline-options button')].map(node => {
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        return { target: node.id ? `#${node.id}` : `[data-deadline="${node.dataset.deadline}"]`,
          width: rect.width, height: rect.height, left: rect.left, right: rect.right,
          visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 };
      }),
    }));
    deadlineTouchTargets.push(measurement);
    assert.equal(measurement.viewport.width, width);
    assert.deepEqual(measurement.controls.map(control => control.target), expected, 'the range and all five deadline buttons are measured');
    for (const control of measurement.controls) {
      assert(control.visible && control.width >= 44 && control.height >= 44,
        `${width}px: deadline touch target must be at least 44 by 44 CSS pixels: ${JSON.stringify(control)}`);
      assert(control.left >= -1 && control.right <= width + 1,
        `${width}px: deadline touch target must fit the viewport: ${JSON.stringify(control)}`);
    }
    if (width === 360) await screenshot(page, 'deadline-controls-360', '.rp-deadline');
  }
}
async function assertReviewLayout(page) {
  for (const target of [null, '#rp-purchase-title', '.rp-checkout-footer']) {
    if (target) await page.$eval(target, node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const geometry = await page.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      return { scrollY, summary: box('.rp-summary'), purchase: box('#rp-purchase-details') };
    });
    reviewGeometry.push({ checkpoint: target || 'after-review', ...geometry });
    assert(geometry.summary.bottom <= geometry.purchase.top + 1,
      `the estimate must stay above the full-width review and consent: ${JSON.stringify(geometry)}`);
  }
  await screenshot(page, 'review-open-desktop', '#rp-purchase-details');
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
  realPayments: false, externalNetwork: false, analyticsConsent: 'denied', checks, screenshots, accessibility, receiptRestorations, reviewGeometry, deadlineTouchTargets, uncaughtErrors: errors,
  pageSha256: createHash('sha256').update(fs.readFileSync(path.join(publicRoot, 'projetos-prontos/index.html'))).digest('hex') };
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`; config.origin = base;
  app = createServiceHttp({ config, offerLoader: () => offer, providerFactory: () => provider, clock: () => time,
    onIncident: code => incidents.push(code) });
  browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  await assertPurchaseButtonRecovery();
  const page = await newPage();
  await audit(page, 'offer-desktop', 1440, 1000);
  await audit(page, 'offer-mobile', 390, 844);
  await assertDeadlineTouchTargets(page);
  await page.setViewport({ width: 1440, height: 1000 });
  checks.push('desktop-mobile-usable-and-accessible', 'deadline-controls-44px-at-360-and-390');

  await configureAndReview(page, { area: 120, deadline: 30, structure: true });
  await assertReviewLayout(page);
  checks.push('review-and-consent-clear-of-estimate-at-each-scroll-position');
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
  const lostCallsStart = calls.length;
  clientResponseLost = true;
  try {
    await lost.click('#rp-pay-button');
    await waitText(lost, '#rp-checkout-message', 'Não foi possível conferir a resposta');
  } finally { clientResponseLost = false; }
  const receiptC = await activeReceipt(lost); assert(receiptC);
  const lostCheckouts = calls.slice(lostCallsStart).filter(call => call.op === 'service-checkout');
  assert(lostCheckouts.length >= 1);
  assert.deepEqual([...new Set(lostCheckouts.map(call => call.body.requestId))], [receiptC.id], 'automatic transport retries reuse the original durable order');
  assert.equal(creates, 3);
  report.responseLoss = { transportAttempts: lostCheckouts.length, requestId: receiptC.id, providerCreations: creates };
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
  const pausedCheckouts = callCount('service-checkout'), pausedQuotes = callCount('service-quote');
  await configureAndReview(unavailable);
  assert.equal(await unavailable.$eval('#rp-pay-button', node => node.disabled), true);
  assert.equal(callCount('service-quote'), pausedQuotes + 1);
  assert.match(await contents(unavailable, '#rp-checkout-message'), /temporariamente indisponível/);
  assert.equal(await unavailable.$eval('#rp-checkout-message', node => !node.hidden), true);
  await fillBuyer(unavailable); await accept(unavailable);
  await unavailable.click('#rp-pay-button');
  await unavailable.waitForNetworkIdle({ idleTime: 100 });
  assert.equal(callCount('service-checkout'), pausedCheckouts, 'paused payment cannot submit even with complete buyer details and acceptance');
  assert.equal(creates, 3);
  assert.match(await contents(unavailable, '#rp-confirmed-summary'), /1\.601,75/);
  await screenshot(unavailable, 'payment-unavailable-desktop', '#monte-seu-projeto');
  checks.push('unavailable-allows-quote-without-charge', 'paused-payment-shows-reason-and-never-submits');

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
