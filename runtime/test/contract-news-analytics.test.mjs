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
  // The IFC editor adds precisely one finite commerce dimension to the approved shared bundle.
  // Removing that single token must reproduce the frozen baseline byte for byte.
  const ifcDimension = '"bim-editor-ifc",';
  assert.equal(sharedScript.split(ifcDimension).length, 2, 'IFC dimension must occur exactly once');
  const approvedBaseline = sharedScript.replace(ifcDimension, '');
  assert.equal(createHash('sha256').update(approvedBaseline).digest('hex'), frozen.forbidden['script.js']);
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
