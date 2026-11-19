#!/usr/bin/env node
// Read-only release evidence. Invoked only after the host verifies the package.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContractNews, createPublicationStore, DEFAULT_NEWS_DIRECTORY } from './server.mjs';
import { PREFIX } from './schema.mjs';
import { articlePath, sortedArticles } from './render.mjs';

export const ATTESTATION_SCHEMA = 'confenge.contract-news-runtime/v1';
export const DOCUMENT_PATHS = Object.freeze({
  'noticias/contratos-publicos/index.html': PREFIX,
  'noticias/contratos-publicos/sitemap.xml': PREFIX + 'sitemap.xml',
  'noticias/contratos-publicos/news-sitemap.xml': PREFIX + 'news-sitemap.xml',
  'noticias/contratos-publicos/feed.xml': PREFIX + 'feed.xml',
});
export const ALIASES = Object.freeze([
  PREFIX.slice(0, -1), PREFIX + 'index.html', PREFIX + 'pagina/1/',
  PREFIX + 'index.html?contract-news-probe=1',
]);
export const SOURCE_FILES = Object.freeze([
  'runtime/contract.json', 'runtime/lib/server.mjs',
  'runtime/contract-news/attest.mjs', 'runtime/contract-news/server.mjs',
  'runtime/contract-news/schema.mjs', 'runtime/contract-news/render.mjs',
  'data/site/brand.json', 'data/site/public-ia-map.json',
]);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');

export async function inspectPublication(directory, now = new Date()) {
  try {
    // An absent pointer is bootstrap only when no earlier publication remains.
    // EACCES, invalid JSON, symlinks and orphan snapshots all fail closed.
    await lstat(join(directory, 'current.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    let entries = [];
    try {
      const metadata = await lstat(directory);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('contract_news_directory_invalid');
      entries = await readdir(directory);
    } catch (directoryError) {
      if (directoryError.code !== 'ENOENT') throw directoryError;
    }
    if (entries.length) throw new Error('contract_news_missing_pointer_with_publication_residue');
    return { state: 'bootstrap', snapshot: null, digest: null };
  }
  const read = createPublicationStore(directory, { now: () => now });
  const snapshot = await read();
  return { state: snapshot.articles.length ? 'published' : 'empty', snapshot, digest: read.digest() };
}

async function responseFor(serve, requestPath) {
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name.toLowerCase()] = String(value); },
    writeHead(status, extra = {}) { this.status = status; for (const [name, value] of Object.entries(extra)) this.setHeader(name, value); return this; },
    end(body) { this.body = Buffer.from(body || ''); return this; },
  };
  if (!await serve({ method: 'GET', url: requestPath, headers: {} }, response)) throw new Error('contract_news_route_not_served');
  const selected = Object.fromEntries([
    'content-type', 'content-security-policy', 'cache-control', 'x-robots-tag',
    'retry-after', 'x-confenge-contract-news', 'x-confenge-news-state', 'x-confenge-news-snapshot',
  ].filter(key => key in headers).map(key => [key, headers[key]]));
  return { request_path: requestPath, status: response.status, location: headers.location || null,
    sha256: hash(response.body), bytes: response.body.length, headers: selected };
}

export async function attestPublication({ releaseSha, directory = process.env.CONFENGE_NEWS_DIR || DEFAULT_NEWS_DIRECTORY, now = new Date(), sourceRoot = ROOT } = {}) {
  if (!/^[a-f0-9]{40}$/.test(releaseSha || '')) throw new Error('contract_news_release_sha_invalid');
  const identity = await inspectPublication(directory, now);
  const serve = createContractNews({ directory, now: () => now });
  const documents = {};
  for (const [physical, path] of Object.entries(DOCUMENT_PATHS)) documents[physical] = await responseFor(serve, path);
  const aliases = {};
  for (const path of ALIASES) aliases[path] = { status: 308, location: PREFIX, runtime_marker_required: path !== PREFIX.slice(0, -1) };
  const after = await inspectPublication(directory, now);
  if (identity.state !== after.state || identity.digest !== after.digest) throw new Error('contract_news_publication_changed_during_attestation');
  const expectedStatus = identity.state === 'bootstrap' ? 503 : 200;
  if (Object.values(documents).some(row => row.status !== expectedStatus ||
      (row.headers['x-confenge-news-snapshot'] || null) !== identity.digest)) throw new Error('contract_news_response_identity_mismatch');
  const sourceFiles = {};
  for (const rel of SOURCE_FILES) sourceFiles[rel] = hash(await readFile(join(sourceRoot, rel)));
  return { schema: ATTESTATION_SCHEMA, release_sha: releaseSha, prefix: PREFIX,
    observed_at: now.toISOString(), state: identity.state, snapshot_sha256: identity.digest,
    generated_at: identity.snapshot?.generated_at || null, article_count: identity.snapshot?.articles.length || 0,
    source_files_sha256: sourceFiles, documents, aliases,
    // The recent sitemap is clock-dependent. Its public verifier derives the
    // exact eligible set from these snapshot facts with bounded cache ageing.
    news_candidates: sortedArticles(identity.snapshot?.articles || [])
      .filter(article => Date.parse(article.published_at) >= now.getTime() - (48 * 60 * 60 + 120) * 1000)
      .map(article => ({ url: 'https://confenge.com.br' + articlePath(article), title: article.title, published_at: article.published_at })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  attestPublication({ releaseSha: process.argv[2] }).then(value => process.stdout.write(JSON.stringify(value) + '\n'))
    .catch(() => { process.stderr.write('contract_news_attestation_failed\n'); process.exitCode = 1; });
}
