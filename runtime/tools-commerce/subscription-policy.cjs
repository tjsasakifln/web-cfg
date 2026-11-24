const { check } = require('./policy.cjs');
const { termsHash } = require('./subscription-terms.cjs');

// Versioned contract: never edit an offer already accepted. Add a version.
const PRO = Object.freeze({ id: 'confenge-pro-monthly-v1', name: 'CONFENGE Pro Mensal',
  amountCents: 4990, currency: 'BRL', frequency: 1, frequencyType: 'months', credits: 6,
  termsVersion: 'ferramentas-pro-v1', termsHash, creditValidity: 'paid-cycle', autoRenew: true });
const FREE = Object.freeze({ id: 'confenge-free', amountCents: 0, initialCourtesy: 1 });
const BASIC = Object.freeze(['calculadora-bdi', 'calculadora-de-beiral', 'conversor-utm-sirgas-2000']);
function configSubscriptions(env, cfg) {
  const ready = env.TOOLS_COMMERCE_PRO_READY === '1';
  const margin = Number(env.TOOLS_COMMERCE_PRO_MAX_VARIABLE_CENTS);
  const approved = env.TOOLS_COMMERCE_PRO_TERMS_APPROVED === PRO.termsVersion && env.TOOLS_COMMERCE_PRO_TERMS_HASH === PRO.termsHash;
  const integration = env.TOOLS_COMMERCE_PRO_INTEGRATION === '1';
  const configured = Boolean(integration && cfg.accessToken && cfg.webhookSecret && cfg.sellerId);
  const returnOrigin = cfg.mode === 'live' ? 'https://confenge.com.br' : env.TOOLS_COMMERCE_SANDBOX_ORIGIN;
  const validOrigin = typeof returnOrigin === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(returnOrigin);
  const enabled = configured && validOrigin && ready && approved && cfg.sharedExportsEnabled && !cfg.exportsPaused &&
    env.TOOLS_COMMERCE_PRO_NEW === '1' && env.TOOLS_COMMERCE_PRO_HOMOLOGATED === '1' &&
    /^\d+$/.test(env.TOOLS_COMMERCE_PRO_MAX_VARIABLE_CENTS || '') && Number.isSafeInteger(margin) && margin >= 0 && margin <= Math.floor(PRO.amountCents * .3);
  const experimentCost = Number(env.TOOLS_COMMERCE_EXPERIMENT_UNIT_COST_CENTS);
  return { enabled, integration, returnOrigin, visible: enabled && env.TOOLS_COMMERCE_PRO_PUBLIC === '1',
    experiment: ready && env.TOOLS_COMMERCE_EXPERIMENT === '1' && Number.isSafeInteger(experimentCost) &&
      experimentCost > 0 && experimentCost <= 10000 ? { costCents: experimentCost, maxAccounts: 50, budgetCents: 10000 } : null };
}
function publicPlans(flags, packages) {
  const single = packages.find(p => p.credits === 1);
  return { free: FREE, ...(flags.visible ? { pro: { ...PRO,
    termsUrl: '/termos-de-uso/#assinatura-ferramentas',
    savingPercent: single ? Math.max(0, Math.floor(100 * (1 - PRO.amountCents / (single.amountCents * PRO.credits)))) : 0 } } : {}) };
}
function cents(value) {
  const s = String(value);
  check(/^\d+(?:\.\d{1,2})?$/.test(s), 'PAYMENT_MISMATCH', 422);
  const [a,b=''] = s.split('.');
  const result = Number(a) * 100 + Number(b.padEnd(2,'0'));
  check(Number.isSafeInteger(result), 'PAYMENT_MISMATCH', 422);
  return result;
}
function instant(value) {
  const at = typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  check(Number.isFinite(at), 'PAYMENT_MISMATCH', 422); return at;
}
// Monthly calendar in Sao Paulo (UTC-03 for the present Brazilian calendar).
// Anchor on immutable invoice creation, not a mutable retry/debit timestamp.
// External homologation must confirm the provider's invoice schedule.
function nextMonth(at) {
  const local = new Date(at - 3 * 3600000);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  const last = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return Date.UTC(y, m + 1, Math.min(d,last), local.getUTCHours(), local.getUTCMinutes(),
    local.getUTCSeconds(), local.getUTCMilliseconds()) + 3 * 3600000;
}
function available(cycle, now) {
  return cycle && cycle.status === 'paid' && cycle.startsAt <= now && now < cycle.expiresAt
    ? cycle.remaining : 0;
}
function subscriptionSummary(w, now) {
  const c = w.proCycle;
  return w.subscriptionId ? { subscriptionCredits: available(c, now), subscriptionExpiresAt: c?.expiresAt || null,
    subscription: { id: w.subscriptionId, status: w.subscriptionStatus || 'requested', nextPaymentAt: w.subscriptionNextPaymentAt || null, latestInvoiceState:w.subscriptionLatestInvoiceState||null } } : {};
}
module.exports = { PRO, FREE, BASIC, configSubscriptions, publicPlans, cents, instant, nextMonth, available, subscriptionSummary };
