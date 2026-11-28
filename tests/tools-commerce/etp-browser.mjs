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
  route + 'etp.mjs', route + 'etp.css', route + 'etp-attachments.mjs', route + 'etp-rules.mjs', route + 'etp-sheet.mjs', route + 'etp-ui-data.mjs',
  '/styles.css', '/script.js', '/assets/js/tool-referral.mjs', '/assets/js/tool-credits.mjs',
  '/assets/logo-confenge-500-f8a83f6d.png', '/assets/tool-showcase/gerador-etp.jpg',
  workerAssets + 'pdfTile.worker-Dv28ODaG.js', workerAssets + 'pdf.worker.min-yatZIOMy.mjs',
]);
const mockAuth = `
// A test can hold the token (globalThis.__etpHold) to act on the page while a request waits for it.
const user = {uid:'etp-test-verified',emailVerified:true,reload:async()=>{},getIdToken:async()=>{
  if (globalThis.__etpHold) { globalThis.__etpWaiting = true; await globalThis.__etpHold; globalThis.__etpWaiting = false; }
  return 'fixture-token';
}};
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
  await q('input[name="sphere"][value="federal"]').check();
  await q('input[name="objectType"][value="tic"]').check();
  await field('sisp').check();
  assert.match(await q('#etp-scope').textContent(), /SISP/);
  assert.match(await q('[data-done="0"]').textContent(), /✓/);
  // Both actions apply the same privacy rule before login; exercise suggestions with no attachments.
  await q('button[data-go="1"]').first().click();
  await q('#etp-inciso-VI > summary').click();
  await field('vi-classified').check();
  await field('VI-text').fill('275,00');
  await q('button[data-go="2"]').first().click();
  await field('consent').check();
  await q('#etp-interview').click();
  assert.match(await q('#etp-status').textContent(), /Nada foi enviado/);
  assert.match(await q('#etp-gaps').textContent(), /Não inclua valores/);
  assert.equal(payloads.length, 0);
  await q('#etp-gaps a').click();
  await field('VI-text').fill('');
  await field('vi-classified').uncheck();
  await q('button[data-go="0"]').first().click();
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
  assert.equal(await q('#etp-meter-text').textContent(), '0 de 13 itens prontos');
  // In TIC under SISP, items III, V, VII and IX may not be omitted.
  await q('#etp-inciso-III > summary').click();
  assert.equal(await field('III-text').isVisible(), true);
  assert.equal(await field('III-omit').isVisible(), false);
  await q('#etp-inciso-I > summary').click();
  // Next item: answering I and moving on lands on II, ready to type.
  await field('I-text').fill('Os equipamentos atuais não atendem às rotinas de atendimento ao público.');
  await q('#etp-inciso-I .etp-next').click();
  assert.equal(await field('II-text').evaluate(input => document.activeElement === input), true);
  assert.match(await q('#etp-inciso-I .etp-chip').textContent(), /Pronto/);
  // A missing item is reported here, at once, with no account, network or credit.
  await q('#etp-inciso-VI > summary').click();
  await field('vi-classified').check();
  assert.equal(await field('VI-prices').isVisible(), false);
  await q('button[data-go="2"]').first().click();
  await field('consent').check();
  await q('#etp-prepare').click();
  assert.match(await q('#etp-status').textContent(), /Nada foi enviado/);
  assert.match(await q('#etp-progress').textContent(), /orçamento sigiloso, remova todos os anexos/);
  assert.equal(payloads.length, 0);
  await page.locator('#etp-progress .etp-blank a', { hasText: /^IV$/ }).click();
  assert.equal(await field('IV-text').evaluate(input => document.activeElement === input), true);
  assert.equal(await q('#etp-gap-IV').isVisible(), true);
  // Items open one at a time, so the one in use keeps the screen.
  await q('#etp-inciso-VI > summary').click();
  assert.equal(await field('IV-text').isVisible(), false);
  await field('vi-classified').uncheck();
  await q('#etp-inciso-IV > summary').click();
  // The item table writes the quantity and value memories, unit prices and total for IV and VI.
  await q('#etp-sheet summary').click();
  const cells = q('#etp-sheet-rows tr').first().locator('input');
  await cells.nth(0).fill('Equipamento');
  await cells.nth(1).fill('un');
  await cells.nth(2).fill('3');
  await cells.nth(3).fill('1.500,00');
  assert.match(await q('#etp-sheet-total').textContent(), /R\$ 4\.500,00/);
  await q('#etp-sheet-apply').click();
  assert.equal(await field('IV-calculation').inputValue(), 'Quantidades por item: Equipamento: 3 un.');
  assert.equal(await field('VI-prices').inputValue(), 'Equipamento: R$ 1.500,00/un.');
  // Reapplying replaces a known table-generated sentence but preserves surrounding context.
  await field('IV-text').fill((await field('IV-text').inputValue()) + ' A entrega será no almoxarifado.');
  await cells.nth(2).fill('4');
  await q('#etp-sheet-apply').click();
  assert.equal(await field('IV-text').inputValue(), 'Estimam-se 4 un de Equipamento, conforme a memória de cálculo. A entrega será no almoxarifado.');
  assert.match(await field('VI-text').inputValue(), /^Valor total estimado: R\$ 6\.000,00\./);
  assert.match(await field('VI-calculation').inputValue(), /total = R\$ 6\.000,00\.$/);
  // A manually rewritten answer cannot be silently paired with a new memory in either item.
  const manualIV = 'Estimam-se 4 un de Equipamento, conforme a memória de cálculo. O planejamento prevê somente 4 unidades.';
  const manualVI = 'O orçamento consolidado soma R$ 6.000,00.';
  await field('IV-text').fill(manualIV);
  await q('#etp-inciso-VI > summary').click();
  await field('VI-text').fill(manualVI);
  await q('#etp-inciso-IV > summary').click();
  await cells.nth(2).fill('5');
  await q('#etp-sheet-apply').click();
  assert.match(await q('#etp-sheet-total').textContent(), /Nenhum campo foi alterado.*IV e VI/);
  assert.equal(await field('IV-text').inputValue(), manualIV);
  assert.equal(await field('IV-calculation').inputValue(), 'Quantidades por item: Equipamento: 4 un.');
  assert.equal(await field('VI-text').inputValue(), manualVI);
  assert.match(await field('VI-calculation').inputValue(), /total = R\$ 6\.000,00\.$/);
  await q('#etp-sheet-replace').click();
  assert.match(await field('IV-text').inputValue(), /5 un/);
  assert.match(await field('VI-text').inputValue(), /R\$ 7\.500,00/);
  assert.match(await field('VI-calculation').inputValue(), /total = R\$ 7\.500,00\.$/);
  await q('#etp-sheet-apply').click(); // Reapplying identical rows must not discard the undo history.
  await q('#etp-sheet-undo').click();
  assert.equal(await field('IV-text').inputValue(), manualIV);
  assert.equal(await field('VI-text').inputValue(), manualVI);
  assert.match(await field('VI-calculation').inputValue(), /total = R\$ 6\.000,00\.$/);
  await cells.nth(2).fill('3');
  await q('#etp-sheet-apply').click();
  await q('#etp-sheet-replace').click();
  // An undo must not restore just one half of the last update when a user made a later edit.
  await field('IV-text').fill('Estimam-se 3 equipamentos, um por guichê.');
  await q('#etp-sheet-undo').click();
  assert.match(await q('#etp-sheet-total').textContent(), /Nada foi desfeito/);
  assert.equal(await field('IV-calculation').inputValue(), 'Quantidades por item: Equipamento: 3 un.');
  assert.match(await field('VI-calculation').inputValue(), /total = R\$ 4\.500,00\.$/);
  await field('IV-text').fill('Estimam-se 3 un de Equipamento, conforme a memória de cálculo.');
  assert.match(await field('VI-text').inputValue(), /^Valor total estimado: R\$ 4\.500,00\./);
  await field('IV-source').fill('F1');
  await q('#etp-inciso-VI > summary').click();
  await field('VI-source').fill('Pesquisa de preços nº 7');
  const answers = {
    II: 'A contratação consta do plano anual do exercício, item 12.',
    III: 'Os equipamentos devem integrar o diretório de usuários e ter suporte por três anos.',
    V: 'Foram comparadas compra e locação; a compra tem menor custo no período de uso.',
    VII: 'Aquisição com entrega, instalação e suporte técnico no local.',
    VIII: 'Lote único, porque instalação e suporte dependem do mesmo fornecedor.',
    XI: 'Depende da contratação de pontos de rede já em andamento.',
    X: 'Adequar a rede elétrica da sala antes da entrega.',
    IX: 'Reduzir as filas do atendimento presencial no primeiro semestre.',
    XIII: 'A contratação é adequada à necessidade, condicionada à adequação elétrica.',
  };
  for (const [id, text] of Object.entries(answers)) {
    await q(`#etp-inciso-${id} > summary`).click();
    await field(`${id}-text`).fill(text);
  }
  // An optional item that does not apply is justified, not left blank.
  await q('#etp-inciso-XII > summary').click();
  await field('XII-omit').check();
  assert.match(await q('#etp-inciso-XII label:has(textarea)').textContent(), /não se aplica/);
  await field('XII-text').fill('O objeto não gera resíduos nem consumo relevante além do uso administrativo já existente.');
  assert.equal(await q('#etp-meter-text').textContent(), '13 de 13 itens prontos');
  assert.match(await q('#etp-inciso-XII .etp-chip').textContent(), /Justificado/);
  await q('button[data-go="2"]').first().click();
  assert.match(await q('#etp-progress').textContent(), /Tudo pronto/);
  await q('#etp-prepare').click();
  await q('#etp-gaps a').waitFor();
  assert.equal(payloads[1][0], 'etp-interview');
  assert.deepEqual(payloads[1][1].input.sources.map(x => x.id), ['F1','F2']);
  assert.deepEqual(Object.keys(payloads[1][1].input.sources[0]), ['id', 'name', 'locator', 'text']);
  assert.equal(payloads[1][1].input.sources[0].text, 'Trecho autorizado e confirmado da aquisição.');
  assert.equal(payloads[1][1].input.answers.XII.status, 'omitted');
  assert.equal(payloads[1][1].input.profile.sphere, 'federal');
  assert.equal(payloads[1][1].input.profile.objectType, 'tic');
  // The interview question waits inside its own item, next to the answer.
  await q('#etp-gaps a').click();
  assert.equal(await field('IV-text').evaluate(input => document.activeElement === input), true);
  assert.match(await q('#etp-inciso-IV .etp-q-ask').textContent(), /Qual é a unidade\?/);
  await field('IV-text').fill('São necessárias 3 unidades no período anual.');
  assert.match(await q('#etp-inciso-IV .etp-chip').textContent(), /Pronto/);
  await q('button[data-go="2"]').first().click();
  await q('#etp-prepare').click();
  await q('#etp-generate').waitFor();
  assert.match(await q('#etp-quote').textContent(), /Um crédito/);
  await q('#etp-generate').click();
  await q('#etp-downloads').waitFor();
  assert.equal(await q('#etp-working').isVisible(), false);
  // Consent withdrawn while the sign-in token is loading: nothing is sent.
  await page.evaluate(() => { globalThis.__etpHold = new Promise(resolve => { globalThis.__etpRelease = resolve; }); });
  const sent = payloads.length;
  await q('#etp-prepare').click();
  await page.waitForFunction(() => globalThis.__etpWaiting === true);
  await field('consent').uncheck();
  await page.evaluate(() => { globalThis.__etpHold = undefined; globalThis.__etpRelease(); });
  await page.waitForFunction(() => !document.getElementById('etp-form').hasAttribute('aria-busy'));
  assert.equal(payloads.length, sent);
  assert.match(await q('#etp-status').textContent(), /Nada foi enviado/);
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
  console.log('ETP: metadados, experiência móvel, verificação local, tabela de itens, leitura local de PDF/DOCX, sigilo, entrevista no item, download e recuperação validados com API simulada.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
