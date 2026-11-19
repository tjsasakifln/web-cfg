#!/usr/bin/env node
// Private synthetic publication, real HTTP renderer and first-party assets.
// No fixture or screenshot is written to the repository or public artifact.
import assert from 'node:assert/strict';
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
const sourceAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
const year = now.getUTCFullYear();
const id = `12345678000195-2-000001/${year}`;
const article = {
  id, slug: 'saneamento-municipio-exemplo-a4d2c93e10b57f68',
  title: 'Município de Exemplo registra contrato de R$ 9,3 milhões para redes de saneamento',
  description: 'Registro no PNCP informa contratação de redes de saneamento, com valor global, fornecedor e vigência. Consulte os dados e a fonte oficial.',
  lead: 'O Município de Exemplo registrou no PNCP um contrato para a execução de redes de saneamento e serviços de engenharia. O valor global informado é de R$ 9.345.678,90.',
  paragraphs: [
    'O objeto registrado compreende a implantação de redes de saneamento e serviços de engenharia. A contratação foi firmada com Engenharia Exemplo Ltda., conforme identificação do fornecedor no registro consultado.',
    'O valor global apresentado na fonte é de R$ 9.345.678,90. Esse campo identifica o montante informado no contrato, enquanto os dados de execução e pagamento dependem dos documentos correspondentes.',
    'A unidade do órgão contratante está cadastrada em Florianópolis, Santa Catarina. O município informado no cadastro identifica a unidade administrativa e não define, por si só, a localização dos serviços.',
    'As datas disponíveis, o objeto integral e o acesso ao registro oficial estão reunidos nesta página para consulta. A fonte permite conferir as informações diretamente no Portal Nacional de Contratações Públicas.',
  ],
  category: 'saneamento', published_at: publishedAt, modified_at: publishedAt,
  facts: {
    id, supplier_type: 'PJ', buyer: 'Município de Exemplo', supplier: 'Engenharia Exemplo Ltda.',
    object: 'Execução de redes de saneamento e serviços de engenharia, incluindo implantação da infraestrutura e recomposição das áreas afetadas.',
    value: { amount: '9345678.9042', kind: 'valorGlobal', currency: 'BRL' },
    source_url: `https://pncp.gov.br/app/contratos/12345678000195/${year}/1`,
    source_published_at: sourceAt, source_checked_at: now.toISOString(),
    signed_at: sourceAt.slice(0, 10), starts_at: sourceAt.slice(0, 10),
    ends_at: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    administrative_location: { city: 'Florianópolis', state: 'SC' },
  },
};
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
const mime = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    if (await serveNews(request, response)) return;
    const pathname = new URL(request.url, 'http://localhost').pathname;
    // The browser's first-party analytics transport is local and non-persistent.
    if (['/api/web/collect', '/.netlify/functions/collect'].includes(pathname) && request.method === 'POST') {
      request.resume();
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (pathname === '/inteligencia/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(await readFile(join(root, 'inteligencia/index.html')));
      return;
    }
    if (!pathname.startsWith('/assets/') && !['/styles.css', '/styles-tokens.css', '/script.js', '/favicon.ico', '/manifest.webmanifest'].includes(pathname)) {
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
  report.scenarios.push({ name: 'intelligence body to news archive', passed: true });

  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const response = await page.goto(base + articlePath, { waitUntil: 'networkidle0', timeout: 30_000 });
    assert.equal(response.status(), 200);
    await page.evaluate(() => document.fonts.ready);
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
    assert.equal(metadata.source, article.facts.source_url);
    assert.equal(metadata.cta, '/acompanhamento-contratos-obras/');
    assert.ok(metadata.whatsapp.startsWith('https://wa.me/5548988344559?'));
    assert.ok(!metadata.whatsapp.includes('12345678000195'));
    assert.equal(metadata.assetId, assetId(article));
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
  }
  const indexResponse = await page.goto(base + PREFIX, { waitUntil: 'networkidle0', timeout: 30_000 });
  assert.equal(indexResponse.status(), 200);
  assert.equal(await page.$$eval('.news-card h2 a', links => links.length), 1);
  await assertLayout(page, 'mobile index');
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
