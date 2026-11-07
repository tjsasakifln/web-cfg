import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';

const PREFIX = '/cad/suite/runtime/';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
  '.zip': 'application/zip', '.gz': 'application/gzip', '.xml': 'application/xml', '.csv': 'text/csv',
  '.webmanifest': 'application/manifest+json'
};
const MAX_MEMBER = 10 * 1024 * 1024;
function byteRange(value, size) {
  if (!value) return [0, size - 1];
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const last = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isSafeInteger(first) && Number.isSafeInteger(last) && first >= 0 && first <= last ? [first, last] : null;
}

function slice(first, last, size) {
  let offset = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      const next = offset + chunk.length;
      if (next > size) return callback(Error('edition_member_overflow'));
      if (next > first && offset <= last) {
        this.push(chunk.subarray(Math.max(0, first - offset), Math.min(chunk.length, last - offset + 1)));
      }
      offset = next;
      callback();
    },
    flush(callback) { callback(offset === size ? undefined : Error('edition_member_truncated')); }
  });
}
const has = (obj, key) => Object.hasOwn(obj, key);
function policy(app, name) {
  return [
    "default-src 'none'", "base-uri 'self'", "form-action 'none'", "frame-ancestors 'self'",
    "object-src 'none'", "connect-src 'self' blob: data:", "img-src 'self' data: blob:",
    "font-src 'self' data: blob:", "style-src 'self' 'unsafe-inline'", name === 'markupcraft' ? "media-src 'self' blob: data:" : "media-src 'self' blob:",
    "frame-src 'self' blob:", "worker-src 'self' blob:", "manifest-src 'self'", "script-src-attr 'none'",
    "script-src 'self' 'wasm-unsafe-eval' blob: " + app.scripts.map(h => "'" + h + "'").join(' ')
  ].join('; ');
}

// The build validates complete archive hashes and every compressed member. At runtime
// paths come exclusively from the release index, never from incoming paths on disk.
export function createCadEditions(directory) {
  let index;
  let active = 0;
  return async function serve(req, res) {
    const raw = req.url.split('?', 1)[0];
    if (!raw.startsWith(PREFIX)) return false;
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = status => { res.writeHead(status, { 'Cache-Control': 'no-store' }).end(); return true; };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return fail(405); }
    if (raw.length > 1200 || /%(?:2f|5c|00)/i.test(raw)) return fail(404);
    let local;
    try { local = decodeURIComponent(raw.slice(PREFIX.length)); } catch { return fail(404); }
    const sep = local.indexOf('/');
    if (sep <= 0) return fail(404);
    const name = local.slice(0, sep), path = local.slice(sep + 1) || 'index.html';
    if (!/^[a-z]+craft$/.test(name) || path.split('/').some(p => !p || p.startsWith('.') || p.includes('\\'))) return fail(404);
    try {
      index ??= readFile(join(directory, 'edicoes.json'), 'utf8').then(JSON.parse);
      const all = await index;
      if (!has(all, name)) return fail(404);
      // Some editions import the shared first-party prompt list via a relative URL.
      if (path === 'assets/js/skill-packs.js' && !has(all[name].files, path)) {
        res.writeHead(307, { Location: '/assets/js/skill-packs.js', 'Cache-Control': 'no-cache' }).end();
        return true;
      }
      if (!has(all[name].files, path)) return fail(404);
      const app = all[name], [offset, compressed, size, method, digest] = app.files[path];
      if (!new RegExp('^' + name + '-[0-9a-f]{16}\\.zip$').test(app.archive) ||
          ![offset, compressed, size].every(v => Number.isSafeInteger(v) && v >= 0) ||
          ![0, 8].includes(method) || size > MAX_MEMBER || offset + compressed > app.size || !/^[a-f0-9]{64}$/.test(digest)) {
        return fail(500);
      }
      if (path === 'index.html') {
        res.setHeader('Vary', 'Sec-Fetch-Dest');
        if (req.headers['sec-fetch-dest'] === 'document') {
          res.writeHead(302, { Location: '/cad/aplicativos/#' + name, 'Cache-Control': 'private, no-store, no-transform' }).end();
          return true;
        }
      }
      res.setHeader('Content-Security-Policy', policy(app, name));
      res.setHeader('Content-Type', MIME[extname(path).toLowerCase()] || (/^(LICENSE|NOTICE|TRADEMARKS)$/.test(path.split('/').at(-1)) ? MIME['.txt'] : 'application/octet-stream'));
      const tag = '"' + digest + '"';
      res.setHeader('ETag', tag);
      res.setHeader('Cache-Control', /(?:^|\/)\d+\.\d+\.\d+\//.test(path) ? 'public, max-age=31536000, immutable, no-transform' : 'no-cache, no-transform');
      res.setHeader('Accept-Ranges', 'bytes');
      if (req.headers['if-none-match']?.split(/,\s*/).includes(tag)) { res.writeHead(304).end(); return true; }
      const range = req.headers['if-range'] && req.headers['if-range'] !== tag ? undefined : req.headers.range;
      const bounds = byteRange(range, size);
      if (!bounds) { res.setHeader('Content-Range', 'bytes */' + size); return fail(416); }
      const [first, last] = bounds;
      if (range) res.setHeader('Content-Range', 'bytes ' + first + '-' + last + '/' + size);
      res.setHeader('Content-Length', Math.max(0, last - first + 1));
      if (req.method === 'HEAD' || !size) { res.writeHead(range ? 206 : 200).end(); return true; }
      // At most one 10 MiB logical member per request. Streaming bounds the resident data.
      if (active >= 128) { res.removeHeader('Content-Length'); return fail(503); }
      active++;
      try {
        res.writeHead(range ? 206 : 200);
        const source = compressed ? createReadStream(join(directory, app.archive), { start: offset, end: offset + compressed - 1 }) : Readable.from([]);
        const stages = [source];
        if (method === 8) stages.push(createInflateRaw());
        stages.push(slice(first, last, size), res);
        await pipeline(stages);
      } finally { active--; }
      return true;
    } catch {
      if (res.headersSent) res.destroy();
      else fail(503);
      return true;
    }
  };
}
