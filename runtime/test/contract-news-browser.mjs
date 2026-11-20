#!/usr/bin/env node
// Private synthetic publication, real HTTP renderer and first-party assets.
// No fixture or screenshot is written to the repository or public artifact.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createContractNews } from '../contract-news/server.mjs';
import { PUBLICATION_SCHEMA, POINTER_SCHEMA, PREFIX, assetId } from '../contract-news/schema.mjs';
import { validateRenderedPublication } from '../contract-news/validate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const chrome = process.env.CHROME_PATH;
assert.ok(chrome && existsSync(chrome), 'CHROME_PATH must point to an installed Chromium');
const temporary = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'contract-news-browser-'));
assert.ok(!temporary.startsWith(resolve(root) + sep), 'Visual evidence must stay outside the repository');
const publicationDirectory = join(temporary, 'private-publication');
const evidenceDirectory = join(temporary, 'evidence');
await mkdir(publicationDirectory);
await mkdir(evidenceDirectory);

const now = new Date();
const publishedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
// Exercise the same documentary schema and private/public projection as the
// publisher. The legacy renderer has separate runtime regression coverage.
const article = JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c', `
import json,sys
sys.path.insert(0, 'tests/contract_news')
from editorial_fixtures import enriched_fact, editorial_draft
from scripts.contract_news.core import validate_draft, public_facts, slug_for, EDITORIAL_VERSION
fact = enriched_fact()
candidate = editorial_draft(fact)
draft = validate_draft(candidate, fact)
print(json.dumps({**draft, 'id': fact['id'], 'slug': slug_for(fact, candidate['subject']),
    'category': 'obras', 'published_at': ${JSON.stringify(publishedAt)},
    'modified_at': ${JSON.stringify(now.toISOString())}, 'facts': public_facts(fact),
    'editorial_version': EDITORIAL_VERSION}, ensure_ascii=False))
