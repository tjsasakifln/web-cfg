// SPDX-License-Identifier: GPL-3.0-or-later
const AUTH = new Set(['https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com']);

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
