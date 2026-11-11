import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { PUPPETEER_REVISIONS } from 'puppeteer-core';
import { qualifyImports } from './freecad/imports.mjs';
import { testNativeMenus } from './freecad/native-menus.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = resolve(root, process.env.FREECAD_SITE || '_site');
const reports = join(root, 'build/reports/freecad');
const chrome = process.env.CHROME_PATH;
if (!chrome || !existsSync(chrome)) throw new Error('CHROME_PATH obrigatório: use o Chrome contratado pelo repositório.');
const manifest = JSON.parse(await readFile(join(site, 'assets/freecad/runtime.json'), 'utf8'));
for (const entry of Object.values(manifest.files)) {
  assert.equal((await stat(join(site, entry.path))).size, entry.size, 'the built artifact must include the real pinned engine');
}
await mkdir(reports, { recursive: true });
await mkdir(join(reports, 'downloads'), { recursive: true });
const report = { schema: 'confenge.freecad-browser/v1', checks: [], requests: [], errors: [], console: [], dialogs: [] };
const record = name => { report.checks.push(name); console.log(`FreeCAD: ${name}`); };
const rules = [];
for (const line of (await readFile(join(site, '_headers'), 'utf8')).split('\n')) {
  if (!line.trim() || line.trimStart().startsWith('#')) continue;
  if (!line.startsWith(' ') && line.startsWith('/')) rules.push({ pattern: line.trim(), headers: {} });
  else if (rules.length && /^\s+[^:]+:/.test(line)) {
    const index = line.indexOf(':'); rules.at(-1).headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
}
const headersFor = path => {
  const result = {};
  for (const rule of rules) if (rule.pattern.endsWith('*') ? path.startsWith(rule.pattern.slice(0, -1)) : path === rule.pattern) Object.assign(result, rule.headers);
  return result;
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const exports = [], calls = [], approved = [];
const fixtureUser = `const user={uid:'freecad-fixture',email:'freecad-fixture@example.test',emailVerified:true,providerData:[{providerId:'password'}],reload:async()=>{},getIdToken:async()=> 'fixture-token'};
const auth={currentUser:user,authStateReady:async()=>{}};
export const getApps=()=>[]; export const initializeApp=x=>x; export const getAuth=()=>auth;
export const initializeAuth=()=>auth; export const browserLocalPersistence={};
export const onAuthStateChanged=(a,fn)=>{fn(user);return ()=>{}};`;
const config = { enabled: true, sharedExportsEnabled: true, purchasesEnabled: false, checkoutEnabled: false,
  tools: ['modela-memoria', 'modelador-parametrico-3d'], firebase: { apiKey: 'fixture-only' },
  authProviders: [], packages: [{ id: 'one', credits: 1, amountCents: 1490 }], termsVersion: 'fixture' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  report.requests.push(url.pathname);
  const sendJson = (value, statusCode = 200) => { response.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
  if (url.pathname === '/api/web/tool-credits') {
    const op = url.searchParams.get('op'); calls.push(op);
    let raw = ''; for await (const chunk of request) raw += chunk;
    if (op === 'config') return sendJson(config);
    if (op === 'account') return sendJson({ paid: 2, promo: 0, freeAvailable: false, recentOrders: [] });
    if (op === 'export-local') {
      const payload = JSON.parse(raw); exports.push(payload);
      assert.equal(payload.toolId, 'modelador-parametrico-3d');
      assert.deepEqual(Object.keys(payload.payload).sort(), ['bytes', 'format', 'sha256']);
      if (exports.length === 1) return sendJson({ error: 'FIXTURE_TEMPORARY_FAILURE' }, 503);
      const receipt = { schema: 'confenge.tools.emission/v1', toolId: payload.toolId,
        ...payload.payload, id: createHash('sha256').update(payload.requestId).digest('hex'),
        proof: 'b'.repeat(64), issuedAt: new Date().toISOString() };
      approved.push(receipt); return sendJson(receipt);
    }
    return sendJson({ error: 'NO_PURCHASE_ENDPOINT_IN_FIXTURE' }, 400);
  }
  if (url.pathname === '/assets/tools-commerce/firebase-auth.mjs') {
    response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cross-Origin-Resource-Policy': 'same-origin' }); response.end(fixtureUser); return;
  }
  const path = resolve(site, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
  if (!path.startsWith(site + sep)) { response.writeHead(403); response.end(); return; }
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', ...headersFor(url.pathname), 'Content-Length': metadata.size });
    createReadStream(path).pipe(response);
  } catch { response.writeHead(404); response.end(); }
});

let browser, page;
const heavyCount = () => report.requests.filter(path => /\/assets\/freecad\/FreeCAD-[a-f0-9]+\.(js|wasm|data)$/.test(path)).length;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, protocolTimeout: 360000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  report.chrome = (await browser.version()).replace(/^[^/]+\//, '');
  assert.equal(report.chrome, PUPPETEER_REVISIONS.chrome, 'the engine must be qualified using contracted Chrome');

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 375, height: 820 });
  await mobile.goto(origin + '/ferramentas/modelador-parametrico-3d/', { waitUntil: 'networkidle0' });
  assert.equal(heavyCount(), 0, 'reading the indexable page cannot download the engine');
  assert.deepEqual([...new Set(calls)], ['config'], 'only public configuration may be consulted before launch, never an account, export or purchase');
  assert.equal(await mobile.$$eval('[data-tool-export-terms]', nodes => nodes.length), 1, 'launcher must have one scoped export condition');
  assert.match(await mobile.$eval('[data-tool-export-terms]', node => node.textContent), /FCStd.*sempre gratuita.*STEP.*STL/s);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'mobile launcher does not overflow');
  const launch = await mobile.$eval('#modelador-abrir', el => ({ text: el.textContent, h: el.getBoundingClientRect().height, href: el.getAttribute('href') }));
  assert.match(launch.text, /503 MB/); assert.ok(launch.h >= 44); assert.equal(launch.href, '/cad/freecad/');
  await mobile.screenshot({ path: join(reports, 'launcher-375.png'), fullPage: true });
  await mobile.close();
  record('indexable mobile launcher is usable and never preloads WASM/data');

  const unsupported = await browser.newPage();
  await unsupported.evaluateOnNewDocument(() => { Object.defineProperty(WebAssembly, 'Suspending', { value: undefined, configurable: true }); });
  await unsupported.goto(origin + '/cad/freecad/', { waitUntil: 'networkidle0' });
  assert.equal(heavyCount(), 0, 'direct technical visit also waits for explicit action');
  await unsupported.click('#start');
  await unsupported.waitForFunction(() => document.querySelector('#capability').textContent.includes('JSPI'));
  assert.equal(heavyCount(), 0, 'unsupported browser must fail before any heavy download');
  assert.equal(calls.some(op => op !== 'config'), false, 'browser fallback must not provision an account or start an export');
  await unsupported.screenshot({ path: join(reports, 'unsupported.png'), fullPage: true });
  await unsupported.close();
  record('unsupported JSPI has an actionable fallback without any heavy request');

  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('console', message => { if (report.console.length < 300) report.console.push({ type: message.type(), text: message.text().slice(0, 1200) }); });
  page.on('pageerror', error => report.errors.push(String(error.stack || error)));
  page.on('dialog', async dialog => {
    report.dialogs.push({ type: dialog.type(), message: dialog.message().slice(0, 500) });
    if (dialog.type() === 'confirm' && dialog.message().startsWith('Exportar este resultado')) await dialog.accept();
    else await dialog.dismiss();
  });
  await page.evaluateOnNewDocument(() => {
    window.__freecadTestDownloads = [];
    const blobs = new Map();
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && blobs.has(this.href)) window.__freecadTestDownloads.push({ name: this.download, blob: blobs.get(this.href), receipt: window.__freecadTestReceipt || null });
      return click.call(this);
    };
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetchOriginal(...args);
      if (response.ok && String(args[0]).includes('/api/web/tool-credits?op=export-local')) window.__freecadTestReceipt = await response.clone().json();
      return response;
    };
  });
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: join(reports, 'downloads') });
  const waitReady = async () => {
    await page.waitForFunction(() =>
      (window.fcInstance?.FS && window.__fcWorkReady && document.getElementById('sample')?.disabled === false)
      || (document.getElementById('entry')?.hidden === false && document.getElementById('start')?.hidden === true),
      { timeout: 300000, polling: 500 });
    const boot = await page.evaluate(() => ({
      ready: Boolean(window.fcInstance?.FS && window.__fcWorkReady && document.getElementById('sample')?.disabled === false),
      message: document.getElementById('status')?.textContent,
    }));
    assert.equal(boot.ready, true, `the runtime reported a terminal startup failure: ${boot.message}`);
    // Let the observer complete its restore pass before testing user operations.
    assert.equal(await page.evaluate(() => window.fcInstance.FS.analyzePath('/tmp/.confenge_restore_complete').exists), true,
      'user actions must wait for the confirmed local recovery pass');
  };
  await page.goto(origin + '/cad/freecad/', { waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => crossOriginIsolated), true, 'artifact headers provide the isolation required by the engine');
  const support = await page.evaluate(async () => (await import('/cad/freecad/capabilities.mjs')).capabilities());
  assert.deepEqual(support, { ok: true }, 'contracted Chrome must support the real memory64 and JSPI probe');
  await page.click('#start');
  await waitReady();
  assert.ok(heavyCount() >= 3);
  record('real pinned FreeCAD and Qt boot under artifact CSP/COOP/COEP');

  // Independent native inspection through the same guarded CPython entry as the product.
  async function python(source) {
    return page.evaluate(async source => {
      const module = window.fcInstance;
      const wait = () => new Promise(resolve => setTimeout(resolve, 100));
      let tries = 0; while (window.__fcPyBusy && ++tries < 300) await wait();
      if (window.__fcPyBusy) throw new Error('Python stayed busy');
      const output = '/tmp/confenge-browser-proof.json';
      try { module.FS.unlink(output); } catch {}
      const code = `import json\n${source}\nwith open(${JSON.stringify(output)}, 'w') as _proof:\n json.dump(proof, _proof)\n`;
      const size = new TextEncoder().encode(code).length + 1;
      const pointer = module._malloc(size); module.stringToUTF8(code, pointer, size);
      if (!await window.fcRunPy(module, pointer)) throw new Error('native Python failed');
      return JSON.parse(module.FS.readFile(output, { encoding: 'utf8' }));
    }, source);
  }
  const nativeReady = await python("import FreeCAD as App, FreeCADGui as Gui\nproof={'version': App.Version()[:3], 'workbenches': list(Gui.listWorkbenches())}");
  assert.equal(nativeReady.version.join('.'), '1.1.3');
  assert.equal(nativeReady.workbenches.includes('FemWorkbench'), false, 'unbundled solvers must not be advertised in the workbench selector');
  await page.click('#sample');
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Peça de exemplo criada'), { timeout: 60000 });
  const model = await python("import FreeCAD as App\nd=App.ActiveDocument\nb=d.getObject('Bloco')\nproof={'name':d.Name,'length':b.Length.Value,'width':b.Width.Value,'height':b.Height.Value,'volume':b.Shape.Volume,'valid':b.Shape.isValid()}");
  assert.deepEqual([model.length, model.width, model.height], [100,60,30]);
  assert.ok(Math.abs(model.volume - 180000) <= 1e-6, `native volume ${model.volume} mm³ must match the box within numerical tolerance`); assert.equal(model.valid, true);
  assert.ok(await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas'), ...Array.from(document.querySelectorAll('*')).flatMap(el => el.shadowRoot ? [...el.shadowRoot.querySelectorAll('canvas')] : [])];
    return canvases.some(canvas => canvas.width > 300 && canvas.height > 200);
  }), 'Qt must present an actual rendering surface');
  await page.screenshot({ path: join(reports, 'native-model.png'), fullPage: true });
  record('native OCCT produces a valid 100 × 60 × 30 mm solid with 180000 mm³ volume');

  const parametric = await python(`import FreeCAD as App, FreeCADGui as Gui, Part, Sketcher
App.closeDocument(App.ActiveDocument.Name)
d=App.newDocument('EnsaioParametrico')
body=d.addObject('PartDesign::Body','Corpo')
sketch=d.addObject('Sketcher::SketchObject','Esboco')
body.addObject(sketch)
points=[(0,0),(100,0),(100,60),(0,60)]
for i in range(4):
 a,b=points[i],points[(i+1)%4]
 sketch.addGeometry(Part.LineSegment(App.Vector(a[0],a[1],0),App.Vector(b[0],b[1],0)),False)
sketch.addConstraint(Sketcher.Constraint('Coincident',0,1,-1,1))
for i in range(4): sketch.addConstraint(Sketcher.Constraint('Coincident',i,2,(i+1)%4,1))
for i in (0,2): sketch.addConstraint(Sketcher.Constraint('Horizontal',i))
for i in (1,3): sketch.addConstraint(Sketcher.Constraint('Vertical',i))
width=sketch.addConstraint(Sketcher.Constraint('Distance',0,100.0))
sketch.addConstraint(Sketcher.Constraint('Distance',1,60.0))
d.recompute()
pad=body.newObject('PartDesign::Pad','Extrusao')
pad.Profile=sketch
pad.Length=30
sketch.Visibility=False
d.recompute()
before=pad.Shape.Volume
sketch.setDatum(width,App.Units.Quantity('120 mm'))
pad.Length=40
d.recompute()
Gui.activeDocument().activeView().viewIsometric()
Gui.activeDocument().activeView().fitAll()
Gui.Selection.clearSelection()
Gui.Selection.addSelection(pad)
Gui.updateGui()
proof={'before':before,'after':pad.Shape.Volume,'valid':pad.Shape.isValid(),'constrained':sketch.FullyConstrained,'profile':pad.Profile[0].Name if isinstance(pad.Profile,tuple) else pad.Profile.Name,'length':pad.Length.Value,'bounds':[pad.Shape.BoundBox.XLength,pad.Shape.BoundBox.YLength,pad.Shape.BoundBox.ZLength]}`);
  assert.ok(Math.abs(parametric.before - 180000) <= 1e-6);
  assert.ok(Math.abs(parametric.after - 288000) <= 1e-6);
  assert.equal(parametric.valid, true); assert.equal(parametric.constrained, true);
  assert.equal(parametric.profile, 'Esboco'); assert.equal(parametric.length, 40);
  parametric.bounds.forEach((value, index) => assert.ok(Math.abs(value - [120,60,40][index]) <= 1e-6));
  await page.screenshot({ path: join(reports, 'native-parametric.png'), fullPage: true });
  report.parametric = parametric;
  record('a fully constrained Sketch and PartDesign Pad recompute after dimension edits from 180000 to 288000 mm³');

  await page.click('#backup');
  await page.waitForFunction(() => window.__freecadTestDownloads.some(item => /\.FCStd$/i.test(item.name)), { timeout: 60000 });
  const backup = await page.evaluate(async () => {
    const item = window.__freecadTestDownloads.find(item => /\.FCStd$/i.test(item.name));
    return { name: item.name, bytes: [...new Uint8Array(await item.blob.arrayBuffer())], receipt: item.receipt };
  });
  assert.deepEqual(backup.bytes.slice(0, 4), [80,75,3,4]);
  assert.ok(backup.bytes.length > 200); assert.equal(backup.receipt, null);
  assert.equal(exports.length, 0, 'backup must remain possible without a wallet request');
  const backupPath = join(reports, 'example.FCStd'); await writeFile(backupPath, Buffer.from(backup.bytes));
  record('free native FCStd backup is a real archive and bypasses the wallet');

  const binariesBeforeReload = report.requests.filter(path => /\/assets\/freecad\/FreeCAD-.*\.(wasm|data)$/.test(path)).length;
  const cacheEntries = await page.evaluate(async () => {
    const cache = await caches.open('confenge-freecad-engine-v1');
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  });
  assert.deepEqual(cacheEntries.sort(), [manifest.files['FreeCAD.data'].path, manifest.files['FreeCAD.wasm'].path].sort());
  // Disable the browser's HTTP cache so this proves the explicit binary cache.
  await page.setCacheEnabled(false);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#start', el => el.disabled), false, 'reload does not retain the one-use launch consent');
  await page.click('#start'); await waitReady();
  assert.equal(report.requests.filter(path => /\/assets\/freecad\/FreeCAD-.*\.(wasm|data)$/.test(path)).length, binariesBeforeReload,
    'a second boot must reuse verified binaries even with the HTTP cache disabled');
  record('second boot reuses the 501757581 verified WASM/data bytes without another binary request');
  await python("import FreeCAD as App\nfor name in list(App.listDocuments()): App.closeDocument(name)\nproof={'closed': True}");
  const chooser = page.waitForFileChooser(); await page.click('#open');
  await (await chooser).accept([backupPath]);
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Modelo aberto.'), { timeout: 60000 });
  const reopened = await python("import FreeCAD as App, FreeCADGui as Gui\nd=App.ActiveDocument\nb=d.getObject('Extrusao')\ns=d.getObject('Esboco')\nGui.Selection.clearSelection()\nGui.Selection.addSelection(b)\nproof={'volume':b.Shape.Volume,'length':b.Length.Value,'profile':b.Profile[0].Name if isinstance(b.Profile,tuple) else b.Profile.Name,'constrained':s.FullyConstrained}");
  assert.equal(reopened.length, 40); assert.equal(reopened.profile, 'Esboco'); assert.equal(reopened.constrained, true);
  assert.ok(Math.abs(reopened.volume - 288000) <= 1e-6, 'reopened sketch and extrusion preserve native geometry and parameters');
  assert.equal(exports.length, 0, 'reopening a free backup never creates an export receipt');
  record('a fresh engine load reopens the downloaded FCStd with editable native geometry');

  const rejected = page.evaluate(() => window.fcwebConfirm('Teste de rejeição', 'Ação não executada no fixture', 'Yes'));
  await page.waitForSelector('#question[open]'); await page.keyboard.press('Escape');
  assert.equal(await rejected, -1, 'Esc cannot choose the first accepting action');
  record('closing an HTML bridge dialog rejects instead of accepting its first action');

  await page.click('#files-toggle');
  await page.select('#export-format', 'step');
  await page.click('#export');
  await page.waitForFunction(() => document.querySelector('.tool-credits__export-notice')?.textContent.includes('interrompida'), { timeout: 90000 });
  assert.equal(exports.length, 1);
  assert.equal(await page.evaluate(() => window.__freecadTestDownloads.length), 0, 'transient receipt failure cannot deliver STEP');
  const firstRequest = exports[0];
  // Use the file row promised by the shell, not the wallet's separate notice.
  const retryRow = await page.$('#downloads li:first-child button');
  assert.match(await retryRow.evaluate(el => el.textContent), /Retomar autorização/);
  await retryRow.click();
  await page.waitForFunction(() => window.__freecadTestDownloads.some(item => item.name.endsWith('.step')), { timeout: 30000 });
  assert.equal(exports.length, 2);
  assert.equal(exports[1].requestId, firstRequest.requestId, 'retry must preserve idempotency');
  assert.deepEqual(exports[1].payload, firstRequest.payload, 'retry must preserve the exact generated file');
  async function technical(format) {
    const file = await page.evaluate(async format => {
      const item = window.__freecadTestDownloads.find(item => item.name.endsWith('.' + format));
      return { bytes: [...new Uint8Array(await item.blob.arrayBuffer())], receipt: item.receipt };
    }, format);
    const bytes = Buffer.from(file.bytes);
    assert.equal(file.receipt.schema, 'confenge.tools.emission/v1');
    assert.equal(file.receipt.toolId, 'modelador-parametrico-3d');
    assert.equal(file.receipt.format, format); assert.equal(file.receipt.bytes, bytes.length);
    assert.equal(file.receipt.sha256, createHash('sha256').update(bytes).digest('hex'));
    await writeFile(join(reports, 'example.' + format), bytes);
    return bytes;
  }
  const step = await technical('step');
  assert.match(step.toString('utf8', 0, 250), /ISO-10303-21/);
  assert.match(step.toString('utf8'), /MANIFOLD_SOLID_BREP|FACETED_BREP|CLOSED_SHELL/);
  record('native STEP is delivered only after a matching receipt and idempotent retry');
  await page.select('#export-format', 'stl');
  await page.click('#export');
  await page.waitForFunction(() => window.__freecadTestDownloads.some(item => item.name.endsWith('.stl')), { timeout: 90000 });
  const stl = await technical('stl');
  if (/^solid\s/i.test(stl.toString('utf8', 0, 100))) assert.match(stl.toString('utf8'), /facet normal[\s\S]*endsolid/);
  else { assert.ok(stl.length >= 84); const triangles = stl.readUInt32LE(80); assert.ok(triangles >= 12); assert.equal(stl.length, 84 + triangles * 50); }
  assert.equal(calls.includes('orders'), false, 'the fixture never creates a purchase');
  assert.equal(calls.includes('order'), false, 'the fixture never polls a purchase');
  assert.equal(approved.length, 2);
  record('native STL mesh is receipt-bound without creating or simulating a purchase');

  report.imports = await qualifyImports({ page, python, reports, record });
  assert.equal(exports.length, 3, 'opening interchange models never requests another export');

  report.nativeMenus = await testNativeMenus({ page, python, record, exportRequests: exports, reportDirectory: reports });
  assert.equal(approved.length, 3, 'the native menu adds exactly one authorized STL result');

  const denied = await page.evaluate(async () => {
    const results = [];
    for (const url of ['/proxy/github/plugin.zip', '/mcp', '/api/sessions', 'https://github.com/file']) {
      try { await fetch(url); results.push(false); } catch { results.push(true); }
    }
    return results;
  });
  assert.deepEqual(denied, [true,true,true,true]);
  assert.equal(report.requests.some(path => path.startsWith('/proxy/') || ['/mcp', '/api/sessions'].includes(path)), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'desktop shell does not overflow');
  await page.screenshot({ path: join(reports, 'native-exports.png'), fullPage: true });
  record('remote feature requests are rejected before reaching any endpoint');
  assert.deepEqual(report.errors, [], 'uncaught browser errors are release blockers');
  assert.equal(report.console.some(entry => /worker sent an error|Uncaught EvalError|violates the following Content Security Policy/i.test(entry.text)), false,
    'a pthread CSP failure cannot be hidden inside the native log');
  report.ok = true;
} catch (error) {
  report.ok = false; report.failure = String(error.stack || error);
  if (page) {
    report.state = await page.evaluate(() => ({ status: document.querySelector('#status')?.textContent,
      capability: document.querySelector('#capability')?.textContent, phase: document.querySelector('#phase')?.textContent,
      appReady: window.__fcAppReady, workReady: window.__fcWorkReady, pythonBusy: window.__fcPyBusy,
      instance: Boolean(window.fcInstance), isolation: crossOriginIsolated })).catch(() => null);
    await page.click('#help-toggle').catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1100));
    report.nativeLog = await page.$eval('#log', el => el.textContent).catch(() => 'unavailable');
    await page.screenshot({ path: join(reports, 'failure.png'), fullPage: true }).catch(() => {});
  }
  console.error(JSON.stringify({ failure: report.failure, state: report.state, nativeLog: report.nativeLog }, null, 2));
  throw error;
} finally {
  report.exports = exports;
  report.apiCalls = calls;
  await writeFile(join(reports, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}
