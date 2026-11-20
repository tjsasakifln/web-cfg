import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './resolve_chrome.mjs';

const root = resolve(process.argv[2] || '_site');
const shots = process.env.TOOL_SHOWCASE_SCREENSHOTS;
const events = [];
let commerceConfig = { enabled: false };
let mockCommerce = null;
let legacyCatalogue = false;
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/assets/js/tool-credits.mjs' && mockCommerce !== null) {
    return res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`
      export const createToolCredits = options => {
        window.sharedWalletOptions = options;
        return ({
        ready: async () => ${mockCommerce},
        open: async options => { window.openedPackageId = options?.packageId; return ${mockCommerce}; },
        openReferral: async () => { window.referralOpened = (window.referralOpened || 0) + 1; return ${mockCommerce}; }
      }); };
      export const exportToolResult = async () => ({ ok: true });`);
  }
  if (url.pathname === '/api/web/tool-credits' && url.searchParams.get('op') === 'config') {
    return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(commerceConfig));
  }
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
    let body = await readFile(file);
    if (legacyCatalogue && file === resolve(root, 'ferramentas/index.html')) {
      body = body.toString().replace(/<label class="ts-format-label"[\s\S]*?<\/label>/, '')
        .replace(/<button[^>]*data-show-more[^>]*>[\s\S]*?<\/button>/g, '');
    }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(body);
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
    let res = await page.goto(base + route, { waitUntil: 'load', timeout: 25000 });
    if (!res) res = await page.reload({ waitUntil: 'load', timeout: 25000 });
    assert.equal(res.status(), 200, route);
  };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 880 });
    await load('/');
    const mobile = await page.$eval('.menu-toggle', el => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none');
    const nav = mobile ? '.mobile-nav' : '.desktop-nav';
    if (mobile) {
      await page.waitForSelector('.menu-toggle', { visible: true });
      await page.click('.menu-toggle');
    }
    const groupToggle = nav + ' [data-nav-group="ferramentas"] > summary';
    await page.waitForSelector(groupToggle, { visible: true });
    const targetSize = await page.$eval(groupToggle, el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
    assert.ok(targetSize.width >= 44 && targetSize.height >= 44, 'menu touch target ' + width);
    await page.click(groupToggle);
    const overview = nav + ' a[data-nav-primary="true"][href="/ferramentas/"]';
    await page.waitForSelector(overview, { visible: true });
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click(overview)]);
    assert.equal(new URL(page.url()).pathname, '/ferramentas/');
    assert.equal(await overflow(), false, 'catalogue viewport ' + width);
    assert.equal(await page.$eval(overview, el => el.getAttribute('aria-current')), 'page');
    if (shots && [390, 1440].includes(width)) {
      await page.screenshot({ path: resolve(shots, 'catalogue-' + width + '.png') });
    }
  }

  const count = await page.$$eval('[data-tool-card]', cards => cards.length);
  assert.ok(count >= 25, count);
  const initialVisible = await page.$$eval('[data-tool-card]:not([hidden])', cards => cards.length);
  assert.ok(initialVisible < count, 'large groups must offer a compact initial selection');
  assert.equal(await page.$$eval('.ts-quickstart a[href]', nodes => nodes.length), 4,
    'the hero must offer four working destinations');
  await page.waitForSelector('[data-tool-search]', { visible: true });
  await page.type('#ts-query', '  REEQUILIBRIO  ');
  assert.deepEqual(await page.$$eval('[data-tool-card]:not([hidden])', nodes => nodes.map(n => n.dataset.toolCard)), ['reequilibrio']);
  await page.click('[data-search-clear]');
  assert.equal(await page.$$eval('[data-tool-card]:not([hidden])', nodes => nodes.length), initialVisible);
  await page.select('#ts-format', 'XLSX');
  const sheets = await page.$$eval('[data-tool-card]:not([hidden])', nodes => nodes.map(n => n.dataset.toolCard));
  assert.ok(sheets.includes('ifc-excel') && sheets.includes('orcamento-de-obras'));
  assert.ok(!sheets.includes('dwg'), 'file filter must hide unrelated tools');
  await page.type('#ts-query', 'SINAPI');
  assert.deepEqual(await page.$$eval('[data-tool-card]:not([hidden])', nodes => nodes.map(n => n.dataset.toolCard)), ['orcamento-de-obras']);
  await page.click('[data-search-clear]');
  assert.equal(await page.$eval('#ts-format', el => el.value), '');
  await page.select('#ts-format', 'CSV');
  const csvTools = await page.$$eval('[data-tool-card]:not([hidden])', cards => cards.map(el => el.dataset.toolCard));
  assert.ok(['calculadora-bdi', 'conversor-utm-sirgas-2000', 'rede-de-agua', 'radar-mercado-publico'].every(id => csvTools.includes(id)),
    'file filtering must use the implemented formats, even when editorial labels omit them');
  await page.click('[data-search-clear]');
  await page.type('#ts-query', 'Excel');
  assert.ok((await page.$$eval('[data-tool-card]:not([hidden])', cards => cards.map(el => el.dataset.toolCard))).includes('orcamento-de-obras'));
  await page.click('[data-search-clear]');
  const hiddenTarget = await page.$eval('[data-tool-card][hidden]', el => el.id);
  const expandedGroup = await page.$eval('[data-show-more]:not([hidden])', el => el.closest('[data-group]').dataset.group);
  await page.click('[data-show-more]:not([hidden])');
  assert.equal(await page.$$eval(`[data-group="${expandedGroup}"] [data-tool-card][hidden]`, nodes => nodes.length), 0,
    'show more must expose all remaining tools');
  await load('/ferramentas/#' + hiddenTarget);
  await page.waitForSelector('#' + hiddenTarget, { visible: true });
  assert.equal(await page.$eval('#' + hiddenTarget, el => el.hidden), false,
    'a shared link must reveal its target even in a collapsed group');
  legacyCatalogue = true;
  await load('/ferramentas/');
  await page.waitForSelector('[data-tool-search]', { visible: true });
  assert.equal(await page.$$eval('[data-tool-card]:not([hidden])', cards => cards.length), count,
    'an older catalogue without expansion buttons must keep every card accessible');
  await page.type('#ts-query', 'REEQUILIBRIO');
  assert.deepEqual(await page.$$eval('[data-tool-card]:not([hidden])', cards => cards.map(el => el.dataset.toolCard)), ['reequilibrio']);
  legacyCatalogue = false;
  await load('/ferramentas/');
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

  // Personal rewards require an active commerce program. Public sharing remains
  // usable while checkout is unavailable, without implying credit attribution.
  const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const captureInViewport = async (selector, name) => {
    const bounds = await page.$eval(selector, el => {
      const box = el.getBoundingClientRect();
      const ancestors = [];
      for (let node = el.parentElement; node; node = node.parentElement) {
        ancestors.push({ tag: node.tagName, className: node.className,
          scrollTop: node.scrollTop, scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight, overflow: getComputedStyle(node).overflow });
      }
      return { target: { top: box.top, bottom: box.bottom, left: box.left, right: box.right,
        width: box.width, height: box.height }, viewport: { width: innerWidth, height: innerHeight },
        scrollY, headerBottom: document.querySelector('.site-header')?.getBoundingClientRect().bottom,
        ancestors };
    });
    if (shots) {
      await page.screenshot({ path: resolve(shots, name + '.png') });
      await writeFile(resolve(shots, name + '.json'), JSON.stringify(bounds, null, 2));
    }
    const box = bounds.target;
    assert.ok(box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= bounds.viewport.height
      && box.left >= 0 && box.right <= bounds.viewport.width,
    'capture target must be inside the viewport: ' + name + ' ' + JSON.stringify(bounds));
  };
  const loadWithCommerce = async route => {
    const [response] = await Promise.all([
      page.waitForResponse(result => result.url() === base + '/api/web/tool-credits?op=config'),
      load(route),
    ]);
    await response.json();
    await paint();
  };
  assert.equal(await page.$eval('[data-referral-entry]', el => el.hidden), true);
  assert.equal(await page.$eval('[data-tool-export-terms]', el => el.hidden), false,
    'the hub must explain free use even when paid exports are unavailable');
  assert.match(await page.$eval('.tool-share h2', el => el.textContent), /Compartilhe/);
  for (const config of [
    { enabled: true, purchasesEnabled: false, tools: ['modela-memoria'] },
    { enabled: true, purchasesEnabled: true, tools: [] },
    { enabled: true, purchasesEnabled: true, sharedExportsEnabled: false, tools: ['modela-memoria'] },
  ]) {
    commerceConfig = config;
    await loadWithCommerce('/ferramentas/');
    assert.equal(await page.$eval('[data-referral-entry]', el => el.hidden), true);
    assert.equal(await page.$eval('[data-tool-export-terms]', el => el.hidden), false);
    assert.equal(await page.$eval('[data-credit-packages]', el => el.hidden), true);
  }
  await loadWithCommerce('/ferramentas/calculadora-de-beiral/');
  assert.equal(await page.$eval('[data-referral-entry]', el => el.hidden), true);
  commerceConfig = { enabled: true, purchasesEnabled: true, sharedExportsEnabled: true,
    tools: ['modela-memoria'], packages: [{ id: 'creditos-1', credits: 1, amountCents: 1490 },
      { id: 'creditos-5', credits: 5, amountCents: 5990 }] };
  mockCommerce = true;
  await load('/ferramentas/#programa-indicacao');
  await page.waitForSelector('[data-referral-entry]:not([hidden])');
  const initialTerms = await page.$eval('[data-tool-export-terms]', el => el.textContent);
  assert.match(initialTerms, /primeira exportação da conta verificada é cortesia/);
  assert.match(initialTerms, /seguintes usam 1 crédito/);
  assert.match(initialTerms, /Crédito avulso: R\$\s*14,90/);
  assert.match(initialTerms, /cortesia é única e compartilhada/);
  await page.waitForSelector('[data-credit-packages]:not([hidden])');
  assert.equal(await page.$$eval('[data-credit-packages] li', nodes => nodes.length), 2);
  assert.match(await page.$eval('[data-credit-packages]', el => el.textContent), /R\$\s*59,90/);
  await page.click('[data-package-id="creditos-5"]');
  await page.waitForFunction(() => window.openedPackageId === 'creditos-5');
  assert.equal(events.filter(event => event.path.includes('tool-credits')).length, 0,
    'choosing a public package only opens the account, without creating a payment');
  assert.equal(await page.$eval('[data-referral-entry] a', el => el.getAttribute('href')),
    '/ferramentas/#programa-indicacao');
  assert.match(await page.$eval('[data-referral-entry]', el => el.textContent), /primeira exportação paga/);
  await page.waitForFunction(() => window.referralOpened === 1);
  assert.equal(await page.evaluate(() => window.sharedWalletOptions?.shared), true);
  await page.click('[data-referral-entry] a');
  await page.waitForFunction(() => window.referralOpened === 2);
  // Fragment arrival has its own real navigation settling cycle. Finish that
  // case before inspecting another section on a fresh page without a fragment.
  await loadWithCommerce('/ferramentas/');
  assert.equal(new URL(page.url()).hash, '');
  await page.waitForSelector('[data-credit-packages]:not([hidden])');
  await page.evaluate(async () => { await document.fonts.ready; });
  for (const width of [320, 390, 414, 1440]) {
    await page.setViewport({ width, height: 880 });
    await page.$eval('[data-credit-packages]', el => {
      const box = el.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, scrollY + box.top - (innerHeight - box.height) / 2),
        behavior: 'instant' });
    });
    await paint();
    await captureInViewport('[data-credit-packages]', 'prices-' + width);
    assert.equal(await overflow(), false, 'public prices viewport ' + width);
  }
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const pricingViolations = await page.evaluate(async () => (await window.axe.run('#como-funciona', {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
  assert.deepEqual(pricingViolations, [], JSON.stringify(pricingViolations));
  await load('/ferramentas/calculadora-de-beiral/');
  await page.waitForSelector('[data-referral-entry]:not([hidden])');
  assert.equal(await page.$eval('[data-referral-entry] a', el => el.getAttribute('href')),
    '/ferramentas/#programa-indicacao');
  await page.click('[data-referral-entry] a');
  await page.waitForFunction(() => window.referralOpened === 1);
  assert.equal(await page.evaluate(() => window.sharedWalletOptions?.shared), true);
  assert.equal(await page.evaluate(() => window.sharedWalletOptions?.toolId), 'modela-memoria');
  await loadWithCommerce('/cad/');
  assert.doesNotMatch(await page.$eval('.content-lead', el => el.textContent), /sem cadastro/);
  assert.match(await page.$eval('[data-tool-export-terms]', el => el.textContent), /Crédito avulso/);
  commerceConfig = { ...commerceConfig, packages: [{ id: 'creditos-1', credits: 1, amountCents: 1990 }] };
  await loadWithCommerce('/ferramentas/');
  assert.match(await page.$eval('[data-credit-packages]', el => el.textContent), /R\$\s*19,90/,
    'public package prices must follow the runtime');
  commerceConfig = { ...commerceConfig, packages: [{ id: 'creditos-5', credits: 1, amountCents: 1990 }] };
  await loadWithCommerce('/ferramentas/');
  assert.equal(await page.$eval('[data-credit-packages]', el => el.hidden), true,
    'an inconsistent package must not create a purchase CTA');
  commerceConfig = { ...commerceConfig, packages: [{ id: 'creditos-1', credits: 1, amountCents: 1990 }] };
  await loadWithCommerce('/ferramentas/conversor-utm-sirgas-2000/');
  assert.match(await page.$eval('[data-tool-export-terms]', el => el.textContent), /R\$\s*19,90/,
    'pre-use price must follow the runtime, never a copy constant');
  assert.equal(await page.evaluate(() => document.querySelector('[data-tool-export-terms]').compareDocumentPosition(document.getElementById('conversor')) & Node.DOCUMENT_POSITION_FOLLOWING), 4,
    'terms must be visible before the coordinate input');
  commerceConfig = { ...commerceConfig, purchasesEnabled: false };
  await loadWithCommerce('/ferramentas/');
  const pausedPurchases = await page.$eval('[data-tool-export-terms]', el => el.textContent);
  assert.match(pausedPurchases, /Novas compras estão temporariamente indisponíveis/);
  assert.doesNotMatch(pausedPurchases, /Crédito avulso|R\$/);
  assert.equal(await page.$eval('[data-credit-packages]', el => el.hidden), true);
  commerceConfig = { ...commerceConfig, exportsPaused: true };
  await loadWithCommerce('/ferramentas/');
  const pausedExports = await page.$eval('[data-tool-export-terms]', el => el.textContent);
  assert.match(pausedExports, /exportações por créditos estão temporariamente pausadas/);
  assert.doesNotMatch(pausedExports, /é cortesia|Crédito avulso|R\$/);
  assert.equal(await page.$eval('[data-credit-packages]', el => el.hidden), true);
  mockCommerce = null;
  commerceConfig = { enabled: false };

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
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const modelaViolations = await page.evaluate(async () => (await window.axe.run('main', {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({target:n.target, summary:n.failureSummary})) })));
  assert.deepEqual(modelaViolations, [], JSON.stringify(modelaViolations));
  // Exercise the actual Modela app wiring. Wallet authentication and reward
  // behavior are covered separately by browser_tool_credits.mjs.
  mockCommerce = true;
  commerceConfig = { enabled: true, purchasesEnabled: true, tools: ['modela-memoria'] };
  await load('/avaliacao-imoveis-urbanos/inferencia/#programa-indicacao');
  await page.waitForFunction(() => window.referralOpened === 1);
  await page.waitForSelector('[data-referral-entry]:not([hidden])');
  assert.equal(await page.$eval('[data-referral-entry] a', el => el.getAttribute('href')),
    '/avaliacao-imoveis-urbanos/inferencia/#programa-indicacao');
  await page.click('[data-referral-entry] a');
  await page.waitForFunction(() => window.referralOpened === 2);
  await paint();
  assert.equal(await page.evaluate(() => window.referralOpened), 2);
  await load('/avaliacao-imoveis-urbanos/inferencia/');
  assert.equal(await page.evaluate(() => window.referralOpened || 0), 0);
  mockCommerce = false;
  await load('/avaliacao-imoveis-urbanos/inferencia/#programa-indicacao');
  assert.equal(await page.evaluate(() => window.referralOpened || 0), 0);
  mockCommerce = null;
  commerceConfig = { enabled: false };
  assert.deepEqual(errors, []);

  // A free calculation can continue into an existing budget without consuming
  // an export or silently changing that budget. The real JSON save/reopen path
  // must preserve the accepted rate and the user's work.
  await load('/ferramentas/orcamento-de-obras/');
  await page.waitForSelector('#demonstrar:not([disabled])');
  await page.click('#demonstrar');
  await page.$eval('#nome-obra', el => {
    el.value = 'Projeto privado de teste da continuidade';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const budgetKey = 'confenge.orcamento-de-obras.v2';
  await page.waitForFunction(key => JSON.parse(sessionStorage.getItem(key))?.titulo ===
    'Projeto privado de teste da continuidade', {}, budgetKey);
  const originalBudget = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), budgetKey);
  const commerceRequestsBefore = events.filter(event => event.path.includes('tool-credits')).length;
  await load('/ferramentas/calculadora-bdi/');
  await page.waitForSelector('#campos:not([disabled])');
  await page.click('#exemplo');
  await page.click('#composicao button[type="submit"]');
  await page.waitForSelector('#resultado:not([hidden])');
  assert.equal(await page.$eval('#taxa', el => el.textContent), '19,4458%');
  for (const width of [320, 390, 1440]) {
    await page.setViewport({ width, height: 880 });
    await page.$eval('#continuar-orcamento', el => {
      const box = el.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, scrollY + box.top - (innerHeight - box.height) / 2), behavior: 'instant' });
    });
    await paint();
    await captureInViewport('#continuar-orcamento', 'bdi-next-' + width);
    assert.equal(await overflow(), false, 'BDI continuation viewport ' + width);
  }
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#continuar-orcamento')]);
  assert.equal(new URL(page.url()).pathname, '/ferramentas/orcamento-de-obras/');
  assert.equal(new URL(page.url()).search, '', 'the BDI must not enter a URL');
  await page.waitForSelector('#bdi-recebido:not([hidden])');
  assert.match(await page.$eval('#bdi-recebido-taxa', el => el.textContent), /19,4458/);
  assert.equal(await page.$eval('#bdi-obra', el => el.value), '20', 'arrival must not apply a rate');
  assert.equal(await page.$eval('#nome-obra', el => el.value), originalBudget.titulo);
  for (const width of [320, 390, 1440]) {
    await page.setViewport({ width, height: 880 });
    await page.$eval('#bdi-recebido', el => {
      const box = el.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, scrollY + box.top - (innerHeight - box.height) / 2), behavior: 'instant' });
    });
    await paint();
    await captureInViewport('#bdi-recebido', 'budget-received-' + width);
    assert.equal(await overflow(), false, 'budget continuation viewport ' + width);
  }
  await page.click('#aplicar-bdi');
  await page.waitForFunction(() => document.getElementById('bdi-obra').value === '19,4458');
  await page.waitForFunction(key => JSON.parse(sessionStorage.getItem(key))?.bdi === '19.4458', {}, budgetKey);
  const appliedBudget = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), budgetKey);
  assert.deepEqual(appliedBudget.itens, originalBudget.itens);
  assert.equal(appliedBudget.titulo, originalBudget.titulo);
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = blob => { window.savedBudgetBlob = blob; return original.call(URL, blob); };
  });
  await page.click('#json');
  await page.waitForFunction(() => window.savedBudgetBlob instanceof Blob);
  const savedBudget = await page.evaluate(async () => JSON.parse(await window.savedBudgetBlob.text()));
  assert.deepEqual(savedBudget, appliedBudget, 'the actual free JSON contains the accepted budget');
  const roundtripDir = resolve(shots || 'build/reports/tool-showcase');
  await mkdir(roundtripDir, { recursive: true });
  const roundtripFile = resolve(roundtripDir, 'budget-roundtrip-fixture.json');
  await writeFile(roundtripFile, JSON.stringify(savedBudget));
  await page.$eval('#abrir', el => { el.closest('details').open = true; });
  page.once('dialog', dialog => dialog.accept());
  await page.click('#novo');
  assert.equal(await page.$eval('#bdi-obra', el => el.value), '0');
  await (await page.$('#abrir')).uploadFile(roundtripFile);
  await page.waitForFunction(() => document.getElementById('nome-obra').value ===
    'Projeto privado de teste da continuidade');
  assert.equal(await page.$eval('#bdi-obra', el => el.value), '19,4458');
  assert.match(await page.$eval('#contagem', el => el.textContent), /3 serviços/);
  await page.$eval('#bdi-obra', el => {
    el.value = '12,3456';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(key => JSON.parse(sessionStorage.getItem(key))?.bdi === '12.3456', {}, budgetKey);
  await load('/ferramentas/calculadora-bdi/');
  await page.waitForSelector('#campos:not([disabled])');
  await page.click('#exemplo');
  await page.click('#composicao button[type="submit"]');
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#continuar-orcamento')]);
  await page.waitForSelector('#bdi-recebido:not([hidden])');
  await page.click('#descartar-bdi');
  assert.equal(await page.$eval('#bdi-recebido', el => el.hidden), true);
  assert.equal(await page.$eval('#bdi-obra', el => el.value), '12,3456', 'discard keeps the different current budget rate');
  assert.equal(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).bdi, budgetKey), '12.3456');
  await load('/ferramentas/'); // Actual navigation flushes the first-party queue.
  const usageIds = new Set(['tool-bdi-continue-budget', 'tool-budget-apply-bdi',
    'tool-budget-discard-bdi', 'tool-budget-save-json']);
  const collectedUsage = () => events.filter(event => event.path === '/api/web/collect')
    .flatMap(event => JSON.parse(event.body).events || []).filter(event => usageIds.has(event.props?.cta_id));
  const usageDeadline = Date.now() + 5000;
  while (new Set(collectedUsage().map(event => event.props.cta_id)).size < usageIds.size && Date.now() < usageDeadline) {
    await delay(50);
  }
  const usage = collectedUsage();
  assert.deepEqual(new Set(usage.map(event => event.props.cta_id)), usageIds, 'all four usage clicks reach the collector');
  const {admitEvent} = require('../../netlify/functions/lib/event-contract.cjs');
  const {aggregateEvents} = require('../../netlify/functions/lib/analytics-agg.cjs');
  for (const event of usage) {
    const admitted = admitEvent(event);
    assert.equal(admitted.ok, true, JSON.stringify(admitted));
    assert.equal(admitted.event.props.destination_type, 'tool_action');
    const summary = aggregateEvents([admitted.event]);
    assert.ok(summary.daily.length > 0);
    assert.ok(summary.daily.every(day => day.cta_clicks === 0 && day.cta_clicks_legacy_unclassified === 0),
      'a tool action must not inflate commercial intent: ' + event.props.cta_id);
  }
  assert.equal(events.filter(event => event.path.includes('tool-credits')).length, commerceRequestsBefore,
    'BDI continuation and free JSON must not request a paid export or create an order');
  assert.ok(events.every(event => !/Projeto privado de teste|19[.,]4458|12[.,]3456/.test(event.body)),
    'calculation and project data must not enter analytics');
  assert.deepEqual(errors, []);

  for (const route of ['/bim/guias/quantitativos-ifc-para-excel/',
    '/bim/guias/pdf-escaneado-para-dwg/', '/cad/guias/escala-e-unidade-do-dwg/']) {
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 880 });
      await load(route);
      await page.$eval('.tool-guide-next', el =>
        el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await paint();
      await captureInViewport('.tool-guide-next a[href="/ferramentas/#como-funciona"]',
        'guide-' + route.split('/').filter(Boolean).at(-1) + '-' + width);
      assert.equal(await overflow(), false, 'guide return CTA ' + route + ' ' + width);
    }
  }

  await page.setJavaScriptEnabled(false);
  // The acquisition-to-service path must exist in the initial HTML, including
  // when the calculation runtime is unavailable. Capture the actual published
  // sections at phone/desktop widths without starting any heavyweight engine.
  for (const slug of ['memorial-de-calculo', 'propriedades-de-secoes',
    'secao-de-concreto-armado', 'trelicas-e-porticos', 'geotecnia-cpt-estacas',
    'conforto-termico', 'energia-solar-fotovoltaica', 'modelador-parametrico-3d']) {
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 880 });
      await load('/ferramentas/' + slug + '/');
      const section = 'section[aria-labelledby="projeto"]';
      await page.$eval(section, el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      const service = '[data-cta-id="tool-service-' + slug + '"]';
      const contact = '[data-cta-id="tool-contact-' + slug + '"]';
      await captureInViewport(service, 'service-' + slug + '-' + width);
      await captureInViewport(contact, 'contact-' + slug + '-' + width);
      assert.equal(await page.$eval(contact, el => el.getAttribute('data-journey')), 'projeto');
      const target = await page.$eval(service, el => el.getAttribute('href'));
      assert.ok(target.startsWith('/') && !/[?#]/.test(target), 'canonical service destination ' + slug);
      assert.equal(await overflow(), false, 'service section viewport ' + slug + ' ' + width);
      const [navigation] = await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click(service)]);
      assert.equal(navigation?.status(), 200, 'service HTTP status ' + slug);
      assert.equal(new URL(page.url()).pathname, target, 'native service link ' + slug);
    }
  }
  await page.setViewport({ width: 320, height: 800 });
  await load('/');
  const nativeGroup = '.mobile-nav [data-nav-group="ferramentas"]';
  const nativeOverview = nativeGroup + ' a[data-nav-primary="true"][href="/ferramentas/"]';
  await page.focus(nativeGroup + ' > summary');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval(nativeGroup, el => el.open), true, 'native tools disclosure opens with scripting disabled');
  // Browser timers/rAF do not run with scripting disabled. Poll native layout
  // from Node instead of waiting for a page-side visibility poller.
  const nativeDeadline = Date.now() + 6000;
  let nativeOverviewVisible = false;
  while (Date.now() < nativeDeadline) {
    nativeOverviewVisible = await page.$eval(nativeOverview, el => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (nativeOverviewVisible) break;
    await delay(50);
  }
  assert.equal(nativeOverviewVisible, true, 'native tools overview is visible');
  await page.focus(nativeOverview);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.keyboard.press('Enter')]);
  assert.equal(new URL(page.url()).pathname, '/ferramentas/', 'native tools link reaches the catalogue');
  assert.equal(await overflow(), false);
  assert.equal(await page.$$eval('.ts-card-action[href]', nodes => nodes.length), count);
  assert.match(await page.$eval('[data-public-export-intro]', el => el.textContent),
    /primeira exportação da conta verificada é cortesia/,
    'material free-use conditions must be visible and indexable without scripting');
  assert.equal(await page.$eval('[data-tool-search]', el => el.hidden), true);
  assert.equal(await page.$$eval('.tool-share-social a[href]', nodes => nodes.length), 2);
  console.log('Browser catalogue: desktop/mobile menu, no-JS, axe, search, referral and share fallback OK.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
