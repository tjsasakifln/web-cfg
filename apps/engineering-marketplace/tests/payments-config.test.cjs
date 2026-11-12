'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStripeConnectConfig, WEBHOOK_PATHS } = require('../config/stripe-connect.cjs');
const { describeSettlement, describeSellerTransfer, reconcileEngineeringPayment } = require('../config/finance-state.cjs');

const fixture = (overrides = {}) => ({
  MARKETPLACE_PAYMENTS_ENABLED: 'true',
  MARKETPLACE_PAYMENT_MODE: 'test',
  STRIPE_SECRET_KEY: 'sk_test_fixture_not_a_credential',
  STRIPE_OPERATOR_WEBHOOK_SECRET: 'whsec_platform_fixture',
  STRIPE_SELLERS_WEBHOOK_SECRET: 'whsec_connected_fixture',
  BACKEND_URL: 'http://localhost:9000',
  MARKETPLACE_PUBLIC_ORIGIN: 'http://localhost:7001',
  ...overrides,
});

test('default and unconfigured disabled integrations do not register financial providers', () => {
  for (const env of [{}, { MARKETPLACE_PAYMENTS_ENABLED: 'false' }]) {
    const config = buildStripeConnectConfig(env);
    assert.equal(config.paymentsEnabled, false);
    assert.equal(config.integrationConfigured, false);
    assert.deepEqual(config.modules, []);
    assert.deepEqual(config.plugins, []);
  }
});

test('disabling new charges keeps configured reconciliation and connected accounts alive', () => {
  const config = buildStripeConnectConfig(fixture({ MARKETPLACE_PAYMENTS_ENABLED: 'false' }));
  const enabled = buildStripeConnectConfig(fixture());
  assert.equal(config.paymentsEnabled, false);
  assert.equal(config.integrationConfigured, true);
  assert.equal(config.plugins.length, 1);
  assert.equal(config.modules.length, 1);
  assert.equal(config.plugins[0].options.kycMonitor.enabled, true);
  assert.deepEqual(config.modules, enabled.modules);
  assert.deepEqual(config.plugins, enabled.plugins);
  assert.deepEqual(config.webhookPaths, enabled.webhookPaths);
});

test('the pinned native onboarding job cannot create accounts in paused or enabled configurations', async () => {
  // Exercise the job's business workflow. The scheduler wrapper may still
  // record a skipped run; this check prevents seller selection/account creation.
  const { jobWorkflow } = require('@mercurjs/stripe-connector-plugin/workflows/jobs');
  const { STRIPE_CONNECTOR_MODULE } = require('@mercurjs/stripe-connector-plugin/types');
  for (const payments of ['false', 'true']) {
    const config = buildStripeConnectConfig(fixture({ MARKETPLACE_PAYMENTS_ENABLED: payments }));
    const resolved = [];
    const container = { resolve(name) {
      resolved.push(name);
      assert.equal(name, STRIPE_CONNECTOR_MODULE, 'Disabled onboarding workflow must stop before seller selection or account creation');
      return { getOptions: () => config.plugins[0].options };
    } };
    assert.deepEqual(await jobWorkflow('payout-sync-onboarding', container)(), { skipped: 'onboarding disabled' });
    assert.deepEqual(resolved, [STRIPE_CONNECTOR_MODULE]);
  }
});

test('payment modes must be explicit and recognized before any provider is configured', () => {
  assert.throws(() => buildStripeConnectConfig(fixture({ MARKETPLACE_PAYMENT_MODE: '' })), /MARKETPLACE_PAYMENT_MODE/);
  assert.throws(() => buildStripeConnectConfig(fixture({ MARKETPLACE_PAYMENT_MODE: 'production' })), /must be test or live/);
});

