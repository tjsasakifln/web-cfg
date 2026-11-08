#!/usr/bin/env node
/**
 * Serve the built public artifact with the portable functions runtime behind
 * the same local origin. This is intentionally a loopback-only HML harness.
 */
import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPortableRuntime } from '../../runtime/lib/server.mjs';
import commercePolicy from '../../runtime/tools-commerce/policy.cjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicRoot = resolve(root, '_site');
const loopback = '127.0.0.1';
const apiPaths = new Set([
  '/api/web/tool-credits',
  '/api/web/tool-credits-webhook',
]);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

function fail(message) {
  throw new Error(`tools-commerce HML refused: ${message}`);
}

function parsePort(argv) {
  if (argv.length === 0) return 8790;
  if (argv.length !== 2 || argv[0] !== '--port' || !/^\d{1,5}$/.test(argv[1])) {
    fail('use --port <1..65535>');
  }
  const port = Number(argv[1]);
  if (port < 1 || port > 65535) fail('port must be between 1 and 65535');
  return port;
}

function assertHmlEnvironment(port) {
  const mode = String(process.env.TOOLS_COMMERCE_MODE || '').trim();
  if (!['emulator', 'sandbox'].includes(mode)) {
    fail('TOOLS_COMMERCE_MODE must be emulator or sandbox');
  }
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    fail('NODE_ENV=production is not allowed');
  }
  if (String(process.env.RUNTIME_PROFILE || '').trim().toLowerCase() === 'netcup-production') {
    fail('RUNTIME_PROFILE=netcup-production is not allowed');
  }
  if (mode === 'sandbox') {
    const expectedOrigin = `http://${loopback}:${port}`;
    if (process.env.TOOLS_COMMERCE_SANDBOX_ORIGIN !== expectedOrigin) {
      fail(`TOOLS_COMMERCE_SANDBOX_ORIGIN must be ${expectedOrigin}`);
    }
  }
}

function requestHeaders(headers) {
  const forwarded = new Set([
    'connection', 'forwarded', 'host', 'keep-alive', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
    'x-forwarded-for', 'x-nf-client-connection-ip', 'x-real-ip',
  ]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !forwarded.has(name.toLowerCase())));
}

function within(rootPath, candidate) {
  const relation = relative(rootPath, candidate);
  return !isAbsolute(relation) && relation !== '..' && !relation.startsWith(`..${sep}`);
}

function contentType(file) {
  const extension = file.slice(file.lastIndexOf('.')).toLowerCase();
  return mimeTypes.get(extension) || 'application/octet-stream';
}

async function staticFile(pathname, realPublicRoot) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('\\')) return null;
  let candidate = resolve(realPublicRoot, `.${decoded}`);
  if (!within(realPublicRoot, candidate)) return null;
  try {
    let stat = await fs.stat(candidate);
    if (stat.isDirectory()) {
      candidate = resolve(candidate, 'index.html');
      stat = await fs.stat(candidate);
    }
    if (!stat.isFile()) return null;
    const realFile = await fs.realpath(candidate);
    return within(realPublicRoot, realFile) ? { file: realFile, size: stat.size } : null;
  } catch {
    return null;
  }
}

function proxyToRuntime(req, res, port) {
  const proxy = http.request({
    host: loopback,
    port,
    method: req.method,
    path: req.url,
    headers: requestHeaders(req.headers),
  }, (upstream) => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.once('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'HML_RUNTIME_UNAVAILABLE' }));
    } else {
      res.destroy();
    }
  });
  req.pipe(proxy);
}

async function main() {
  const port = parsePort(process.argv.slice(2));
  assertHmlEnvironment(port);
  const host = `${loopback}:${port}`;
  const origin = `http://${host}`;
  let realPublicRoot;
  try { realPublicRoot = await fs.realpath(publicRoot); } catch { fail('build _site before starting HML'); }
  if (relative(await fs.realpath(root), realPublicRoot) !== '_site') fail('_site must be the built artifact inside this checkout');

  Object.assign(process.env, {
    NODE_ENV: 'development',
    RUNTIME_HOST: loopback,
    RUNTIME_PORT: '0',
    RUNTIME_PROFILE: 'tools-commerce-hml',
    RUNTIME_TRUST_PROXY: 'none',
    CONTEXT: 'dev',
    CONFENGE_STORAGE_BACKEND: 'memory',
  });
  commercePolicy.loadConfig(process.env);
  const runtime = createPortableRuntime();
  await runtime.listen();
  const runtimeAddress = runtime.server.address();
  if (!runtimeAddress || typeof runtimeAddress === 'string') fail('portable runtime did not bind a TCP port');

  const server = http.createServer(async (req, res) => {
    if (req.headers.host !== host || !req.url?.startsWith('/') || req.url.startsWith('//')) {
      res.writeHead(400).end();
      return;
    }
    const url = new URL(req.url, origin);
    if (url.origin !== origin) {
      res.writeHead(400).end();
      return;
    }
    if (apiPaths.has(url.pathname)) {
      proxyToRuntime(req, res, runtimeAddress.port);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    const file = await staticFile(url.pathname, realPublicRoot);
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType(file.file),
      'Content-Length': file.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file.file).once('error', () => res.destroy()).pipe(res);
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('listening', resolve);
      server.listen(port, loopback);
    });
  } catch (error) {
    await runtime.shutdown('preview_listen_failed');
    throw error;
  }
  process.stdout.write(`Tools-commerce HML: ${origin}\n`);

  let stopping = false;
  async function stop(signal) {
    if (stopping) return;
    stopping = true;
    await new Promise((resolve) => server.close(resolve));
    await runtime.shutdown(signal);
  }
  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 78;
});
