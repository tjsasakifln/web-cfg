import { randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";

const ROUTE = /^\/(?:\.netlify\/functions|api\/web)\/([a-z0-9][a-z0-9-]*)$/;
// scripts/migration/netcup/lib/nginx.mjs renders
// `proxy_set_header X-Request-Id $request_id`, so the public nginx path always
// overwrites this header with its own 128-bit random hexadecimal value. Reject
// arbitrary client text here as defense in depth: a direct loopback call cannot
// smuggle an IP address, phone number or other literal into the application log.
const REQUEST_ID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i;
const HOP_BY_HOP = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

class PayloadTooLargeError extends Error {
  constructor() {
    super("payload_too_large");
    this.code = "payload_too_large";
  }
}

class HandlerTimeoutError extends Error {
  constructor() {
    super("handler_timeout");
    this.code = "handler_timeout";
  }
}

function normalizeRemoteAddress(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("::ffff:")) return raw.slice(7);
  if (raw === "::1") return "::1";
  return raw;
}

function ipv4Integer(value) {
  const pieces = String(value || "").split(".");
  if (pieces.length !== 4) return null;
  let output = 0;
  for (const piece of pieces) {
    if (!/^\d{1,3}$/.test(piece)) return null;
    const octet = Number(piece);
    if (octet < 0 || octet > 255) return null;
    output = ((output << 8) | octet) >>> 0;
  }
  return output;
}

export function ipv4CidrContains(cidr, address) {
  const match = String(cidr || "").match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) return false;
  const network = ipv4Integer(match[1]);
  const candidate = ipv4Integer(normalizeRemoteAddress(address));
  if (network == null || candidate == null) return false;
  const bits = Number(match[2]);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (network & mask) === (candidate & mask);
}

export function isLoopbackAddress(value) {
  const address = normalizeRemoteAddress(value);
  return address === "::1" || address.startsWith("127.");
}

function trustedProxy(req, config) {
  if (config.trustProxy === "none") return false;
  const remote = normalizeRemoteAddress(req.socket && req.socket.remoteAddress);
  if (isLoopbackAddress(remote)) return true;
  return (config.trustProxyCidrs || []).some((cidr) => ipv4CidrContains(cidr, remote));
}

function requestHeaders(req, config) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) headers[key.toLowerCase()] = value.join(", ");
    else if (value != null) headers[key.toLowerCase()] = String(value);
  }
  const remote = normalizeRemoteAddress(req.socket && req.socket.remoteAddress) || "unknown";
  const proxyIsTrusted = trustedProxy(req, config);
  if (!proxyIsTrusted) {
    for (const name of [
      "client-ip",
      "forwarded",
      "x-forwarded-for",
      "x-nf-client-connection-ip",
      "x-real-ip",
    ]) {
      delete headers[name];
    }
  }
  if (!proxyIsTrusted || !headers["x-forwarded-for"]) headers["client-ip"] = remote;
  return { headers, proxyIsTrusted, remote };
}

function sourceIp(headers, remote) {
  const forwarded = String(headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || remote || "unknown").slice(0, 80);
}

function queryParameters(url) {
  const single = {};
  const multi = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!multi[key]) multi[key] = [];
    multi[key].push(value);
    single[key] = value;
  }
  return { single, multi };
}

export function buildNetlifyEvent(req, {
  body,
  url,
  config,
  requestId,
} = {}) {
  const transport = requestHeaders(req, config);
  const query = queryParameters(url);
  const clientIp = sourceIp(transport.headers, transport.remote);
  return {
    httpMethod: String(req.method || "GET").toUpperCase(),
    headers: transport.headers,
    multiValueHeaders: {},
    body,
    isBase64Encoded: false,
    path: url.pathname,
    rawUrl: url.toString(),
    rawQuery: url.search.length > 1 ? url.search.slice(1) : "",
    queryStringParameters: query.single,
    multiValueQueryStringParameters: query.multi,
    requestContext: {
      requestId,
      identity: { sourceIp: clientIp },
      http: {
        method: String(req.method || "GET").toUpperCase(),
        path: url.pathname,
        sourceIp: clientIp,
      },
    },
    clientContext: null,
  };
}

