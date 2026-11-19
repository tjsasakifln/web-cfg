import { constants } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { MAX_SNAPSHOT_BYTES, PREFIX, validatePointer, validatePublication } from './schema.mjs';
import { contentPolicy, renderArticle, renderError, renderFeed, renderIndex, renderSitemap } from './render.mjs';

export const DEFAULT_NEWS_DIRECTORY = '/var/lib/confenge-web/contract-news/public';

async function boundedFile(path, limit) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > limit) throw new Error('contract_news_file_size');
    const value = await handle.readFile();
    if (value.length > limit) throw new Error('contract_news_file_size');
    return value;
  } finally { await handle.close(); }
}

export function createPublicationStore(directory, { now = () => new Date() } = {}) {
  let cache = null;
  let pending = null;
  async function load() {
    const pointerPath = join(directory, 'current.json');
    const metadata = await stat(pointerPath, { bigint: true });
    const identity = `${metadata.ino}:${metadata.size}:${metadata.mtimeNs}`;
    if (cache?.identity === identity) return cache.snapshot;
    const pointer = validatePointer(JSON.parse((await boundedFile(pointerPath, 4096)).toString('utf8')));
    if (cache?.digest === pointer.sha256) {
      if (pointer.generated_at !== cache.snapshot.generated_at || pointer.article_count !== cache.snapshot.articles.length) throw new Error('contract_news_pointer_mismatch');
      cache.identity = identity;
      return cache.snapshot;
    }
    const bytes = await boundedFile(join(directory, pointer.file), MAX_SNAPSHOT_BYTES);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== pointer.sha256) throw new Error('contract_news_digest');
    const snapshot = validatePublication(JSON.parse(bytes.toString('utf8')), { now: now() });
    if (snapshot.generated_at !== pointer.generated_at || snapshot.articles.length !== pointer.article_count) throw new Error('contract_news_pointer_mismatch');
    cache = { identity, digest, snapshot };
    return snapshot;
  }
  const publication = async function publication() {
    pending ??= load().finally(() => { pending = null; });
    return pending;
  };
  publication.digest = () => cache?.digest || null;
  return publication;
}

export function createContractNews({ directory = process.env.CONFENGE_NEWS_DIR || DEFAULT_NEWS_DIRECTORY, now = () => new Date() } = {}) {
  const publication = createPublicationStore(directory, { now });
  return async function serve(req, res) {
    const raw = (req.url || '').split('?', 1)[0];
    if (raw !== PREFIX.slice(0, -1) && !raw.startsWith(PREFIX)) return false;
    res.setHeader('X-Confenge-Contract-News', 'confenge.contract-news-runtime/v1');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const send = (status, body, type = 'text/html; charset=utf-8', jsonld = '') => {
      const bytes = Buffer.from(body);
      res.setHeader('Content-Type', type);
      res.setHeader('Content-Security-Policy', contentPolicy(jsonld));
      res.setHeader('Cache-Control', status === 200 ? 'public, max-age=60, must-revalidate, no-transform' : 'no-store');
      if (status !== 200) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      if (status === 503) res.setHeader('Retry-After', '300');
      const etag = '"' + createHash('sha256').update(bytes).digest('hex') + '"';
      if (status === 200) {
        res.setHeader('ETag', etag);
        if (String(req.headers['if-none-match'] || '').split(/,\s*/).includes(etag)) { res.writeHead(304).end(); return true; }
      }
      res.setHeader('Content-Length', bytes.length);
      res.writeHead(status).end(req.method === 'HEAD' ? undefined : bytes);
      return true;
    };
    const failure = (status, path = PREFIX) => { const rendered = renderError(status, path); return send(status, rendered.html, undefined, rendered.jsonld); };
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return failure(405); }
    if (raw.length > 512 || /[%\\\u0000-\u0020]/.test(raw)) return failure(404);
    if (raw === PREFIX.slice(0, -1)) { res.writeHead(308, { Location: PREFIX, 'Cache-Control': 'public, max-age=300' }).end(); return true; }
    const suffix = raw.slice(PREFIX.length);
    if (suffix === 'index.html') { res.writeHead(308, { Location: PREFIX, 'Cache-Control': 'public, max-age=300' }).end(); return true; }
    const xmlKind = ['sitemap.xml', 'news-sitemap.xml', 'feed.xml'].includes(suffix) ? suffix : null;
    const pageMatch = /^pagina\/([1-9]\d{0,5})\/$/.exec(suffix);
    const slugMatch = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/$/.exec(suffix);
    if (suffix && !xmlKind && !pageMatch && !slugMatch) {
      if (/^(?:[a-z0-9]+(?:-[a-z0-9]+)*|pagina\/\d{1,6})$/.test(suffix)) {
        res.writeHead(308, { Location: raw + '/', 'Cache-Control': 'public, max-age=300' }).end(); return true;
      }
      return failure(404);
    }
    if (pageMatch && Number(pageMatch[1]) === 1) { res.writeHead(308, { Location: PREFIX, 'Cache-Control': 'public, max-age=300' }).end(); return true; }
    let snapshot;
    try { snapshot = await publication(); } catch { res.setHeader('X-Confenge-News-State', 'unavailable'); return failure(503); }
    res.setHeader('X-Confenge-News-State', snapshot.articles.length ? 'published' : 'empty');
    res.setHeader('X-Confenge-News-Snapshot', publication.digest());
    if (xmlKind === 'sitemap.xml') return send(200, renderSitemap(snapshot), 'application/xml; charset=utf-8');
    if (xmlKind === 'news-sitemap.xml') return send(200, renderSitemap(snapshot, { news: true, now: now() }), 'application/xml; charset=utf-8');
    if (xmlKind === 'feed.xml') return send(200, renderFeed(snapshot), 'application/rss+xml; charset=utf-8');
    let rendered;
    if (!suffix || pageMatch) rendered = renderIndex(snapshot, pageMatch ? Number(pageMatch[1]) : 1);
    else rendered = snapshot.articles.find(article => article.slug === slugMatch[1]);
    if (!rendered) return failure(404, raw);
    if (slugMatch) rendered = renderArticle(rendered);
    if (!snapshot.articles.length) res.setHeader('X-Robots-Tag', 'noindex, follow');
    return send(200, rendered.html, undefined, rendered.jsonld);
  };
}
