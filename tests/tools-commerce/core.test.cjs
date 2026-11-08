const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PACKAGES, TERMS, TERMS_HASH, loadConfig, orderId, normalizeEmail } = require('../../runtime/tools-commerce/policy.cjs');
const { modelaReport } = require('../../runtime/tools-commerce/report.cjs');
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
    TOOLS_COMMERCE_MP_LIVE_SELLER_ID: '3823648243' };
  assert.equal(loadConfig(live).sellerId, '3823648243');
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
  assert.equal(TERMS_HASH, 'b4ec61dc0849d971562044415691105f030e7371cee94be9e5d85020b261cb96');
  assert.equal(actual, TERMS_HASH);
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
