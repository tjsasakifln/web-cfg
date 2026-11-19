'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, timingSafeEqual } = require('node:crypto');
const { CommerceError, check, UUID } = require('./policy.cjs');
const { canonicalJson } = require('../../netlify/functions/lib/host-file-store.cjs');

const OFFER_PATH = path.resolve(__dirname, '../../data/projects-ready/service-offer.v1.json');
const STATES = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = value => createHash('sha256').update(value).digest('hex');
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const safeText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const sameSecret = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const roundRatio = (numerator, denominator) => Number((BigInt(numerator) * 2n + BigInt(denominator)) / (2n * BigInt(denominator)));

function readOffer(filename = OFFER_PATH) {
  const o = JSON.parse(fs.readFileSync(filename, 'utf8'));
  check(o?.schema === 'confenge.project-service-offer/1' && /^\d{4}-\d{2}-\d{2}-v\d+$/.test(o.version || '') &&
    o.currency === 'BRL' && o.authorization?.publicPrices === true && o.authorization?.checkout === true,
  'INVALID_SERVICE_OFFER', 503);
  const p = o.pricing;
  check(p?.areaMin === 50 && p.areaMax === 250 && p.deadlineMin === 15 && p.deadlineMax === 90 &&
    Array.isArray(p.disciplines) && p.disciplines.length === 4 &&
    p.disciplines.every(d => ['arquitetura', 'estrutura', 'eletrica', 'hidrossanitario'].includes(d.id) &&
      safeText(d.title, 1, 140) && Number.isSafeInteger(d.rateCents) && d.rateCents > 0 &&
      Number.isSafeInteger(d.minCents) && d.minCents > 0) && new Set(p.disciplines.map(d => d.id)).size === 4,
  'INVALID_SERVICE_OFFER', 503);
  check(safeText(o.terms?.text, 100, 50_000) && safeText(o.terms?.version, 1, 80) &&
    o.terms.url === '/projetos-prontos/condicoes/' && safeText(o.supplier?.legalName, 1, 250) &&
    o.supplier.registration === '52.407.089/0001-09' && safeText(o.supplier.email, 5, 254) &&
    safeText(o.supplier.phone, 8, 30), 'INVALID_SERVICE_OFFER', 503);
  return o;
}

function termsFor(offer) {
  const s = offer.supplier;
  const text = `Fornecedor: ${s.legalName}\nCNPJ: ${s.registration}\n${s.address ? `Endereço cadastral e fiscal: ${s.address}\n` : ''}${s.serviceLocation ? `${s.serviceLocation}\n` : ''}E-mail: ${s.email}\nTelefone: ${s.phone}\n\n${offer.terms.text}`;
  return { version: offer.terms.version, sha256: sha(text), url: offer.terms.url, text };
}

function publicPricing(offer) {
  return { version: offer.version, currency: offer.currency, ...offer.pricing };
}

function validateSelection(input, offer) {
  const p = offer.pricing;
  check(plain(input), 'INVALID_REQUEST', 422);
  check(typeof input.areaM2 === 'number' && Number.isFinite(input.areaM2) &&
    Math.abs(input.areaM2 * 100 - Math.round(input.areaM2 * 100)) < 0.000001 &&
    Number.isInteger(input.deadlineDays) && Array.isArray(input.disciplines) && input.disciplines.length > 0 &&
    input.disciplines.length <= p.disciplines.length && new Set(input.disciplines).size === input.disciplines.length &&
    input.disciplines.every(id => p.disciplines.some(d => d.id === id)), 'INVALID_REQUEST', 422);
  check(input.areaM2 >= p.areaMin && input.areaM2 <= p.areaMax &&
    input.deadlineDays >= p.deadlineMin && input.deadlineDays <= p.deadlineMax &&
    [1, 2].includes(input.floors) && input.buildingType === 'new-residential' && input.terrain === 'flat-or-gentle',
  'OUTSIDE_SERVICE_SCOPE', 422);
  return { areaM2: input.areaM2, deadlineDays: input.deadlineDays, floors: input.floors,
    buildingType: input.buildingType, terrain: input.terrain,
    disciplines: p.disciplines.filter(d => input.disciplines.includes(d.id)).map(d => d.id) };
}

function quote(input, offer) {
  const s = validateSelection(input, offer);
  const terms = termsFor(offer);
  const areaHundredths = Math.round(s.areaM2 * 100);
  const items = offer.pricing.disciplines.filter(d => s.disciplines.includes(d.id)).map(d => {
    const baseAmountCents = Math.max(d.minCents, roundRatio(areaHundredths * d.rateCents, 100));
    const amountCents = roundRatio(baseAmountCents * (85 * s.deadlineDays + 1350), 100 * s.deadlineDays);
    return { id: d.id, title: d.title, baseAmountCents, amountCents };
  });
  const result = { ...s, items, amountCents: items.reduce((total, item) => total + item.amountCents, 0), currency: 'BRL',
    pricingVersion: offer.version, termsVersion: terms.version, termsHash: terms.sha256 };
  // Bind the exact reviewed amount and scope, even if an operator accidentally
  // edits a price without incrementing its human-readable catalogue version.
  return { ...result, quoteHash: sha(canonicalJson(result)) };
}

