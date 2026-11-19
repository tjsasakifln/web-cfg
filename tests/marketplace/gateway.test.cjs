'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHmac } = require('node:crypto');
const { createMarketplaceGateway, TERMS_VERSION } = require('../../runtime/marketplace/gateway.cjs');

const ORIGIN = 'http://127.0.0.1:8790';
const TOKEN = 'fixture_header.fixture_payload.fixture_signature';
const customer = { id: 'cus_fixture', first_name: 'Cliente', last_name: 'Exemplo', email: 'cliente@example.test' };
const seller = { id: 'sel_fixture', name: 'Prestador exemplo', handle: 'prestador-exemplo', status: 'open' };
const config = extra => ({ ENGINEERING_MARKETPLACE_MODE: 'sandbox', ENGINEERING_MARKETPLACE_URL: 'http://127.0.0.1:19000',
  ENGINEERING_MARKETPLACE_PUBLISHABLE_KEY: 'pk_fixture_publishable_only', ENGINEERING_MARKETPLACE_SESSION_KEY: Buffer.alloc(32, 9).toString('base64url'),
  ENGINEERING_MARKETPLACE_GATEWAY_KEY: Buffer.alloc(32, 10).toString('base64url'),
  ENGINEERING_MARKETPLACE_SANDBOX_ORIGIN: ORIGIN, ...extra });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const event = (op, { method = 'GET', body, cookie, query = {}, headers = {}, extra = {} } = {}) => ({
  httpMethod: method, queryStringParameters: { op, ...query }, headers: { origin: ORIGIN,
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}), requestContext: { identity: { sourceIp: '192.0.2.1' } }, ...extra,
});
const data = response => JSON.parse(response.body);
const cookieOf = response => response.headers['Set-Cookie'].split(';')[0];
const consent = { consent: true, terms_version: TERMS_VERSION };

function fixture(custom, extraConfig = {}) {
  const calls = [];
  let now = Date.parse('2026-11-12T12:00:00Z');
  const gateway = createMarketplaceGateway({ env: config(extraConfig), clock: () => now, fetchImpl: async (url, options) => {
    const call = { path: new URL(url).pathname, query: new URL(url).searchParams, url, ...options,
      parsedBody: options.body === undefined ? undefined : JSON.parse(options.body) };
    calls.push(call);
    const selected = custom?.(call);
    if (selected) return selected;
    if (call.path.startsWith('/auth/')) return json({ token: TOKEN });
    if (call.path === '/store/customers/me') return json({ customer });
    if (call.path === '/store/customers') return json({ customer }, 201);
    if (call.path === '/vendor/sellers' && call.method === 'POST') return json({ seller }, 201);
    if (call.path === '/vendor/sellers') return json({ seller_members: [{ id: 'sm_fixture', seller }] });
    if (call.path === '/store/engineering/providers') return json({ providers: [], count: 0 });
    if (call.path === '/store/engineering/config') return json({ service: 'confenge-engineering-marketplace', version: '0.1.0', terms_version: TERMS_VERSION, paymentsEnabled: false, commission_bps: null, payment_mode: 'test' });
    if (call.path === '/vendor/engineering/profile') return json({ provider: seller });
    throw new Error(`Unexpected fixture endpoint: ${call.path}`);
  } });
  return { ...gateway, calls, setTime(value) { now = value; },
    async login(role = 'customer') { const response = await gateway.api(event('login', { method: 'POST', body: { role, email: customer.email, password: 'fixture-password' } })); assert.equal(response.statusCode, 200); return cookieOf(response); } };
}

test('disabled or unreachable marketplace never enables account forms or invents a successful receipt', async () => {
  let fetched = false;
  const off = createMarketplaceGateway({ env: {}, fetchImpl: async () => { fetched = true; throw new Error('unreachable'); } });
  assert.equal(data(await off.api(event('config'))).enabled, false);
  assert.equal((await off.api(event('register', { method: 'POST', body: {} }))).statusCode, 503);
  assert.equal(fetched, false);
  const unreachable = createMarketplaceGateway({ env: config(), fetchImpl: async () => { throw new Error('private infrastructure detail'); } });
  assert.deepEqual(data(await unreachable.api(event('config'))), { enabled: false, terms_version: TERMS_VERSION });
});

