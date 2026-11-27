import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { chromium } from 'playwright';
import documents from '../../runtime/tools-commerce/etp-documents.cjs';

const root = new URL('../../', import.meta.url);
const route = '/ferramentas/gerador-etp/';
const workerAssets = '/ferramentas/medir-planta-pdf/workbench/app/assets/';
const staticPaths = new Set([
  route + 'etp.mjs', route + 'etp.css', route + 'etp-attachments.mjs',
  '/styles.css', '/script.js', '/assets/js/tool-referral.mjs', '/assets/js/tool-credits.mjs',
  '/assets/logo-confenge-500-f8a83f6d.png', '/assets/tool-showcase/gerador-etp.jpg',
  workerAssets + 'pdfTile.worker-Dv28ODaG.js', workerAssets + 'pdf.worker.min-yatZIOMy.mjs',
]);
const mockAuth = `
const user = {uid:'etp-test-verified',emailVerified:true,reload:async()=>{},getIdToken:async()=> 'fixture-token'};
const auth = {currentUser:user};
export const getApps=()=>[{name:'confenge-tools'}];
export const getAuth=()=>auth;
export const onAuthStateChanged=(input,callback)=>{callback(user);return ()=>{}};
`;
const files = documents.renderEtp({
  identification: { organization: 'Órgão Fictício', unit: 'Compras', process: 'Teste 2026', title: 'Contratação para teste' },
  sections: [{
    id: 'I', title: 'Necessidade da contratação', group: '2. Diagnóstico da situação atual',
    paragraphs: ['Texto de apoio da contratação fictícia para validar a leitura local no navegador.'],
  }],
  sources: [], scopeNote: 'Minuta para teste em navegador.',
});
const payloads = [];
let enabled = true, emittedId;