function readBody(req, maxBytes) {
  const contentLength = Number(req.headers && req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    req.resume();
    return Promise.reject(new PayloadTooLargeError());
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        fail(new PayloadTooLargeError());
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      try {
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        settled = true;
        resolve(decoded);
      } catch {
        fail(Object.assign(new Error("invalid_utf8"), { code: "invalid_utf8" }));
      }
    });
    req.on("aborted", () => fail(Object.assign(new Error("request_aborted"), { code: "request_aborted" })));
    req.on("error", fail);
  });
}

function isJsonMediaType(value) {
  const mediaType = String(value || "").split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function validJsonFraming(body) {
  if (!String(body || "").trim()) return true;
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

function setHeader(res, name, value) {
  const lower = String(name || "").toLowerCase();
  if (!name || HOP_BY_HOP.has(lower) || value == null) return;
  try {
    res.setHeader(name, value);
  } catch {
    // Invalid handler-provided headers are omitted; the process remains available.
  }
}

function applyHandlerHeaders(res, response, requestId) {
  for (const [name, value] of Object.entries(response.headers || {})) {
    setHeader(res, name, Array.isArray(value) ? value.map(String) : String(value));
  }
  for (const [name, values] of Object.entries(response.multiValueHeaders || {})) {
    if (!Array.isArray(values)) continue;
    setHeader(res, name, values.map(String));
  }
  if (Array.isArray(response.cookies) && response.cookies.length) {
    setHeader(res, "Set-Cookie", response.cookies.map(String));
  }
  if (!res.hasHeader("X-Request-Id")) setHeader(res, "X-Request-Id", requestId);
}

export function writeJson(res, statusCode, payload, requestId, extraHeaders = {}) {
  if (res.headersSent || res.writableEnded) return;
  res.statusCode = statusCode;
  setHeader(res, "Content-Type", "application/json; charset=utf-8");
  setHeader(res, "Cache-Control", "no-store");
  setHeader(res, "X-Content-Type-Options", "nosniff");
  setHeader(res, "X-Request-Id", requestId);
  for (const [name, value] of Object.entries(extraHeaders)) setHeader(res, name, value);
  res.end(JSON.stringify(payload));
}

export function writeHandlerResponse(res, response, requestId) {
  if (!response || typeof response !== "object") {
    writeJson(res, 500, { ok: false, error: "handler_response_invalid" }, requestId);
    return 500;
  }
  const status = Number(response.statusCode);
  res.statusCode = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 200;
  applyHandlerHeaders(res, response, requestId);
  let body = response.body == null ? "" : String(response.body);
  if (response.isBase64Encoded === true) {
    try {
      body = Buffer.from(body, "base64");
    } catch {
      writeJson(res, 500, { ok: false, error: "handler_body_invalid" }, requestId);
      return 500;
    }
  }
  res.end(body);
  return res.statusCode;
}

function handlerDeadline(milliseconds) {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new HandlerTimeoutError()), milliseconds);
    timer.unref();
  });
  return {
    promise,
    clear() {
      clearTimeout(timer);
    },
  };
}

function requestIdFrom(req) {
  const supplied = String((req.headers && req.headers["x-request-id"]) || "");
  return REQUEST_ID.test(supplied) ? supplied : randomUUID();
}

function endpointMethodAllowed(req) {
  return req.method === "GET" || req.method === "HEAD";
}

function routeForLog(pathname) {
  const value = String(pathname || "/");
  if (["/healthz", "/ready", "/runtime-identity", "/.well-known/runtime-info.json"].includes(value)) {
    return value;
  }
  const match = value.match(ROUTE);
  if (!match) return "unmatched";
  return value.startsWith("/api/web/")
    ? `/api/web/${match[1]}`
    : `/.netlify/functions/${match[1]}`;
}

