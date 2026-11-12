import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const publicRoot = fs.existsSync(path.join(root, '_site/ops/index.html')) ? path.join(root, '_site') : root;
const output = path.resolve(process.argv[2] || path.join(root, 'build/ready-project-ops'));
const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-ops-browser-'));
Object.assign(process.env, { NODE_ENV: 'test', LEAD_STORE_DIR: storeDir, OPS_TOKEN: 'b'.repeat(32) });
for (const key of ['CONFENGE_STORAGE_DIR', 'CONFENGE_STORAGE_BACKEND', 'RUNTIME_PROFILE']) delete process.env[key];
const { FileStore } = require('../../netlify/functions/lib/lead-store.cjs');
const { handler } = require('../../netlify/functions/ops.cjs');
await new FileStore(storeDir).put({
  lead_id: 'lead_project_browser_validation', record_kind: 'real', intent: 'ready_project_interest',
  nome: 'Pessoa de validação', email: 'contato@example.com', telefone: '48988887777',
  received_at: new Date().toISOString(), commercial_stage: 'qualified',
  route_family: 'ready_projects', estagio: 'projetos-prontos', jornada: 'projeto',
  landing_page: '/projetos-prontos/', project_interest: {
    kind: 'license', product_id: null, city: 'Florianópolis', uf: 'SC',
    lot_width_m: 10, lot_depth_m: 25, lot_status: 'owned', bedrooms: '2', build_when: 'unknown',
  },
}, { onlyIfNew: true });
let pausedContacts = null;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/.netlify/functions/ops') {
      if (url.searchParams.get('family') === 'ready_projects' && pausedContacts) await pausedContacts;
      let body = ''; for await (const chunk of req) body += chunk;
      const result = await handler({ httpMethod: req.method, headers: req.headers,
        queryStringParameters: Object.fromEntries(url.searchParams), body });
      res.writeHead(result.statusCode, result.headers); res.end(result.body); return;
    }
    const target = path.resolve(publicRoot, '.' + (url.pathname === '/ops/' ? '/ops/index.html' : url.pathname));
    if (!target.startsWith(publicRoot + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404); res.end(); return; }
    const type = { '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' }[path.extname(target)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(target).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  fs.mkdirSync(output, { recursive: true });
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/ops/`);
  await page.click('[data-tab="projects"]');
  await page.click('#btn-project-contacts');
  await page.waitForFunction(() => !document.querySelector('#error').hidden);
  assert.equal(await page.$eval('#projects-body', el => el.textContent.includes('contato@example.com')), false);
  await page.type('#token', process.env.OPS_TOKEN);
  await page.click('#btn-load');
  await page.waitForFunction(() => document.querySelector('#projects-kpi').children.length === 6);
  await page.click('#btn-project-contacts');
  await page.waitForFunction(() => document.querySelector('#projects-body').textContent.includes('Florianópolis/SC'));
  assert.equal(await page.$eval('#projects-body', el => el.textContent.includes('contato@example.com')), true);
  assert.equal(await page.$eval('#btn-project-export', el => el.disabled), false);
  for (const [label, width, height] of [['desktop', 1365, 1000], ['mobile', 390, 844]]) {
    await page.setViewport({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: path.join(output, label + '.png'), fullPage: true });
  }
  await page.click('#projects-body button');
  assert.equal(await page.$eval('#stage-id', el => el.value), 'lead_project_browser_validation');
  assert.equal(await page.$eval('#panel-leads', el => el.classList.contains('active')), true);
  await page.click('[data-tab="projects"]');
  let releaseContacts;
  pausedContacts = new Promise(resolve => { releaseContacts = resolve; });
  const pending = page.waitForRequest(request => request.url().includes('family=ready_projects'));
  await page.click('#btn-project-contacts'); await pending;
  await page.$eval('#token', el => { el.value = ''; el.dispatchEvent(new Event('input')); });
  releaseContacts(); await page.waitForNetworkIdle({ idleTime: 150 });
  assert.equal(await page.$eval('#projects-body', el => el.textContent), '');
  assert.equal(await page.$eval('#btn-project-export', el => el.disabled), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, source: publicRoot === root ? 'source' : 'public-artifact', checks: ['unauthenticated_denied', 'private_qualification_visible', 'export_available', 'desktop_mobile_no_overflow', 'existing_stage_editor_reused', 'no_script_errors'], screenshots: output }));
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  fs.rmSync(storeDir, { recursive: true, force: true });
}
