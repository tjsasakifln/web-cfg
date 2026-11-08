// Smoke do mesmo host usado pelo navegador, com as políticas efetivamente servidas.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { verificarSuite } from '../cad/suite/verificar-http.mjs';

export async function verificarBim(base, versao = '') {
  async function requisitar(caminho, opcoes = {}) {
    const url = new URL('/bim' + caminho, base);
    if (versao) url.searchParams.set('release', versao);
    const r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(30000) });
    assert.ok(r.ok, `${url.pathname}: HTTP ${r.status}`);
    return r;
  }
  const inicio = await requisitar('');
  assert.equal(new URL(inicio.url).pathname, '/bim/');
  assert.doesNotMatch(inicio.headers.get('content-security-policy') || '', /unsafe-eval/);
  assert.match(await inicio.text(), /href=["']https:\/\/confenge\.com\.br\/bim\/["']/);

  for (const caminho of ['/web/digitalizar.html', '/fotogrametria/']) {
    const r = await requisitar(caminho);
    const politica = r.headers.get('content-security-policy') || '';
    assert.match(politica, /'wasm-unsafe-eval'/);
    assert.doesNotMatch(politica, /'unsafe-eval'/);
    assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
    const html = await r.text();
    assert.match(html, /<script\b/i);
    if (caminho === '/fotogrametria/') {
      assert.equal(r.headers.get('cross-origin-opener-policy'), 'same-origin');
      assert.equal(r.headers.get('cross-origin-embedder-policy'), 'require-corp');
      const href = html.match(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["']/i)?.[1];
      assert.ok(href, 'folha de estilo do laboratório');
      async function lerCss(ref, origem) {
        const url = new URL(ref, origem);
        assert.equal(url.origin, new URL(base).origin);
        const css = await fetch(url, { signal: AbortSignal.timeout(30000) });
        assert.equal(css.status, 200, url.pathname);
        assert.match(css.headers.get('content-type') || '', /^text\/css/i);
        return [css.url, await css.text()];
      }
      let [url, conteudo] = await lerCss(href, r.url);
      const importado = conteudo.match(/@import\s+url\(["']?([^)'"]+)/)?.[1];
      if (importado) [, conteudo] = await lerCss(importado, url);
      assert.match(conteudo, /\{[^}]+\}/, 'regras de estilo do laboratório');
    }
  }
  for (const caminho of ['/web/digitalizar.mjs', '/web/proteger-trabalho.mjs', '/web/vendor/oficina/fornecedor.js', '/web/modelagem-step.mjs', '/fotogrametria/app.mjs']) {
    const r = await requisitar(caminho, { method: 'HEAD' });
    assert.match(r.headers.get('content-type') || '', /javascript/i, caminho);
    const permiteLigacoesNativas = caminho.endsWith('fornecedor.js') || caminho.endsWith('modelagem-step.mjs');
    assert.equal(/'unsafe-eval'/.test(r.headers.get('content-security-policy') || ''), permiteLigacoesNativas, caminho);
  }
  for (const [caminho, assinatura] of [
    ['/web/vendor/web-ifc/web-ifc.wasm', Buffer.from([0, 97, 115, 109])],
    ['/examples/planta-digitalizada.dwg', Buffer.from('AC1015')],
    ['/examples/planta-digitalizada.pdf', Buffer.from('%PDF')],
  ]) {
    const r = await requisitar(caminho, { headers: { Range: 'bytes=0-7' } });
    if (caminho.endsWith('.wasm')) assert.match(r.headers.get('content-type') || '', /^application\/wasm\b/);
    const inicio = Buffer.from(await r.arrayBuffer()).subarray(0, assinatura.length);
    assert.deepEqual(inicio, assinatura, caminho);
  }
  console.log('BIM HTTP OK · portal, folhas, módulos, workers, WebAssembly e amostras CAD/PDF');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await verificarBim(process.argv[2], process.argv[3]);
  await verificarSuite(process.argv[2], process.argv[3]);
}
