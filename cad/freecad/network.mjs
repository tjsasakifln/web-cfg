// SPDX-License-Identifier: GPL-3.0-or-later
const AUTH = new Set(['https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com']);
export const RUNTIME_CACHE = 'confenge-freecad-engine-v1';

function runtimeAsset(spec) {
  // Only immutable engine binaries belong here. Documents, exports, credentials
  // and arbitrary same-origin responses must never enter this cache.
  const match = /^\/assets\/freecad\/FreeCAD-([a-f0-9]{12})\.(wasm|data)$/.exec(spec?.path);
  if (!match || !/^[a-f0-9]{64}$/.test(spec.sha256) || match[1] !== spec.sha256.slice(0, 12)
      || !Number.isSafeInteger(spec.size) || spec.size <= 0 || spec.size > 512 * 1024 * 1024) {
    throw new Error('O arquivo do ambiente não corresponde à versão publicada.');
  }
  return match[2];
}

async function verifiedBytes(response, spec, onProgress, scope, source) {
  if (!response || response.status !== 200) throw new Error(`Não foi possível baixar o ambiente (HTTP ${response?.status || 0}).`);
  let buffer;
  if (!response.body) {
    buffer = await response.arrayBuffer();
    if (buffer.byteLength !== spec.size) throw new Error('O arquivo do ambiente está incompleto. Reabra a ferramenta para tentar novamente.');
    onProgress(spec.size, { source });
  } else {
    const bytes = new Uint8Array(spec.size), reader = response.body.getReader();
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.byteLength > bytes.length) throw new Error('O tamanho do ambiente diverge da versão publicada.');
        bytes.set(value, offset); offset += value.byteLength;
        onProgress(offset, { source });
      }
      if (offset !== spec.size) throw new Error('O download do ambiente foi interrompido. Reabra a ferramenta para tentar novamente.');
    } catch (error) {
      // A cached/tee'd Response may keep its sibling alive. Cancelling this
      // reader must not wait for that unrelated branch before recovery.
      try { reader.cancel().catch(() => {}); } catch { /* Preserve the original read failure. */ }
      throw error;
    } finally { reader.releaseLock(); }
    buffer = bytes.buffer;
  }
  const digest = await scope.crypto.subtle.digest('SHA-256', buffer);
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== spec.sha256) throw new Error('A integridade do ambiente não foi confirmada. Reabra a ferramenta para tentar novamente.');
  return buffer;
}

/** Reuse verified public engine bytes without relying on the browser's HTTP size limits. */
export async function fetchRuntimeBytes(spec, onProgress = () => {}, scope = globalThis) {
  const extension = runtimeAsset(spec);
  if (!scope.crypto?.subtle) throw new Error('O navegador não oferece a verificação necessária para abrir o ambiente.');
  const key = new URL(spec.path, scope.location.origin).href;
  let cache;
  try { cache = await scope.caches?.open(RUNTIME_CACHE); }
  catch { /* Private mode, blocked storage and quota never prevent local modelling. */ }
  if (cache) {
    try {
      const cached = await cache.match(key);
      if (cached) return await verifiedBytes(cached, spec, onProgress, scope, 'cache');
    } catch {
      // A truncated, changed or unreadable entry is never executed. Replacement
      // is best effort: a failed delete must not block a fresh verified download.
      try { await cache.delete(key); } catch { /* Storage may have been revoked. */ }
    }
  }
  onProgress(0, { source: 'network' });
  // Verify the streamed body ourselves before use or persistence. This also
  // preserves download progress instead of waiting for fetch's SRI buffering.
  const response = await scope.fetch(spec.path);
  const buffer = await verifiedBytes(response, spec, onProgress, scope, 'network');
  if (cache) {
    try {
      // The body is already decoded. Do not retain Content-Encoding or the wire
      // Content-Length from the server, which would describe different bytes.
      await cache.put(key, new scope.Response(buffer, { status: 200, headers: {
        'Content-Type': extension === 'wasm' ? 'application/wasm' : 'application/octet-stream',
        'Content-Length': String(buffer.byteLength),
      } }));
    } catch { /* The verified in-memory bytes remain usable if caching fails. */ }
  }
  return buffer;
}

export function allowedRequest(input, method = 'GET', origin = 'https://confenge.com.br') {
  let url;
  try { url = new URL(typeof input === 'string' ? input : input.url, origin); } catch { return false; }
  if (url.username || url.password) return false;
  method = method.toUpperCase();
  if (AUTH.has(url.origin)) return ['GET', 'POST'].includes(method);
  if (url.origin !== origin) return false;
  if (url.pathname === '/api/web/tool-credits') return ['GET', 'POST'].includes(method);
  if (!['GET', 'HEAD'].includes(method)) return false;
  return ['/cad/freecad/', '/assets/freecad/'].some(prefix => url.pathname.startsWith(prefix));
}

/** No proxy, telemetry, addon downloads, collaboration server or remote model APIs. */
export function installNetworkBoundary(scope = window) {
  const original = scope.fetch.bind(scope);
  scope.fetch = (input, init = {}) => {
    if (!allowedRequest(input, init.method || input?.method || 'GET', scope.location.origin)) {
      return Promise.reject(new TypeError('Conexão externa indisponível neste modelador local.'));
    }
    return original(input, init);
  };
  const open = scope.XMLHttpRequest.prototype.open;
  scope.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (!allowedRequest(String(url), method, scope.location.origin)) throw new TypeError('Conexão externa indisponível neste modelador local.');
    return open.call(this, method, url, ...rest);
  };
  const denied = function () { throw new TypeError('Conexões em tempo real indisponíveis neste modelador local.'); };
  scope.WebSocket = denied;
  scope.EventSource = denied;
  try { scope.navigator.sendBeacon = () => false; } catch { /* CSP remains the second boundary. */ }
}
