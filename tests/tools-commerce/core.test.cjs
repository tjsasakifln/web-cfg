const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PACKAGES, TERMS, TERMS_HASH, TOOL, loadConfig, orderId, normalizeEmail } = require('../../runtime/tools-commerce/policy.cjs');
const { modelaReport } = require('../../runtime/tools-commerce/report.cjs');
const { LOCAL_FORMATS, localArtifact } = require('../../runtime/tools-commerce/exports.cjs');
const { createCommerceHttp } = require('../../runtime/tools-commerce/http.cjs');
const { payload } = require('./fixtures.cjs');

test('production, sandbox and emulator cannot be mixed; prices are server owned', () => {
  const key = randomBytes(32).toString('base64url');
  const local = { TOOLS_COMMERCE_MODE: 'emulator', TOOLS_COMMERCE_FIREBASE_PROJECT: 'demo-confenge-tools',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085', TOOLS_COMMERCE_HMAC_KEY: key };
  assert.equal(loadConfig({}).mode, 'off');
  assert.equal(loadConfig(local).mode, 'emulator');
  assert.throws(() => loadConfig({ ...local, RUNTIME_PROFILE: 'netcup-production' }), /COMMERCE_UNAVAILABLE/);
  assert.throws(() => loadConfig({ ...local, TOOLS_COMMERCE_PURCHASES: '1' }), /COMMERCE_UNAVAILABLE/);
  assert.throws(() => loadConfig({ ...local, TOOLS_COMMERCE_MODE: 'live', RUNTIME_PROFILE: 'netcup-production' }), /COMMERCE_UNAVAILABLE/);
  assert.deepEqual(PACKAGES.map(p => [p.credits, p.amountCents]), [[1, 1490], [3, 3990], [5, 5990], [10, 9999], [25, 22490], [50, 40000]]);
  const id = randomUUID();
  assert.equal(orderId('alpha', id), orderId('alpha', id.toUpperCase()));
  assert.notEqual(orderId('alpha', id), orderId('beta', id));
  assert.equal(normalizeEmail('Nome.Sobrenome+alias@googlemail.com'), 'nomesobrenome@gmail.com');
});

test('sandbox can poll a test order before a public webhook is configured', async () => {
  const sandbox = { TOOLS_COMMERCE_MODE: 'sandbox', TOOLS_COMMERCE_FIREBASE_PROJECT: 'confenge-ferramentas-pj-hml',
    TOOLS_COMMERCE_FIREBASE_WEB_KEY: 'AIza' + 'x'.repeat(30), TOOLS_COMMERCE_FIREBASE_WEB_APP: '1:123:web:abc',
    TOOLS_COMMERCE_HMAC_KEY: randomBytes(32).toString('base64url'), TOOLS_COMMERCE_SANDBOX_UIDS: 'tester',
    TOOLS_COMMERCE_SANDBOX_ORIGIN: 'http://127.0.0.1:8790', TOOLS_COMMERCE_PURCHASES: '1',
    TOOLS_COMMERCE_TERMS_APPROVED: TERMS, TOOLS_COMMERCE_MP_ACCESS_TOKEN: 'APP_USR-' + 'x'.repeat(30),
    TOOLS_COMMERCE_MP_TEST_SELLER_ID: '1170000100' };
  assert.equal(loadConfig(sandbox).sandboxPayerEmail, 'test_payer@example.com');
  assert.equal(loadConfig(sandbox).sellerId, '1170000100');
  assert.throws(() => loadConfig({ ...sandbox, TOOLS_COMMERCE_MP_TEST_SELLER_ID: '' }), /COMMERCE_UNAVAILABLE/);
  assert.throws(() => loadConfig({ ...sandbox, TOOLS_COMMERCE_MP_LIVE_SELLER_ID: '3823648243' }), /COMMERCE_UNAVAILABLE/);
  assert.throws(() => loadConfig({ ...sandbox, TOOLS_COMMERCE_FIREBASE_PROJECT: 'confenge-ferramentas-pj-prod' }), /COMMERCE_UNAVAILABLE/);
  assert.throws(() => loadConfig({ ...sandbox, TOOLS_COMMERCE_MP_TEST_BUYER: 'visitor@example.com' }), /COMMERCE_UNAVAILABLE/);
  assert.throws(() => loadConfig({ ...sandbox, TOOLS_COMMERCE_MODE: 'live', RUNTIME_PROFILE: 'netcup-production' }), /COMMERCE_UNAVAILABLE/);
  const handler = createCommerceHttp({ env: sandbox });
  assert.equal((await handler.webhook({ httpMethod: 'POST' })).statusCode, 404);
});

test('live seller and Firebase environment must match live commerce configuration', () => {
  const live = { TOOLS_COMMERCE_MODE: 'live', RUNTIME_PROFILE: 'netcup-production', TOOLS_COMMERCE_FIREBASE_PROJECT: 'confenge-ferramentas-pj-prod',
    TOOLS_COMMERCE_FIREBASE_WEB_KEY: 'AIza' + 'x'.repeat(30), TOOLS_COMMERCE_FIREBASE_WEB_APP: '1:123:web:abc',
    TOOLS_COMMERCE_HMAC_KEY: randomBytes(32).toString('base64url'), TOOLS_COMMERCE_PURCHASES: '1', TOOLS_COMMERCE_TERMS_APPROVED: TERMS,
    TOOLS_COMMERCE_MP_ACCESS_TOKEN: 'APP_USR-' + 'x'.repeat(30), TOOLS_COMMERCE_MP_WEBHOOK_SECRET: 'x'.repeat(24),
    TOOLS_COMMERCE_MP_LIVE_SELLER_ID: '3823648243', TOOLS_COMMERCE_SHARED_EXPORTS: '1', TOOLS_COMMERCE_MP_CHECKOUT: '1' };
  assert.equal(loadConfig(live).sellerId, '3823648243');
  assert.equal(loadConfig(live).purchasesEnabled, true);
  assert.equal(loadConfig({ ...live, TOOLS_COMMERCE_SHARED_EXPORTS: '0' }).purchasesEnabled, false);
  assert.equal(loadConfig({ ...live, TOOLS_COMMERCE_MP_CHECKOUT: '0' }).purchasesEnabled, false);
  const paused = loadConfig({ ...live, TOOLS_COMMERCE_EXPORTS_PAUSED: '1' });
  assert.equal(paused.purchasesEnabled, false);
  assert.equal(paused.accessToken, live.TOOLS_COMMERCE_MP_ACCESS_TOKEN, 'the provider can still reconcile orders');
  assert.equal(loadConfig({ ...live, TOOLS_COMMERCE_TERMS_APPROVED: 'ferramentas-creditos-v1' }).purchasesEnabled, false);
  assert.throws(() => loadConfig({ ...live, TOOLS_COMMERCE_MP_LIVE_SELLER_ID: '' }), /COMMERCE_UNAVAILABLE/);
  assert.throws(() => loadConfig({ ...live, TOOLS_COMMERCE_MP_LIVE_SELLER_ID: '0' }), /COMMERCE_UNAVAILABLE/);
  assert.throws(() => loadConfig({ ...live, TOOLS_COMMERCE_MP_TEST_SELLER_ID: '1170000100' }), /COMMERCE_UNAVAILABLE/);
  assert.throws(() => loadConfig({ ...live, TOOLS_COMMERCE_FIREBASE_PROJECT: 'confenge-ferramentas-pj-hml' }), /COMMERCE_UNAVAILABLE/);
});

test('terms hash locks the published credits section', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../termos-de-uso/index.html'), 'utf8').replace(/\r\n?/g, '\n');
  const start = source.indexOf('<h2 id="creditos-ferramentas">');
  const end = source.indexOf('<h2', start + 4);
  assert.ok(start >= 0 && end > start);
  const actual = createHash('sha256').update(source.slice(start, end).trim()).digest('hex');
  assert.equal(TERMS, 'ferramentas-creditos-v2');
  assert.equal(actual, TERMS_HASH);
});