test('rejects mode mixing, missing and duplicated webhook secrets without printing credentials', () => {
  assert.throws(() => buildStripeConnectConfig(fixture({ STRIPE_SECRET_KEY: 'sk_live_sensitive_fixture' })),
    (error) => /does not match/.test(error.message) && !error.message.includes('sensitive_fixture'));
  assert.throws(() => buildStripeConnectConfig(fixture({ STRIPE_OPERATOR_WEBHOOK_SECRET: '' })), /STRIPE_OPERATOR/);
  assert.throws(() => buildStripeConnectConfig(fixture({ STRIPE_OPERATOR_WEBHOOK_SECRET: 'whsec_connected_fixture' })), /distinct/);
  assert.throws(() => buildStripeConnectConfig(fixture({ MARKETPLACE_PAYMENTS_ENABLED: 'TRUE' })), /must be true or false/);
});

test('rejects foreign, cleartext, credential-bearing and query-bearing public return URLs', () => {
  const invalid = [
    'https://confenge.com.br.evil.example', 'https://other.example',
    'http://confenge.com.br', 'https://user:secret@confenge.com.br',
    'https://confenge.com.br/prestador?token=private', 'https://confenge.com.br/#token',
  ];
  for (const url of invalid) {
    assert.throws(() => buildStripeConnectConfig(fixture({ MARKETPLACE_PUBLIC_ORIGIN: url })), /canonical HTTPS/);
  }
});

test('Brazil configuration delegates bank payouts to Stripe and never creates a second Mercur transfer', () => {
  const config = buildStripeConnectConfig(fixture());
  const plugin = config.plugins[0].options;
  const payment = config.modules.find((item) => item.resolve === '@medusajs/medusa/payment');
  const payout = config.modules.find((item) => item.resolve === '@mercurjs/core/modules/payout');
  assert.equal(config.paymentsEnabled, true);
  assert.equal(plugin.settlements.mode, 'provider');
  assert.equal(plugin.capture.captureBeforeAcceptance, false);
  assert.equal(plugin.capture.safetyBufferMs, 0);
  assert.equal(plugin.transfers.enabled, false);
  assert.equal(plugin.reversals.enabled, false);
  assert.equal(plugin.settlements.enabled, false);
  assert.equal(payment, undefined);
  assert.equal(payout.options.providers[0].options.manualPayouts, false);
  assert.deepEqual(payout.options.providers[0].options.accountValidation.requiredCapabilities, ['card_payments', 'transfers']);
  assert.equal(payout.options.onboarding.defaultCountry, 'BR');
  assert.equal(payout.options.onboarding.returnUrl, 'http://localhost:7001/profissionais/#minha-conta');
  assert.equal(WEBHOOK_PATHS.engineering, '/hooks/engineering-stripe');
});

test('live configuration needs canonical HTTPS URLs and mode-matched credentials', () => {
  const live = fixture({ MARKETPLACE_PAYMENT_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_fixture_not_a_credential',
    BACKEND_URL: 'https://confenge.com.br/marketplace/api/', MARKETPLACE_PUBLIC_ORIGIN: 'https://confenge.com.br' });
  const config = buildStripeConnectConfig(live);
  const payout = config.modules.find((item) => item.resolve === '@mercurjs/core/modules/payout');
  assert.equal(payout.options.onboarding.returnUrl, 'https://confenge.com.br/profissionais/#minha-conta');
  assert.equal(payout.options.onboarding.refreshBaseUrl, 'https://confenge.com.br/marketplace/api');
  assert.throws(() => buildStripeConnectConfig({ ...live, BACKEND_URL: 'http://localhost:9000' }), /canonical HTTPS/);
});

test('provider settlement paid_out never becomes bank receipt, even with an apparent payout identifier', () => {
  const result = describeSettlement({ status: 'paid_out', payout_status: 'paid', provider_payout_id: 'po_fixture' }, 'provider');
  assert.equal(result.code, 'provider_statement');
  assert.equal(result.bankReceiptConfirmed, false);
  assert.match(result.detail, /não confirma crédito no banco/);
});

