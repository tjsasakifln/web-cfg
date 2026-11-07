import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Compare the served HTML with the member independently hashed in the gated artifact.
export async function verificarSuite(base, release = '') {
  const editions = JSON.parse(await readFile('_site/cad/suite/pacotes/edicoes.json', 'utf8'));
  assert.equal(Object.keys(editions).length, 8);
  for (const [app, spec] of Object.entries(editions)) {
    const url = new URL(`/cad/suite/runtime/${app}/`, base);
    if (release) url.searchParams.set('release', release);
    const result = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'manual' });
    assert.equal(result.status, 200, app);
    assert.match(result.headers.get('content-type') || '', /^text\/html\b/, app);
    assert.match(result.headers.get('x-robots-tag') || '', /noindex/, app);
    assert.match(result.headers.get('cache-control') || '', /no-transform/, app);
    assert.match(result.headers.get('content-security-policy') || '', /frame-ancestors 'self'/, app);
    const bytes = Buffer.from(await result.arrayBuffer());
    const html = bytes.toString('utf8');
    assert.match(html, /<title>CONFENGE /, app + ' precisa exibir a marca no título');
    const toolbar = html.match(/<header class="app-bar">([\s\S]*?)<\/header>/)?.[1] || '';
    assert.match(toolbar, /<img\b[^>]*favicon-32\.png/, app + ' precisa exibir a marca na barra interna');
    assert.match(toolbar, />CONFENGE [^<>]*</, app + ' precisa identificar a ferramenta');
    assert.match(toolbar, /href="\.\/creditos\.html"/, app + ' precisa permitir a consulta às licenças');
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, spec.files['index.html'][4], app);
  }
  console.log('CAD: oito edições entregues com os bytes e as políticas previstos.');
}