test('local emissions bind the format and exact fingerprint without receiving the result', () => {
  const key = randomBytes(32);
  const event = { exportId: 'proof-id', at: 1794144000000 };
  const base = { format: 'csv', bytes: 12, sha256: 'a'.repeat(64) };
  for (const [id, formats] of Object.entries(LOCAL_FORMATS)) {
    for (const format of formats) {
      const artifact = localArtifact(id, { ...base, format }, key);
      assert.equal(artifact.receipt(event).toolId, id);
      assert.equal(artifact.receipt(event).format, format);
    }
  }
  const artifact = localArtifact('calculadora-bdi', base, key);
  assert.deepEqual(artifact.receipt(event), localArtifact('calculadora-bdi', base, key).receipt(event));
  assert.notEqual(artifact.digest, localArtifact('rede-de-agua', base, key).digest);
  assert.notEqual(artifact.digest, localArtifact('calculadora-bdi', { ...base, bytes: 13 }, key).digest);
  assert.throws(() => localArtifact('calculadora-bdi', { ...base, bytes: 0 }, key), /INVALID_EXPORT/);
  assert.throws(() => localArtifact('calculadora-bdi', { ...base, format: 'xlsx' }, key), /INVALID_EXPORT/);
  assert.throws(() => localArtifact('calculadora-bdi', { ...base, file: 'sensitive' }, key), /INVALID_EXPORT/);
  assert.throws(() => localArtifact('constructor', base, key), /INVALID_EXPORT/);
});

