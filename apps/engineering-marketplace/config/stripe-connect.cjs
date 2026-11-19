'use strict';

// Options verified against mercurjs/mercur v2.4.1. This builds provider
// configuration; request authorization remains the API's responsibility.
const WEBHOOK_PATHS = Object.freeze({
  engineering: '/hooks/engineering-stripe',
  platform: '/hooks/engineering-stripe',
  connectedAccounts: '/hooks/payout',
});

function required(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing ${name} for marketplace payments`);
  }
  return value.trim();
}

function publicBaseUrl(env, name, mode) {
  let url;
  try {
    url = new URL(required(env, name));
  } catch {
    throw new Error(`Invalid ${name} for marketplace payments`);
  }
  const localTestHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const canonical = url.hostname === 'confenge.com.br';
  const permittedProtocol = url.protocol === 'https:' ||
    (mode === 'test' && localTestHost && url.protocol === 'http:');
  if (!permittedProtocol || url.username || url.password || url.search || url.hash ||
      (!canonical && !(mode === 'test' && localTestHost)) ||
      (mode === 'live' && url.port)) {
    throw new Error(`${name} must use the canonical HTTPS CONFENGE surface (localhost is allowed in test mode)`);
  }
  return url.href.replace(/\/+$/, '');
}

/** This configuration does not authorize a purchase. The engineering API must
 * check scope, the current quote, both acceptances and the authenticated buyer.
 * Keep the environment switch off until that complete flow has been verified.
 */
function buildStripeConnectConfig(env = process.env) {
  const enabled = env.MARKETPLACE_PAYMENTS_ENABLED;
  if (enabled !== undefined && !['true', 'false', ''].includes(enabled)) {
    throw new Error('MARKETPLACE_PAYMENTS_ENABLED must be true or false');
  }
  const paymentsEnabled = enabled === 'true';
  const integrationConfigured = typeof env.STRIPE_SECRET_KEY === 'string' && !!env.STRIPE_SECRET_KEY.trim();
  if (!paymentsEnabled && !integrationConfigured) {
    return {
      paymentsEnabled: false,
      integrationConfigured: false,
      mode: 'disabled',
      country: 'BR',
      currencyCode: 'brl',
      plugins: [],
      modules: [],
      webhookPaths: WEBHOOK_PATHS,
    };
  }

  const mode = required(env, 'MARKETPLACE_PAYMENT_MODE');
  if (!['test', 'live'].includes(mode)) {
    throw new Error('MARKETPLACE_PAYMENT_MODE must be test or live');
  }
  const apiKey = required(env, 'STRIPE_SECRET_KEY');
  if (!apiKey.startsWith(`sk_${mode}_`)) {
    throw new Error('STRIPE_SECRET_KEY does not match MARKETPLACE_PAYMENT_MODE');
  }
  const platformWebhookSecret = required(env, 'STRIPE_OPERATOR_WEBHOOK_SECRET');
  const connectWebhookSecret = required(env, 'STRIPE_SELLERS_WEBHOOK_SECRET');
  if (![platformWebhookSecret, connectWebhookSecret].every((value) => /^whsec_.+/.test(value))) {
    throw new Error('Stripe webhook signing secrets must use the whsec_ format');
  }
  if (platformWebhookSecret === connectWebhookSecret) {
    throw new Error('Platform and connected-account webhooks require distinct signing secrets');
  }
  const backendUrl = publicBaseUrl(env, 'BACKEND_URL', mode);
  const publicOrigin = publicBaseUrl({ MARKETPLACE_PUBLIC_ORIGIN: env.MARKETPLACE_PUBLIC_ORIGIN || 'https://confenge.com.br' },
    'MARKETPLACE_PUBLIC_ORIGIN', mode);
  if (new URL(publicOrigin).pathname !== '/') {
    throw new Error('MARKETPLACE_PUBLIC_ORIGIN must be an origin without a path');
  }

  return {
    paymentsEnabled,
    integrationConfigured: true,
    mode,
    country: 'BR',
    currencyCode: 'brl',
    webhookPaths: WEBHOOK_PATHS,
    plugins: [{
      resolve: '@mercurjs/stripe-connector-plugin',
      options: {
        apiKey,
        webhookSecret: connectWebhookSecret,
        // Disable the native account-creation cron. The authenticated Connect
        // route invokes Mercur's payout/onboarding workflows explicitly under
        // its seller lock and paymentsEnabled guard; those workflows do not
        // consult this scheduler option. KYC and signed webhooks stay active.
        onboarding: { enabled: false },
        // Engineering requests have their own Stripe Checkout destination
        // charge. Never create a second Transfer from a Mercur Order.
        transfers: { enabled: false, requiredFulfillmentStatus: 'delivered' },
        reversals: { enabled: false },
        settlements: { enabled: false, mode: 'provider' },
        // v2.4.1 has no capture.enabled. There is no native payment provider
        // below and no Medusa payment collection for engineering requests.
        // Zero also removes the native expiry-driven forced capture fallback.
        capture: { captureBeforeAcceptance: false, safetyBufferMs: 0 },
        kycMonitor: { enabled: true },
      },
    }],
    modules: [{
      resolve: '@mercurjs/core/modules/payout',
      options: {
        providers: [{
          resolve: '@mercurjs/stripe-connector-plugin/providers/payout-stripe-connect',
          id: 'stripe',
          options: {
            apiKey,
            webhookSecret: connectWebhookSecret,
            manualPayouts: false,
            accountValidation: {
              detailsSubmitted: true,
              chargesEnabled: true,
              payoutsEnabled: true,
              noOutstandingRequirements: true,
              requiredCapabilities: ['card_payments', 'transfers'],
            },
          },
        }],
        onboarding: {
          returnUrl: `${publicOrigin}/profissionais/#minha-conta`,
          refreshBaseUrl: backendUrl,
          prefill: true,
          defaultCountry: 'BR',
        },
      },
    }],
  };
}

module.exports = { buildStripeConnectConfig, WEBHOOK_PATHS };
