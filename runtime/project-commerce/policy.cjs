'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');
const { createHash } = require('node:crypto');
const { CommerceError, check, UUID } = require('../tools-commerce/policy.cjs');

const SCHEMA = 'confenge.project-catalog/1';
const ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MAX_FILE = 32 * 1024 * 1024;
// Keep ample room below Firestore's 1 MiB document limit for QR data, field
// encoding and the bounded support history. Count bytes, not JS characters.
const MAX_PRODUCT_BYTES = 256 * 1024;
const CATALOG_PATH = path.resolve(__dirname, '../../data/projects-ready/catalog.v1.json');
const sha = value => createHash('sha256').update(value).digest('hex');
const text = (value, max = 2000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const dated = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const strings = value => Array.isArray(value) && value.length > 0 && value.length <= 40 && value.every(v => text(v));
const checkConfig = value => check(value, 'PROJECT_COMMERCE_UNAVAILABLE', 503);

function supplierValid(s) {
  if (!s || !text(s.legalName, 250) || s.registrationType !== 'CNPJ' ||
      typeof s.registration !== 'string' || !/^[A-Z0-9]{12}\d{2}$/.test(s.registration) || /^(.)\1+$/.test(s.registration) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email || '') || s.email.length > 254 ||
      !/^\+55[1-9]\d{9,10}$/.test(s.phone || '')) return false;
  const digits = [...s.registration].map(c => c.charCodeAt(0) - 48);
  for (const count of [12, 13]) {
    let weight = count - 7;
    const sum = digits.slice(0, count).reduce((total, value) => { const result = total + value * weight; weight = weight === 2 ? 9 : weight - 1; return result; }, 0);
    const digit = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (digits[count] !== digit) return false;
  }
  const a = s.address;
  return Boolean(a && text(a.street, 250) && text(a.number, 40) && (!a.complement || text(a.complement, 150)) &&
    text(a.neighborhood, 150) && text(a.city, 150) && /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(a.state || '') &&
    /^\d{8}$/.test(a.postalCode || '') && a.country === 'BR');
}

function supplierText(s) {
  const a = s.address;
  return `Fornecedor: ${s.legalName}\nCNPJ: ${s.registration}\nEndereço: ${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ''}, ${a.neighborhood}, ${a.city}/${a.state}, CEP ${a.postalCode}, Brasil\nE-mail: ${s.email}\nTelefone: ${s.phone}`;
}

function publicSupplier(s) {
  return { legalName: s.legalName, registrationType: s.registrationType, registration: s.registration,
    address: { street: s.address.street, number: s.address.number, ...(s.address.complement ? { complement: s.address.complement } : {}),
      neighborhood: s.address.neighborhood, city: s.address.city, state: s.address.state, postalCode: s.address.postalCode, country: 'BR' },
    email: s.email, phone: s.phone };
}