test('a provider bank event remains provider-reported, and an inconsistent record requires reconciliation', () => {
  const result = describeSettlement({ status: 'paid_out', payout_status: 'paid', provider_payout_id: 'po_fixture' }, 'plugin');
  assert.equal(result.code, 'provider_reports_paid');
  assert.equal(result.bankReceiptConfirmed, false);
  assert.equal(describeSettlement({ status: 'paid_out', payout_status: 'paid' }, 'plugin').code, 'reconciliation_pending');
  assert.equal(describeSettlement({ status: 'paid_out', payout_status: 'failed' }).code, 'needs_attention');
  assert.throws(() => describeSettlement({}, 'unknown'), /Unknown/);
});

test('seller transfer marked paid means Stripe-account transfer, never bank-received funds', () => {
  const result = describeSellerTransfer({ status: 'paid' });
  assert.equal(result.code, 'stripe_account_credit');
  assert.equal(result.bankReceiptConfirmed, false);
  assert.equal(describeSellerTransfer({ status: 'failed' }).code, 'transfer_failed');
});

test('refund pending, failed and partial states suspend execution instead of declaring money returned', () => {
  const record = { status: 'completed', payment: { status: 'paid' } };
  for (const [facts, expected] of [
    [{ refundPendingAmountCents: 1000 }, 'refund_pending'],
    [{ refundFailedAmountCents: 1000 }, 'refund_failed'],
    [{ refundedAmountCents: 1000 }, 'partially_refunded'],
  ]) {
    assert.deepEqual(reconcileEngineeringPayment(record, facts), { status: 'disputed', paymentStatus: expected });
  }
  assert.deepEqual(reconcileEngineeringPayment(record, { fullyRefunded: true, refundedAmountCents: 1000 }),
    { status: 'refunded', paymentStatus: 'refunded' });
  assert.deepEqual(record, { status: 'completed', payment: { status: 'paid' } });
});

test('duplicates preserve delivery and completion; late paid events cannot reopen restricted terminal states', () => {
  for (const status of ['paid', 'delivered', 'completed']) {
    assert.deepEqual(reconcileEngineeringPayment({ status, payment: { status: 'paid' } }, { paid: true }),
      { status, paymentStatus: 'paid' });
  }
  for (const status of ['disputed', 'refunded', 'cancelled']) {
    assert.deepEqual(reconcileEngineeringPayment({ status, payment: { status } }, { paid: true }),
      { status, paymentStatus: status });
  }
});

test('an expired unpaid checkout becomes expired without automatic reauthorization or downgrade of paid work', () => {
  const facts = { sessionStatus: 'expired', paymentCaptured: false, paid: false };
  assert.deepEqual(reconcileEngineeringPayment({ status: 'accepted', payment: { status: 'pending' } }, facts),
    { status: 'accepted', paymentStatus: 'expired' });
  assert.deepEqual(reconcileEngineeringPayment({ status: 'completed', payment: { status: 'paid' } }, facts),
    { status: 'completed', paymentStatus: 'paid' });
});

test('capture promotes accepted work only; unmatched capture and disputes require operational review', () => {
  assert.deepEqual(reconcileEngineeringPayment({ status: 'accepted', payment: { status: 'pending' } }, { paid: true }),
    { status: 'paid', paymentStatus: 'paid' });
  assert.deepEqual(reconcileEngineeringPayment({ status: 'requested', payment: { status: 'pending' } }, { paid: true }),
    { status: 'disputed', paymentStatus: 'payment_mismatch' });
  assert.deepEqual(reconcileEngineeringPayment({ status: 'paid', payment: { status: 'paid' } }, { disputed: true }),
    { status: 'disputed', paymentStatus: 'disputed' });
  assert.throws(() => reconcileEngineeringPayment({ status: 'accepted' }, { paid: true }), /saved payment/);
});
