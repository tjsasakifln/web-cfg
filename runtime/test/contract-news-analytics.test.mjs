import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { renderIndex, contentPolicy } from '../contract-news/render.mjs';

const require = createRequire(import.meta.url);
const contract = require('../../netlify/functions/lib/event-contract.cjs');
const root = new URL('../../', import.meta.url);
const sharedScript = readFileSync(new URL('script.js', root), 'utf8');
const newsScript = readFileSync(new URL('assets/js/contract-news.js', root), 'utf8');
const markup = renderIndex({ articles: [] }).html;
const sourcePath = '/noticias/contratos-publicos/contrato-de-saneamento-a4d2c93e10b57f68/';
const assetId = 'news-a4d2c93e10b57f68';
const destination = '/acompanhamento-contratos-obras/';

const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));

function drive({ pathname = sourcePath, identity = assetId, denied = false, missingTracker = false } = {}) {
  const attrs = attributes(markup.match(/<a\b[^>]*data-news-service-link="true"[^>]*>/)[0]);
  attrs['data-asset-id'] = identity;
  const bodyAttrs = attributes(markup.match(/<body\b[^>]*>/)[0]);
  bodyAttrs['data-asset-id'] = identity;
  const listeners = [];
  const link = {
    textContent: 'Conhecer o apoio a contratos públicos',
    classList: { contains: () => false },
    getAttribute: name => attrs[name] ?? null,
    setAttribute: (name, value) => { attrs[name] = String(value); },
    hasAttribute: name => Object.hasOwn(attrs, name),
    closest: () => null,
    addEventListener(type, fn, capture) { if (type === 'click') listeners.push({ fn, capture: capture === true }); },
  };
  const dataLayer = [], requests = [], timers = [], storage = new Map();
  const document = {
    readyState: 'complete',
    body: { classList: { add() {}, remove() {} }, getAttribute: name => bodyAttrs[name] ?? null },
    documentElement: { scrollHeight: 2000, classList: { replace() {} } },
    head: { appendChild() {} }, referrer: '',
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === 'a[href]' || selector.startsWith('a[data-news-service-link=')) return [link];
      return [];
    },
    getElementById: () => null, addEventListener() {},
    createElement: () => ({ setAttribute() {}, querySelector: () => null }),
  };
  const fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, status: 202 }; };
  const window = {
    document, dataLayer, fetch, innerWidth: 1200, innerHeight: 800, scrollY: 0,
    location: { pathname, search: '?email=private%40example.invalid', hash: '' },
    matchMedia: () => ({ matches: false }), addEventListener() {},
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    localStorage: { getItem: key => key === 'confenge_analytics' && denied ? 'denied' : null },
  };
  window.window = window;
  const context = vm.createContext({ window, document, console, URL, URLSearchParams, fetch, navigator: {}, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout });
  vm.runInContext(sharedScript, context);
  assert.equal(typeof window.confengeTrack, 'function');
  if (missingTracker) delete window.confengeTrack;
  vm.runInContext(newsScript, context);
  return {
    dataLayer, requests, link,
    click() {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      for (const { fn } of [...listeners.filter(row => row.capture), ...listeners.filter(row => !row.capture)]) fn(event);
      return event;
    },
    async flush() {
      for (let round = 0; round < 12 && timers.length; round += 1) {
        const batch = timers.splice(0);
        for (const fn of batch) fn();
        for (let i = 0; i < 6; i += 1) await Promise.resolve();
      }
    },
  };
}

