import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildHostContract } from '../../scripts/migration/netcup/lib/contract.mjs';
import { renderRuntimeLocations } from '../../scripts/migration/netcup/lib/nginx.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('host proxies the exact news namespace and preserves runtime security and cache headers', () => {
  const { contract } = buildHostContract(root);
  assert.equal(contract.runtime.contractNewsPrefix, '/noticias/contratos-publicos/');
  const output = renderRuntimeLocations(contract);
  assert.match(output, /location = \/noticias\/contratos-publicos \{/);
  assert.match(output, /location \^~ \/noticias\/contratos-publicos\/ \{/);
  const section = output.split('location ^~ /noticias/contratos-publicos/ {')[1].split('\n}\n')[0];
  assert.match(section, /proxy_pass http:\/\/confenge_web_runtime;/);
  assert.doesNotMatch(section, /add_header (?:Content-Security-Policy|Cache-Control|X-Robots-Tag|Content-Type)/i);
  contract.runtime.contractNewsPrefix = '/';
  assert.throws(() => renderRuntimeLocations(contract));
});