const SELECTION_KEYS = ['areaM2', 'deadlineDays', 'disciplines', 'floors', 'buildingType', 'terrain'];
const CHECKOUT_KEYS = [...SELECTION_KEYS, 'requestId', 'receiptToken', 'name', 'email', 'phone', 'city', 'state',
  'reference', 'acceptedTerms', 'consent', 'pricingVersion', 'termsVersion', 'termsHash', 'quoteHash'];
function normalizeCheckout(input) {
  check(plain(input) && Object.keys(input).every(k => CHECKOUT_KEYS.includes(k)) && REQUEST_ID.test(input.requestId || '') &&
    TOKEN.test(input.receiptToken || '') && safeText(input.name, 2, 150) && safeText(input.email, 5, 254) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) && safeText(input.phone, 8, 30) &&
    /^\+?[\d\s().-]{8,30}$/.test(input.phone.trim()) && /^\d{10,13}$/.test(input.phone.replace(/\D/g, '')) &&
    safeText(input.city, 2, 100) && STATES.test(input.state || '') &&
    (input.reference === undefined || input.reference === '' || safeText(input.reference, 1, 2000)) &&
    safeText(input.pricingVersion, 1, 80) && safeText(input.termsVersion, 1, 80) && /^[a-f0-9]{64}$/.test(input.termsHash || '') &&
    /^[a-f0-9]{64}$/.test(input.quoteHash || ''),
  'INVALID_REQUEST', 422);
  check(input.acceptedTerms === true && input.consent === true, 'TERMS_REQUIRED', 422);
  const normalized = { ...input, requestId: input.requestId.toLowerCase(), name: input.name.trim(),
    email: input.email.trim().toLowerCase(), phone: input.phone.trim(), city: input.city.trim(), reference: input.reference?.trim() || '' };
  // The secret is used only to authorize the receipt. Its original bytes never
  // enter durable storage, provider metadata, URLs or application logs.
  delete normalized.receiptToken;
  return { input: normalized, receiptHash: sha(input.receiptToken), requestHash: sha(canonicalJson(normalized)) };
}

function loadServiceConfig(env = process.env) {
  const mode = env.PROJECT_SERVICE_MODE || (env.RUNTIME_PROFILE === 'netcup-production' ? 'live' : 'off');
  check(['off', 'sandbox', 'live'].includes(mode), 'PAYMENT_UNAVAILABLE', 503);
  if (mode === 'off') return { mode, purchasesEnabled: false, configured: false };
  check(mode === 'live' ? env.RUNTIME_PROFILE === 'netcup-production' : env.RUNTIME_PROFILE !== 'netcup-production',
    'PAYMENT_UNAVAILABLE', 503);
  // Reuse only a provider already explicitly configured as live. An hml token
  // must never silently become a production seller credential.
  const shared = mode === 'live' && env.PROJECT_COMMERCE_MODE === 'live' ? 'PROJECT_COMMERCE_' :
    mode === 'live' && env.TOOLS_COMMERCE_MODE === 'live' ? 'TOOLS_COMMERCE_' : '';
  const accessToken = env.PROJECT_SERVICE_MP_ACCESS_TOKEN || (shared ? env[`${shared}MP_ACCESS_TOKEN`] : '') || '';
  const sellerId = (mode === 'live' ? env.PROJECT_SERVICE_MP_LIVE_SELLER_ID : env.PROJECT_SERVICE_MP_TEST_SELLER_ID) ||
    (shared ? env[`${shared}MP_LIVE_SELLER_ID`] : '') || '';
  const webhookSecret = env.PROJECT_SERVICE_MP_WEBHOOK_SECRET || (shared ? env[`${shared}MP_WEBHOOK_SECRET`] : '') || '';
  const origin = mode === 'live' ? 'https://confenge.com.br' : env.PROJECT_SERVICE_SANDBOX_ORIGIN || '';
  const storageRoot = env.CONFENGE_STORAGE_DIR || '';
  const configured = accessToken.length >= 25 && (mode !== 'live' || accessToken.startsWith('APP_USR-')) &&
    /^[1-9]\d{0,14}$/.test(sellerId) && webhookSecret.length >= 24 && path.isAbsolute(storageRoot) &&
    (mode === 'live' || /^(?:https:\/\/[a-z0-9.-]+|http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5})$/i.test(origin));
  check(!(mode === 'live' && (env.PROJECT_SERVICE_MP_TEST_SELLER_ID || env.PROJECT_SERVICE_MP_TEST_BUYER)),
    'PAYMENT_UNAVAILABLE', 503);
  return { mode, accessToken, sellerId, webhookSecret, origin, storageRoot, configured,
    purchasesEnabled: configured && env.PROJECT_SERVICE_PURCHASES !== '0',
    sandboxPayerEmail: mode === 'sandbox' ? env.PROJECT_SERVICE_MP_TEST_BUYER || 'test_payer@example.com' : '' };
}

module.exports = { CommerceError, check, UUID, TOKEN, OFFER_PATH, SELECTION_KEYS, CHECKOUT_KEYS,
  sha, sameSecret, safeText, readOffer, termsFor, publicPricing, validateSelection, quote, normalizeCheckout, loadServiceConfig };