test('configuration rejects external upstreams, userinfo, paths and production/sandbox mixing', async () => {
  for (const url of ['https://example.test', 'http://169.254.169.254:8080', 'http://127.0.0.1:19000/admin', 'http://user:pass@127.0.0.1:19000', 'http://127.0.0.1:80']) {
    const app = fixture(() => { throw new Error('must not contact invalid upstream'); }, { ENGINEERING_MARKETPLACE_URL: url });
    assert.equal(data(await app.api(event('config'))).enabled, false);
    assert.equal(app.calls.length, 0);
  }
  const app = fixture(undefined, { RUNTIME_PROFILE: 'netcup-production' });
  assert.equal(data(await app.api(event('config'))).enabled, false);
});

test('only declared operations, query fields and methods are accepted', async () => {
  const app = fixture();
  assert.equal((await app.api(event('admin'))).statusCode, 404);
  assert.equal((await app.api(event('providers', { query: { fields: '*', url: '/admin/users' } }))).statusCode, 422);
  assert.equal((await app.api(event('providers', { query: { limit: '999' } }))).statusCode, 422);
  assert.equal((await app.api(event('provider', { query: { id: '../../admin/users' } }))).statusCode, 422);
  assert.equal((await app.api(event('providers', { method: 'POST', body: {} }))).statusCode, 405);
  assert.equal((await app.api(event('providers', { extra: { multiValueQueryStringParameters: { op: ['providers', 'admin'] } } }))).statusCode, 400);
  assert.equal(app.calls.length, 0);
});

test('public providers remove private metadata, contact, bank and review author identifiers', async () => {
  const app = fixture(call => call.path === '/store/engineering/providers' ? json({ providers: [{ ...seller,
    email: 'private@example.test', tax_id: 'private-tax', metadata: { token: 'private' }, payment_details: { account_number: 'private-bank' },
    profile: { city: 'Florianópolis', uf: 'SC', registration: '123', registration_board: 'CREA', specialties: ['projetar_revisar_compatibilizar'], verification_status: 'verified', cpf: 'private' },
    rating: 4.5, review_count: 2, reviews: [{ rating: 5, note: 'Excelente atendimento.', created_at: '2026-11-01', customer: { email: 'private@example.test' }, customer_id: 'cus_private' }],
  }], count: 1 }) : null);
  const response = await app.api(event('providers', { query: { q: 'engenharia & obra' }, headers: { authorization: 'Bearer supplied_admin_key', 'x-seller-id': 'sel_other', 'x-confenge-gateway-key': 'attacker' } }));
  assert.equal(response.statusCode, 200);
  const row = data(response).providers[0];
  assert.equal(row.name, seller.name);
  assert.equal(row.profile.city, 'Florianópolis');
  assert.deepEqual(row.reviews, [{ rating: 5, note: 'Excelente atendimento.', created_at: '2026-11-01' }]);
  assert.doesNotMatch(response.body, /private|payment_details|verification_status/);
  assert.equal(app.calls[0].headers.Authorization, undefined);
  assert.equal(app.calls[0].headers['x-seller-id'], undefined);
  assert.equal(app.calls[0].headers['x-confenge-gateway-key'], config().ENGINEERING_MARKETPLACE_GATEWAY_KEY);
  assert.equal(app.calls[0].query.get('q'), 'engenharia & obra');
  assert.equal(app.calls[0].redirect, 'error');
});