export function createHttpAdapter({
  config,
  registry,
  identity,
  readiness,
  logger,
  trackInvocation = (promise) => promise,
} = {}) {
  return async function handleHttp(req, res) {
    const started = Date.now();
    const requestId = requestIdFrom(req);
    let route = "unmatched";
    let functionName = null;
    let status = 500;
    try {
      const host = String((req.headers && req.headers.host) || "localhost").replace(/[\r\n]/g, "");
      const url = new URL(req.url || "/", "http://" + host);
      const requestPath = url.pathname;
      route = routeForLog(requestPath);

      if (["/healthz", "/ready", "/runtime-identity", "/.well-known/runtime-info.json"].includes(requestPath)) {
        if (!endpointMethodAllowed(req)) {
          writeJson(res, 405, { ok: false, error: "method_not_allowed" }, requestId, {
            Allow: "GET, HEAD",
          });
          status = 405;
          return;
        }
        if (requestPath === "/healthz") {
          writeJson(res, 200, {
            ok: true,
            status: "live",
            contract_version: identity.contract_version,
          }, requestId);
          status = 200;
          return;
        }
        if (requestPath === "/ready") {
          const current = readiness();
          status = current.ok ? 200 : 503;
          writeJson(res, status, current, requestId);
          return;
        }
        writeJson(res, 200, identity, requestId);
        status = 200;
        return;
      }

      const match = requestPath.match(ROUTE);
      if (!match) {
        writeJson(res, 404, { ok: false, error: "not_found" }, requestId);
        status = 404;
        return;
      }
      functionName = match[1];
      const handler = registry.getHttpHandler(functionName);
      if (!handler) {
        writeJson(res, 404, { ok: false, error: "function_not_found" }, requestId);
        status = 404;
        return;
      }

      let body;
      try {
        body = await readBody(req, config.maxBodyBytes);
      } catch (error) {
        const code = error && error.code;
        status = code === "payload_too_large" ? 413 : 400;
        writeJson(res, status, {
          ok: false,
          error: code === "payload_too_large" ? "payload_too_large" : "request_body_invalid",
        }, requestId);
        return;
      }

      if (
        config.validateJson
        && isJsonMediaType(req.headers && req.headers["content-type"])
        && !validJsonFraming(body)
      ) {
        status = 400;
        writeJson(res, 400, { ok: false, error: "invalid_json" }, requestId);
        return;
      }

      const event = buildNetlifyEvent(req, { body, url, config, requestId });
      const context = {
        functionName,
        requestId,
        signal: null,
      };
      const invocation = Promise.resolve().then(() => handler(event, context));
      trackInvocation(invocation);
      const deadline = handlerDeadline(config.handlerTimeoutMs);
      let response;
      try {
        response = await Promise.race([
          invocation,
          deadline.promise,
        ]);
      } catch (error) {
        status = error && error.code === "handler_timeout" ? 504 : 500;
        writeJson(res, status, {
          ok: false,
          error: status === 504 ? "handler_timeout" : "internal_error",
        }, requestId);
        logger(status === 504 ? "warn" : "error", "runtime_handler_error", {
          request_id: requestId,
          function: functionName,
          status,
          error_code: status === 504 ? "handler_timeout" : "handler_exception",
        });
        return;
      } finally {
        deadline.clear();
      }
      status = writeHandlerResponse(res, response, requestId);
    } catch {
      status = 500;
      writeJson(res, 500, { ok: false, error: "internal_error" }, requestId);
    } finally {
      logger("info", "runtime_request", {
        request_id: requestId,
        method: req.method || "GET",
        route,
        function: functionName,
        status,
        duration_ms: Date.now() - started,
      });
    }
  };
}
