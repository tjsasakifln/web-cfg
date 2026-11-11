import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { fetchRuntimeBytes, RUNTIME_CACHE } from '../../cad/freecad/network.mjs';

const origin = 'https://confenge.com.br';

function fixture(content = 'public FreeCAD engine bytes', extension = 'wasm') {
  const bytes = new TextEncoder().encode(content);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { bytes, spec: { path: `/assets/freecad/FreeCAD-${sha256.slice(0, 12)}.${extension}`, size: bytes.length, sha256 } };
}

/** Native Response/ReadableStream semantics, with Cache API clone-on-read/write. */
function environment(bytes, failures = {}) {
  const stored = new Map(), events = [];
  const cache = {
    async match(key) {
      events.push(['match', key]);
      if (failures.match) throw new DOMException('Storage unavailable', 'SecurityError');
      return stored.get(key)?.clone();
    },
    async delete(key) {
      events.push(['delete', key]);
      if (failures.delete) throw new DOMException('Storage unavailable', 'SecurityError');
      return stored.delete(key);
    },
    async put(key, response) {
      events.push(['put', key]);
      if (failures.put) throw new DOMException('Storage full', 'QuotaExceededError');
      stored.set(key, response.clone());
    },
  };
  const scope = {
    crypto: webcrypto, Response, location: { origin },
    caches: { async open(name) {
      events.push(['open', name]);
      assert.equal(name, RUNTIME_CACHE);
      if (failures.open) throw new DOMException('Storage blocked', 'SecurityError');
      return cache;
    } },
    async fetch(path, init) {
      events.push(['fetch', path, init]);
      return new Response(bytes, { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '9' } });
    },
  };
  return { scope, stored, events, cache };
}

const asBytes = buffer => [...new Uint8Array(buffer)];

test('cold download persists verified bytes and a later opening makes no engine request', async () => {
  for (const extension of ['wasm', 'data']) {
    const { bytes, spec } = fixture('verified immutable ' + extension, extension);
    const env = environment(bytes), firstProgress = [], warmProgress = [];
    assert.deepEqual(asBytes(await fetchRuntimeBytes(spec, (count, info) => firstProgress.push([count, info.source]), env.scope)), [...bytes]);
    assert.equal(env.events.filter(([name]) => name === 'fetch').length, 1);
    assert.equal(firstProgress.at(-1)[0], bytes.length);
    assert.ok(firstProgress.every(([, source]) => source === 'network'));
    const cached = await env.cache.match(new URL(spec.path, origin).href);
    assert.equal(cached.headers.get('Content-Encoding'), null, 'decoded cache body must not retain compression headers');
    assert.equal(cached.headers.get('Content-Length'), String(bytes.length));
    assert.equal(cached.headers.get('Content-Type'), extension === 'wasm' ? 'application/wasm' : 'application/octet-stream');
    env.scope.fetch = () => { throw new Error('warm opening unexpectedly used the network'); };
    assert.deepEqual(asBytes(await fetchRuntimeBytes(spec, (count, info) => warmProgress.push([count, info.source]), env.scope)), [...bytes]);
    assert.equal(warmProgress.at(-1)[0], bytes.length);
    assert.ok(warmProgress.every(([, source]) => source === 'cache'));
  }
});

test('cache validation checks SHA as well as length and replaces invalid responses', async t => {
  const { bytes, spec } = fixture();
  for (const [name, response] of [
    ['same-size corruption', new Response(bytes.map(byte => byte ^ 1))],
    ['truncated body', new Response(bytes.slice(1))],
    ['oversize body', new Response(new Uint8Array(bytes.length + 1))],
    ['partial HTTP response', new Response(bytes, { status: 206 })],
    ['cached error', new Response(bytes, { status: 500 })],
  ]) {
    await t.test(name, async () => {
      const env = environment(bytes), key = new URL(spec.path, origin).href;
      env.stored.set(key, response);
      assert.deepEqual(asBytes(await fetchRuntimeBytes(spec, undefined, env.scope)), [...bytes]);
      assert.deepEqual(env.events.filter(([event]) => ['delete', 'fetch', 'put'].includes(event)).map(([event]) => event), ['delete', 'fetch', 'put']);
      assert.deepEqual(asBytes(await (await env.cache.match(key)).arrayBuffer()), [...bytes]);
    });
  }
});