test('each executable linked by the published showcase has a wallet export', () => {
  const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/site/tool-showcase.json'), 'utf8'));
  const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '../../scripts/cad/suite/releases.json'), 'utf8'));
  const hubs = new Set(['/bim/', '/cad/aplicativos/']);
  const special = {
    '/cad/': 'cad-editor',
    '/analise-cnpj/': 'analise-cnpj',
    '/avaliacao-imoveis-urbanos/inferencia/': TOOL,
  };
  for (const { href } of catalogue.entries) {
    if (hubs.has(href)) continue;
    const url = new URL(href, 'https://confenge.com.br');
    const slug = url.pathname.split('/').filter(Boolean).at(-1);
    let id = special[url.pathname];
    if (url.pathname.startsWith('/ferramentas/')) id = slug;
    if (url.pathname.startsWith('/bim/web/')) id = 'bim-' + slug.replace(/\.html$/, '');
    if (url.pathname === '/cad/aplicativos/') {
      id = url.hash.startsWith('#calculo-') ? 'cad-suite-calculos' : 'cad-suite-' + url.hash.slice(1);
    }
    assert.ok(id === TOOL || LOCAL_FORMATS[id]?.length > 0, `Exportação sem carteira: ${href}`);
  }
  const launcher = fs.readFileSync(path.join(__dirname, '../../cad/aplicativos/catalog.js'), 'utf8');
  for (const app of Object.keys(suite)) {
    const formats = new RegExp(`^ +${app}: \\[([^\\]]+)\\]`, 'm').exec(launcher)?.[1].match(/'[a-z0-9]+'/g)
      .map(value => value.slice(1, -1)).sort();
    assert.ok(formats?.length > 0, `Aplicativo sem formatos de exportação: ${app}`);
    assert.deepEqual([...LOCAL_FORMATS['cad-suite-' + app]].sort(), formats, `Formatos divergentes: ${app}`);
  }
  assert.deepEqual(LOCAL_FORMATS['cad-suite-calculos'], ['txt']);
});

test('official report is deterministic and retains diagnostics; rejects raw sample or changed shape', () => {
  const key = randomBytes(32);
  const event = { exportId: 'emissao-1', at: 1794144000000 };
  const report = modelaReport(payload, key);
  const output = JSON.parse(report.render(event));
  assert.equal(output.esquema, 'confenge.modela.memoria/v1');
  assert.equal(output.emissao, event.exportId);
  assert.deepEqual(output.memoria.resultado.residuals, payload.resultado.residuals);
  assert.equal(modelaReport({ resultado: payload.resultado, parametros: payload.parametros, exemplo_ficticio: true }, key).render(event), report.render(event));
  assert.throws(() => modelaReport({ ...payload, parametros: { ...payload.parametros, rows: [{ name: 'private' }] } }, key), /INVALID_REPORT/);
  assert.notEqual(modelaReport({ ...payload, exemplo_ficticio: false }, key).digest, report.digest);
  const usedRows = Array.from({ length: 10000 }, (_, i) => String(i + 1));
  const full = { ...payload, resultado: { ...payload.resultado, n: usedRows.length, usedRows,
    residuals: usedRows.map(id => ({ id, observed: 370123.123456789, predicted: 372101.987234, residual: -1978.863777211, cook: 0.00003123, leverage: 0.123456789 })) } };
  assert.equal(JSON.parse(modelaReport(full, key).render(event)).memoria.resultado.residuals.length, 10000);
});

test('disabled endpoints never load Firebase; browser config excludes all secrets', async () => {
  const factory = () => { throw new Error('Firebase should not be called'); };
  const disabled = createCommerceHttp({ env: {}, firebaseFactory: factory });
  const e = { httpMethod: 'GET', queryStringParameters: { op: 'config' } };
  assert.deepEqual(JSON.parse((await disabled.api(e)).body), { enabled: false });
  assert.equal((await disabled.webhook({ httpMethod: 'POST' })).statusCode, 404);
  const cfg = { mode: 'live', identityKey: randomBytes(32), accessToken: 'do-not-expose', webhookSecret: 'private',
    firebase: { apiKey: 'public-config' }, purchasesEnabled: true };
  const enabled = createCommerceHttp({ config: cfg, firebaseFactory: factory });
  const out = await enabled.api(e);
  assert.equal(out.headers['Cache-Control'], 'private, no-store');
  assert.equal(JSON.parse(out.body).termsVersion, TERMS);
  assert.ok(!out.body.includes(cfg.accessToken) && !out.body.includes(cfg.webhookSecret));
  assert.equal((await enabled.api({ httpMethod: 'POST', queryStringParameters: { op: 'export' } })).statusCode, 401);
  const wrongOrigin = await enabled.api({ httpMethod: 'POST', queryStringParameters: { op: 'export' }, headers: { authorization: 'Bearer fake', origin: 'https://wrong.test' } });
  assert.equal(wrongOrigin.statusCode, 403);
});
