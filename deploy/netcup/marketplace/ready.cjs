'use strict';
// Execute inside the API container after setup. No credentials are displayed.
const key = process.env.MARKETPLACE_READINESS_PUBLISHABLE_KEY;
if (!key || !process.env.MARKETPLACE_GATEWAY_KEY) {
  process.stderr.write('Readiness key is not configured.\n');
  process.exit(78);
}
fetch('http://127.0.0.1:9000/store/engineering/config', {
  headers: { 'x-publishable-api-key': key, 'x-confenge-gateway-key': process.env.MARKETPLACE_GATEWAY_KEY },
  signal: AbortSignal.timeout(10000), redirect: 'error',
}).then(async response => {
  if (!response.ok) throw new Error('not ready');
  const data = await response.json();
  if (data.service !== 'confenge-engineering-marketplace' || data.version !== '0.1.0' || data.terms_version !== 'marketplace-engenharia-v1' || !['test','live'].includes(data.payment_mode)) throw new Error('contract mismatch');
  process.stdout.write('Engineering API and request database are ready.\n');
}).catch(() => { process.stderr.write('Engineering readiness failed.\n'); process.exitCode = 1; });
