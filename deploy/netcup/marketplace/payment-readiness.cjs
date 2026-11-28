'use strict';

// Run inside the private marketplace API container from stdin. The default
// probe is local. --verify-stripe performs only authenticated reads.
const { buildStripeConnectConfig } = require('/app/config/stripe-connect.cjs');

const stripeEndpointRequirements = [
  {
    path: '/api/web/engineering-marketplace-webhook',
    events: [
      'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
      'checkout.session.expired', 'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed',
      'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
    ],
  },
  {
    path: '/api/web/engineering-marketplace-connect-webhook',
    events: ['account.updated', 'payout.paid', 'payout.failed', 'payout.canceled', 'payout.updated'],
  },
];

async function main(args, env) {
  if (args.some(arg => arg !== '--verify-stripe') || args.length > 1) throw new Error('invalid_args');
  const result = { payments_enabled: env.MARKETPLACE_PAYMENTS_ENABLED === 'true',
    mode: env.MARKETPLACE_PAYMENT_MODE || 'test', stripe_configured: false,
    stripe_account_br: null, stripe_endpoints_complete: null, commission_configured: false };
  const value = env.MARKETPLACE_COMMISSION_BPS || '';
  result.commission_configured = /^\d{1,4}$/.test(value) && Number(value) <= 5000;
  const config = buildStripeConnectConfig(env);
  result.stripe_configured = config.integrationConfigured;
  if (args.includes('--verify-stripe') && config.integrationConfigured) {
    const Stripe = require('/app/node_modules/stripe');
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { timeout: 8000, maxNetworkRetries: 0 });
    const account = await stripe.accounts.retrieve();
    result.stripe_account_br = account.country === 'BR';
    const candidates = [];
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
      if (endpoint.status === 'enabled' && endpoint.livemode === (result.mode === 'live')) candidates.push(endpoint);
      if (candidates.length >= 500) break;
    }
    result.stripe_endpoints_complete = stripeEndpointRequirements.every(requirement => candidates.some(endpoint =>
      endpoint.url === 'https://confenge.com.br' + requirement.path &&
      (endpoint.enabled_events.includes('*') || requirement.events.every(event => endpoint.enabled_events.includes(event)))));
  }
  // Credentials, account identifiers and provider response bodies stay private.
  return result;
}

main(process.argv.slice(2), process.env).then(result => process.stdout.write(JSON.stringify(result) + '\n'))
  .catch(() => { process.stderr.write('Financial readiness probe failed. Check the private environment and provider access.\n'); process.exitCode = 1; });
