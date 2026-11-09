const { createHash, createHmac } = require('node:crypto');

const TERMS = 'ferramentas-creditos-v2';
const TERMS_HASH = '39e7ed6f4db8a21666ebce3a30bda3b2a498adfb1737070cd6d617408661c6e4';
const CATALOG_VERSION = 'brl-2026-11-08-v2';
const PACKAGES = Object.freeze([
  { id: 'creditos-1', credits: 1, amountCents: 1490 },
  { id: 'creditos-3', credits: 3, amountCents: 3990 },
  { id: 'creditos-5', credits: 5, amountCents: 5990 },
  { id: 'creditos-10', credits: 10, amountCents: 9999 },
  { id: 'creditos-25', credits: 25, amountCents: 22490 },
  { id: 'creditos-50', credits: 50, amountCents: 40000 },
].map(Object.freeze));
const TOOL = 'modela-memoria';
const REFERRAL_LIMIT = 10;
const ORDER_LIMIT = 8;
const MAX_BODY = 4 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERRAL = /^[A-Za-z0-9_-]{16}$/;

class CommerceError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}

function check(ok, code, status) { if (!ok) throw new CommerceError(code, status); }
const sha = value => createHash('sha256').update(value).digest('hex');
const mac = (key, domain, value) => createHmac('sha256', key).update(`${domain}\0`).update(value).digest('hex');
const accountId = uid => sha(`firebase-uid\0${uid}`);
function orderId(uid, requestId) {
  const h = sha(`order\0${uid}\0${requestId.toLowerCase()}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function normalizeEmail(email) {
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0].replaceAll('.', '')}@gmail.com`;
  }
  return `${local}@${domain}`;
}

function loadConfig(env) {
  const mode = env.TOOLS_COMMERCE_MODE || 'off';
  if (mode === 'off') return { mode };
  const valid = ok => check(ok, 'COMMERCE_UNAVAILABLE', 503);
  valid(['emulator', 'sandbox', 'live'].includes(mode));
  const prod = env.RUNTIME_PROFILE === 'netcup-production';
  valid(mode === 'live' ? prod : !prod);
  const loopback = /^127\.0\.0\.1:\d{2,5}$/;
  const projectId = env.TOOLS_COMMERCE_FIREBASE_PROJECT || '';
  valid(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId));
  let firebase;
  let authEmulator;
  if (mode === 'emulator') {
    valid(projectId === 'demo-confenge-tools' && loopback.test(env.FIREBASE_AUTH_EMULATOR_HOST || '') && loopback.test(env.FIRESTORE_EMULATOR_HOST || ''));
    authEmulator = `http://${env.FIREBASE_AUTH_EMULATOR_HOST}`;
    firebase = { apiKey: 'demo-confenge-tools', projectId, authDomain: `${projectId}.firebaseapp.com`, appId: 'demo-confenge-tools' };
  } else {
    valid(!projectId.startsWith('demo-') && !env.FIREBASE_AUTH_EMULATOR_HOST && !env.FIRESTORE_EMULATOR_HOST);
    valid(mode === 'sandbox' ? projectId.endsWith('-hml') : projectId.endsWith('-prod'));
    valid(/^AIza[A-Za-z0-9_-]{20,70}$/.test(env.TOOLS_COMMERCE_FIREBASE_WEB_KEY || ''));
    valid(/^1:\d+:web:[a-f0-9]+$/.test(env.TOOLS_COMMERCE_FIREBASE_WEB_APP || ''));
    firebase = { apiKey: env.TOOLS_COMMERCE_FIREBASE_WEB_KEY, authDomain: `${projectId}.firebaseapp.com`, projectId, appId: env.TOOLS_COMMERCE_FIREBASE_WEB_APP };
  }
  const identityKey = env.TOOLS_COMMERCE_HMAC_KEY || '';
  valid(/^[A-Za-z0-9_-]{43,86}$/.test(identityKey) && Buffer.from(identityKey, 'base64url').length >= 32);
  const purchasesRequested = env.TOOLS_COMMERCE_PURCHASES === '1';
  const exportsPaused = env.TOOLS_COMMERCE_EXPORTS_PAUSED === '1';
  const sharedExportsEnabled = env.TOOLS_COMMERCE_SHARED_EXPORTS === '1';
  const checkoutEnabled = env.TOOLS_COMMERCE_MP_CHECKOUT === '1';
  const purchasesEnabled = purchasesRequested && env.TOOLS_COMMERCE_TERMS_APPROVED === TERMS &&
    !exportsPaused && (!prod || (sharedExportsEnabled && checkoutEnabled));
  const accessToken = env.TOOLS_COMMERCE_MP_ACCESS_TOKEN || '';
  const webhookSecret = env.TOOLS_COMMERCE_MP_WEBHOOK_SECRET || '';
  const sandboxSellerId = env.TOOLS_COMMERCE_MP_TEST_SELLER_ID || '';
  const liveSellerId = env.TOOLS_COMMERCE_MP_LIVE_SELLER_ID || '';
  const samplePayer = 'test_payer@example.com';
  const sandboxPayerEmail = env.TOOLS_COMMERCE_MP_TEST_BUYER || (mode === 'sandbox' ? samplePayer : '');
  const sandboxUids = (env.TOOLS_COMMERCE_SANDBOX_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (mode === 'sandbox') valid(sandboxUids.length > 0 && /^https:\/\/[a-z0-9.-]+$|^http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}$/i.test(env.TOOLS_COMMERCE_SANDBOX_ORIGIN || ''));
  const providerConfigured = Boolean(accessToken || webhookSecret || purchasesRequested || checkoutEnabled);
  valid(!sandboxSellerId || /^[1-9]\d{0,14}$/.test(sandboxSellerId));
  valid(!liveSellerId || /^[1-9]\d{0,14}$/.test(liveSellerId));
  if (mode === 'sandbox') valid(!liveSellerId);
  if (mode === 'live') valid(!sandboxSellerId);
  if (mode === 'emulator') valid(!sandboxSellerId && !liveSellerId);
  if (providerConfigured) {
    valid(mode !== 'emulator' && accessToken.length >= 25);
    if (mode === 'sandbox') {
      valid(!webhookSecret || webhookSecret.length >= 24);
      valid(Boolean(sandboxSellerId));
      valid(sandboxPayerEmail === samplePayer || /^[^\s@]+@testuser\.com$/i.test(sandboxPayerEmail));
    }
    if (mode === 'live') valid(accessToken.startsWith('APP_USR-') && webhookSecret.length >= 24 && !sandboxPayerEmail && Boolean(liveSellerId));
  }
  return { mode, firebase, authEmulator, projectId, identityKey: Buffer.from(identityKey, 'base64url'),
    purchasesEnabled, exportsPaused, sharedExportsEnabled, checkoutEnabled,
    accessToken, webhookSecret, sellerId: mode === 'sandbox' ? sandboxSellerId : mode === 'live' ? liveSellerId : '',
    sandboxSellerId, liveSellerId, sandboxPayerEmail, sandboxUids };
}

module.exports = { TERMS, TERMS_HASH, CATALOG_VERSION, PACKAGES, TOOL, REFERRAL_LIMIT, ORDER_LIMIT, MAX_BODY,
  UUID, REFERRAL, CommerceError, check, sha, mac, accountId, orderId, normalizeEmail, loadConfig };
