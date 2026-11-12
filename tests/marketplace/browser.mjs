import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

// Isolated browser fixtures. No provider, review, account or payment is seeded
// into the product. The real engineering domain validates form submissions.
const root = process.cwd();
const require = createRequire(import.meta.url);
const domain = require('../../apps/engineering-marketplace/config/domain.cjs');
const canonicalIntents = require('../../apps/engineering-marketplace/config/intents.json').intents.map(item => item.intent_family);
const chrome = process.env.CHROME_PATH;
assert.ok(chrome && existsSync(chrome), 'CHROME_PATH must point to an installed Chromium');
const report = join(root, 'build/reports/marketplace');
mkdirSync(report, { recursive: true });
const terms = 'marketplace-engenharia-v1';
const calls = [];
const runtimeErrors = [];
const navigationAttempts = [];
let enabled = false;
let paymentsEnabled = false;
let commissionBps = 1000;
let session = { authenticated: false };
let contracts = [];
let checkoutUrl = 'https://untrusted.example.invalid/pay';
let checkoutError = '';
let delayRequests = false;
const provider = {
  id: 'sel_frontendtest', name: 'Perfil de teste <img src=x onerror=alert(1)>',
  description: 'Perfil exclusivo de teste de navegador, usado para verificar a apresentação segura dos dados.',
  website_url: 'javascript:alert(1)', phone: '+5548999990000', rating: 5, review_count: 0, reviews: [],
  profile: { city: 'Florianópolis', uf: 'SC', registration_board: 'CREA', registration: 'TESTE123',
    modalities: ['remoto'], specialties: [canonicalIntents[0]], portfolio_url: 'https://example.invalid/portfolio' },
};
function account(role) {
  return role === 'provider'
    ? { authenticated: true, role, seller: { id: provider.id, name: provider.name }, sellers: [{ id: provider.id, name: provider.name }] }
    : { authenticated: true, role: 'customer', user: { id: 'cus_frontendtest', first_name: 'Cliente', last_name: 'Teste', email: 'cliente@example.invalid' } };
}
const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
async function api(req, res, url) {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}'), op = url.searchParams.get('op');
  calls.push({ op, method: req.method, body, query: Object.fromEntries(url.searchParams) });
  if (op === 'config') return json(res, 200, { enabled, terms_version: terms, paymentsEnabled: paymentsEnabled && commissionBps !== null, commission_bps: commissionBps });
  if (op === 'session') return json(res, 200, session);
  if (op === 'providers') {
    const q = url.searchParams.get('q');
    if (q === 'failure') return json(res, 503, { error: 'MARKETPLACE_UNAVAILABLE' });
    if (q === 'old') await new Promise(resolve => setTimeout(resolve, 150));
    return json(res, 200, { providers: q === 'empty' ? [] : [{ ...provider, name: q === 'current' ? 'Consulta mais recente' : q === 'old' ? 'Consulta ultrapassada' : provider.name }], count: q === 'empty' ? 0 : 1, limit: 12, offset: 0 });
  }
  if (op === 'provider') return json(res, 200, { provider });
  if (op === 'register' || op === 'login') {
    if (op === 'register') { assert.equal(body.consent, true); assert.equal(body.terms_version, terms); assert.ok(body.password.length >= 12); }
    session = account(body.role); return json(res, op === 'register' ? 201 : 200, session);
  }
  if (op === 'logout') { session = { authenticated: false }; return json(res, 200, { authenticated: false }); }
  if (!session.authenticated) return json(res, 401, { error: 'AUTH_REQUIRED' });
  if (op === 'vendor-profile') {
    assert.equal(session.role, 'provider');
    if (req.method === 'POST') Object.assign(provider, domain.validateProfile(body));
    return json(res, 200, { provider });
  }
  if (op === 'request') {
    assert.equal(session.role, 'customer');
    const valid = domain.validateRequest(body);
    const request = { ...valid, id: `ereq_frontend${contracts.length + 1}`, customer_id: 'cus_frontendtest', status: 'requested', revision: 0, created_at: '2026-11-12T12:00:00Z' };
    contracts.push(request); return json(res, 201, { request });
  }
  if (op === 'requests') {
    const snapshot = JSON.parse(JSON.stringify(contracts));
    if (delayRequests) await new Promise(resolve => setTimeout(resolve, 250));
    return json(res, 200, { requests: snapshot, count: snapshot.length });
  }
  if (op === 'request-action') {
    const request = contracts.find(item => item.id === body.id); assert.ok(request);
    const { id, ...input } = body;
    const actor = { role: session.role, id: 'cus_frontendtest', sellerId: provider.id, commissionBps,
      providerProfile: { id: provider.id, name: provider.name, registration_board: provider.profile.registration_board, registration: provider.profile.registration } };
    try { Object.assign(request, domain.applyAction(request, actor, input)); }
    catch (error) { return json(res, error.status || 422, { error: error.status === 409 ? 'REQUEST_CONFLICT' : 'INVALID_REQUEST' }); }
    if (input.action === 'review') { provider.reviews = [request.review]; provider.review_count = 1; provider.rating = request.review.rating; }
    return json(res, 200, { request });
  }
  if (op === 'checkout') return checkoutError ? json(res, 409, { error: checkoutError }) : json(res, 200, { url: checkoutUrl });
  if (op === 'connect') return json(res, 200, { url: 'https://connect.stripe.com/setup/test' });
  return json(res, 404, { error: 'NOT_FOUND' });
}
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/web/engineering-marketplace') {
    void api(req, res, url).catch(error => { runtimeErrors.push(error.message); json(res, 500, { error: 'INVALID_REQUEST' }); }); return;
  }
  if (url.pathname.startsWith('/api/')) return json(res, 200, { enabled: false });
  const path = resolve(root, `.${decodeURIComponent(url.pathname)}`, url.pathname.endsWith('/') ? 'index.html' : '');
  if (!path.startsWith(root + sep) || !existsSync(path) || !statSync(path).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(readFileSync(path));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = `${origin}/profissionais/`;
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(10_000);
page.on('pageerror', error => runtimeErrors.push(error.message));
await page.setRequestInterception(true);
page.on('request', request => {
  if (request.url().startsWith(origin) || request.url().startsWith('data:')) return void request.continue();
  if (request.isNavigationRequest()) navigationAttempts.push(request.url());
  void request.abort();
});
const fill = (selector, value) => page.locator(selector).fill(value);
const checked = async (selector, desired = true) => { if (await page.$eval(selector, input => input.checked) !== desired) await page.click(selector); };
const visible = selector => page.waitForSelector(selector, { visible: true });
const tab = async name => { await page.click(`#market-tab-${name}`); await visible(`#market-panel-${name}`); };
const latest = op => calls.filter(call => call.op === op).at(-1);
const count = op => calls.filter(call => call.op === op).length;
const submit = selector => page.click(`${selector} button[type=submit]`);
async function login(role) {
  await tab('account');
  if (await page.$eval('#market-account-view', node => !node.hidden)) { await page.click('#market-logout'); await visible('#market-auth-view'); }
  await page.click('#market-mode-login'); await checked(`#market-auth-form input[value=${role}]`);
  await fill('#market-auth-form input[name=email]', `${role}@example.invalid`);
  await fill('#market-password', 'browser-test-password');
  await submit('#market-auth-form'); await visible('#market-account-view');
  if (role === 'provider') await page.waitForFunction(() => !document.querySelector('#market-profile-form > fieldset').disabled);
}
async function geometry(width) {
  await page.setViewport({ width, height: 900 });
  const result = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
    badTargets: [...document.querySelectorAll('.marketplace button')].filter(node => node.getBoundingClientRect().width && node.getBoundingClientRect().height < 43).map(node => node.textContent) }));
  assert.equal(result.overflow, false, `No horizontal overflow at ${width}px`);
  assert.deepEqual(result.badTargets, [], `Touchable buttons at ${width}px`);
}
try {
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await visible('#market-unavailable-actions');
  assert.equal(await page.$eval('#market-workbench', node => node.hidden), true);
  assert.equal(await page.$eval('meta[name=robots]', node => node.content), 'noindex,follow');
  assert.equal(await page.$eval('#market-unavailable-actions a', node => node.getAttribute('href')), '/triagem-tecnica/');
  assert.equal(count('providers'), 0, 'Disabled service does not pretend to search');
  await page.screenshot({ path: join(report, 'unavailable-desktop.png'), fullPage: true });

  enabled = true; await page.click('#market-retry'); await visible('.market-provider-card');
  assert.match(await page.$eval('.market-provider-card', node => node.textContent), /Ainda sem avaliações/);
  assert.equal(await page.$$eval('.market-provider-card img', nodes => nodes.length), 0, 'Provider text is not executable HTML');
  assert.deepEqual(await page.$$eval('#market-request-intent option[value]:not([value=""])', nodes => nodes.map(node => node.value)), canonicalIntents, 'Public category IDs match the backend subset');
  for (const width of [320, 390, 768, 1280]) await geometry(width);
  await page.screenshot({ path: join(report, 'search-desktop.png'), fullPage: true });
  await page.focus('#market-tab-search'); await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval('#market-tab-account', node => node.getAttribute('aria-selected')), 'true', 'Tabs support keyboard navigation');
  await tab('search');
  await fill('#market-query', 'empty'); await submit('#market-search-form'); await page.waitForFunction(() => document.querySelector('#market-provider-list').textContent.includes('Nenhum perfil'));
  await fill('#market-query', 'failure'); await submit('#market-search-form'); await page.waitForFunction(() => document.querySelector('#market-search-status').dataset.tone === 'error');
  await fill('#market-query', 'old'); await submit('#market-search-form');
  await fill('#market-query', 'current'); await page.$eval('#market-search-form', form => form.requestSubmit());
  await page.waitForFunction(() => document.querySelector('#market-provider-list').textContent.includes('Consulta mais recente'));
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.doesNotMatch(await page.$eval('#market-provider-list', node => node.textContent), /ultrapassada/, 'Stale search response is discarded');
  await fill('#market-query', ''); await submit('#market-search-form'); await visible('.market-provider-card button');
  await page.click('.market-provider-card button'); await visible('#market-provider-view');
  assert.equal(await page.$$eval('#market-provider-detail a', nodes => nodes.length), 1, 'Unsafe provider URL is omitted');
  assert.equal(await page.$eval('#market-provider-detail a', node => node.href), 'https://example.invalid/portfolio');
  assert.match(await page.$eval('#market-provider-detail', node => node.textContent), /Registro informado/);
  await page.click('#market-request-start'); await page.click('#market-request-login');
  await page.click('#market-mode-register'); await checked('#market-auth-form input[value=customer]');
  await fill('#market-auth-form input[name=first_name]', 'Cliente'); await fill('#market-auth-form input[name=last_name]', 'Teste');
  await fill('#market-auth-form input[name=email]', 'cliente@example.invalid'); await fill('#market-password', 'browser-test-password');
  await submit('#market-auth-form'); assert.equal(count('register'), 0, 'Registration requires consent');
  await checked('#market-auth-form input[name=consent]'); await submit('#market-auth-form'); await visible('#market-request-form');
  assert.equal(latest('register').body.consent, true); assert.equal(latest('register').body.terms_version, terms);
  assert.deepEqual(await page.$$eval('#market-request-intent option[value]:not([value=""])', nodes => nodes.map(node => node.value)), provider.profile.specialties, 'Only the selected professional specialties can receive requests');
  await fill('#market-request-form input[name=title]', 'Projeto estrutural para revisão');
  await page.select('#market-request-intent', canonicalIntents[0]);
  await fill('#market-request-form textarea[name=description]', 'Preciso de revisão dos projetos estruturais e relatório técnico das interferências identificadas.');
  await fill('#market-request-form input[name=location]', 'Florianópolis, SC');
  await submit('#market-request-form'); assert.equal(count('request'), 0, 'Request requires explicit consent');
  await checked('#market-request-form input[name=consent]'); await submit('#market-request-form'); await visible('.market-request-card');
  assert.equal(latest('request').body.terms_version, terms); assert.equal(contracts[0].status, 'requested');
  assert.equal(await page.$$eval('[data-action=quote],[data-action=complete],[data-action=review]', nodes => nodes.length), 0);

  await login('provider');
  assert.equal(await page.$eval('#market-auth-form input[name=email]', node => node.value), 'provider@example.invalid');
  assert.equal(await page.$eval('#market-password', node => node.value), '', 'Password cleared after authentication');
  await fill('#market-profile-form input[name=name]', 'Profissional de teste');
  await fill('#market-profile-form textarea[name=description]', 'Perfil exclusivo de teste para projetos e revisões técnicas de estruturas.');
  await fill('#market-profile-form input[name=website_url]', 'http://example.invalid');
  await checked('#market-profile-form input[name=consent]'); await submit('#market-profile-form');
  await page.waitForFunction(() => document.querySelector('#market-profile-form [data-form-status]').textContent.includes('https://'));
  assert.equal(calls.filter(call => call.op === 'vendor-profile' && call.method === 'POST').length, 0);
  await fill('#market-profile-form input[name=website_url]', 'https://example.invalid');
  await submit('#market-profile-form'); await page.waitForFunction(() => document.querySelector('#market-profile-form [data-form-status]').dataset.tone === 'success');
  assert.equal(latest('vendor-profile').body.consent, true); assert.deepEqual(latest('vendor-profile').body.profile.specialties, [canonicalIntents[0]]);
  await geometry(390); await page.screenshot({ path: join(report, 'provider-mobile.png'), fullPage: true }); await geometry(1280);
  assert.equal(await page.$eval('#market-connect', node => node.disabled), true, 'Unavailable payments cannot start onboarding');
  await tab('requests'); await visible('[data-action=quote]');
  const quote = '[data-action=quote]';
  await fill(`${quote} input[name=amount]`, '12.34');
  await fill(`${quote} textarea[name=scope]`, 'Revisão dos projetos estruturais, relatório técnico e reunião de apresentação dos resultados.');
  await fill(`${quote} input[name=deadline]`, '2099-12-31');
  await checked(`${quote} input[name=confirmed]`); await submit(quote);
  await page.waitForFunction(() => document.querySelector('[data-action=quote] [data-form-status]').textContent.includes('2.500,00'));
  assert.equal(count('request-action'), 0, 'Ambiguous money notation is rejected');
  await fill(`${quote} input[name=amount]`, '1.234,56');
  assert.match(await page.$eval(quote, node => node.textContent), /123,45.*1\.111,11/s, 'Exact fee and professional share are shown before quote');
  await checked(`${quote} input[name=confirmed]`, false); await submit(quote); assert.equal(count('request-action'), 0, 'Provider commission acceptance is required');
  await checked(`${quote} input[name=confirmed]`); await submit(quote); await page.waitForFunction(() => document.querySelector('.market-state')?.textContent === 'Proposta recebida');
  assert.equal(latest('request-action').body.amount_cents, 123456); assert.equal(latest('request-action').body.deadline, '2099-12-31');
  assert.equal(latest('request-action').body.expected_commission_bps, 1000);
  assert.equal(contracts[0].proposal.fee_cents, 12345);

  await login('customer'); await tab('requests'); await visible('[data-action=accept]');
  assert.match(await page.$eval('.market-request-reference', node => node.textContent), /Protocolo ereq_frontend1.*Revisão 1/);
  assert.match(await page.$eval('.market-contract-identity', node => node.textContent), /Profissional de teste.*CREA TESTE123/s, 'The professional identity is visible before acceptance');
  const seenRevision = contracts[0].revision;
  Object.assign(contracts[0], domain.applyAction(contracts[0], { role: 'provider', sellerId: provider.id, commissionBps,
    providerProfile: { id: provider.id, name: provider.name, registration_board: provider.profile.registration_board, registration: provider.profile.registration } },
    { action: 'quote', amount_cents: 125000, scope: 'Revisão estrutural atualizada com memorial e reunião de entrega dos resultados.', deadline: '2099-12-31', expected_commission_bps: commissionBps }));
  await checked('[data-action=accept] input[name=confirmed]'); await submit('[data-action=accept]');
  await page.waitForFunction(() => document.querySelector('[data-action=accept] [data-form-status]').dataset.tone === 'error');
  assert.equal(latest('request-action').body.revision, seenRevision, 'Acceptance sends the revision the customer actually read');
  assert.equal(contracts[0].status, 'quoted', 'Changed quotation is not accepted');
  await page.click('#market-refresh-requests'); await page.waitForFunction(() => document.querySelector('.market-price')?.textContent.includes('1.250,00'));
  await checked('[data-action=accept] input[name=confirmed]'); await submit('[data-action=accept]');
  await page.waitForFunction(() => document.querySelector('.market-state')?.textContent === 'Proposta aceita');
  assert.equal(latest('request-action').body.revision, contracts[0].revision);
  assert.match(await page.$eval('#market-request-list', node => node.textContent), /pagamento online ainda não está disponível/);
  assert.equal(count('checkout'), 0);

  paymentsEnabled = true; await page.goto(`${url}?payment=success`, { waitUntil: 'networkidle0' }); await visible('.market-request-card');
  assert.equal(contracts[0].status, 'accepted');
  assert.equal(await page.$eval('.market-state', node => node.textContent), 'Proposta aceita', 'Payment return URL cannot fabricate paid status');
  assert.match(await page.$eval('#market-request-list', node => node.textContent), /sem aguardar a conclusão/, 'Payment timing is explicit before checkout');
  await page.click('.market-request-action button');
  await page.waitForFunction(() => document.querySelector('.market-request-action [role=status]').textContent.includes('confirmar a resposta'));
  assert.equal(page.url(), `${url}?payment=success`); assert.deepEqual(navigationAttempts, [], 'Untrusted payment redirect is refused');
  checkoutError = 'PAYMENT_RECONCILIATION_REQUIRED'; await page.click('.market-request-action button');
  await page.waitForFunction(() => document.querySelector('.market-request-action button')?.textContent === 'Pagamento em conferência');
  assert.equal(await page.$eval('.market-request-action button', node => node.disabled), true, 'An interrupted payment requires reconciliation before another attempt');
  checkoutError = ''; await page.reload({ waitUntil: 'networkidle0' }); await visible('.market-request-card');
  checkoutUrl = 'https://checkout.stripe.com/c/pay/test';
  await Promise.all([page.waitForRequest(request => request.url() === checkoutUrl), page.click('.market-request-action button')]);
  assert.deepEqual(latest('checkout').body, { id: contracts[0].id });
  assert.deepEqual(navigationAttempts, [checkoutUrl], 'Only the expected payment host may be opened');

  // Verified payment is a fixture from the server. The UI itself never moves it.
  contracts[0].status = 'paid'; contracts[0].payment = { status: 'paid', amount_cents: 125000, fee_cents: 12500 };
  await page.goto(url, { waitUntil: 'networkidle0' }); await login('provider'); await tab('requests'); await visible('[data-action=deliver]');
  await fill('[data-action=deliver] textarea[name=note]', 'Relatório e memorial entregues para conferência no endereço informado ao cliente.');
  await submit('[data-action=deliver]'); await page.waitForFunction(() => document.querySelector('.market-state')?.textContent === 'Entrega disponível');
  await login('customer'); await tab('requests'); await visible('[data-action=complete]');
  await checked('[data-action=complete] input[name=confirmed]'); await submit('[data-action=complete]'); await visible('[data-action=review]');
  await page.select('[data-action=review] select[name=rating]', '5');
  await fill('[data-action=review] textarea[name=note]', 'Entrega de teste conferida <img src=x onerror=alert(1)>');
  await submit('[data-action=review]'); await page.waitForFunction(() => !document.querySelector('[data-action=review]'));
  assert.equal(contracts[0].review.rating, 5); assert.equal(await page.$$eval('.market-request-card img', nodes => nodes.length), 0);
  await geometry(390); await page.screenshot({ path: join(report, 'completed-mobile.png'), fullPage: true });

  // A stale private response must not reappear after logout.
  delayRequests = true; await tab('requests'); await tab('account'); await page.click('#market-logout'); await visible('#market-auth-view');
  await new Promise(resolve => setTimeout(resolve, 300)); delayRequests = false;
  assert.equal(await page.$eval('#market-request-list', node => node.children.length), 0);
  assert.equal(await page.$eval('#market-auth-form input[name=email]', node => node.value), '', 'Account data is cleared at logout');
  assert.equal(await page.$eval('#market-password', node => node.value), '');
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.doesNotMatch(storage, /browser-test-password|cliente@example\.invalid|provider@example\.invalid/, 'No marketplace credentials or personal fields in browser storage');

  session = account('provider'); commissionBps = null; contracts[0].status = 'requested'; contracts[0].proposal = null;
  await page.goto(`${url}#minha-conta`, { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#market-tab-account', node => node.getAttribute('aria-selected')), 'true', 'Connect return opens the account');
  await tab('requests'); await visible('.market-request-card');
  assert.equal(await page.$$eval('[data-action=quote]', nodes => nodes.length), 0, 'Undefined commission cannot be silently accepted');
  assert.match(await page.$eval('#market-request-list', node => node.textContent), /definição das condições comerciais/);
  assert.deepEqual(runtimeErrors, [], `No browser/server errors: ${runtimeErrors.join(', ')}`);
  console.log('Marketplace browser checks passed: unavailable state, canonical categories, XSS-safe rendering, forms and consent, exact BRL, quote revision, commission, payment gating, delivery/review, session clearing and responsive layout.');
} catch (error) {
  await page.screenshot({ path: join(report, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