const mime = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png',
};
const send = (res, body, type = 'application/json', code = 200) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const op = u.searchParams.get('op');
  if (u.pathname === '/api/web/tool-credits') {
    if (op === 'config') return send(res, {
      enabled: true, etpEnabled: enabled, sharedExportsEnabled: true,
      tools: enabled ? ['modela-memoria', 'gerador-etp'] : ['modela-memoria'], firebase:{ apiKey:'fixture' },
    });
    if (req.headers.authorization !== 'Bearer fixture-token') return send(res, { error: 'AUTH_REQUIRED' }, 'application/json', 401);
    let chunks = '';
    for await (const part of req) chunks += part;
    const body = JSON.parse(chunks || '{}');
    payloads.push([op, body]);
    if (op === 'account') return send(res, { paid: 1 });
    if (op === 'etp-interview') return send(res, { questions: [{ id: 'IV', question: 'Qual é a unidade?', why: 'A quantidade precisa de unidade.' }], gaps: [] });
    if (op === 'etp-prepare') return send(res, { quote: { token: 'fixture-quote', bucket: 'paid' } });
    if (op === 'etp-generate') { emittedId = body.requestId; return send(res, { status: 'working' }, 'application/json', 202); }
    // Recovery comes from the account, not the tab: a new tab with no stored id still finds the issuance.
    if (op === 'etp-recent') return send(res, { items: emittedId ? [{ requestId: emittedId, status: 'ready', expiresAt: Date.now() + 60_000 }] : [] });
    if (op === 'etp-result') {
      return body.requestId === emittedId ? send(res, {
        status: 'ready', expiresAt: Date.now() + 60_000,
        files: { docx: files.docx.toString('base64'), pdf: files.pdf.toString('base64') },
      }) : send(res, { status: 'missing' });
    }
  }
  if (u.pathname === '/assets/tools-commerce/firebase-auth.mjs') return send(res, mockAuth, 'text/javascript');
  const isPage = u.pathname === route;
  if (!isPage && !staticPaths.has(u.pathname)) return send(res, '', 'text/plain', 404);
  const file = isPage ? route + 'index.html' : u.pathname;
  try { send(res, await readFile(new URL(file.slice(1), root)), mime[extname(file)]); }
  catch { send(res, '', 'text/plain', 404); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch(process.env.ETP_CHROME_BINARY ? { executablePath: process.env.ETP_CHROME_BINARY } : {});
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Never send site chrome or sample data to a third party during this test.
  const origin = 'http://127.0.0.1:' + server.address().port;
  await page.route('**/*', request => request.request().url().startsWith(origin + '/') ? request.continue() : request.abort());
  await page.goto(origin + route);
  const q = selector => page.locator(selector);
  const field = name => q(`[name="${name}"]`);
  await q('#etp-form').waitFor();
  assert.equal(await q('main h1').count(), 1);
  assert.equal(await q('link[rel=canonical]').getAttribute('href'), 'https://confenge.com.br/ferramentas/gerador-etp/');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await field('organization').fill('Órgão Fictício');
  await field('title').fill('Aquisição de equipamentos');
  await field('sphere').selectOption('federal');
  await field('objectType').selectOption('tic');
  await field('sisp').check();
  assert.match(await q('#etp-scope').textContent(), /SISP/);
  await q('#etp-file').setInputFiles({ name:'apoio.pdf', mimeType:'application/pdf', buffer:files.pdf });
  await field('etp-source-text-F1').waitFor({ timeout: 24_000 });
  assert.match(await field('etp-source-text-F1').inputValue(), /contratação fictícia/i);
  await field('etp-source-include-F1').check();
  await field('etp-source-text-F1').fill('Trecho autorizado e confirmado da aquisição.');
  assert.equal(await field('etp-source-include-F1').isChecked(), false);
  await field('etp-source-include-F1').check();
  await q('#etp-file').setInputFiles({ name:'apoio.docx', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer:files.docx });
  await field('etp-source-text-F2').waitFor();
  assert.match(await field('etp-source-text-F2').inputValue(), /contratação fictícia/i);
  await field('etp-source-include-F2').check();
  await q('button[data-go="1"]').first().click();
  assert.equal(await q('.etp-q').count(), 13);
  await q('#etp-inciso-VI summary').click();
  await field('vi-classified').check();
  assert.equal(await field('VI-prices').isVisible(), false);
  await q('button[data-go="2"]').first().click();
  await field('consent').check();
  await q('#etp-prepare').click();
  assert.match(await q('#etp-status').textContent(), /Desmarque/);
  assert.equal(payloads.length, 0);
  await q('button[data-go="1"]').first().click();
  await field('vi-classified').uncheck();
  await q('button[data-go="2"]').first().click();
  await q('#etp-prepare').click();
  await q('#etp-gaps a').waitFor();
  assert.equal(payloads[1][0], 'etp-interview');
  assert.deepEqual(payloads[1][1].input.sources.map(x => x.id), ['F1','F2']);
  assert.deepEqual(Object.keys(payloads[1][1].input.sources[0]), ['id', 'name', 'locator', 'text']);
  assert.equal(payloads[1][1].input.sources[0].text, 'Trecho autorizado e confirmado da aquisição.');
  await q('#etp-gaps a').click();
  assert.equal(await field('IV-text').evaluate(input => document.activeElement === input), true);
  await field('IV-text').fill('São necessárias 3 unidades no período anual.');
  await q('button[data-go="2"]').first().click();
  await q('#etp-prepare').click();
  await q('#etp-generate').waitFor();
  assert.match(await q('#etp-quote').textContent(), /Um crédito/);
  await q('#etp-generate').click();
  await q('#etp-downloads').waitFor();
  const [docx] = await Promise.all([page.waitForEvent('download'), q('#etp-docx').click()]);
  const [pdf] = await Promise.all([page.waitForEvent('download'), q('#etp-pdf').click()]);
  assert.equal(docx.suggestedFilename(), 'estudo-tecnico-preliminar.docx');
  assert.equal(pdf.suggestedFilename(), 'estudo-tecnico-preliminar.pdf');
  assert.equal(payloads.filter(([op]) => op === 'etp-generate').length, 1);
  const stored = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  assert.deepEqual(Object.fromEntries(Object.entries(stored).filter(([key]) => key.startsWith('confenge.etp.'))), { 'confenge.etp.emissao.v1': emittedId });
  assert.doesNotMatch(JSON.stringify(stored), /Órgão Fictício|trecho autorizado|aquisição de equipamentos/i);
  enabled = false;
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await q('#etp-resume').waitFor();
  assert.equal(await q('#etp-form').isVisible(), false);
  await q('#etp-resume').click();
  await q('#etp-downloads').waitFor();
  assert.equal(payloads.filter(([op]) => op === 'etp-generate').length, 1);
  assert.deepEqual(errors, []);
  console.log('ETP: metadados, experiência móvel, leitura local de PDF/DOCX, sigilo, entrevista, download e recuperação validados com API simulada.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