test('invalid network content is never returned or cached', async t => {
  const { bytes, spec } = fixture();
  for (const [name, response, message] of [
    ['same-size corruption', new Response(bytes.map(byte => byte ^ 1)), /integridade/],
    ['truncated body', new Response(bytes.slice(1)), /interrompido/],
    ['oversize body', new Response(new Uint8Array(bytes.length + 1)), /tamanho/],
    ['partial HTTP response', new Response(bytes, { status: 206 }), /HTTP 206/],
    ['server error', new Response('unavailable', { status: 503 }), /HTTP 503/],
  ]) {
    await t.test(name, async () => {
      const env = environment(bytes);
      env.scope.fetch = async () => response;
      await assert.rejects(fetchRuntimeBytes(spec, undefined, env.scope), message);
      assert.equal(env.stored.size, 0);
      assert.equal(env.events.some(([name]) => name === 'put'), false);
    });
  }
});

test('cache open, read, delete or quota failures preserve a verified local launch', async t => {
  const { bytes, spec } = fixture();
  for (const operation of ['open', 'match', 'put', 'delete']) {
    await t.test(operation, async () => {
      const env = environment(bytes, { [operation]: true });
      if (operation === 'delete') env.stored.set(new URL(spec.path, origin).href, new Response('invalid'));
      assert.deepEqual(asBytes(await fetchRuntimeBytes(spec, undefined, env.scope)), [...bytes]);
      assert.equal(env.events.filter(([event]) => event === 'fetch').length, 1);
    });
  }
  await t.test('Cache Storage not exposed', async () => {
    const env = environment(bytes);
    delete env.scope.caches;
    assert.deepEqual(asBytes(await fetchRuntimeBytes(spec, undefined, env.scope)), [...bytes]);
    assert.equal(env.stored.size, 0);
  });
  await t.test('Cache Storage property access is blocked', async () => {
    const env = environment(bytes);
    Object.defineProperty(env.scope, 'caches', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    assert.deepEqual(asBytes(await fetchRuntimeBytes(spec, undefined, env.scope)), [...bytes]);
    assert.equal(env.stored.size, 0);
  });
});

test('a tampered cached file cannot conceal an invalid replacement from the network', async () => {
  const { bytes, spec } = fixture(), env = environment(bytes.map(byte => byte ^ 1));
  env.stored.set(new URL(spec.path, origin).href, new Response('invalid cache'));
  await assert.rejects(fetchRuntimeBytes(spec, undefined, env.scope), /integridade/);
  assert.equal(env.stored.size, 0);
});

test('the cache admits engine binaries only and never documents, exports or account data', async () => {
  const { bytes, spec } = fixture(), env = environment(bytes);
  for (const path of ['/home/web_user/model.FCStd', '/api/web/tool-credits', '/cad/freecad/model.step',
    `/assets/freecad/FreeCAD-${spec.sha256.slice(0, 12)}.FCStd`,
    `/assets/freecad/FreeCAD-${spec.sha256.slice(0, 12)}.wasm?token=private`,
    `https://other.test${spec.path}`, '/assets/freecad/FreeCAD-000000000000.wasm']) {
    await assert.rejects(fetchRuntimeBytes({ ...spec, path }, undefined, env.scope), /versão publicada/);
  }
  for (const changes of [{ sha256: 'bad' }, { size: 0 }, { size: 2 ** 30 }, { size: 1.5 }]) {
    await assert.rejects(fetchRuntimeBytes({ ...spec, ...changes }, undefined, env.scope), /versão publicada/);
  }
  assert.deepEqual(env.events, []);
  assert.equal(env.stored.size, 0);
});

test('a different immutable hash never reuses an older engine entry', async () => {
  const old = fixture('old engine'), current = fixture('new engine'), env = environment(current.bytes);
  env.stored.set(new URL(old.spec.path, origin).href, new Response(old.bytes));
  assert.deepEqual(asBytes(await fetchRuntimeBytes(current.spec, undefined, env.scope)), [...current.bytes]);
  assert.equal(env.events.filter(([event]) => event === 'fetch').length, 1);
  assert.equal(env.stored.size, 2);
});

test('stream failures cancel reads and never produce a usable cache entry', async () => {
  const { bytes, spec } = fixture(), env = environment(bytes);
  let cancelled = false;
  env.scope.fetch = async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(spec.size + 1)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(fetchRuntimeBytes(spec, undefined, env.scope), /tamanho/);
  assert.equal(cancelled, true);
  assert.equal(env.stored.size, 0);

  env.scope.fetch = async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error('connection interrupted')); },
  }));
  await assert.rejects(fetchRuntimeBytes(spec, undefined, env.scope), /connection interrupted/);
  assert.equal(env.stored.size, 0);
});

test('network data cannot run when cryptographic verification is unavailable', async () => {
  const { bytes, spec } = fixture(), env = environment(bytes);
  env.scope.crypto = undefined;
  await assert.rejects(fetchRuntimeBytes(spec, undefined, env.scope), /verificação necessária/);
  assert.deepEqual(env.events, []);
});
