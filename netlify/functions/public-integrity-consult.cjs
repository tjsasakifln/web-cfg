/**
 * Isolated public-integrity consumer intake.
 * PREPARE-ONLY: fixtures are the data path. Flag default false.
 */
const {
  parseBody,
  originAllowed,
  corsHeaders,
  publicErrorBody,
  safeLog,
} = require("./lib/lead-core.cjs");
const { handleConsult, handleResult, handleDelete } = require("../../scripts/public_integrity_consumer/intake.cjs");
const { createStore } = require("../../scripts/public_integrity_consumer/store.cjs");
const { redactLog } = require("../../scripts/public_integrity_consumer/privacy.cjs");
const { landingHtml } = require("../../scripts/public_integrity_consumer/render.cjs");
const { flagEnabled } = require("../../scripts/public_integrity_consumer/flag.cjs");

let _storeOverride = null;

function setStoreForTests(store) {
  _storeOverride = store;
}

async function getStore(event) {
  if (_storeOverride) return _storeOverride;
  try {
    const { connectLambda } = require("@netlify/blobs");
    if (event && event.blobs) connectLambda(event);
  } catch {
    /* local */
  }
  return createStore();
}

function json(statusCode, headers, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function html(statusCode, headers, body) {
  return {
    statusCode,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
    body,
  };
}

function wantsHtml(event) {
  const h = (event && event.headers) || {};
  const accept = String(h.accept || h.Accept || "");
  return accept.includes("text/html") && !accept.includes("application/json");
}

function tokenFromEvent(event, data) {
  if (data && (data.t || data.token)) return String(data.t || data.token);
  const qs = (event && event.queryStringParameters) || {};
  if (qs.t || qs.token) return String(qs.t || qs.token);
  const path = String((event && (event.path || event.rawUrl)) || "");
  const m = path.match(/\/r\/([A-Za-z0-9_-]{16,})/);
  return m ? m[1] : "";
}

exports.setStoreForTests = setStoreForTests;
exports.handleConsult = handleConsult;
exports.handleResult = handleResult;

exports.handler = async (event) => {
  const originCheck = originAllowed(event);
  const headers = {
    ...corsHeaders(originCheck.origin),
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (!originCheck.ok && event.httpMethod === "POST") {
    return json(originCheck.status || 403, headers, publicErrorBody({
      error: originCheck.error,
      message: originCheck.message,
    }));
  }

  const parsed = event.httpMethod === "GET"
    ? { ok: true, data: event.queryStringParameters || {} }
    : parseBody(event);
  if (!parsed.ok) {
    return json(parsed.status || 400, headers, publicErrorBody({
      error: parsed.error,
      message: "Requisicao invalida.",
    }));
  }

  const store = await getStore(event);
  const data = parsed.data || {};
  const action = String(data.action || "").toLowerCase();

  try {
    if (event.httpMethod === "GET" && (action === "landing" || event.path && /consulta-ocorrencias-publicas\/?$/.test(event.path))) {
      return html(200, headers, landingHtml({ flagOn: flagEnabled() }));
    }

    if (event.httpMethod === "GET" || action === "result") {
      const token = tokenFromEvent(event, data);
      const result = await handleResult({
        store,
        token,
        env: process.env,
        wantsHtml: wantsHtml(event),
      });
      const outHeaders = { ...headers, ...(result.headers || {}) };
      if (result.html && wantsHtml(event)) return html(result.statusCode, outHeaders, result.html);
      return json(result.statusCode, outHeaders, result.body);
    }

    if (event.httpMethod === "DELETE" || action === "delete") {
      const token = tokenFromEvent(event, data);
      const result = await handleDelete({ store, token });
      return json(result.statusCode, headers, result.body);
    }

    if (event.httpMethod !== "POST") {
      return json(405, headers, publicErrorBody({ error: "method_not_allowed", message: "Metodo nao permitido." }));
    }

    const headerIdem = event.headers && (event.headers["idempotency-key"] || event.headers["Idempotency-Key"]);
    if (headerIdem && !data.idempotency_key) data.idempotency_key = headerIdem;

    const result = await handleConsult({
      store,
      body: data,
      env: process.env,
      now: new Date(),
    });
    const outHeaders = { ...headers, ...(result.headers || {}) };
    if (result.logs) {
      for (const line of result.logs) {
        safeLog("info", line.event, redactLog(line.fields || {}));
      }
    }
    if (wantsHtml(event) && result.html) {
      outHeaders.Location = result.headers && result.headers.Location;
      return html(result.statusCode, outHeaders, result.html);
    }
    return json(result.statusCode, outHeaders, result.body);
  } catch (err) {
    safeLog("error", "public_integrity_exception", {
      code: err && err.message ? String(err.message).slice(0, 80) : "error",
    });
    return json(500, headers, publicErrorBody({
      error: "error",
      message: "Nao foi possivel processar a solicitacao.",
    }));
  }
};