test('login keeps Mercur token encrypted in HttpOnly cookie and forwards only its authenticated role', async () => {
  const app = fixture();
  const response = await app.api(event('login', { method: 'POST', body: { role: 'provider', email: customer.email, password: 'fixture-password' },
    headers: { authorization: 'Bearer arbitrary_admin', 'x-seller-id': 'sel_other' } }));
  assert.equal(response.statusCode, 200);
  assert.equal(data(response).seller.id, seller.id);
  assert.doesNotMatch(response.body, /token|fixture_header/);
  assert.match(response.headers['Set-Cookie'], /HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(response.headers['Set-Cookie'], /fixture_header/);
  assert.equal(app.calls[0].path, '/auth/member/emailpass');
  const cookie = cookieOf(response);
  const profile = await app.api(event('vendor-profile', { cookie }));
  assert.equal(profile.statusCode, 200);
  assert.equal(app.calls.at(-1).headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(app.calls.at(-1).headers['x-seller-id'], seller.id);
});

test('live sessions use host-only Secure cookies', async () => {
  const app = fixture(undefined, { ENGINEERING_MARKETPLACE_MODE: 'live', RUNTIME_PROFILE: 'netcup-production' });
  const response = await app.api(event('login', { method: 'POST', body: { role: 'customer', email: customer.email, password: 'fixture-password' }, headers: { origin: 'https://confenge.com.br' } }));
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['Set-Cookie'], /^__Host-confenge_marketplace=/);
  assert.match(response.headers['Set-Cookie'], /; Secure$/);
  assert.doesNotMatch(response.headers['Set-Cookie'], /Domain=/);
});

test('forged, duplicate and expired session cookies cannot authenticate', async () => {
  const app = fixture();
  const cookie = await app.login();
  assert.equal(data(await app.api(event('session', { cookie: cookie.slice(0, -4) + 'AAAA' }))).authenticated, false);
  assert.equal(data(await app.api(event('session', { cookie: `${cookie}; ${cookie}` }))).authenticated, false);
  app.setTime(Date.parse('2026-11-12T15:00:01Z'));
  assert.equal(data(await app.api(event('session', { cookie }))).authenticated, false);
});

test('mutation requires exact origin, JSON, bounded payload and role', async () => {
  const app = fixture();
  const cookie = await app.login();
  assert.equal((await app.api(event('logout', { method: 'POST', body: {}, cookie, headers: { origin: 'https://attacker.test' } }))).statusCode, 403);
  assert.equal((await app.api(event('logout', { method: 'POST', body: {}, cookie, headers: { 'content-type': 'text/plain' } }))).statusCode, 415);
  assert.equal((await app.api(event('logout', { method: 'POST', body: { padding: 'a'.repeat(25000) }, cookie }))).statusCode, 413);
  assert.equal((await app.api(event('vendor-profile', { cookie }))).statusCode, 403);
  assert.equal((await app.api(event('connect', { method: 'POST', body: {}, cookie }))).statusCode, 403);
});

test('registration requires consent and creates the correct native actor before reauthentication', async () => {
  const app = fixture();
  const registration = { role: 'customer', email: customer.email, password: 'long-fixture-password', first_name: 'Cliente', last_name: 'Exemplo' };
  assert.equal((await app.api(event('register', { method: 'POST', body: registration }))).statusCode, 422);
  assert.equal(app.calls.length, 0);
  const response = await app.api(event('register', { method: 'POST', body: { ...registration, ...consent } }));
  assert.equal(response.statusCode, 201);
  assert.deepEqual(app.calls.map(call => call.path), ['/auth/customer/emailpass/register', '/store/customers', '/auth/customer/emailpass', '/store/customers/me']);
  assert.equal(app.calls[1].parsedBody.metadata.confenge_terms.version, TERMS_VERSION);
  assert.equal(app.calls[1].parsedBody.metadata.confenge_terms.accepted_at, '2026-11-12T12:00:00.000Z');
});

test('interrupted registration recovers only after password login and never overwrites an existing profile', async () => {
  const registration = { role: 'customer', email: customer.email, password: 'long-fixture-password', first_name: 'Cliente', last_name: 'Exemplo', ...consent };
  const existing = fixture(call => call.path.endsWith('/register') ? json({ error: 'already exists' }, 401) : null);
  const response = await existing.api(event('register', { method: 'POST', body: registration }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(existing.calls.map(call => call.path), ['/auth/customer/emailpass/register', '/auth/customer/emailpass', '/store/customers/me']);
  assert.equal(existing.calls.some(call => call.path === '/store/customers'), false);

  const actorless = `fixture_header.${Buffer.from(JSON.stringify({ actor_type: 'customer', actor_id: '', app_metadata: {}, mfa_enabled: false })).toString('base64url')}.fixture_signature`;
  let created = false;
  const interrupted = fixture(call => {
    if (call.path.endsWith('/register')) return json({ error: 'already exists' }, 401);
    if (call.path === '/auth/customer/emailpass') return json({ token: created ? TOKEN : actorless });
    if (call.path === '/store/customers/me' && !created) return json({ error: 'actor missing' }, 401);
    if (call.path === '/store/customers') { created = true; return json({ customer }, 201); }
  });
  const recovered = await interrupted.api(event('register', { method: 'POST', body: registration }));
  assert.equal(recovered.statusCode, 201);
  assert.equal(interrupted.calls.filter(call => call.path === '/store/customers').length, 1);
});

test('verification/MFA and linked actor denial cannot be bypassed through registration recovery', async () => {
  const body = { role: 'customer', email: customer.email, password: 'long-fixture-password', first_name: 'Cliente', last_name: 'Exemplo', ...consent };
  for (const required of ['mfa_required', 'verification_required']) {
    const app = fixture(call => call.path.endsWith('/register') ? json({}, 401) : call.path === '/auth/customer/emailpass' ? json({ token: TOKEN, [required]: true }) : null);
    const response = await app.api(event('register', { method: 'POST', body }));
    assert.equal(response.statusCode, 403);
    assert.equal(app.calls.some(call => call.path === '/store/customers'), false);
  }
  const denied = fixture(call => call.path.endsWith('/register') || call.path === '/store/customers/me' ? json({}, 401) : null);
  assert.equal((await denied.api(event('register', { method: 'POST', body }))).statusCode, 401);
  assert.equal(denied.calls.some(call => call.path === '/store/customers'), false);
});

test('readiness and commission come from the versioned backend contract', async () => {
  const app = fixture(call => call.path === '/store/engineering/config' ? json({ service: 'confenge-engineering-marketplace', version: '0.1.0', terms_version: TERMS_VERSION,
    paymentsEnabled: true, commission_bps: 1000, payment_mode: 'test', database_password: 'private' }) : null);
  const response = await app.api(event('config'));
  assert.equal(data(response).paymentsEnabled, true);
  assert.equal(data(response).commission_bps, 1000);
  assert.doesNotMatch(response.body, /private|password/);
  const wrong = fixture(call => call.path === '/store/engineering/config' ? json({ service: 'other', paymentsEnabled: true }) : null);
  assert.equal(data(await wrong.api(event('config'))).enabled, false);
});

test('vendor cannot self-assign verified status or arbitrary metadata on its public profile', async () => {
  const app = fixture();
  const cookie = await app.login('provider');
  const before = app.calls.length;
  for (const body of [{ ...consent, status: 'open' }, { ...consent, metadata: { verified: true } }, { ...consent, profile: { verification_status: 'verified' } }]) {
    assert.equal((await app.api(event('vendor-profile', { method: 'POST', body, cookie }))).statusCode, 422);
  }
  assert.equal(app.calls.length, before);
  const response = await app.api(event('vendor-profile', { method: 'POST', body: { ...consent, name: seller.name, profile: { city: 'Florianópolis', uf: 'SC', modalities: ['remote'], specialties: ['projetar_revisar_compatibilizar'] } }, cookie }));
  assert.equal(response.statusCode, 200);
  assert.equal(app.calls.at(-1).path, '/vendor/engineering/profile');
});

test('request actions require current proposal revision and keep server-owned fields out', async () => {
  const app = fixture(call => call.path === '/store/engineering/requests/req_fixture' ? json({ request: { id: 'req_fixture', status: 'accepted',
    proposal: { amount_cents: 12345, revision: 2, scope: 'Projeto definido', deadline: '2026-12-01', private_memo: 'never',
      provider: { id: seller.id, name: seller.name, registration_board: 'CREA', registration: '123456-SC', email: 'never', metadata: { bank: 'never' } } },
    payment: { stripe_secret: 'never' }, customer_id: 'never', review: { rating: 5, note: 'Boa entrega', customer_id: 'never' } } }) : null);
  const cookie = await app.login();
  assert.equal((await app.api(event('request-action', { method: 'POST', body: { id: 'req_fixture', action: 'accept' }, cookie }))).statusCode, 422);
  assert.equal((await app.api(event('request-action', { method: 'POST', body: { id: 'req_fixture', action: 'accept', revision: 2, customer_id: 'cus_other' }, cookie }))).statusCode, 422);
  const response = await app.api(event('request-action', { method: 'POST', body: { id: 'req_fixture', action: 'accept', revision: 2 }, cookie }));
  assert.equal(response.statusCode, 200);
  assert.equal(data(response).request.proposal.amount_cents, 12345);
  assert.deepEqual(data(response).request.proposal.provider, {id:seller.id,name:seller.name,registration_board:'CREA',registration:'123456-SC'});
  assert.doesNotMatch(response.body, /never|secret|customer_id/);
  assert.deepEqual(app.calls.at(-1).parsedBody, { action: 'accept', revision: 2 });
});

test('request creation requires real consent and sends a single bounded request to backend', async () => {
  const app = fixture(call => call.path === '/store/engineering/requests' ? json({ request: { id: 'req_fixture', ...call.parsedBody, status: 'requested' } }, 201) : null);
  const cookie = await app.login();
  const body = { seller_id: seller.id, title: 'Projeto', description: 'Preciso de um projeto.', location: 'Florianópolis/SC', intent_family: 'projetar_revisar_compatibilizar' };
  assert.equal((await app.api(event('request', { method: 'POST', body, cookie }))).statusCode, 422);
  const response = await app.api(event('request', { method: 'POST', body: { ...body, ...consent }, cookie }));
  assert.equal(response.statusCode, 201);
  assert.equal(data(response).request.id, 'req_fixture');
});

test('quotes carry the commission displayed to the professional and reject missing or unbounded consent', async () => {
  const app = fixture(call => call.path === '/vendor/engineering/requests/req_fixture' ? json({ request: { id: 'req_fixture', status: 'quoted' } }) : null);
  const cookie = await app.login('provider');
  const body = { id: 'req_fixture', action: 'quote', amount_cents: 120000, scope: 'Projeto estrutural com memorial de cálculo.', deadline: '2026-12-01' };
  const before = app.calls.length;
  for (const value of [undefined, -1, 5001, 1000.5, '1000']) {
    assert.equal((await app.api(event('request-action', { method: 'POST', body: { ...body, expected_commission_bps: value }, cookie }))).statusCode, 422);
  }
  assert.equal(app.calls.length, before);
  const response = await app.api(event('request-action', { method: 'POST', body: { ...body, expected_commission_bps: 1000 }, cookie }));
  assert.equal(response.statusCode, 200);
  assert.equal(app.calls.at(-1).parsedBody.expected_commission_bps, 1000);
});

test('only explicitly safe engineering conflict codes cross the boundary', async () => {
  for (const code of ['PROPOSAL_EXPIRED', 'COMMISSION_CHANGED', 'PAYMENT_RECONCILIATION_REQUIRED', 'private_database_password']) {
    const app = fixture(call => call.path === '/store/engineering/requests/req_fixture' ? json({ error: code, message: 'internal secret' }, 409) : null);
    const cookie = await app.login();
    const response = await app.api(event('request-action', { method: 'POST', cookie, body: { id: 'req_fixture', action: 'accept', revision: 1 } }));
    assert.equal(response.statusCode, 409);
    assert.equal(data(response).error, code === 'private_database_password' ? 'REQUEST_CONFLICT' : code);
    assert.doesNotMatch(response.body, /private_database_password|internal secret/);
  }
});

test('private provider profile carries verification status without allowing self-approval', async () => {
  const app = fixture(call => call.path === '/vendor/engineering/profile' ? json({ provider: { ...seller, verified: false } }) : null);
  const cookie = await app.login('provider');
  const response = await app.api(event('vendor-profile', { cookie }));
  assert.equal(data(response).provider.status, 'open');
  assert.equal(data(response).provider.verified, false);
});

test('checkout and onboarding only return URLs of their exact Stripe hosts', async () => {
  let url = 'https://checkout.stripe.com/c/pay/fixture';
  const app = fixture(call => call.path.endsWith('/checkout') || call.path.endsWith('/connect') ? json({ url }) : call.path === '/store/engineering/config' ? json({service:'confenge-engineering-marketplace',version:'0.1.0',terms_version:TERMS_VERSION,paymentsEnabled:true,commission_bps:1000,payment_mode:'test'}) : null);
  const buyerCookie = await app.login();
  let response = await app.api(event('checkout', { method: 'POST', cookie: buyerCookie, body: { id: 'req_fixture' } }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(data(response), { url });
  for (const malicious of ['https://checkout.stripe.com.attacker.test/pay', 'https://checkout.stripe.com@attacker.test/pay', 'javascript:alert(1)', 'https://connect.stripe.com/setup/fixture']) {
    url = malicious;
    assert.equal((await app.api(event('checkout', { method: 'POST', cookie: buyerCookie, body: { id: 'req_fixture' } }))).statusCode, 502);
  }
  const sellerCookie = await app.login('provider');
  url = 'https://connect.stripe.com/setup/s/fixture';
  response = await app.api(event('connect', { method: 'POST', cookie: sellerCookie, body: {} }));
  assert.equal(response.statusCode, 200);
  assert.equal(app.calls.at(-1).headers['x-seller-id'], seller.id);
});

test('every financial operation rechecks the switch and refuses live/test mixing', async () => {
  for (const [mode, paymentMode, enabled] of [['live', 'test', true], ['sandbox', 'live', true], ['sandbox', 'test', false]]) {
    const origin = mode === 'live' ? 'https://confenge.com.br' : ORIGIN;
    const app = fixture(call => call.path === '/store/engineering/config' ? json({service:'confenge-engineering-marketplace',version:'0.1.0',terms_version:TERMS_VERSION,paymentsEnabled:enabled,commission_bps:1000,payment_mode:paymentMode}) : null,
      {ENGINEERING_MARKETPLACE_MODE:mode, ...(mode === 'live' ? {RUNTIME_PROFILE:'netcup-production'} : {})});
    assert.equal(data(await app.api(event('config'))).paymentsEnabled, false);
    for (const [role, op, body] of [['customer', 'checkout', {id:'req_fixture'}], ['provider', 'connect', {}]]) {
      const login = await app.api(event('login', {method:'POST',headers:{origin},body:{role,email:customer.email,password:'fixture-password'}}));
      assert.equal(login.statusCode, 200);
      const result = await app.api(event(op, {method:'POST',headers:{origin},cookie:cookieOf(login),body}));
      assert.equal(result.statusCode, 503);
      assert.equal(data(result).error, 'PAYMENTS_DISABLED');
    }
    assert.equal(app.calls.some(call => call.path.endsWith('/checkout') || call.path.endsWith('/connect')), false);
  }
});

test('upstream errors, redirection and oversized response do not leak internals or claim success', async () => {
  const privateError = fixture(call => call.path === '/store/engineering/providers' ? json({ message: 'sql password private data' }, 500) : null);
  const unavailable = await privateError.api(event('providers'));
  assert.equal(unavailable.statusCode, 503);
  assert.doesNotMatch(unavailable.body, /password|sql/);
  const huge = fixture(call => call.path === '/store/engineering/providers' ? json({ payload: 'x'.repeat(600000) }) : null);
  assert.equal((await huge.api(event('providers'))).statusCode, 502);
  const wrongType = fixture(call => call.path === '/store/engineering/providers' ? new Response('<html>internal</html>', { headers: { 'Content-Type': 'text/html' } }) : null);
  assert.equal((await wrongType.api(event('providers'))).statusCode, 502);
});

test('authentication rate limit prevents unbounded repeated attempts', async () => {
  const app = fixture();
  for (let i = 0; i < 12; i++) assert.equal((await app.api(event('login', { method: 'POST', body: { role: 'customer', email: customer.email, password: 'fixture-password' } }))).statusCode, 200);
  const before = app.calls.length;
  assert.equal((await app.api(event('login', { method: 'POST', body: { role: 'customer', email: customer.email, password: 'fixture-password' } }))).statusCode, 429);
  assert.equal(app.calls.length, before);
});

test('logout erases cookie and authentication failure expires the browser session', async () => {
  const app = fixture();
  const cookie = await app.login();
  const response = await app.api(event('logout', { method: 'POST', cookie, body: {} }));
  assert.equal(data(response).authenticated, false);
  assert.match(response.headers['Set-Cookie'], /Max-Age=0/);
  const rejecting = fixture(call => call.path === '/store/customers/me' ? json({ error: 'expired token details' }, 401) : null);
  const failed = await rejecting.api(event('session', { cookie }));
  assert.equal(failed.statusCode, 401);
  assert.match(failed.headers['Set-Cookie'], /Max-Age=0/);
  assert.doesNotMatch(failed.body, /details/);
});

test('real HTTP transport preserves raw Stripe body and signature, strips browser credentials', async t => {
  const raw = '{ "id": "evt_fixture", "spacing": true }\n';
  let received;
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = { url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') };
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"received":true,"private":"hidden"}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const app = createMarketplaceGateway({ env: config({ ENGINEERING_MARKETPLACE_URL: `http://127.0.0.1:${server.address().port}` }) });
  const response = await app.webhook({ httpMethod: 'POST', body: raw, headers: { 'content-type': 'application/json', 'Stripe-Signature': 't=123,v1=fixture', cookie: 'private-cookie', authorization: 'Bearer private-token' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(data(response), { received: true });
  assert.equal(received.url, '/hooks/engineering-stripe');
  assert.equal(received.body, raw);
  assert.equal(received.headers['stripe-signature'], 't=123,v1=fixture');
  assert.equal(received.headers.cookie, undefined);
  assert.equal(received.headers.authorization, undefined);
  assert.equal(received.headers['x-publishable-api-key'], undefined);
  assert.equal(received.headers['x-confenge-gateway-key'], undefined);
});

test('Stripe webhook requires signature, size and upstream confirmation, and missing backend retries', async () => {
  const app = fixture(call => call.path === '/hooks/engineering-stripe' ? json({ received: false }) : null);
  const valid = { httpMethod: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'stripe-signature': 't=123,v1=fixture' } };
  assert.equal((await app.webhook({ ...valid, headers: { 'content-type': 'application/json' } })).statusCode, 400);
  assert.equal((await app.webhook({ ...valid, body: 'a'.repeat(65537) })).statusCode, 413);
  assert.equal((await app.webhook(valid)).statusCode, 502);
  const off = createMarketplaceGateway({ env: {} });
  assert.equal((await off.webhook(valid)).statusCode, 503);
});

test('pausing new business preserves reconciliation without authentication settings', async () => {
  const app = createMarketplaceGateway({ env: { ENGINEERING_MARKETPLACE_MODE: 'off', ENGINEERING_MARKETPLACE_URL: 'http://127.0.0.1:19000' },
    fetchImpl: async () => json({ received: true }) });
  assert.equal(data(await app.api(event('config'))).enabled, false);
  const response = await app.webhook({ httpMethod: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'stripe-signature': 't=123,v1=fixture' } });
  assert.equal(response.statusCode, 200);
});

test('Connect webhook authenticates raw bytes and timestamp before accepting native enqueue', async () => {
  const secret = ['whsec', 'fixture_secret_for_gateway_test_only'].join('_');
  const now = Date.parse('2026-11-12T12:00:00Z');
  const body = '{ "id":"evt_fixture", "type":"account.updated" }';
  const stamp = String(Math.floor(now / 1000));
  const digest = createHmac('sha256', secret).update(`${stamp}.${body}`).digest('hex');
  const calls = [];
  const app = createMarketplaceGateway({ clock: () => now, env: config({ ENGINEERING_MARKETPLACE_CONNECT_WEBHOOK_SECRET: secret }), fetchImpl: async (url, options) => {
    calls.push({ url, ...options }); return new Response('OK', { status: 200 });
  } });
  const call = signature => app.connectWebhook({ httpMethod: 'POST', body, headers: { 'content-type': 'application/json', 'stripe-signature': signature } });
  assert.equal((await call(`t=${stamp},v1=${'0'.repeat(64)}`)).statusCode, 400);
  assert.equal((await call(`t=${Number(stamp) - 301},v1=${digest}`)).statusCode, 400);
  assert.equal((await call(`t=${Number(stamp) + 301},v1=${digest}`)).statusCode, 400);
  assert.equal((await call(`t=${stamp},t=${stamp},v1=${digest}`)).statusCode, 400);
  assert.equal(calls.length, 0);
  const response = await call(`t=${stamp},v1=${'0'.repeat(64)},v1=${digest}`);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(data(response), { received: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:19000/hooks/payout');
  assert.equal(calls[0].body, body);
  assert.equal(calls[0].headers.Authorization, undefined);
});
