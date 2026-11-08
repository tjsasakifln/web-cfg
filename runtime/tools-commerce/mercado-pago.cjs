'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

const API_ROOT = 'https://api.mercadopago.com';
const SELLER_PROFILE_URL = 'https://api.mercadolibre.com/users/me';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_ID = /^ORD[A-Z0-9]+$/;
const TRANSITIONAL = new Set(['created', 'pending', 'in_process', 'processing', 'action_required', 'authorized']);

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(name + ' is required');
  return value.trim();
}
function optional(value) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function header(headers, name) {
  if (headers && typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase());
  for (const [key, value] of Object.entries(headers || {})) if (key.toLowerCase() === name.toLowerCase()) return Array.isArray(value) ? value[0] : value;
}
function query(queryObject, name) {
  if (queryObject && typeof queryObject.get === 'function') return queryObject.get(name);
  const value = queryObject && queryObject[name];
  return Array.isArray(value) ? value[0] : value;
}
function toMoney(cents) {
  if (!Number.isSafeInteger(cents) || cents < 1) throw new Error('amountCents must be a positive integer');
  return (cents / 100).toFixed(2);
}
function toCents(value) {
  const text = String(value === undefined ? '' : value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return undefined;
  const pieces = text.split('.');
  const result = Number(pieces[0]) * 100 + Number(((pieces[1] || '') + '00').slice(0, 2));
  return Number.isSafeInteger(result) ? result : undefined;
}
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}
function signature(value) {
  return Object.fromEntries(String(value || '').split(',').map((part) => {
    const at = part.indexOf('=');
    return at > 0 ? [part.slice(0, at).trim(), part.slice(at + 1).trim()] : [];
  }).filter((item) => item.length));
}
function officialCheckoutUrl(value) {
  if (!value) return undefined;
  let url;
  try { url = new URL(value); } catch { throw new Error('Mercado Pago returned an invalid checkout URL'); }
  if (url.protocol !== 'https:' || url.host !== 'www.mercadopago.com.br' || url.username || url.password) throw new Error('Mercado Pago returned an invalid checkout URL');
  return url.toString();
}
function pixCode(value) {
  if (!value) return undefined;
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Mercado Pago returned an invalid Pix code');
  return value;
}
function pngBase64(value) {
  if (!value) return undefined;
  // Drop overly large images rather than exceed the Firestore document limit.
  // The same Pix remains payable with the textual code or the hosted ticket.
  if (typeof value !== 'string' || value.length > 196608) return undefined;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Mercado Pago returned an invalid QR image');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length < 8 || !decoded.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Mercado Pago returned an invalid QR image');
  return value;
}

function stateFor(order, payment, amountCents, paymentCount) {
  const orderStatus = String(order.status || '').toLowerCase();
  const paymentStatus = String(payment && payment.status || '').toLowerCase();
  const orderPaid = toCents(order.total_paid_amount);
  const paymentPaid = toCents(payment && payment.paid_amount);
  const refundValues = [order.total_refunded_amount, payment && payment.refunded_amount].filter((value) => value !== undefined).map(toCents);
  const details = [order.status_detail, payment?.status_detail];
  if (!(amountCents > 0) || details.includes('partially_refunded') || refundValues.some(value => value === undefined || value < 0)) return 'review';
  const hasRefund = refundValues.some(value => value > 0);
  // Order creation may return before the Pix transaction is available.
  if (paymentCount === 0 && TRANSITIONAL.has(orderStatus) && !hasRefund) return 'pending';
  if (paymentCount !== 1 || !payment || payment.payment_method.type !== 'bank_transfer' || toCents(payment.amount) !== amountCents) return 'review';
  // Mercado Pago distinguishes full (`refunded`) from partial
  // (`processed/partially_refunded`). If refund totals are present they must agree.
  if (orderStatus === 'refunded') return orderPaid === amountCents && paymentStatus === 'refunded' &&
    refundValues.every(value => value === amountCents) ? 'reversed' : 'review';
  if (hasRefund) return 'review';
  if (paymentStatus && paymentStatus !== orderStatus && !(TRANSITIONAL.has(paymentStatus) && TRANSITIONAL.has(orderStatus))) return 'review';
  if (['cancelled', 'canceled', 'failed', 'rejected', 'expired'].includes(orderStatus)) return 'failed';
  if (orderStatus === 'processed') return paymentStatus === 'processed' && details.every(detail => detail === 'accredited') &&
    orderPaid === amountCents && paymentPaid === amountCents ? 'paid' : 'review';
  if (TRANSITIONAL.has(orderStatus) || !orderStatus) return 'pending';
  return 'review';
}