`], { cwd: root, encoding: 'utf8' }));
const snapshot = { schema: PUBLICATION_SCHEMA, generated_at: now.toISOString(), articles: [article] };
validateRenderedPublication(snapshot);
const bytes = Buffer.from(JSON.stringify(snapshot));
const digest = createHash('sha256').update(bytes).digest('hex');
const file = `snapshot-${digest}.json`;
await writeFile(join(publicationDirectory, file), bytes);
await writeFile(join(publicationDirectory, 'current.json'), JSON.stringify({
  schema: POINTER_SCHEMA, file, sha256: digest, generated_at: snapshot.generated_at, article_count: 1,
}));

const serveNews = createContractNews({ directory: publicationDirectory });
const collectedEvents = [];
const mime = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    if (await serveNews(request, response)) return;
    const pathname = new URL(request.url, 'http://localhost').pathname;
    // The browser's first-party analytics transport is local and non-persistent.
    if (['/api/web/collect', '/.netlify/functions/collect'].includes(pathname) && request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      collectedEvents.push(...JSON.parse(Buffer.concat(chunks).toString('utf8')).events);
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (['/inteligencia/', '/acompanhamento-contratos-obras/'].includes(pathname)) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(await readFile(join(root, pathname.slice(1), 'index.html')));
      return;
    }
    if (!pathname.startsWith('/assets/') && !['/styles.css', '/styles-tokens.css', '/styles-offers.css', '/script.js', '/favicon.ico', '/manifest.webmanifest'].includes(pathname)) {
      response.writeHead(404).end();
      return;
    }
    const asset = resolve(root, '.' + decodeURIComponent(pathname));
    if (!asset.startsWith(resolve(root) + sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': mime[extname(asset)] || 'application/octet-stream' }).end(await readFile(asset));
  } catch (error) {
    if (!response.headersSent) response.writeHead(500);
    response.end(String(error.message));
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const articlePath = PREFIX + article.slug + '/';
const report = { schema: 'confenge.contract-news-browser/v1', private_synthetic_fixture: true, scenarios: [], errors: [], screenshots: [] };
let browser;

async function capture(page, filename) {
  const path = join(evidenceDirectory, filename);
  await page.screenshot({ path, fullPage: true });
  const png = await readFile(path);
  const data = png.toString('base64');
  const chunkSize = 48_000;
  const metadata = {
    filename, content_type: 'image/png', bytes: png.length,
    sha256: createHash('sha256').update(png).digest('hex'),
    width: png.readUInt32BE(16), height: png.readUInt32BE(20),
    chunks: Math.ceil(data.length / chunkSize), private_synthetic_fixture: true,
  };
  report.screenshots.push(metadata);
  process.stdout.write('PUBLIC_EVIDENCE_META ' + JSON.stringify(metadata) + '\n');
  for (let start = 0; start < data.length; start += chunkSize) {
    process.stdout.write('PUBLIC_EVIDENCE_CHUNK ' + JSON.stringify({
      filename, index: start / chunkSize, data: data.slice(start, start + chunkSize),
    }) + '\n');
  }
}

async function visitBrandImages(page) {
  const images = await page.$$('.brand img,.footer-brand img');
  assert.equal(images.length, 2, 'Header and footer brand images must be present');
  // The footer is below the lazy-loading distance on narrow viewports. Visit
  // both images as a reader would, then restore the first fold for evidence.
  for (const image of images) {
    await image.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForFunction(element => element.complete && element.naturalWidth > 0, { timeout: 10_000 }, image);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
}

async function assertLayout(page, label) {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth,
    title: document.querySelector('h1')?.getBoundingClientRect().toJSON(),
    font: getComputedStyle(document.querySelector('h1')).fontFamily,
    logo: [...document.querySelectorAll('.brand img,.footer-brand img')].every(img => img.complete && img.naturalWidth > 0),
    menuOverflow: [...document.querySelectorAll('.news-mobile-menu[open] nav')].some(nav => nav.scrollWidth > nav.clientWidth + 1),
  }));
  assert.ok(geometry.document <= geometry.viewport + 1, `${label}: horizontal overflow ${JSON.stringify(geometry)}`);
  assert.ok(geometry.title?.width > 0 && geometry.title.right <= geometry.viewport + 1, `${label}: title clipped`);
  assert.ok(/Archivo/.test(geometry.font), `${label}: brand font missing`);
  assert.equal(geometry.logo, true, `${label}: brand image missing`);
  assert.equal(geometry.menuOverflow, false, `${label}: open mobile navigation overflows`);
  return geometry;
}

async function assertServiceClick(page, mode) {
  const selector = '[data-news-service-link="true"]';
  const previous = await page.evaluate(() => (window.dataLayer || []).filter(event => event.event === 'content_to_service').length);
  // Keep this test on the article while activating a native anchor. The
  // production scripts do not cancel its default navigation.
  await page.$eval(selector, link => link.addEventListener('click', event => event.preventDefault(), { once: true }));
  if (mode === 'keyboard') {
    await page.focus(selector);
    await page.keyboard.press('Enter');
  } else await page.click(selector);
  const transitions = await page.evaluate(() => (window.dataLayer || []).filter(event => event.event === 'content_to_service'));
  assert.equal(transitions.length, previous + 1, mode + ': exactly one event per activation');
  const event = transitions.at(-1);
  assert.equal(event.source_path, articlePath);
  assert.equal(event.source_asset_id, assetId(article));
  assert.equal(event.source_asset_family, 'editorial');
  assert.equal(event.destination_path, '/acompanhamento-contratos-obras/');
  assert.equal(event.destination_service_id, 'acompanhamento-contratos-obras');
  assert.equal(event.route_family, 'noticias-contratos-publicos');
  assert.ok(event.event_id);
  report.scenarios.push({ name: mode + ' news-to-service click', passed: true, events: 1, asset_id: event.source_asset_id });
}

try {
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-background-networking', '--no-first-run'] });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().startsWith('data:') || new URL(request.url()).origin === base) request.continue();
    else { report.errors.push('Unexpected external request: ' + new URL(request.url()).origin); request.abort(); }
  });
  page.on('pageerror', error => report.errors.push('Page: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push('Console: ' + message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`); });

  const hubResponse = await page.goto(base + '/inteligencia/', { waitUntil: 'networkidle0', timeout: 30_000 });
  assert.equal(hubResponse.status(), 200);
  const discovery = 'main [data-news-discovery="true"]';
  await page.waitForSelector(discovery, { visible: true });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click(discovery)]);
  assert.equal(new URL(page.url()).pathname, PREFIX);
  assert.equal(await page.$$eval('.news-card h2 a', links => links.length), 1);
  const discoveryId = 'intelligence-contract-news';
  // The native navigation flushes the prior document's analytics queue. Wait
  // for its real first-party request, then verify the entire discovery action.
  const discoveryDeadline = Date.now() + 5_000;
  while (!collectedEvents.some(event => event.props?.cta_id === discoveryId) && Date.now() < discoveryDeadline) {
    await new Promise(done => setTimeout(done, 25));
  }
  const discoveryEvents = collectedEvents.filter(event => event.props?.cta_id === discoveryId);
  assert.equal(discoveryEvents.length, 1, 'news discovery sends exactly one collector event');
  const discoveryEvent = discoveryEvents[0];
  assert.equal(discoveryEvent.event, 'cta_click', 'news discovery is a navigation click');
  assert.equal(discoveryEvent.props.page_path, '/inteligencia/');
  assert.equal(discoveryEvent.props.destination_type, 'route');
  assert.equal(discoveryEvent.props.destination_path, PREFIX);
  assert.equal(discoveryEvent.props.cta_position, 'content');
  assert.ok(discoveryEvent.props.event_id);
  assert.equal(collectedEvents.filter(event => event.event === 'content_to_service').length, 0,
    'news discovery must not emit a service conversion');
  report.scenarios.push({ name: 'intelligence body to news archive', passed: true, event: 'cta_click', destination_type: 'route', service_events: 0 });

  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const response = await page.goto(base + articlePath, { waitUntil: 'networkidle0', timeout: 30_000 });
    assert.equal(response.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    await visitBrandImages(page);
    const metadata = await page.evaluate(() => ({
      h1: [...document.querySelectorAll('h1')].map(element => element.textContent),
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      robots: document.querySelector('meta[name="robots"]')?.content,
      schema: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'].find(item => item['@type'] === 'NewsArticle'),
      source: document.querySelector('[data-source-kind="pncp"]')?.href,
      cta: document.querySelector('[data-cta-id="news-contract-support"]')?.getAttribute('href'),
      whatsapp: document.querySelector('[data-cta-id="news-contact-whatsapp"]')?.href,
      assetId: document.body.dataset.assetId,
    }));
    assert.deepEqual(metadata.h1, [article.title]);
    assert.equal(metadata.canonical, 'https://confenge.com.br' + articlePath);
    assert.ok(metadata.robots.startsWith('index,follow'));
    assert.equal(metadata.schema.datePublished, publishedAt);
    assert.equal(metadata.schema.author['@type'], 'Organization');
    assert.deepEqual(metadata.schema.citation, article.editorial.sources.map(source => source.url));
    assert.equal(metadata.source, article.facts.source_url);
    assert.equal(metadata.cta, '/acompanhamento-contratos-obras/');
    assert.ok(metadata.whatsapp.startsWith('https://wa.me/5548988344559?'));
    assert.ok(!metadata.whatsapp.includes('12345678000195'));
    assert.equal(metadata.assetId, assetId(article));
    assert.equal(await page.$eval('body', body => body.dataset.editorialVersion), article.editorial_version);
    assert.equal(await page.$$eval('.news-analysis', sections => sections.length), 1);
    assert.equal(await page.$$eval('.news-summary li', items => items.length), 3);
    assert.equal(await page.$eval('.news-original', details => details.open), false);
    if (name === 'mobile') {
      const order = await page.evaluate(() => ({
        story: document.querySelector('.news-story').getBoundingClientRect().top,
        registry: document.querySelector('.news-contract').getBoundingClientRect().top,
      }));
      assert.ok(order.story < order.registry, 'the mobile reader reaches the reporting before the raw registry');
    }
    report.scenarios.push({ name, width, height, geometry: await assertLayout(page, name) });
    await capture(page, `contract-news-${name}.png`);
    if (name === 'mobile') {
      await page.click('.news-mobile-menu > summary');
      await page.click('.news-mobile-nav [data-nav-group="conteudos"] > summary');
      const link = '.news-mobile-nav [data-nav-destination="biblioteca"]';
      await page.waitForSelector(link, { visible: true });
      await assertLayout(page, 'mobile open navigation');
      await page.click('.news-mobile-menu > summary');
      await page.setViewport({ width: 320, height: 740, deviceScaleFactor: 1 });
      await assertLayout(page, 'small mobile');
    }
    await assertServiceClick(page, name === 'mobile' ? 'keyboard' : 'pointer');
  }
  const indexResponse = await page.goto(base + PREFIX, { waitUntil: 'networkidle0', timeout: 30_000 });
  assert.equal(indexResponse.status(), 200);
  assert.equal(await page.$$eval('.news-card h2 a', links => links.length), 1);
  await visitBrandImages(page);
  await assertLayout(page, 'mobile index');
  const transitions = collectedEvents.filter(event => event.event === 'content_to_service');
  assert.equal(transitions.length, 2, 'the existing first-party transport sends both physical activations once');
  assert.equal(new Set(transitions.map(event => event.props.event_id)).size, 2);
  assert.ok(transitions.every(event => event.props.source_path === articlePath && event.props.source_asset_id === assetId(article)));
  assert.equal(collectedEvents.filter(event => event.props?.cta_id === discoveryId).length, 1,
    'news discovery stays a single event across subsequent article navigations');
  report.scenarios.push({ name: 'existing first-party collector transport', passed: true, events: transitions.length });

  await page.setJavaScriptEnabled(false);
  await page.goto(base + articlePath, { waitUntil: 'networkidle0' });
  const [serviceResponse] = await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('[data-news-service-link="true"]'),
  ]);
  assert.equal(new URL(page.url()).pathname, '/acompanhamento-contratos-obras/');
  assert.equal(serviceResponse.status(), 200);
  report.scenarios.push({ name: 'native service navigation without JavaScript', passed: true });
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
  await writeFile(join(evidenceDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write('CONTRACT_NEWS_BROWSER_OK ' + JSON.stringify(report) + '\n');
} catch (error) {
  report.status = 'failed';
  report.failure = error.message;
  await writeFile(join(evidenceDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  process.stderr.write('CONTRACT_NEWS_BROWSER_FAILED ' + JSON.stringify(report) + '\n');
  throw error;
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  await rm(publicationDirectory, { recursive: true, force: true });
}
