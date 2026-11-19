/**
 * Compare the diagnostic route's projected CSS with the canonical global sheet.
 * Both stylesheets stay loaded next to each other at the original cascade
 * position. A single task switches their media, then restores the projected
 * sheet, so an unloaded CSS interval cannot clamp scrolling or reset fonts.
 * Real local interactions expose the runtime states a static purge misses.
 * Usage: node scripts/site/test_diagnostic_css_parity.mjs [site-root]
 * No request can reach an external host or persist a lead: non-GET requests are
 * intercepted, and the local static server independently refuses them.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { resolveChromePath } from './resolve_chrome.mjs';

const root = resolve(process.argv[2] || '.');
const route = '/ferramentas/diagnostico-defesa-margem/';
const evidenceDir = resolve(process.env.DIAGNOSTIC_CSS_REPORT_DIR
  || 'build/reports/convergence/navigation-discovery/diagnostic-css');
const fullSheet = '/styles.css';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
let commerceEnabled = false;
const report = {
  schema: 'confenge.diagnostic-css-parity/1.0', site_root: root, route,
  source_sha: null, workflow_sha: process.env.GITHUB_SHA || null,
  run_id: process.env.GITHUB_RUN_ID || null, run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
  status: 'running', scenarios: [], screenshots: [], blocked_requests: [], font_contracts: [], font_warmups: [],
  page_errors: [], failures: [],
};
const server = createServer(async (request, response) => {
  if (request.method !== 'GET') return response.writeHead(405).end();
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/_qa/diagnostic-font-warmup/') {
      return response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        + '<title>CSS font preparation</title><link rel="stylesheet" href="/styles.css">'
        + '</head><body></body></html>');
    }
    if (url.pathname === '/api/web/tool-credits' && url.searchParams.get('op') === 'config') {
      return response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        enabled: commerceEnabled, purchasesEnabled: commerceEnabled,
        sharedExportsEnabled: commerceEnabled, tools: commerceEnabled ? ['modela-memoria'] : [],
      }));
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
      return response.writeHead(404).end();
    }
    let file = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) return response.writeHead(403).end();
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const headers = { 'Content-Type': mime[extname(file)] || 'application/octet-stream' };
    if (/\.(?:woff2?|ttf|otf)$/i.test(file)) headers['Cache-Control'] = 'public, max-age=3600, immutable';
    response.writeHead(200, headers)
      .end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});

// Compare resolved values, including descendants of closed disclosures and
// generated arrows. No expected color, dimension or font is copied from CSS.
const properties = [
  'display', 'visibility', 'position', 'z-index', 'box-sizing', 'overflow-x', 'overflow-y',
  'top', 'right', 'bottom', 'left', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'color', 'background-color', 'background-image', 'box-shadow', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variant-numeric',
  'line-height', 'letter-spacing', 'word-spacing', 'white-space', 'overflow-wrap', 'word-break', 'hyphens',
  'text-align', 'text-transform', 'text-decoration-line', 'text-decoration-color',
  'text-decoration-thickness', 'text-underline-offset', 'text-shadow',
  'outline-style', 'outline-width', 'outline-color', 'outline-offset',
  'list-style-type', 'list-style-position', 'list-style-image',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-self', 'align-content', 'justify-content', 'row-gap', 'column-gap',
  'transform', 'transform-origin', 'clip', 'clip-path', 'object-fit', 'object-position',
  'scroll-margin-top', 'scroll-padding-top', 'overscroll-behavior',
  'fill', 'stroke', 'stroke-width', 'content', 'cursor', 'appearance',
  'break-before', 'break-after', 'break-inside', 'print-color-adjust',
];
const digest = value => createHash('sha256').update(value).digest('hex');
let browser;
let page;
let cdp;
let isolatedContext;
let stylesheetPair;
let blockedFonts = 0;
let context = { state: 'setup' };
let base;
let pendingLead = null;
let pendingSnapshots = [];
let holdSnapshot = false;
let holdLead = false;

async function poll(read, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await read();
    if (result) return result;
    await delay(60);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label} (${JSON.stringify(context)})`);
}

async function waitDOM(predicate, label, ...args) {
  // Node polling also works with page scripting disabled. A rAF-based wait does not.
  return poll(() => page.evaluate(predicate, ...args), label);
}

async function settle() {
  let previous = '';
  let stable = 0;
  await poll(async () => {
    const sample = await page.evaluate(() => {
      const running = document.getAnimations().some(animation => animation.playState === 'running'
        && animation.effect?.getComputedTiming().iterations !== Infinity);
      const selectors = ['html', 'body', '.site-header', 'main', '.site-footer', '#diagnostic-result',
        '#lookup-status', '#lead-form .form-status', '.tool-share', '.mobile-nav', '.nav-panel'];
      const boxes = selectors.flatMap(selector => [...document.querySelectorAll(selector)])
        .map(element => {
          const r = element.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height, element.scrollWidth, element.scrollHeight];
        });
      return { ready: document.readyState === 'complete' && document.fonts.status === 'loaded' && !running,
        boxes, scroll: [scrollX, scrollY] };
    });
    const current = JSON.stringify(sample);
    stable = sample.ready && current === previous ? stable + 1 : 0;
    previous = current;
    return stable >= 3;
  }, 'fonts, transitions and stable geometry');
}

async function snapshot() {
  const data = await page.evaluate(keys => {
    const elements = [document.documentElement, ...document.body.querySelectorAll('*')];
    elements.splice(1, 0, document.body);
    const round = value => Math.round(value * 10000) / 10000;
    const styleOf = style => Object.fromEntries(keys.map(key => [key, style.getPropertyValue(key)]));
    const nodes = elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      const pseudo = {};
      for (const name of ['::before', '::after', '::marker']) {
        const style = getComputedStyle(element, name);
        if (name === '::marker' ? element.matches('li, summary') : !['none', 'normal', ''].includes(style.content)) {
          pseudo[name] = styleOf(style);
        }
      }
      return {
        index, label: element.tagName.toLowerCase() + (element.id ? '#' + element.id : '')
          + (typeof element.className === 'string' && element.className ? '.' + element.className.trim().replace(/\s+/g, '.') : ''),
        box: [rect.x, rect.y, rect.width, rect.height, element.scrollWidth, element.scrollHeight].map(round),
        styles: styleOf(getComputedStyle(element)), pseudo,
        control: { value: 'value' in element ? String(element.value) : null,
          checked: 'checked' in element ? element.checked : null,
          disabled: 'disabled' in element ? element.disabled : null,
          open: 'open' in element ? element.open : null },
      };
    });
    return {
      dom: document.body.outerHTML,
      html_attributes: [...document.documentElement.attributes].map(attribute => [attribute.name, attribute.value]),
      active: elements.indexOf(document.activeElement), scroll: [scrollX, scrollY], nodes,
    };
  }, properties);
  data.fonts = await platformFonts();
  return data;
}

const fontSelectors = ['.tool-page-hero h1', '.tool-page-hero .content-lead',
  '.tool-page-hero .eyebrow', '.nav-group[open] > summary'];

async function platformFonts() {
  const { root: documentNode } = await cdp.send('DOM.getDocument');
  const nodes = [];
  for (const selector of fontSelectors) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: documentNode.nodeId, selector });
    if (!nodeId) { nodes.push({ selector, fonts: [] }); continue; }
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    nodes.push({ selector, fonts: fonts.filter(font => font.glyphCount > 0)
      .sort((a, b) => `${a.familyName}|${a.postScriptName}`.localeCompare(`${b.familyName}|${b.postScriptName}`)) });
  }
  return nodes;
}

function assertFontMode(fonts) {
  for (const [index, { selector, fonts: used }] of fonts.entries()) {
    if (index < 3) assert.ok(used.length, `${selector} has observed glyphs in ${context.font_mode} mode`);
    if (!used.length) continue; // The menu label has no painted glyphs while closed/printing.
    if (context.font_mode === 'loaded') {
      assert.ok(used.every(font => font.isCustomFont && /Archivo/i.test(font.familyName + font.postScriptName)),
        `${selector} actually uses Archivo: ${JSON.stringify(used)}`);
    } else {
      assert.ok(blockedFonts > 0, 'fallback mode intercepted a web-font request with cache disabled');
      assert.ok(used.every(font => typeof font.familyName === 'string' && font.familyName.trim()
        && typeof font.postScriptName === 'string' && font.postScriptName.trim()
        && !/Archivo/i.test(font.familyName + font.postScriptName)),
      `${selector} actually uses an identified non-Archivo fallback: ${JSON.stringify(used)}`);
    }
  }
}

function compare(left, right) {
  const differences = [];
  const record = (node, field, projected, canonical) => differences.push({ node, field, projected, canonical });
  if (left.dom !== right.dom) record('document', 'body DOM changed while swapping CSS', digest(left.dom), digest(right.dom));
  if (JSON.stringify(left.html_attributes) !== JSON.stringify(right.html_attributes)) {
    record('html', 'attributes', left.html_attributes, right.html_attributes);
  }
  if (left.active !== right.active) record('document', 'active element', left.active, right.active);
  if (JSON.stringify(left.fonts) !== JSON.stringify(right.fonts)) record('document', 'platform fonts', left.fonts, right.fonts);
  if (JSON.stringify(left.scroll) !== JSON.stringify(right.scroll)) record('document', 'scroll position', left.scroll, right.scroll);
  if (left.nodes.length !== right.nodes.length) record('document', 'element count', left.nodes.length, right.nodes.length);
  for (let i = 0; i < Math.min(left.nodes.length, right.nodes.length); i += 1) {
    const a = left.nodes[i], b = right.nodes[i];
    if (a.label !== b.label) record(i, 'element identity', a.label, b.label);
    if (JSON.stringify(a.control) !== JSON.stringify(b.control)) record(a.label, 'control state', a.control, b.control);
    a.box.forEach((value, index) => {
      if (Math.abs(value - b.box[index]) > 0.25) record(a.label, `geometry[${index}]`, value, b.box[index]);
    });
    for (const key of properties) {
      if (a.styles[key] !== b.styles[key]) record(a.label, key, a.styles[key], b.styles[key]);
    }
    for (const pseudo of new Set([...Object.keys(a.pseudo), ...Object.keys(b.pseudo)])) {
      if (!a.pseudo[pseudo] || !b.pseudo[pseudo]) {
        record(a.label + pseudo, 'generated content', a.pseudo[pseudo] || null, b.pseudo[pseudo] || null);
      } else for (const key of properties) {
        if (a.pseudo[pseudo][key] !== b.pseudo[pseudo][key]) {
          record(a.label + pseudo, key, a.pseudo[pseudo][key], b.pseudo[pseudo][key]);
        }
      }
    }
  }
  return differences;
}

async function activateStylesheet(canonical) {
  await page.evaluate((canonical, projectedMedia, loadFont) => {
    const projected = document.querySelector('link[data-css-parity="projected"]');
    const reference = document.querySelector('link[data-css-parity="canonical"]');
    // No layout read occurs between these assignments. Both resources and their
    // CSSStyleSheet objects remain resident; exactly one becomes applicable.
    projected.media = canonical ? 'not all' : projectedMedia;
    reference.media = canonical ? 'all' : 'not all';
    if (loadFont) void document.fonts.load('400 16px "Archivo Var"', 'Diagnóstico público 0123456789').catch(() => {});
  }, canonical, stylesheetPair.projected_media, context.font_mode === 'loaded');
  await settle();
}

async function warmFontMedia() {
  // Resource loading happened in a separate document before this route painted.
  // Exercise both resident sheets in the current screen/print media and prove
  // the actual glyph fonts through CDP, without changing authored declarations.
  await activateStylesheet(true);
  const canonical = await platformFonts();
  assertFontMode(canonical);
  await activateStylesheet(false);
  const projected = await platformFonts();
  assertFontMode(projected);
  assert.deepEqual(projected, canonical, 'both resident sheets use the same platform fonts before comparison');
}

async function prepareStylesheets() {
  stylesheetPair = await page.evaluate(canonicalHref => {
    const matches = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter(link => /\/diagnostico-base(?:\.[a-f0-9]+)?\.css(?:\?|$)/.test(link.getAttribute('href')));
    if (matches.length !== 1) throw new Error('one projected base stylesheet is required');
    const projected = matches[0];
    const reference = document.createElement('link');
    reference.rel = 'stylesheet';
    reference.href = canonicalHref;
    reference.media = 'not all';
    reference.dataset.cssParity = 'canonical';
    projected.dataset.cssParity = 'projected';
    // Preserve the existing order relative to the tool's own bundle.
    projected.after(reference);
    return { projected_href: projected.getAttribute('href'), canonical_href: canonicalHref,
      projected_media: projected.media || 'all' };
  }, fullSheet);
  await waitDOM(() => [...document.querySelectorAll('link[data-css-parity]')].length === 2
    && [...document.querySelectorAll('link[data-css-parity]')].every(link => {
      try { return link.sheet?.href === link.href && link.sheet.cssRules.length > 0; } catch { return false; }
    }), 'both resident stylesheets loaded');
  const faces = await page.evaluate(() => {
    const read = rules => [...rules].flatMap(rule => {
      if (rule.type === CSSRule.FONT_FACE_RULE) return [rule.cssText];
      if (rule.type === CSSRule.IMPORT_RULE) return read(rule.styleSheet.cssRules);
      return rule.cssRules ? read(rule.cssRules) : [];
    });
    return Object.fromEntries([...document.querySelectorAll('link[data-css-parity]')]
      .map(link => [link.dataset.cssParity, read(link.sheet.cssRules)]));
  });
  assert.ok(faces.projected.length > 0, 'authored font-face rules are present');
  assert.deepEqual(faces.projected, faces.canonical, 'projection preserves every font-face descriptor and its order');
  report.font_contracts.push({ ...context, font_face_count: faces.projected.length,
    font_face_sha256: digest(JSON.stringify(faces.projected)), cache_disabled: context.font_mode === 'fallback' });
  await warmFontMedia();
}

async function capture(name) {
  const filename = `${context.font_mode}-${context.javascript ? 'js' : 'nojs'}-${context.width}-${context.state}-${name}.png`;
  await page.screenshot({ path: resolve(evidenceDir, filename) });
  report.screenshots.push({ file: filename, ...context, stylesheet: name });
}

async function parity(state, screenshots = false) {
  context = { ...context, state };
  await page.mouse.move(0, 0);
  await settle();
  const before = await snapshot();
  assertFontMode(before.fonts);
  if (screenshots) await capture('projected');
  let canonical;
  let restored;
  try {
    await activateStylesheet(true);
    canonical = await snapshot();
    assertFontMode(canonical.fonts);
    if (screenshots) await capture('canonical');
  } finally {
    await activateStylesheet(false);
    restored = await snapshot();
    assertFontMode(restored.fonts);
  }
  const differences = compare(before, canonical);
  const restoration = compare(before, restored);
  const row = { ...context, elements: before.nodes.length, properties: properties.length,
    dom_sha256: digest(before.dom), ...stylesheetPair,
    platform_fonts: before.fonts, canonical_platform_fonts: canonical.fonts,
    restored_platform_fonts: restored.fonts, blocked_font_requests: blockedFonts,
    differences: differences.length, restoration_differences: restoration.length,
    samples: differences.slice(0, 100), restoration_samples: restoration.slice(0, 30),
    status: differences.length || restoration.length ? 'failed' : 'passed' };
  report.scenarios.push(row);
  if (row.status === 'failed') {
    report.failures.push({ ...context, differences: differences.length, restoration_differences: restoration.length });
    console.error('DIAGNOSTIC_CSS_PARITY_DIFF', JSON.stringify(row));
  }
}

async function keyboardActivate(selector) {
  await page.focus(selector);
  await page.keyboard.press('Enter');
}

async function fill(selector, value) {
  await page.focus(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.type(value);
}

async function primeFontBeforeDocument() {
  if (context.font_mode !== 'loaded') return;
  const javascript = page.isJavaScriptEnabled();
  const response = await page.goto(base + '/_qa/diagnostic-font-warmup/', { waitUntil: 'load', timeout: 30000 });
  assert.equal(response?.status(), 200, 'same-origin font preparation document');
  assert.equal(await page.evaluate(() => document.scripts.length), 0, 'font preparation has no application scripts');
  // A late load cannot reverse optional's fallback decision in a painted page.
  // Decode the exact authored face in this empty document, then navigate fresh.
  // Native tests keep scripts disabled on the application route throughout;
  // only this empty preparation document needs to resolve FontFace.load().
  if (!javascript) await page.setJavaScriptEnabled(true);
  try {
    const faces = await page.evaluate(async () => {
      const faces = [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Archivo Var');
      if (!faces.length) throw new Error('canonical stylesheet has no Archivo Var FontFace');
      await Promise.all(faces.map(face => face.load()));
      await document.fonts.ready;
      return faces.map(face => ({ family: face.family, status: face.status, weight: face.weight,
        stretch: face.stretch, style: face.style, display: face.display }));
    });
    assert.ok(faces.every(face => face.status === 'loaded'), 'authored Archivo bytes decoded before route navigation');
    report.font_warmups.push({ ...context, url: new URL(page.url()).pathname, application_scripts: 0, faces });
  } finally {
    if (!javascript) await page.setJavaScriptEnabled(false);
  }
}

async function visit() {
  await primeFontBeforeDocument();
  let response = await page.goto(base + route, { waitUntil: 'load', timeout: 30000 });
  if (!response) response = await page.reload({ waitUntil: 'load', timeout: 30000 });
  assert.equal(response?.status(), 200, route);
  // Load the authored lazy footer logo through ordinary scrolling before either
  // CSS snapshot. No DOM/style override is used to manufacture equivalent paint.
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await waitDOM(() => [...document.images].every(image => image.complete), 'authored images loaded');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await settle();
  await prepareStylesheets();
}

async function newPage(width, javascript, fontMode = 'loaded') {
  if (page) await page.close();
  if (isolatedContext) await isolatedContext.close();
  isolatedContext = fontMode === 'fallback' ? await browser.createBrowserContext() : null;
  page = await (isolatedContext || browser).newPage();
  cdp = await page.createCDPSession();
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  blockedFonts = 0;
  context = { width, height: 900, javascript, font_mode: fontMode, state: 'visit' };
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  if (fontMode === 'fallback') await page.setCacheEnabled(false);
  await page.setJavaScriptEnabled(javascript);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  // Exercise the real fallback handler when the browser denies clipboard/share.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('Fixture denial', 'NotAllowedError')) } });
    Object.defineProperty(navigator, 'share', { configurable: true,
      value: () => Promise.reject(new DOMException('Fixture denial', 'NotAllowedError')) });
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    const local = url.origin === new URL(base).origin;
    if (request.method() !== 'GET') {
      report.blocked_requests.push({ method: request.method(), origin: url.origin, path: url.pathname });
      if (local && url.pathname === '/api/web/lead' && holdLead && !pendingLead) {
        // Hold at interception to inspect the real pending state, then abort.
        // Nothing is sent to even the local server, much less the lead service.
        pendingLead = request;
        return;
      }
      void request.abort().catch(() => {});
      return;
    }
    if (!local && !request.url().startsWith('data:')) {
      report.blocked_requests.push({ method: 'GET', origin: url.origin, path: url.pathname });
      void request.abort().catch(() => {});
      return;
    }
    if (fontMode === 'fallback' && (request.resourceType() === 'font' || /\.(?:woff2?|ttf|otf)$/i.test(url.pathname))) {
      blockedFonts += 1;
      report.blocked_requests.push({ method: 'GET', origin: url.origin, path: url.pathname,
        reason: 'font-fallback-fixture', width });
      void request.abort().catch(() => {});
      return;
    }
    if (local && holdSnapshot && url.pathname === route + 'snapshot.json') {
      pendingSnapshots.push(request);
      return;
    }
    void request.continue().catch(() => {});
  });
  page.on('pageerror', error => report.page_errors.push({ ...context, message: String(error) }));
}

try {
  await mkdir(evidenceDir, { recursive: true });
  report.source_sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(report.source_sha, /^[a-f0-9]{40}$/, 'actual checked-out source revision');
  const identityPath = resolve(root, '.well-known/build-info.json');
  const identity = await readFile(identityPath, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (identity !== null) {
    report.build_identity = JSON.parse(identity);
    assert.equal(report.build_identity.commit || report.build_identity.web_cfg_sha, report.source_sha,
      'compiled identity belongs to the actual checked-out revision');
  }
  assert.ok((await stat(resolve(root, 'styles.css'))).isFile(), 'canonical global CSS is available at /styles.css');
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
  report.base_url = base;
  browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ['--no-sandbox'] });
  for (const width of [390, 1440]) {
    commerceEnabled = false;
    holdSnapshot = true;
    await newPage(width, true);
    await visit();
    await waitDOM(() => document.querySelector('#lead-form')?.dataset.formReady === 'true', 'shared form initialized');
    await poll(() => pendingSnapshots.length > 0, 'snapshot request intercepted');
    await parity('runtime-loading');
    holdSnapshot = false;
    for (const request of pendingSnapshots.splice(0)) await request.continue();
    await waitDOM(() => !document.querySelector('#lookup .tool-runtime-fields').disabled, 'snapshot unlocks the search');
    const publicId = await page.$eval('#public-contract-id', element => element.value);
    assert.ok(publicId, 'authored public contract is available for the local search');
    await parity('ready', true);

    const nav = width <= 1120 ? '.mobile-nav' : '.desktop-nav';
    if (width <= 1120) await keyboardActivate('.menu-toggle');
    await keyboardActivate(`${nav} [data-nav-group="ferramentas"] > summary`);
    await waitDOM(selector => document.querySelector(selector)?.open, 'navigation group opened', `${nav} [data-nav-group="ferramentas"]`);
    await parity('navigation-open', true);
    await page.keyboard.press('Tab');
    await waitDOM(() => document.activeElement?.classList.contains('nav-destination'), 'keyboard focus enters destination');
    await parity('navigation-focus');
    await page.keyboard.press('Escape');
    if (width <= 1120) await page.keyboard.press('Escape');
    await waitDOM(() => !document.body.classList.contains('menu-open') && !document.querySelector('.nav-group[open]'), 'menu closes and restores background');
    await parity('navigation-restored');

    await fill('#qid', publicId);
    await page.keyboard.press('Enter');
    await waitDOM(() => !document.querySelector('#diagnostic-result').hidden && document.activeElement?.id === 'diagnostic-result', 'successful result is focused');
    await parity('result', true);
    await page.emulateMediaType('print');
    await warmFontMedia();
    await parity('print-result', true);
    await page.emulateMediaType('screen');
    await warmFontMedia();
    await page.click('#btn-reset');
    await waitDOM(() => document.querySelector('#diagnostic-result').hidden, 'reset hides result');
    await parity('cleared');
    await fill('#qid', 'no-contract-matches-this-parity-fixture');
    await page.keyboard.press('Enter');
    await waitDOM(() => document.querySelector('#lookup-status').classList.contains('is-error'), 'unknown query explains its failure');
    await parity('lookup-error');

    await fill('#qid', publicId);
    await page.keyboard.press('Enter');
    await waitDOM(() => !document.querySelector('#diagnostic-result').hidden, 'result restored for contact');
    await fill('#nome', 'CSS parity fixture');
    await page.click('#consentimento');
    await page.click('#lead-form [type="submit"]');
    await waitDOM(() => document.querySelector('#lead-form .form-status').classList.contains('is-error')
      && document.querySelector('#email').getAttribute('aria-invalid') === 'true', 'required contact validation');
    await parity('contact-invalid');
    await fill('#email', 'css-parity@example.invalid');
    holdLead = true;
    await page.click('#lead-form [type="submit"]');
    await poll(() => pendingLead !== null, 'lead held before any network transmission');
    await waitDOM(() => document.querySelector('#lead-form [type="submit"]').disabled
      && document.querySelector('#lead-form .form-status').classList.contains('is-ok'), 'submission pending state');
    await parity('contact-pending');
    holdLead = false;
    await pendingLead.abort();
    pendingLead = null;
    await waitDOM(() => document.querySelector('#lead-form [data-wa-fallback]')
      && !document.querySelector('#lead-form [type="submit"]').disabled, 'failed submission exposes local recovery');
    await parity('contact-fallback');

    await page.click('[data-share-copy]');
    await waitDOM(() => !document.querySelector('.tool-share-manual').hidden, 'clipboard denial exposes manual sharing');
    await parity('share-manual');
    await page.click('#confenge-analytics-preference button:first-of-type');
    await waitDOM(() => document.querySelector('#confenge-analytics-preference button:first-of-type').hidden, 'analytics consent granted locally');
    await parity('analytics-granted');
    await page.click('#confenge-analytics-preference button:last-of-type');
    await waitDOM(() => !document.querySelector('#confenge-analytics-preference button:first-of-type').hidden, 'analytics consent revoked locally');
    await parity('analytics-denied');

    commerceEnabled = true;
    await visit();
    await waitDOM(() => !document.querySelector('[data-referral-entry]').hidden, 'local config reveals referral entry');
    await parity('referral-enabled');
    commerceEnabled = false;

    await newPage(width, false);
    await visit();
    await parity('native-ready', true);
    const nativeNav = width <= 1120 ? '.mobile-nav' : '.desktop-nav';
    const nativeVisible = await page.$eval(`${nativeNav} [data-nav-group="ferramentas"] > summary`, element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    });
    // Some uncompiled sources predate the no-js bootstrap. Record the actual
    // state; the same baseline comparison still catches CSS hiding a reference
    // control. The compiled artifact must expose its native mobile navigation.
    const hasNativeBootstrap = await page.evaluate(() => document.documentElement.classList.contains('no-js'));
    if (hasNativeBootstrap || width > 1120) assert.ok(nativeVisible, 'native navigation is visible');
    report.scenarios.at(-1).native_navigation_visible = nativeVisible;
    report.scenarios.at(-1).no_js_marker = hasNativeBootstrap;
    if (nativeVisible) {
      await keyboardActivate(`${nativeNav} [data-nav-group="ferramentas"] > summary`);
      await waitDOM(selector => document.querySelector(selector)?.open, 'native disclosure opens with Enter', `${nativeNav} [data-nav-group="ferramentas"]`);
      await parity('native-navigation', true);
    }
    await page.emulateMediaType('print');
    await warmFontMedia();
    await parity('native-print');
    assert.equal(page.isJavaScriptEnabled(), false, 'native states never enable application scripts');
  }
  // Separate cold contexts prevent an already-cached web font from making the
  // fallback fixture pass without actually exercising the local font stack.
  for (const width of [390, 1440]) {
    await newPage(width, true, 'fallback');
    await visit();
    await waitDOM(() => !document.querySelector('#lookup .tool-runtime-fields').disabled, 'fallback snapshot loaded');
    await parity('fallback-ready', true);
    const nav = width <= 1120 ? '.mobile-nav' : '.desktop-nav';
    if (width <= 1120) await keyboardActivate('.menu-toggle');
    await keyboardActivate(`${nav} [data-nav-group="ferramentas"] > summary`);
    await waitDOM(selector => document.querySelector(selector)?.open, 'fallback menu opened', `${nav} [data-nav-group="ferramentas"]`);
    await parity('fallback-navigation', true);
    await page.keyboard.press('Escape');
    if (width <= 1120) await page.keyboard.press('Escape');
    await page.emulateMediaType('print');
    await warmFontMedia();
    await parity('fallback-print', true);
  }
  assert.equal(report.page_errors.length, 0, JSON.stringify(report.page_errors));
  assert.equal(report.failures.length, 0, 'projected stylesheet must match canonical CSS in every state');
  report.status = 'passed';
  console.log('DIAGNOSTIC_CSS_PARITY_OK', JSON.stringify({ scenarios: report.scenarios.length,
    properties: properties.length, screenshots: report.screenshots.length, site_root: root }));
} catch (error) {
  report.status = 'failed';
  report.failures.push({ ...context, message: String(error), stack: error?.stack });
  console.error('DIAGNOSTIC_CSS_PARITY_FAILED', JSON.stringify(report.failures.at(-1)));
  if (page) {
    try { await page.screenshot({ path: resolve(evidenceDir, 'failure.png') }); } catch {}
  }
  process.exitCode = 1;
} finally {
  if (pendingLead) await pendingLead.abort().catch(() => {});
  for (const request of pendingSnapshots) await request.abort().catch(() => {});
  await writeFile(resolve(evidenceDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
}