function normalize(order) {
  if (!order || typeof order !== 'object') throw new Error('Mercado Pago returned an invalid order');
  const payments = Array.isArray(order.transactions && order.transactions.payments) ? order.transactions.payments : [];
  const pix = payments.filter((payment) => payment && payment.payment_method && payment.payment_method.id === 'pix');
  const payment = pix.length === 1 ? pix[0] : undefined;
  const method = payment && payment.payment_method || {};
  const amountCents = toCents(order.total_amount);
  if ((order.type && order.type !== 'online') || (order.site_id && order.site_id !== 'MLB') ||
      (order.currency_id && order.currency_id !== 'BRL')) throw new Error('Mercado Pago returned an incompatible order');
  const state = stateFor(order, payment, amountCents, payments.length);
  // Orders Pix does not expose a currency field. This adapter is restricted to
  // the Brazilian Mercado Pago account/site, where Pix is denominated in BRL.
  return {
    providerId: optional(order.id),
    reference: optional(order.external_reference),
    amountCents,
    currency: 'BRL',
    state,
    ...(state === 'pending' ? {
      checkoutUrl: officialCheckoutUrl(optional(order.checkout_url) || optional(order.init_point) || optional(method.ticket_url)),
      qrCode: pixCode(optional(method.qr_code)),
      qrImage: pngBase64(optional(method.qr_code_base64)),
      expiresAt: optional(payment && (payment.date_of_expiration || payment.expiration_date)) || optional(order.date_of_expiration)
    } : {})
  };
}

function createMercadoPago({ accessToken, webhookSecret, mode = 'live', sellerId, sandboxPayerEmail, fetchImpl = globalThis.fetch } = {}) {
  accessToken = required(accessToken, 'accessToken');
  if (mode !== 'sandbox' && mode !== 'live') throw new Error('Invalid Mercado Pago environment');
  const sandbox = mode === 'sandbox';
  webhookSecret = sandbox ? optional(webhookSecret) : required(webhookSecret, 'webhookSecret');
  const authorization = { Authorization: 'Bearer ' + accessToken };
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl must be a function');
  async function request(url, options) {
    let response;
    try { response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(8000), redirect: 'error' }); }
    catch { throw new Error('Mercado Pago request could not be completed; reconcile the existing order before retrying'); }
    if (!response || !response.ok) throw new Error('Mercado Pago request failed (HTTP ' + (response && response.status || 'unknown') + ')');
    try { return await response.json(); } catch { throw new Error('Mercado Pago returned an invalid response'); }
  }
  let sellerCheck;
  function verifySellerEnvironment() {
    // Orders tokens can have the same prefix in both environments.
    const expectedSellerId = required(sellerId, 'sellerId');
    sellerCheck ??= request(SELLER_PROFILE_URL, { method: 'GET', headers: authorization }).then(seller => {
      if (!Array.isArray(seller?.tags) || seller.tags.includes('test_user') !== sandbox) {
        throw new Error('Mercado Pago seller does not match the configured environment');
      }
      if (String(seller.id) !== expectedSellerId) {
        throw new Error('Mercado Pago seller does not match the configured ID');
      }
    }).catch(error => {
      sellerCheck = undefined;
      throw error;
    });
    return sellerCheck;
  }
  return {
    verifySellerEnvironment,
    async createOrder({ id, amountCents, email, label } = {}) {
      id = required(id, 'id');
      if (!UUID.test(id) || id.length > 64) throw new Error('id must be a stable UUID');
      label = required(label, 'label');
      if (label.length > 256) throw new Error('label is too long');
      const amount = toMoney(amountCents);
      const payer = sandbox ? { email: required(sandboxPayerEmail, 'sandboxPayerEmail'), first_name: 'APRO' } :
        { email: required(email, 'email') };
      const body = {
        type: 'online', external_reference: id, total_amount: amount,
        transactions: { payments: [{ amount, payment_method: { id: 'pix', type: 'bank_transfer' } }] },
        payer,
        // Use the provider's documented minimal Pix request in the sandbox.
        ...(!sandbox ? { processing_mode: 'automatic', description: label } : {})
      };
      await verifySellerEnvironment();
      const normalized = normalize(await request(API_ROOT + '/v1/orders', {
        method: 'POST',
        headers: { ...authorization, 'Content-Type': 'application/json', 'X-Idempotency-Key': id },
        body: JSON.stringify(body)
      }));
      if (!normalized.providerId || normalized.reference !== id || normalized.amountCents !== amountCents) throw new Error('Mercado Pago order did not match the requested reference and amount');
      return normalized;
    },
    async getOrder(providerId) {
      providerId = required(providerId, 'providerId');
      if (!ORDER_ID.test(providerId)) throw new Error('providerId must be a Mercado Pago order ID');
      const normalized = normalize(await request(API_ROOT + '/v1/orders/' + encodeURIComponent(providerId), { method: 'GET', headers: authorization }));
      if (normalized.providerId !== providerId || !ORDER_ID.test(normalized.providerId)) throw new Error('Mercado Pago returned an unexpected order ID');
      return normalized;
    },
    parseWebhook({ headers, query: queryObject, body } = {}) {
      void body;
      if (!webhookSecret) throw new Error('Mercado Pago webhook is not configured');
      const providerId = optional(query(queryObject, 'data.id'));
      const requestId = optional(header(headers, 'x-request-id'));
      const parts = signature(header(headers, 'x-signature'));
      if (!providerId || !ORDER_ID.test(providerId) || !requestId || !/^\d+$/.test(parts.ts || '') || !parts.v1) throw new Error('Invalid Mercado Pago webhook');
      const manifest = 'id:' + providerId.toLowerCase() + ';request-id:' + requestId + ';ts:' + parts.ts + ';';
      const expected = createHmac('sha256', webhookSecret).update(manifest).digest('hex');
      if (!safeEqual(expected, parts.v1)) throw new Error('Invalid Mercado Pago webhook signature');
      return { providerId };
    }
  };
}

module.exports = { createMercadoPago };