function orderId(uid, requestId) {
  const hash = sha(`project-order\0${uid}\0${requestId.toLowerCase()}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
const accountId = uid => sha(`project-buyer\0${uid}`);

function loadConfig(env = process.env) {
  const mode = env.PROJECT_COMMERCE_MODE || 'off';
  if (mode === 'off') return { mode, purchasesEnabled: false };
  checkConfig(['sandbox', 'live'].includes(mode));
  checkConfig((mode === 'live') === (env.RUNTIME_PROFILE === 'netcup-production'));
  checkConfig(!env.FIREBASE_AUTH_EMULATOR_HOST && !env.FIRESTORE_EMULATOR_HOST);
  const projectId = env.PROJECT_COMMERCE_FIREBASE_PROJECT || '';
  checkConfig(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId));
  checkConfig(mode === 'live' ? projectId.endsWith('-prod') : projectId.endsWith('-hml'));
  checkConfig(/^AIza[A-Za-z0-9_-]{20,70}$/.test(env.PROJECT_COMMERCE_FIREBASE_WEB_KEY || ''));
  checkConfig(/^1:\d+:web:[a-f0-9]+$/.test(env.PROJECT_COMMERCE_FIREBASE_WEB_APP || ''));
  const firebase = { projectId, authDomain: `${projectId}.firebaseapp.com`,
    apiKey: env.PROJECT_COMMERCE_FIREBASE_WEB_KEY, appId: env.PROJECT_COMMERCE_FIREBASE_WEB_APP };
  const sandboxUids = (env.PROJECT_COMMERCE_SANDBOX_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = mode === 'live' ? 'https://confenge.com.br' : env.PROJECT_COMMERCE_SANDBOX_ORIGIN || '';
  if (mode === 'sandbox') checkConfig(sandboxUids.length > 0 && /^(?:https:\/\/[a-z0-9.-]+|http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5})$/i.test(origin));
  const sellerId = mode === 'live' ? env.PROJECT_COMMERCE_MP_LIVE_SELLER_ID : env.PROJECT_COMMERCE_MP_TEST_SELLER_ID;
  checkConfig(!env[mode === 'live' ? 'PROJECT_COMMERCE_MP_TEST_SELLER_ID' : 'PROJECT_COMMERCE_MP_LIVE_SELLER_ID']);
  checkConfig(/^[1-9]\d{0,14}$/.test(sellerId || ''));
  const accessToken = env.PROJECT_COMMERCE_MP_ACCESS_TOKEN || '';
  const webhookSecret = env.PROJECT_COMMERCE_MP_WEBHOOK_SECRET || '';
  checkConfig(accessToken.length >= 25 && webhookSecret.length >= 24);
  if (mode === 'live') checkConfig(accessToken.startsWith('APP_USR-'));
  const sandboxPayerEmail = mode === 'sandbox' ? env.PROJECT_COMMERCE_MP_TEST_BUYER || 'test_payer@example.com' : '';
  if (mode === 'sandbox') checkConfig(sandboxPayerEmail === 'test_payer@example.com' || /^[^\s@]+@testuser\.com$/i.test(sandboxPayerEmail));
  else checkConfig(!env.PROJECT_COMMERCE_MP_TEST_BUYER && sandboxUids.length === 0);
  const filesRoot = env.PROJECT_COMMERCE_FILES_ROOT || '/var/lib/confenge-web/project-files';
  checkConfig(path.isAbsolute(filesRoot));
  if (mode === 'live') checkConfig(path.resolve(filesRoot) === '/var/lib/confenge-web/project-files' ||
    path.resolve(filesRoot).startsWith('/var/lib/confenge-web/project-files/'));
  return { mode, projectId, firebase, sandboxUids, origin, sellerId, accessToken, webhookSecret, sandboxPayerEmail,
    filesRoot: path.resolve(filesRoot), purchasesEnabled: env.PROJECT_COMMERCE_PURCHASES === '1',
    deliveryPaused: env.PROJECT_COMMERCE_DELIVERY_PAUSED === '1',
    approvedCatalogVersion: env.PROJECT_COMMERCE_APPROVED_CATALOG || '',
    approvedTermsHash: env.PROJECT_COMMERCE_APPROVED_TERMS_SHA256 || '' };
}

function productReady(product) {
  try { if (Buffer.byteLength(JSON.stringify(product), 'utf8') > MAX_PRODUCT_BYTES) return false; } catch { return false; }
  if (!product || !ID.test(product.id || '') || !ID.test(product.slug || '') || !text(product.title, 140) ||
      !VERSION.test(product.version || '') || product.status !== 'approved' || product.currency !== 'BRL' ||
      !Number.isSafeInteger(product.amountCents) || product.amountCents < 1 || product.amountCents > 100_000_000) return false;
  const d = product.delivery;
  if (!d || !/^[a-z0-9][a-z0-9._-]{0,119}\.zip$/.test(d.filename || '') ||
      !DIGEST.test(d.sha256 || '') || !Number.isSafeInteger(d.bytes) || d.bytes < 1 || d.bytes > MAX_FILE) return false;
  const terms = product.terms;
  if (!terms || !VERSION.test(terms.version || '') || !DIGEST.test(terms.sha256 || '') ||
      !text(terms.text, 50_000) || sha(terms.text) !== terms.sha256 || !supplierValid(terms.supplier) ||
      !terms.text.startsWith(supplierText(terms.supplier) + '\n\n') ||
      !/^\/projetos-prontos\/[a-z0-9/-]+\/$/.test(terms.url || '')) return false;
  const e = product.evidence;
  if (!e || !e.rights || !e.technical || !e.commercial) return false;
  for (const approval of Object.values(e)) {
    if (!approval || approval.approved !== true || !text(approval.reference, 500) ||
        !dated(approval.approvedAt) || approval.productVersion !== product.version || approval.archiveSha256 !== d.sha256) return false;
  }
  if (!text(e.rights.owner, 250) || !text(e.rights.origin, 500) || !text(e.rights.resaleAuthorization, 500) ||
      !text(e.technical.reviewer, 250) || !text(e.technical.professionalRegistration, 250) ||
      e.commercial.amountCents !== product.amountCents || e.commercial.termsSha256 !== terms.sha256) return false;
  const p = product.public;
  if (!p || !text(p.description) || !strings(p.programme) || !Number.isFinite(p.areaM2) || p.areaM2 <= 0 ||
      !Number.isSafeInteger(p.floors) || p.floors < 1 || !text(p.dimensions) || !text(p.terrainConditions) ||
      !strings(p.documents) || !strings(p.formats) || !text(p.deliveryTime) || !strings(p.included) ||
      !strings(p.excluded) || !text(p.license) || p.implementations !== 1 || !text(p.reuseRule) ||
      !text(p.corrections) || !text(p.changes) || !text(p.responsibilities) || !text(p.support)) return false;
  if (!Array.isArray(p.previews) || p.previews.length < 1 || p.previews.length > 12 ||
      !p.previews.every(v => v && /^\/assets\/projects-ready\/[a-z0-9._/-]+\.(?:png|jpg|jpeg|webp|pdf)$/.test(v.url || '') &&
        !v.url.includes('..') && text(v.alt, 250) && v.real === true && v.publicationAuthorized === true)) return false;
  return true;
}

async function readCatalog(filename = CATALOG_PATH) {
  const catalog = JSON.parse(await fs.readFile(filename, 'utf8'));
  check(catalog?.schema === SCHEMA && VERSION.test(catalog.version || '') && Array.isArray(catalog.products) &&
    catalog.products.length <= 30, 'INVALID_PROJECT_CATALOG', 503);
  check(catalog.products.every(p => p && ID.test(p.id || '')) &&
    new Set(catalog.products.map(p => p.id)).size === catalog.products.length, 'INVALID_PROJECT_CATALOG', 503);
  return catalog;
}

function authorizedProduct(catalog, config, id) {
  const product = catalog.products.find(p => p.id === id);
  check(config.purchasesEnabled && !config.deliveryPaused && config.approvedCatalogVersion === catalog.version,
    'PROJECT_PURCHASES_PAUSED', 503);
  check(productReady(product) && config.approvedTermsHash === product.terms.sha256, 'PROJECT_UNAVAILABLE', 409);
  return product;
}

// Read and hash the exact opened descriptor, never a public URL or a second
// pathname read. The same verified bytes are returned to the authorized buyer.
async function privateArchive(config, delivery) {
  check(delivery && /^[a-z0-9][a-z0-9._-]{0,119}\.zip$/.test(delivery.filename || '') &&
    DIGEST.test(delivery.sha256 || '') && Number.isSafeInteger(delivery.bytes) && delivery.bytes > 0 &&
    delivery.bytes <= MAX_FILE, 'DELIVERY_UNAVAILABLE', 503);
  const root = path.resolve(config.filesRoot);
  const repo = path.resolve(__dirname, '../..');
  check(root !== repo && !root.startsWith(repo + path.sep), 'DELIVERY_UNAVAILABLE', 503);
  const rootStat = await fs.lstat(root);
  check(rootStat.isDirectory() && !rootStat.isSymbolicLink() && await fs.realpath(root) === root, 'DELIVERY_UNAVAILABLE', 503);
  const filename = path.join(root, delivery.filename);
  const file = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    check(stat.isFile() && stat.size === delivery.bytes && stat.size <= MAX_FILE, 'DELIVERY_UNAVAILABLE', 503);
    const bytes = await file.readFile();
    check(bytes.length === delivery.bytes && sha(bytes) === delivery.sha256 && bytes.length >= 4 &&
      bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]), 'DELIVERY_UNAVAILABLE', 503);
    return bytes;
  } finally { await file.close(); }
}

function publicProduct(p) {
  const presentation = Object.fromEntries(['description', 'programme', 'areaM2', 'floors', 'dimensions',
    'terrainConditions', 'documents', 'formats', 'deliveryTime', 'included', 'excluded', 'license',
    'implementations', 'reuseRule', 'corrections', 'changes', 'responsibilities', 'support', 'previews']
    .map(key => [key, p.public[key]]));
  return { ...presentation, id: p.id, slug: p.slug, title: p.title, version: p.version, amountCents: p.amountCents,
    currency: 'BRL', terms: { version: p.terms.version, sha256: p.terms.sha256,
      url: p.terms.url, text: p.terms.text, supplier: publicSupplier(p.terms.supplier) }, delivery: { filename: p.delivery.filename, sha256: p.delivery.sha256 } };
}

module.exports = { CommerceError, check, UUID, ID, SCHEMA, CATALOG_PATH, MAX_FILE, MAX_PRODUCT_BYTES, sha, accountId, orderId, supplierValid, supplierText, publicSupplier,
  loadConfig, productReady, readCatalog, authorizedProduct, privateArchive, publicProduct };
