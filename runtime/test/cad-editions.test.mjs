import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { createCadEditions } from '../lib/cad-editions.mjs';

test('serves only indexed edition members and handles ranges, cache and CSP', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'confenge-cad-edition-'));
  const html = Buffer.from('<html><title>Test</title></html>');
  const raw = deflateRawSync(html);
  const digest = createHash('sha256').update(html).digest('hex');
  const archive = 'cadcraft-0123456789abcdef.zip';
  await writeFile(path.join(directory, archive), Buffer.concat([Buffer.alloc(21), raw]));
  await writeFile(path.join(directory, 'edicoes.json'), JSON.stringify({ cadcraft: {
    archive, size: raw.length + 21, scripts: [], files: { 'index.html': [21, raw.length, html.length, 8, digest] }
  } }));
  const edition = createCadEditions(directory);
  const server = createServer(async (req, res) => { if (!(await edition(req, res))) res.writeHead(404).end(); });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port + '/cad/suite/runtime/cadcraft/';
    const result = await fetch(url);
    assert.equal(result.status, 200);
    assert.equal(await result.text(), html.toString());
    assert.match(result.headers.get('content-type'), /^text\/html/);
    assert.match(result.headers.get('content-security-policy'), /default-src 'none'/);
    assert.doesNotMatch(result.headers.get('content-security-policy'), /https?:\/\/(?!127\.0\.0\.1:)|'unsafe-eval'/);
    const navigation = await fetch(url + 'index.html', { redirect: 'manual', headers: { 'sec-fetch-dest': 'document' } });
    assert.equal(navigation.status, 302);
    assert.equal(navigation.headers.get('location'), '/cad/aplicativos/#cadcraft');
    assert.match(result.headers.get('cache-control'), /no-transform/);
    assert.equal((await fetch(url, { headers: { 'sec-fetch-dest': 'iframe' } })).status, 200);
    const etag = result.headers.get('etag');
    assert.equal((await fetch(url, { method: 'HEAD' })).headers.get('content-length'), String(html.length));
    assert.equal((await fetch(url, { headers: { 'if-none-match': etag } })).status, 304);
    const piece = await fetch(url, { headers: { range: 'bytes=2-5' } });
    assert.equal(piece.status, 206);
    assert.equal(await piece.text(), html.subarray(2, 6).toString());
    assert.equal((await fetch(url, { headers: { range: 'bytes=9999-' } })).status, 416);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
    for (const file of ['.env', '%2e%2e%2f.env', 'LICENSE.key', '__proto__', 'not-found.js']) {
      assert.equal((await fetch(url + file)).status, 404);
    }
    assert.equal((await fetch(url.replace('cadcraft', 'unknowncraft'))).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true });
  }
});
