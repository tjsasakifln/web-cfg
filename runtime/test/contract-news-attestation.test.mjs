import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ALIASES, DOCUMENT_PATHS, attestPublication, inspectPublication } from '../contract-news/attest.mjs';
import { createContractNews } from '../contract-news/server.mjs';
import { PUBLICATION_SCHEMA, POINTER_SCHEMA, PREFIX } from '../contract-news/schema.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SHA = 'a'.repeat(40);
async function emptySnapshot(directory) {
  const snapshot = { schema: PUBLICATION_SCHEMA, generated_at: new Date().toISOString(), articles: [] };
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const file = `snapshot-${sha256}.json`;
  await writeFile(join(directory, file), bytes);
  await writeFile(join(directory, 'current.json'), JSON.stringify({ schema: POINTER_SCHEMA, sha256, file, generated_at: snapshot.generated_at, article_count: 0 }));
  return { file, sha256 };
}

test('runtime attestation distinguishes initial absence from an invalid or removed pointer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'news-attest-'));
  try {
    const initial = await attestPublication({ releaseSha: SHA, directory });
    assert.equal(initial.state, 'bootstrap');
    assert.equal(initial.snapshot_sha256, null);
    assert.deepEqual(Object.keys(initial.documents), Object.keys(DOCUMENT_PATHS));
    for (const row of Object.values(initial.documents)) {
      assert.equal(row.status, 503);
      assert.equal(row.headers['x-robots-tag'], 'noindex, nofollow');
      assert.equal(row.headers['retry-after'], '300');
    }
    const pointer = await emptySnapshot(directory);
    const empty = await attestPublication({ releaseSha: SHA, directory });
    assert.equal(empty.state, 'empty');
    assert.equal(empty.snapshot_sha256, pointer.sha256);
    assert.ok(Object.values(empty.documents).every(row => row.status === 200 && row.headers['x-confenge-news-snapshot'] === pointer.sha256));
    await unlink(join(directory, 'current.json'));
    await assert.rejects(inspectPublication(directory), /missing_pointer_with_publication_residue/);
    await writeFile(join(directory, 'current.json'), '{"sensitive":"never quote this snapshot"');
    await assert.rejects(attestPublication({ releaseSha: SHA, directory }));
    const result = spawnSync(process.execPath, ['runtime/contract-news/attest.mjs', SHA], { cwd: ROOT, env: { ...process.env, CONFENGE_NEWS_DIR: directory }, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'contract_news_attestation_failed\n');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a symlink pointer cannot be attested as either bootstrap or a valid publication', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'news-attest-link-'));
  try {
    const pointer = await emptySnapshot(directory);
    const bytes = await readFile(join(directory, 'current.json'));
    await writeFile(join(directory, 'real-pointer.json'), bytes);
    await unlink(join(directory, 'current.json'));
    await symlink(join(directory, 'real-pointer.json'), join(directory, 'current.json'));
    await assert.rejects(inspectPublication(directory));
    assert.ok(pointer.sha256);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('physical index aliases and page one redirect to the runtime canonical route', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'news-attest-http-'));
  const serve = createContractNews({ directory });
  const server = createServer(async (request, response) => { if (!await serve(request, response)) response.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const path of ALIASES) {
      const response = await fetch(base + path, { redirect: 'manual' });
      assert.equal(response.status, 308, path);
      assert.equal(response.headers.get('location'), PREFIX, path);
      assert.equal(response.headers.get('x-confenge-contract-news'), 'confenge.contract-news-runtime/v1');
    }
    assert.equal((await fetch(base + PREFIX + 'outro/index.html')).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