test('news integration preserves the approved shared bundle and uses the existing CSP', () => {
  const frozen = JSON.parse(readFileSync(new URL('data/bofu-dominance/frozen-specs/hashes.json', root), 'utf8'));
  // The IFC and spreadsheet recaptures are historical checkpoints, not
  // necessarily the final two history entries once another tools PR lands.
  // Select them by provenance and scope instead of by an unstable array tail.
  const ifcDimension = '"bim-editor-ifc",';
  assert.equal(sharedScript.split(ifcDimension).length, 2, 'IFC dimension must occur exactly once');
  const currentHash = createHash('sha256').update(sharedScript).digest('hex');
  const analyticsHash = createHash('sha256')
    .update(readFileSync(new URL('js/modules/analytics.js', root))).digest('hex');
  const ifcScope = ['script.js', 'js/modules/analytics.js', 'sitemap.txt', 'sitemap.xml'];
  const sitemapScope = ['sitemap.txt', 'sitemap-index.xml'];
  const toolsScope = ['script.js', 'js/modules/analytics.js'];
  const ifcSource = 'https://github.com/tjsasakifln/web-cfg/pull/859';
  const toolsSource = 'https://github.com/tjsasakifln/web-cfg/pull/865';
  const marketplaceSource = 'https://github.com/tjsasakifln/web-cfg/pull/893';
  const history = frozen.recapture_history;
  const ifcIndex = history.findIndex(entry =>
    entry.recapture_evidence?.pull_request === ifcSource &&
    JSON.stringify(entry.recapture_evidence.changed_protected_paths) === JSON.stringify(ifcScope));
  assert.ok(ifcIndex > 0, 'missing separately audited IFC recapture');
  const beforeIfc = history[ifcIndex - 1];
  const afterIfc = history[ifcIndex];
  const afterSitemaps = history.findLast(entry =>
    entry.recapture_evidence?.pull_request === ifcSource &&
    JSON.stringify(entry.recapture_evidence.changed_protected_paths) === JSON.stringify(sitemapScope));
  assert.ok(afterSitemaps, 'missing separately audited spreadsheet sitemap recapture');
  const afterTools = history.findLast(entry =>
    entry.recapture_evidence?.pull_request === toolsSource &&
    JSON.stringify(entry.recapture_evidence.changed_protected_paths) === JSON.stringify(toolsScope));
  assert.ok(afterTools, 'missing separately audited tool identifiers recapture');
  const afterMarketplace = [...history, frozen].findLast(entry =>
    entry.recapture_evidence?.pull_request === marketplaceSource);
  assert.ok(afterMarketplace, 'missing separately audited marketplace navigation recapture');

  assert.equal(currentHash, frozen.forbidden['script.js']);
  assert.equal(analyticsHash, frozen.forbidden['js/modules/analytics.js']);
  assert.equal(afterIfc.recapture_evidence.human_review_claimed, false);
  assert.equal(afterSitemaps.recapture_evidence.human_review_claimed, false);
  assert.equal(afterTools.recapture_evidence.human_review_claimed, false);
  assert.equal(afterMarketplace.recapture_evidence.human_review_claimed, false);
  assert.deepEqual(afterMarketplace.recapture_evidence.changed_protected_paths, ['script.js']);

  for (const path of ifcScope) {
    assert.ok(beforeIfc.forbidden[path], `missing earlier protected hash: ${path}`);
    assert.notEqual(afterIfc.forbidden[path], beforeIfc.forbidden[path],
      `unmodified protected asset incorrectly claimed by IFC recapture: ${path}`);
    assert.equal(afterIfc.recapture_evidence.changed_protected_hashes[path].previous,
      beforeIfc.forbidden[path]);
    assert.equal(afterIfc.recapture_evidence.changed_protected_hashes[path].current,
      afterIfc.forbidden[path]);
  }
  for (const [path, digest] of Object.entries(afterSitemaps.forbidden)) {
    if (sitemapScope.includes(path)) {
      assert.notEqual(digest, afterIfc.forbidden[path], `unmodified sitemap: ${path}`);
      assert.equal(afterSitemaps.recapture_evidence.changed_protected_hashes[path].previous,
        afterIfc.forbidden[path]);
      assert.equal(afterSitemaps.recapture_evidence.changed_protected_hashes[path].current,
        digest);
    } else {
      assert.equal(digest, afterIfc.forbidden[path], `unexpected historical protected drift: ${path}`);
    }
  }
  for (const [path, digest] of Object.entries(afterTools.forbidden)) {
    if (toolsScope.includes(path)) {
      assert.notEqual(digest, afterSitemaps.forbidden[path],
        `missing recorded tool-script recapture: ${path}`);
      assert.equal(afterTools.recapture_evidence.changed_protected_hashes[path].previous,
        afterSitemaps.forbidden[path]);
      assert.equal(afterTools.recapture_evidence.changed_protected_hashes[path].current,
        digest);
    } else {
      assert.equal(digest, afterSitemaps.forbidden[path],
        `unexpected protected drift after sitemap recapture: ${path}`);
    }
  }
  const { 'script.js': previousScript, ...previousProtected } = afterTools.forbidden;
  const { 'script.js': marketplaceScript, ...marketplaceProtected } = afterMarketplace.forbidden;
  assert.deepEqual(marketplaceProtected, previousProtected);
  assert.notEqual(previousScript, marketplaceScript);
  assert.deepEqual(afterMarketplace.recapture_evidence.changed_protected_hashes['script.js'], {
    previous: previousScript, current: marketplaceScript,
  });
  assert.deepEqual(frozen.pillars, beforeIfc.pillars, 'the six frozen pillars must remain unchanged');
  assert.deepEqual(frozen.pillars, afterIfc.pillars, 'the six frozen pillars must remain unchanged');
  assert.deepEqual(frozen.pillars, afterSitemaps.pillars, 'the six frozen pillars must remain unchanged');
  assert.deepEqual(frozen.pillars, afterMarketplace.pillars, 'the six frozen pillars must remain unchanged');
  assert.match(markup, /<script defer src="\/script\.js"><\/script><script defer src="\/assets\/js\/contract-news\.js"><\/script>/);
  assert.match(markup, /href="\/acompanhamento-contratos-obras\/" data-cta-id="news-contract-support" data-news-service-link="true"/);
  assert.match(contentPolicy(), /script-src 'self'/);
  assert.doesNotMatch(contentPolicy(), /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(newsScript, /fetch\(|sendBeacon|dataLayer|preventDefault\(|stopPropagation\(/);
});

test('one native click produces one admitted transition with origin and hashed asset through the shared collector', async () => {
  const app = drive();
  for (let expected = 1; expected <= 2; expected += 1) {
    assert.equal(app.click().defaultPrevented, false, 'the normal anchor remains navigable');
    const transitions = app.dataLayer.filter(row => row.event === 'content_to_service');
    assert.equal(transitions.length, expected, 'the shared listeners must not duplicate the click');
    const event = transitions.at(-1);
    assert.equal(event.source_path, sourcePath);
    assert.equal(event.source_asset_id, assetId);
    assert.equal(event.source_asset_family, 'editorial');
    assert.equal(event.destination_path, destination);
    assert.equal(event.destination_service_id, 'acompanhamento-contratos-obras');
    assert.equal(event.route_family, 'noticias-contratos-publicos');
    assert.equal(event.source, 'CONFENGE_WEB');
    assert.ok(event.event_id && event.session_id);
  }
  await app.flush();
  assert.ok(app.requests.every(row => row.url === '/api/web/collect'));
  const sent = app.requests.flatMap(row => row.body.events).filter(row => row.event === 'content_to_service');
  assert.equal(sent.length, 2);
  for (const event of sent) {
    const admitted = contract.admitEvent(event);
    assert.equal(admitted.ok, true, JSON.stringify(admitted));
    assert.equal(admitted.event.props.source_asset_id, assetId);
    assert.equal(admitted.event.props.destination_service_id, 'acompanhamento-contratos-obras');
    assert.equal(admitted.event.layer, 'engagement');
  }
  assert.doesNotMatch(JSON.stringify(sent), /private|example\.invalid|12345678000195/);
});

test('news clicks respect shared analytics denial and never bypass a missing tracker', async () => {
  for (const options of [{ denied: true }, { missingTracker: true }]) {
    const app = drive(options);
    assert.equal(app.click().defaultPrevented, false);
    await app.flush();
    assert.equal(app.dataLayer.filter(row => row.event === 'content_to_service').length, 0);
    assert.equal(app.requests.flatMap(row => row.body.events).filter(row => row.event === 'content_to_service').length, 0);
  }
});

test('unbound source identity or changed destination cannot be reported as a news-to-service transition', () => {
  for (const options of [{ identity: '12345678000195' }, { pathname: '/noticias/contratos-publicos/12345678000195/' }]) {
    const app = drive(options);
    app.click();
    assert.equal(app.dataLayer.filter(row => row.event === 'content_to_service').length, 0);
  }
  const app = drive();
  app.link.setAttribute('href', '/empresa/');
  app.click();
  assert.equal(app.dataLayer.filter(row => row.event === 'content_to_service').length, 0);
});
