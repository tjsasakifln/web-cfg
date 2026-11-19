'use strict';

// CONFENGE's same-origin boundary for the pinned Mercur 2.4.1 API. The
// marketplace owns accounts and transactions; this process holds no ledger.
const { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, timingSafeEqual } = require('node:crypto');

const TERMS_VERSION = 'marketplace-engenharia-v1';
const MAX_BODY = 24 * 1024;
const MAX_RESPONSE = 512 * 1024;
const SESSION_SECONDS = 2 * 60 * 60;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;
const HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
});
const METHODS = Object.freeze({
  config: ['GET'], providers: ['GET'], provider: ['GET'], session: ['GET'],
  login: ['POST'], register: ['POST'], logout: ['POST'], 'select-seller': ['POST'],
  'vendor-profile': ['GET', 'POST'], requests: ['GET'], request: ['POST'],
  'request-action': ['POST'], checkout: ['POST'], connect: ['POST'],
});
class GatewayError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
function ensure(value, code, status) { if (!value) throw new GatewayError(code, status); }
const reply = (statusCode, data, headers = {}) => ({ statusCode, headers: { ...HEADERS, ...headers }, body: JSON.stringify(data) });
const header = (event, key) => Object.entries(event.headers || {}).find(([name]) => name.toLowerCase() === key)?.[1];
const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function only(value, keys) { ensure(object(value) && Object.keys(value).every(key => keys.includes(key)), 'INVALID_REQUEST', 422); }
function string(value, max, { optional = false, min = 1 } = {}) {
  if (optional && (value === undefined || value === null)) return undefined;
  ensure(typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), 'INVALID_REQUEST', 422);
  return value.trim();
}
const publicText = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max) : null;
function publicUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
function safeProfile(profile) {
  if (!object(profile)) return {};
  const result = {};
  for (const key of ['city', 'uf', 'registration', 'registration_board']) {
    if (typeof profile[key] === 'string') result[key] = profile[key].slice(0, 160);
  }
  for (const key of ['modalities', 'specialties']) if (Array.isArray(profile[key])) result[key] = profile[key].filter(v => typeof v === 'string').slice(0, 20).map(v => v.slice(0, 100));
  result.portfolio_url = publicUrl(profile.portfolio_url);
  return result;
}
function safeReview(review) {
  if (!object(review) || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) return null;
  return { rating: review.rating, note: publicText(review.note, 2000), created_at: publicText(review.created_at, 40) };
}
function safeProvider(provider, { privateView = false } = {}) {
  ensure(object(provider) && ID.test(provider.id || '') && typeof provider.name === 'string', 'INVALID_UPSTREAM_RESPONSE', 502);
  const result = { id: provider.id, name: publicText(provider.name, 160), handle: publicText(provider.handle, 160),
    description: publicText(provider.description, 4000), logo: publicUrl(provider.logo), website_url: publicUrl(provider.website_url),
    profile: safeProfile(provider.profile),
    rating: Number.isFinite(provider.rating) && provider.rating >= 1 && provider.rating <= 5 ? provider.rating : null,
    review_count: Number.isSafeInteger(provider.review_count) && provider.review_count >= 0 ? provider.review_count : 0 };
  if (Array.isArray(provider.reviews)) result.reviews = provider.reviews.slice(0, 50).map(safeReview).filter(Boolean);
  if (privateView) {
    result.status = publicText(provider.status, 60);
    result.verified = provider.verified === true;
    result.email = publicText(provider.email, 254);
    result.phone = publicText(provider.phone, 40);
  }
  return result;
}
function safeUser(customer) {
  ensure(object(customer) && ID.test(customer.id || ''), 'INVALID_UPSTREAM_RESPONSE', 502);
  return { id: customer.id, first_name: publicText(customer.first_name, 100), last_name: publicText(customer.last_name, 100), email: publicText(customer.email, 254) };
}
function safeRequest(request) {
  ensure(object(request) && ID.test(request.id || ''), 'INVALID_UPSTREAM_RESPONSE', 502);
  const result = { id: request.id };
  for (const key of ['seller_id', 'title', 'description', 'location', 'intent_family', 'status', 'created_at', 'updated_at', 'paid_at', 'completed_at']) {
    if (typeof request[key] === 'string') result[key] = request[key].slice(0, key === 'description' || key === 'scope' ? 6000 : 1000);
  }
  if (Number.isSafeInteger(request.revision) && request.revision >= 0) result.revision = request.revision;
  if (object(request.proposal)) {
    const proposal = {};
    if (Number.isSafeInteger(request.proposal.amount_cents) && request.proposal.amount_cents > 0) proposal.amount_cents = request.proposal.amount_cents;
    if (Number.isSafeInteger(request.proposal.revision) && request.proposal.revision >= 0) proposal.revision = request.proposal.revision;
    for (const key of ['fee_cents', 'commission_bps']) if (Number.isSafeInteger(request.proposal[key]) && request.proposal[key] >= 0) proposal[key] = request.proposal[key];
    for (const key of ['scope', 'deadline', 'created_at', 'currency', 'provider_accepted_at', 'hash']) if (typeof request.proposal[key] === 'string') proposal[key] = request.proposal[key].slice(0, key === 'scope' ? 6000 : 100);
    if (object(request.proposal.provider)) {
      const provider = request.proposal.provider;
      ensure(ID.test(provider.id || '') && typeof provider.name === 'string', 'INVALID_UPSTREAM_RESPONSE', 502);
      proposal.provider = { id: provider.id, name: publicText(provider.name, 160),
        registration_board: publicText(provider.registration_board, 20), registration: publicText(provider.registration, 40) };
    }
    result.proposal = proposal;
  }
  if (object(request.delivery)) result.delivery = { note: publicText(request.delivery.note, 4000), delivered_at: publicText(request.delivery.delivered_at, 40), accepted_at: publicText(request.delivery.accepted_at, 40) };
  if (object(request.acceptance)) result.acceptance = { revision: Number.isSafeInteger(request.acceptance.revision) ? request.acceptance.revision : null,
    accepted_at: publicText(request.acceptance.accepted_at, 40), terms_version: publicText(request.acceptance.terms_version, 100) };
  if (object(request.payment)) {
    result.payment = { status: publicText(request.payment.status, 60) };
    for (const key of ['amount_cents', 'fee_cents']) if (Number.isSafeInteger(request.payment[key]) && request.payment[key] >= 0) result.payment[key] = request.payment[key];
  }
  if (object(request.review)) result.review = safeReview(request.review);
  return result;
}
function boundedInteger(value, fallback, min, max) {
  if (value === undefined) return fallback;
  ensure(typeof value === 'string' && /^\d{1,6}$/.test(value), 'INVALID_REQUEST', 422);
  const number = Number(value);
  ensure(Number.isSafeInteger(number) && number >= min && number <= max, 'INVALID_REQUEST', 422);
  return number;
}
function privateUpstream(env) {
  let upstream;
  try { upstream = new URL(env.ENGINEERING_MARKETPLACE_URL); } catch { throw new GatewayError('MARKETPLACE_UNAVAILABLE', 503); }
  ensure(upstream.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)
    && Number(upstream.port) >= 1024 && Number(upstream.port) <= 65535 && upstream.pathname === '/'
    && !upstream.username && !upstream.password && !upstream.search && !upstream.hash, 'MARKETPLACE_UNAVAILABLE', 503);
  return upstream.origin;
}
function loadConfig(env) {
  const mode = env.ENGINEERING_MARKETPLACE_MODE || 'off';
  if (mode === 'off') return { mode };
  ensure(['sandbox', 'live'].includes(mode), 'MARKETPLACE_UNAVAILABLE', 503);
  ensure(mode === 'live' ? env.RUNTIME_PROFILE === 'netcup-production' : env.RUNTIME_PROFILE !== 'netcup-production', 'MARKETPLACE_UNAVAILABLE', 503);
  const upstream = privateUpstream(env);
  const keyText = env.ENGINEERING_MARKETPLACE_SESSION_KEY || '';
  ensure(/^[A-Za-z0-9_-]{43}$/.test(keyText), 'MARKETPLACE_UNAVAILABLE', 503);
  const key = Buffer.from(keyText, 'base64url');
  ensure(key.length === 32 && key.toString('base64url') === keyText, 'MARKETPLACE_UNAVAILABLE', 503);
  const publishableKey = env.ENGINEERING_MARKETPLACE_PUBLISHABLE_KEY || '';
  ensure(/^pk_[A-Za-z0-9_-]{16,200}$/.test(publishableKey), 'MARKETPLACE_UNAVAILABLE', 503);
  const gatewayKey = env.ENGINEERING_MARKETPLACE_GATEWAY_KEY || '';
  ensure(/^[A-Za-z0-9_-]{32,256}$/.test(gatewayKey), 'MARKETPLACE_UNAVAILABLE', 503);
  const origin = mode === 'live' ? 'https://confenge.com.br' : env.ENGINEERING_MARKETPLACE_SANDBOX_ORIGIN;
  if (mode === 'sandbox') ensure(/^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}$/.test(origin || ''), 'MARKETPLACE_UNAVAILABLE', 503);
  return { mode, upstream, key, publishableKey, gatewayKey, origin,
    cookieName: mode === 'live' ? '__Host-confenge_marketplace' : 'confenge_marketplace_sandbox' };
}
function cookieHeader(config, value, maxAge = SESSION_SECONDS) {
  return `${config.cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.mode === 'live' ? '; Secure' : ''}`;
}
function sealSession(config, session, now) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.key, iv);
  cipher.setAAD(Buffer.from(config.cookieName));
  const bytes = Buffer.concat([cipher.update(JSON.stringify({ ...session, expires: now + SESSION_SECONDS * 1000 }), 'utf8'), cipher.final()]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64url');
  ensure(value.length <= 3800, 'INVALID_UPSTREAM_RESPONSE', 502);
  return cookieHeader(config, value);
}
function readSession(config, event, now) {
  const raw = header(event, 'cookie');
  if (typeof raw !== 'string' || raw.length > 16000) return null;
  const matches = raw.split(';').map(p => p.trim()).filter(p => p.startsWith(`${config.cookieName}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(config.cookieName.length + 1);
  if (!/^[A-Za-z0-9_-]{40,3800}$/.test(value)) return null;
  try {
    const packed = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', config.key, packed.subarray(0, 12));
    decipher.setAAD(Buffer.from(config.cookieName));
    decipher.setAuthTag(packed.subarray(12, 28));
    const session = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8'));
    if (!object(session) || !['customer', 'provider'].includes(session.role) || !validToken(session.token)
      || !Number.isSafeInteger(session.expires) || session.expires <= now || session.expires > now + SESSION_SECONDS * 1000
      || (session.sellerId && !ID.test(session.sellerId))) return null;
    return session;
  } catch { return null; }
}
function validToken(token) { return typeof token === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) && token.length <= 2400; }
function readBody(event) {
  ensure(!event.isBase64Encoded && typeof event.body === 'string', 'INVALID_REQUEST', 400);
  ensure(Buffer.byteLength(event.body) <= MAX_BODY, 'PAYLOAD_TOO_LARGE', 413);
  ensure(/^application\/json(?:\s*;|$)/i.test(header(event, 'content-type') || ''), 'INVALID_CONTENT_TYPE', 415);
  try { const value = JSON.parse(event.body); ensure(object(value), 'INVALID_REQUEST', 400); return value; }
  catch (e) { if (e instanceof GatewayError) throw e; throw new GatewayError('INVALID_REQUEST', 400); }
}
async function readResponse(response) {
  ensure(/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || ''), 'INVALID_UPSTREAM_RESPONSE', 502);
  const length = response.headers.get('content-length');
  ensure(!length || (/^\d+$/.test(length) && Number(length) <= MAX_RESPONSE), 'INVALID_UPSTREAM_RESPONSE', 502);
  const reader = response.body?.getReader();
  ensure(reader, 'INVALID_UPSTREAM_RESPONSE', 502);
  let bytes = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      ensure(bytes <= MAX_RESPONSE, 'INVALID_UPSTREAM_RESPONSE', 502);
      chunks.push(Buffer.from(value));
    }
  } catch (e) { await reader.cancel().catch(() => {}); throw e; }
  try { const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); ensure(object(data), 'INVALID_UPSTREAM_RESPONSE', 502); return data; }
  catch (e) { if (e instanceof GatewayError) throw e; throw new GatewayError('INVALID_UPSTREAM_RESPONSE', 502); }
}

function createMarketplaceGateway({ env = process.env, fetchImpl = globalThis.fetch, clock = Date.now } = {}) {
  const attempts = new Map();
  function limit(event, op) {
    const identity = event.requestContext?.identity?.sourceIp || 'unavailable';
    const auth = op === 'login' || op === 'register';
    const key = createHash('sha256').update(`${identity}:${auth ? 'auth' : event.httpMethod}`).digest('hex');
    const now = clock(), period = auth ? 15 * 60_000 : 60_000;
    let item = attempts.get(key);
    if (!item || now - item.since >= period) {
      if (attempts.size >= 5000) attempts.delete(attempts.keys().next().value);
      item = { since: now, count: 0 }; attempts.set(key, item);
    }
    ensure(++item.count <= (auth ? 12 : event.httpMethod === 'GET' ? 120 : 30), 'TOO_MANY_REQUESTS', 429);
  }
  async function upstream(config, path, { method = 'GET', body, session, token } = {}) {
    // Every path comes from a branch below, never from a client URL or header.
    ensure(/^\/(?:store|vendor|auth)\/[a-zA-Z0-9_/?=,%&.+-]+$/.test(path), 'INVALID_REQUEST', 400);
    const headers = { Accept: 'application/json', 'x-publishable-api-key': config.publishableKey, 'x-confenge-gateway-key': config.gatewayKey };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token || session?.token) headers.Authorization = `Bearer ${token || session.token}`;
    if (session?.role === 'provider' && session.sellerId) headers['x-seller-id'] = session.sellerId;
    let response;
    try {
      response = await fetchImpl(`${config.upstream}${path}`, { method, headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(10_000) });
    } catch { throw new GatewayError('MARKETPLACE_UNAVAILABLE', 503); }
    if (!response.ok) {
      // Never return framework stacks, raw validation errors, SQL, or credentials.
      const status = [400, 401, 403, 404, 409, 422, 429].includes(response.status) ? response.status : 503;
      let code = { 400: 'INVALID_REQUEST', 401: 'AUTH_REQUIRED', 403: 'ACTION_FORBIDDEN', 404: 'NOT_FOUND',
        409: 'REQUEST_CONFLICT', 422: 'INVALID_REQUEST', 429: 'TOO_MANY_REQUESTS' }[status] || 'MARKETPLACE_UNAVAILABLE';
      if (status === 409 && /^\/(store|vendor)\/engineering\//.test(path)) {
        // These domain codes guide a safe next action without exposing backend
        // messages. Unrecognized, malformed or oversized errors stay generic.
        try {
          const problem = await readResponse(response);
          if (['PROPOSAL_EXPIRED', 'COMMISSION_CHANGED', 'PAYMENT_RECONCILIATION_REQUIRED'].includes(problem.error)) code = problem.error;
        } catch { response.body?.cancel().catch(() => {}); /* Keep the bounded generic error. */ }
      } else response.body?.cancel().catch(() => {});
      throw new GatewayError(code, status);
    }
    return readResponse(response);
  }
  async function account(config, session) {
    if (session.role === 'customer') {
      const data = await upstream(config, '/store/customers/me?fields=id,first_name,last_name,email', { session });
      return { authenticated: true, role: session.role, user: safeUser(data.customer), seller: null };
    }
    const data = await upstream(config, '/vendor/sellers?limit=24&fields=id,seller.id,seller.name,seller.handle,seller.description,seller.status', { session });
    ensure(Array.isArray(data.seller_members), 'INVALID_UPSTREAM_RESPONSE', 502);
    const sellers = data.seller_members.slice(0, 24).map(member => safeProvider(member.seller, { privateView: true }));
    const seller = sellers.find(candidate => candidate.id === session.sellerId) || (sellers.length === 1 ? sellers[0] : null);
    if (seller) session.sellerId = seller.id;
    else delete session.sellerId;
    return { authenticated: true, role: session.role, user: null, seller, sellers, profile_required: sellers.length === 0 };
  }
  async function readiness(config) {
    // The extension proves its database SELECT and current commercial switch.
    // A production surface must never open a Stripe test checkout.
    const data = await upstream(config, '/store/engineering/config');
    ensure(data.service === 'confenge-engineering-marketplace' && data.version === '0.1.0' && data.terms_version === TERMS_VERSION
      && ['test', 'live'].includes(data.payment_mode), 'INVALID_UPSTREAM_RESPONSE', 502);
    const commission = Number.isInteger(data.commission_bps) && data.commission_bps >= 0 && data.commission_bps <= 5000 ? data.commission_bps : null;
    const modeMatches = data.payment_mode === (config.mode === 'live' ? 'live' : 'test');
    return { enabled: true, terms_version: TERMS_VERSION, payment_provider: 'stripe-connect',
      paymentsEnabled: data.paymentsEnabled === true && commission !== null && modeMatches, commission_bps: commission };
  }
  async function api(event) {
    let config;
    try {
      const query = event.queryStringParameters || {};
      const op = query.op;
      ensure(typeof op === 'string' && Object.hasOwn(METHODS, op), 'NOT_FOUND', 404);
      ensure(METHODS[op].includes(event.httpMethod), 'METHOD_NOT_ALLOWED', 405);
      for (const values of Object.values(event.multiValueQueryStringParameters || {})) ensure(!Array.isArray(values) || values.length <= 1, 'INVALID_REQUEST', 400);
      only(query, op === 'providers' ? ['op', 'q', 'limit', 'offset'] : op === 'provider' ? ['op', 'id'] : ['op']);
      config = loadConfig(env);
      if (config.mode === 'off') return op === 'config' ? reply(200, { enabled: false, terms_version: TERMS_VERSION }) : reply(503, { error: 'MARKETPLACE_UNAVAILABLE' });
      limit(event, op);
      if (event.httpMethod === 'POST') ensure(header(event, 'origin') === config.origin, 'ORIGIN_FORBIDDEN', 403);
      if (op === 'config') {
        return reply(200, await readiness(config));
      }
      if (op === 'logout') {
        only(readBody(event), []);
        return reply(200, { authenticated: false }, { 'Set-Cookie': cookieHeader(config, '', 0) });
      }
      if (op === 'providers') {
        const params = new URLSearchParams({ limit: String(boundedInteger(query.limit, 12, 1, 24)), offset: String(boundedInteger(query.offset, 0, 0, 10000)) });
        if (query.q !== undefined) params.set('q', string(query.q, 120, { min: 0 }));
        const data = await upstream(config, `/store/engineering/providers?${params}`);
        ensure(Array.isArray(data.providers) && Number.isSafeInteger(data.count) && data.count >= 0, 'INVALID_UPSTREAM_RESPONSE', 502);
        return reply(200, { providers: data.providers.slice(0, Number(params.get('limit'))).map(p => safeProvider(p)), count: data.count,
          offset: Number(params.get('offset')), limit: Number(params.get('limit')) });
      }
      if (op === 'provider') {
        ensure(ID.test(query.id || ''), 'INVALID_REQUEST', 422);
        const data = await upstream(config, `/store/engineering/providers/${query.id}`);
        return reply(200, { provider: safeProvider(data.provider) });
      }
      if (op === 'login' || op === 'register') {
        const input = readBody(event);
        only(input, op === 'login' ? ['role', 'email', 'password'] : ['role', 'email', 'password', 'first_name', 'last_name', 'name', 'consent', 'terms_version']);
        ensure(['customer', 'provider'].includes(input.role), 'INVALID_REQUEST', 422);
        const email = string(input.email, 254).toLowerCase();
        ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'INVALID_REQUEST', 422);
        ensure(typeof input.password === 'string' && input.password.length >= (op === 'register' ? 12 : 1) && input.password.length <= 128, 'INVALID_REQUEST', 422);
        const actor = input.role === 'provider' ? 'member' : 'customer';
        if (op === 'register') {
          ensure(input.consent === true && input.terms_version === TERMS_VERSION, 'TERMS_REQUIRED', 422);
          input.first_name = string(input.first_name, 100); input.last_name = string(input.last_name, 100);
          if (input.role === 'provider') input.name = string(input.name, 160);
          let registered;
          try {
            registered = await upstream(config, `/auth/${actor}/emailpass/register`, { method: 'POST', body: { email, password: input.password } });
          } catch (error) {
            if (!(error instanceof GatewayError) || ![400, 401, 409].includes(error.status)) throw error;
            // A response may have been lost after native auth or actor creation.
            // A password-authenticated retry can recover; it must never change
            // an existing actor's profile or bypass verification/MFA.
            registered = await upstream(config, `/auth/${actor}/emailpass`, { method: 'POST', body: { email, password: input.password } });
            ensure(registered.verification_required !== true && registered.mfa_required !== true, 'ADDITIONAL_VERIFICATION_REQUIRED', 403);
            ensure(validToken(registered.token), 'INVALID_UPSTREAM_RESPONSE', 502);
            const existingSession = { token: registered.token, role: input.role };
            try {
              const existing = await account(config, existingSession);
              return reply(200, existing, { 'Set-Cookie': sealSession(config, existingSession, clock()) });
            } catch (accountError) {
              if (!(accountError instanceof GatewayError) || ![401, 404].includes(accountError.status)) throw accountError;
              let claims;
              try { claims = JSON.parse(Buffer.from(registered.token.split('.')[1], 'base64url').toString('utf8')); } catch { throw accountError; }
              // This is a freshly issued token from our configured private
              // backend, not a client-supplied JWT. Native auth remains the
              // verifier. A linked/disabled actor is never recreated here.
              ensure(claims.actor_type === actor && claims.actor_id === '' && !claims.app_metadata?.[`${actor}_id`]
                && claims.mfa_enabled !== true, 'AUTH_REQUIRED', 401);
            }
          }
          ensure(validToken(registered.token), 'INVALID_UPSTREAM_RESPONSE', 502);
          const metadata = { confenge_terms: { version: TERMS_VERSION, accepted_at: new Date(clock()).toISOString() } };
          await upstream(config, input.role === 'provider' ? '/vendor/sellers' : '/store/customers', { method: 'POST', token: registered.token,
            body: input.role === 'provider' ? { name: input.name, email, member_email: email, first_name: input.first_name, last_name: input.last_name, currency_code: 'brl', metadata }
              : { email, first_name: input.first_name, last_name: input.last_name, metadata } });
        }
        const authenticated = await upstream(config, `/auth/${actor}/emailpass`, { method: 'POST', body: { email, password: input.password } });
        ensure(authenticated.verification_required !== true && authenticated.mfa_required !== true, 'ADDITIONAL_VERIFICATION_REQUIRED', 403);
        ensure(validToken(authenticated.token), 'INVALID_UPSTREAM_RESPONSE', 502);
        const session = { token: authenticated.token, role: input.role };
        const data = await account(config, session);
        return reply(op === 'register' ? 201 : 200, data, { 'Set-Cookie': sealSession(config, session, clock()) });
      }
      const session = readSession(config, event, clock());
      if (op === 'session' && !session) return reply(200, { authenticated: false });
      ensure(session, 'AUTH_REQUIRED', 401);
      if (op === 'session') {
        const data = await account(config, session);
        return reply(200, data, { 'Set-Cookie': sealSession(config, session, clock()) });
      }
      if (op === 'select-seller') {
        ensure(session.role === 'provider', 'ACTION_FORBIDDEN', 403);
        const input = readBody(event); only(input, ['seller_id']); ensure(ID.test(input.seller_id || ''), 'INVALID_REQUEST', 422);
        await upstream(config, '/vendor/sellers/select', { method: 'POST', body: { seller_id: input.seller_id }, session });
        session.sellerId = input.seller_id;
        const data = await account(config, session);
        return reply(200, data, { 'Set-Cookie': sealSession(config, session, clock()) });
      }
      if (op === 'vendor-profile') {
        ensure(session.role === 'provider' && session.sellerId, 'ACTION_FORBIDDEN', 403);
        let body;
        if (event.httpMethod === 'POST') {
          const input = readBody(event);
          only(input, ['name', 'description', 'phone', 'website_url', 'profile', 'consent', 'terms_version']);
          ensure(input.consent === true && input.terms_version === TERMS_VERSION, 'TERMS_REQUIRED', 422);
          body = { consent: true, terms_version: TERMS_VERSION };
          for (const [key, max] of [['name', 160], ['description', 4000], ['phone', 40]]) if (input[key] !== undefined) body[key] = string(input[key], max, { min: key === 'name' ? 1 : 0 });
          if (input.website_url !== undefined) { ensure(input.website_url === '' || publicUrl(input.website_url), 'INVALID_REQUEST', 422); body.website_url = input.website_url || null; }
          if (input.profile !== undefined) {
            only(input.profile, ['city', 'uf', 'registration', 'registration_board', 'modalities', 'specialties', 'portfolio_url']);
            body.profile = {};
            for (const key of ['city', 'uf', 'registration', 'registration_board']) if (input.profile[key] !== undefined) body.profile[key] = string(input.profile[key], 160, { min: 0 });
            for (const key of ['modalities', 'specialties']) if (input.profile[key] !== undefined) { ensure(Array.isArray(input.profile[key]) && input.profile[key].length <= 20, 'INVALID_REQUEST', 422); body.profile[key] = input.profile[key].map(v => string(v, 100)); }
            if (input.profile.portfolio_url !== undefined) { ensure(input.profile.portfolio_url === '' || publicUrl(input.profile.portfolio_url), 'INVALID_REQUEST', 422); body.profile.portfolio_url = input.profile.portfolio_url || null; }
          }
        }
        const data = await upstream(config, '/vendor/engineering/profile', { method: event.httpMethod, body, session });
        return reply(200, { provider: safeProvider(data.provider, { privateView: true }) });
      }
      const base = session.role === 'provider' ? '/vendor/engineering/requests' : '/store/engineering/requests';
      if (session.role === 'provider') ensure(session.sellerId, 'ACTION_FORBIDDEN', 403);
      if (op === 'checkout' || op === 'connect') {
        const input = readBody(event);
        only(input, op === 'checkout' ? ['id'] : []);
        ensure(session.role === (op === 'checkout' ? 'customer' : 'provider'), 'ACTION_FORBIDDEN', 403);
        if (op === 'checkout') ensure(ID.test(input.id || ''), 'INVALID_REQUEST', 422);
        ensure((await readiness(config)).paymentsEnabled, 'PAYMENTS_DISABLED', 503);
        const data = await upstream(config, op === 'checkout' ? `/store/engineering/requests/${input.id}/checkout` : '/vendor/engineering/connect',
          { method: 'POST', body: {}, session });
        let destination;
        try { destination = new URL(data.url); } catch { throw new GatewayError('INVALID_UPSTREAM_RESPONSE', 502); }
        ensure(typeof data.url === 'string' && data.url.length <= 4096 && destination.protocol === 'https:' && !destination.username && !destination.password
          && !destination.port && destination.hostname === (op === 'checkout' ? 'checkout.stripe.com' : 'connect.stripe.com'), 'INVALID_UPSTREAM_RESPONSE', 502);
        return reply(200, { url: destination.href });
      }
      if (op === 'requests') {
        const data = await upstream(config, base, { session });
        ensure(Array.isArray(data.requests), 'INVALID_UPSTREAM_RESPONSE', 502);
        return reply(200, { requests: data.requests.slice(0, 100).map(safeRequest), count: Number.isSafeInteger(data.count) && data.count >= 0 ? data.count : data.requests.length });
      }
      if (op === 'request') {
        ensure(session.role === 'customer', 'ACTION_FORBIDDEN', 403);
        const input = readBody(event); only(input, ['seller_id', 'title', 'description', 'location', 'intent_family', 'consent', 'terms_version']);
        ensure(input.consent === true && input.terms_version === TERMS_VERSION, 'TERMS_REQUIRED', 422);
        ensure(ID.test(input.seller_id || ''), 'INVALID_REQUEST', 422);
        const body = { seller_id: input.seller_id, title: string(input.title, 160), description: string(input.description, 6000),
          location: string(input.location, 240), intent_family: string(input.intent_family, 100), consent: true, terms_version: TERMS_VERSION };
        const data = await upstream(config, base, { method: 'POST', body, session });
        return reply(201, { request: safeRequest(data.request) });
      }
      const input = readBody(event); only(input, ['id', 'action', 'amount_cents', 'scope', 'deadline', 'note', 'rating', 'revision', 'expected_commission_bps']);
      ensure(ID.test(input.id || '') && ['quote', 'accept', 'deliver', 'complete', 'cancel', 'review'].includes(input.action), 'INVALID_REQUEST', 422);
      const body = { action: input.action };
      if (input.action === 'accept' || input.revision !== undefined) { ensure(Number.isSafeInteger(input.revision) && input.revision >= 0, 'INVALID_REQUEST', 422); body.revision = input.revision; }
      if (input.action === 'quote' || input.expected_commission_bps !== undefined) { ensure(Number.isInteger(input.expected_commission_bps) && input.expected_commission_bps >= 0 && input.expected_commission_bps <= 5000, 'INVALID_REQUEST', 422); body.expected_commission_bps = input.expected_commission_bps; }
      if (input.amount_cents !== undefined) { ensure(Number.isSafeInteger(input.amount_cents) && input.amount_cents > 0 && input.amount_cents <= 100_000_000, 'INVALID_REQUEST', 422); body.amount_cents = input.amount_cents; }
      if (input.rating !== undefined) { ensure(Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5, 'INVALID_REQUEST', 422); body.rating = input.rating; }
      for (const [key, max] of [['scope', 6000], ['deadline', 100], ['note', input.action === 'deliver' ? 4000 : input.action === 'review' ? 2000 : 1000]]) if (input[key] !== undefined) body[key] = string(input[key], max);
      const data = await upstream(config, `${base}/${input.id}`, { method: 'POST', body, session });
      return reply(200, { request: safeRequest(data.request) });
    } catch (error) {
      if (error instanceof GatewayError) {
        if (event.queryStringParameters?.op === 'config' && error.status >= 500) return reply(200, { enabled: false, terms_version: TERMS_VERSION });
        return reply(error.status, { error: error.message }, error.status === 401 && config?.cookieName ? { 'Set-Cookie': cookieHeader(config, '', 0) } : {});
      }
      return reply(503, { error: 'MARKETPLACE_UNAVAILABLE' });
    }
  }
  async function relayWebhook(event, connect = false) {
    try {
      // Closing new business must not prevent reconciliation of past payments.
      const upstream = privateUpstream(env);
      ensure(event.httpMethod === 'POST', 'METHOD_NOT_ALLOWED', 405);
      ensure(!event.isBase64Encoded && typeof event.body === 'string', 'INVALID_REQUEST', 400);
      ensure(Buffer.byteLength(event.body) <= 64 * 1024, 'PAYLOAD_TOO_LARGE', 413);
      ensure(/^application\/json(?:\s*;|$)/i.test(header(event, 'content-type') || ''), 'INVALID_CONTENT_TYPE', 415);
      const signature = header(event, 'stripe-signature');
      ensure(typeof signature === 'string' && signature.length > 0 && signature.length <= 3000 && !/[\r\n\u0000]/.test(signature), 'INVALID_WEBHOOK', 400);
      if (connect) {
        // Native Mercur /hooks/payout enqueues before verifying; reject invalid
        // signatures here so an unauthenticated caller cannot fill that queue.
        const secret = env.ENGINEERING_MARKETPLACE_CONNECT_WEBHOOK_SECRET || '';
        ensure(/^whsec_[A-Za-z0-9_-]{20,240}$/.test(secret), 'MARKETPLACE_UNAVAILABLE', 503);
        const parts = signature.split(',').map(part => part.trim().split('='));
        const stamps = parts.filter(([key]) => key === 't');
        const digests = parts.filter(([key, value]) => key === 'v1' && /^[0-9a-f]{64}$/i.test(value || '')).map(([, value]) => Buffer.from(value, 'hex'));
        ensure(stamps.length === 1 && /^\d{1,12}$/.test(stamps[0][1] || '') && digests.length > 0 && digests.length <= 20, 'INVALID_WEBHOOK', 400);
        const stamp = stamps[0][1];
        ensure(Math.abs(Math.floor(clock() / 1000) - Number(stamp)) <= 300, 'INVALID_WEBHOOK', 400);
        const expected = createHmac('sha256', secret).update(`${stamp}.`).update(event.body, 'utf8').digest();
        ensure(digests.some(digest => timingSafeEqual(digest, expected)), 'INVALID_WEBHOOK', 400);
      }
      let response;
      try {
        response = await fetchImpl(`${upstream}${connect ? '/hooks/payout' : '/hooks/engineering-stripe'}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body: event.body });
      } catch { throw new GatewayError('MARKETPLACE_UNAVAILABLE', 503); }
      if (!response.ok) {
        response.body?.cancel().catch(() => {});
        throw new GatewayError(response.status >= 500 ? 'MARKETPLACE_UNAVAILABLE' : 'INVALID_WEBHOOK', response.status >= 500 ? 503 : 400);
      }
      if (connect) {
        // The pinned native hook sends status 200 with text "OK" after a
        // successful enqueue. It is not a statement that money was received.
        ensure(response.status === 200, 'INVALID_UPSTREAM_RESPONSE', 502);
        await response.body?.cancel().catch(() => {});
      } else {
        const data = await readResponse(response);
        ensure(data.received === true, 'INVALID_UPSTREAM_RESPONSE', 502);
      }
      return reply(200, { received: true });
    } catch (error) {
      return error instanceof GatewayError ? reply(error.status, { error: error.message }) : reply(503, { error: 'MARKETPLACE_UNAVAILABLE' });
    }
  }
  return { api, webhook: event => relayWebhook(event), connectWebhook: event => relayWebhook(event, true) };
}

module.exports = { createMarketplaceGateway, marketplaceGateway: createMarketplaceGateway(), TERMS_VERSION };
