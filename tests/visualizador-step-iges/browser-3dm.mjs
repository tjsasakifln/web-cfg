import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { resolveChromePath } from '../../scripts/site/resolve_chrome.mjs';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const root = resolve(process.cwd());
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.3dm': 'application/octet-stream', '.stp': 'application/step' };
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'";

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const requestPath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const filename = resolve(root, `.${requestPath}`);
  if (!filename.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', ...(csp && { 'Content-Security-Policy': csp }) });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: resolveChromePath(), headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });

try {
  const page = await browser.newPage();
  const requests = new Set();
  const resourceUrls = new Set();
  const errors = [];
  const missing = [];
  page.on('requestfinished', request => {
    resourceUrls.add(request.url());
    requests.add(new URL(request.url()).pathname);
  });
  page.on('response', response => {
    if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('unsafe-eval')) {
      errors.push(`${message.text()} ${JSON.stringify(message.stackTrace())}`);
    }
  });
  await page.goto(`http://127.0.0.1:${port}/ferramentas/visualizador-step-iges/`, { waitUntil: 'networkidle0' });
  await page.click('#open-example-3dm');
  try {
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('pronto para inspeção visual'), { timeout: 20000 });
  } catch (error) {
    throw new Error(`3DM did not render: ${await page.$eval('#status', node => node.textContent)} | ${errors.join('; ')} | ${missing.join('; ')} | ${[...requests].filter(path => path.includes('rhino')).join(', ')} | rhino=${await page.evaluate(() => typeof window.rhino3dm)}`, { cause: error });
  }
  assert.equal((await page.$$('#viewer canvas')).length, 1, '3DM rendered into a canvas');
  assert.ok(requests.has('/ferramentas/visualizador-step-iges/vendor/rhino3dm/rhino3dm.min.js'), 'loads local rhino3dm JavaScript');
  assert.ok(requests.has('/ferramentas/visualizador-step-iges/vendor/rhino3dm/rhino3dm.wasm'), 'loads local rhino3dm WebAssembly');
  assert.equal([...resourceUrls].some(url => url.includes('cdn.jsdelivr.net/npm/rhino3dm')), false, 'does not request a Rhino CDN');
  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
  console.log('3DM browser verification passed');
} finally {
  await browser.close();
  server.closeAllConnections?.();
  await new Promise(resolveServer => server.close(resolveServer));
}
