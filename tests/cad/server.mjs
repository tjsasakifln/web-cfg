import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseHeaders } from '../../scripts/migration/netcup/lib/contract.mjs';

// Loopback-only server for the exact artifact and its actual scoped policies.
export async function serveCad(root, port = 0) {
  root = path.resolve(root);
  const headers = await readFile(path.join(root, '_headers'), 'utf8');
  const rules = parseHeaders(headers);
  const mime = { '.html':'text/html', '.htm':'text/html', '.js':'text/javascript',
    '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json',
    '.wasm':'application/wasm', '.png':'image/png', '.svg':'image/svg+xml',
    '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2',
    '.ttf':'font/ttf', '.otf':'font/otf', '.txt':'text/plain', '.gz':'application/gzip' };
  const server = http.createServer(async (request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
    catch { response.writeHead(400).end(); return; }
    const target = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!target.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
    const policy = {};
    for (const rule of rules.filter(rule => rule.match === 'global' ||
      (rule.path.endsWith('*') ? pathname.startsWith(rule.path.slice(0,-1)) : pathname === rule.path))
      .sort((a,b) => a.path.length - b.path.length)) {
      for (const header of rule.headers) policy[header.name] = header.value;
    }
    // Only HTTPS upgrading is inapplicable to the local HTTP origin.
    for (const name of Object.keys(policy)) if (name.toLowerCase() === 'content-security-policy') {
      policy[name] = policy[name].split(';').filter(v => v.trim() !== 'upgrade-insecure-requests').join(';');
    }
    try {
      const info = await stat(target);
      if (!info.isFile()) throw new Error('not a file');
      response.writeHead(200, { ...policy, 'Content-Type':mime[path.extname(target)] || 'application/octet-stream',
        'Content-Length':info.size });
      if (request.method === 'HEAD') response.end();
      else createReadStream(target).pipe(response);
    } catch { response.writeHead(404, policy).end(); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, base: 'http://127.0.0.1:' + server.address().port };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const { base } = await serveCad(process.argv[2] || '_site', Number(process.argv[3] || 8765));
  console.log(base);
}
