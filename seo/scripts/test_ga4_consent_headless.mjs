/** Consent boundary with the real Google loader; collection requests are blocked. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const publicRoot = process.env.SITE_ROOT ? resolve(root, process.env.SITE_ROOT) : root;
const csp = readFileSync(join(root, '_headers'), 'utf8').match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1];
assert(csp, 'test must enforce the deployed CSP contract');
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert(existsSync(chrome), `Chrome not found: ${chrome}`);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const requested = join(publicRoot, rel);
  const file = requested.startsWith(publicRoot) && existsSync(requested) ? requested : join(publicRoot, '404.html');
  res.writeHead(file === requested ? 200 : 404, { 'content-type': types[extname(file)] || 'application/octet-stream', 'content-security-policy': csp });
  res.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-background-networking', '--no-first-run'] });
try {
  const page = await browser.newPage();
  const google = [];
  const blockedExternal = [];
  const blockedFirstPartyWrites = [];
  const browserErrors = [];
  const loaderResponses = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('response', (response) => {
    if (/googletagmanager\.com\/gtag\/js/.test(response.url())) loaderResponses.push(response.status());
  });
  const isApprovedBootstrap = (url, method) => {
    const parsed = new URL(url);
    return method === 'GET'
      && parsed.protocol === 'https:' && parsed.port === '' && !parsed.username && !parsed.password
      && parsed.hostname === 'www.googletagmanager.com'
      && (parsed.pathname === '/gtag/js' || parsed.pathname === '/gtag/destination')
      && parsed.searchParams.get('id') === 'G-MT2G5L4KBR'
      && (!parsed.searchParams.has('l') || parsed.searchParams.get('l') === 'confengeGaQueue');
  };
  const isGoogleAnalyticsRequest = (url) => {
    const host = new URL(url).hostname;
    return host === 'www.googletagmanager.com'
      || host === 'www.google-analytics.com'
      || host === 'region1.google-analytics.com';
  };
  const waitFor = async (predicate, message) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.fail(`${message}: ${JSON.stringify({ google, loaderResponses, browserErrors })}`);
  };
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (new URL(url).origin === base) {
      if (['GET', 'HEAD'].includes(request.method())) return request.continue();
      blockedFirstPartyWrites.push(request.method());
      return request.abort('blockedbyclient');
    }
    if (isGoogleAnalyticsRequest(url)) {
      google.push({ url, method: request.method(), postData: request.postData() || '' });
      // The sole exception to deny-by-default is the approved GA bootstrap.
      // Collect requests reach this branch and are aborted before any network I/O.
      if (isApprovedBootstrap(url, request.method())) return request.continue();
    }
    blockedExternal.push({ url, method: request.method(), postData: request.postData() || '' });
    return request.abort('blockedbyclient');
  });
  await page.goto(`${base}/cliente/ana%2540example.test/?email=secret@example.test`, { waitUntil: 'networkidle0' });
  assert.equal(google.length, 0, 'no Google request before explicit grant');
  assert.equal(blockedExternal.length, 0, 'no external request is allowed before explicit grant');
  await page.evaluate(() => window.confengeSetGoogleAnalyticsConsent('granted'));
  await page.waitForFunction(() => document.querySelector('script[data-confenge-ga4]'));
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((entry) => /googletagmanager\.com\/gtag\/js/.test(entry.name)), { timeout: 10000 });
  await page.waitForFunction(() => typeof window.google_tag_manager === 'object', { timeout: 10000 });
  const loader = google.filter((item) => /googletagmanager\.com\/gtag\/js/.test(item.url));
  await waitFor(() => google.some((item) => /(?:^|\/)g\/collect(?:[/?]|$)/.test(new URL(item.url).pathname)), 'grant must attempt a collect request that this test blocks');
  const collects = google.filter((item) => /(?:^|\/)g\/collect(?:[/?]|$)/.test(new URL(item.url).pathname));
  assert.equal(loader.length, 1, 'grant loads one official Google tag script');
  assert(loaderResponses.includes(200), `the real Google loader must return 200: ${loaderResponses}`);
  assert.equal(browserErrors.length, 0, `browser errors: ${browserErrors.join('; ')}`);
  assert(collects.length >= 1, 'grant must attempt a collect request that this test blocks');
  const collectText = collects.map((item) => `${item.url} ${item.postData}`).join('\n');
  assert(/(?:[?&]|^)tid=G-MT2G5L4KBR(?:&|$)/.test(collectText), 'collect must target the approved measurement ID');
  assert(/(?:[?&]|^)en=page_view(?:&|$)/.test(collectText), 'collect must be the manual page view');
  assert(/dl=https?%3A%2F%2Fconfenge\.com\.br%2F404\.html(?:&|\s|$)/.test(collectText), 'collect must carry only the 404 canonical fallback');
  assert(/(?:[?&]|^)dt=CONFENGE(?:&|$)/.test(collectText), 'collect must use the fixed public page title');
  assert(!/secret%40example|secret@example|ana%2540|ana%40|ana-silva|\?email|#/.test(collectText), 'blocked collection must not carry URL query or PII');
  const beforeRevoke = google.length;
  await page.evaluate(() => {
    window.confengeSetGoogleAnalyticsConsent('denied');
    window.confengeTrack('cta_click', { page_path: '/', cta_id: 'private-id' });
  });
  await new Promise((done) => setTimeout(done, 500));
  assert.equal(google.length, beforeRevoke, 'revoke blocks later Google collection');
  console.log('GA4_CONSENT_HEADLESS_OK', JSON.stringify({ loader_gets: loader.length, blocked_collects: collects.length }));
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
