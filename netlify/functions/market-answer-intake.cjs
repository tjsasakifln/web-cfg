/**
 * Isolated Market Answer / X-Ray intake.
 * CNPJ-only persist does not go through lead-core validateAndNormalize.
 * Commercial hand-raise uses the adapter (frozen libs stay untouched).
 */
const {
  parseBody,
  originAllowed,
  corsHeaders,
  publicErrorBody,
  safeLog,
} = require("./lib/lead-core.cjs");
const { createStore } = require("./lib/lead-store.cjs");
const { handleXrayRequest, handleHandraise } = require("../../scripts/conversion/intake-core.cjs");
const { safeFields } = require("../../scripts/conversion/minimize.cjs");
const { canaryEnabled } = require("../../scripts/conversion/flag.cjs");

let _storeOverride = null;
let _fetchOverride = null;

function setStoreForTests(store) {
  _storeOverride = store;
}
function setFetchForTests(fn) {
  _fetchOverride = fn;
}

async function getStore(event) {
  if (_storeOverride) return _storeOverride;
  return createStore({ event });
}

function json(statusCode, headers, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

exports.setStoreForTests = setStoreForTests;
exports.setFetchForTests = setFetchForTests;
exports.handleXrayRequest = handleXrayRequest;
exports.handleHandraise = handleHandraise;

exports.handler = async (event, context) => {
  const originCheck = originAllowed(event);
  const headers = corsHeaders(originCheck.origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, headers, publicErrorBody({ error: "method_not_allowed", message: "Metodo nao permitido." }));
  }
  if (!originCheck.ok) {
    return json(originCheck.status || 403, headers, publicErrorBody({
      error: originCheck.error,
      message: originCheck.message,
    }));
  }

  const parsed = parseBody(event);
  if (!parsed.ok) {
    return json(parsed.status || 400, headers, publicErrorBody({
      error: parsed.error,
      message: "Requisicao invalida.",
    }));
  }

  const data = parsed.data || {};
  const headerIdem = event.headers && (event.headers["idempotency-key"] || event.headers["Idempotency-Key"]);
  if (headerIdem && !data.idempotency_key) data.idempotency_key = headerIdem;

  const store = await getStore(event);
  if (!store) {
    safeLog("error", "conversion_store_unavailable", {});
    return json(503, headers, publicErrorBody({
      error: "store_unavailable",
      message: "Servico temporariamente indisponivel.",
    }));
  }

  const action = String(data.action || "xray").toLowerCase();
  const opts = {
    store,
    body: data,
    env: process.env,
    fetchFn: _fetchOverride || (context && context.fetchFn) || undefined,
    now: new Date(),
  };

  try {
    const result = action === "handraise"
      ? await handleHandraise(opts)
      : await handleXrayRequest(opts);

    safeLog("info", "conversion_intake", safeFields({
      action,
      status: result.statusCode,
      idempotent: Boolean(result.body && result.body.idempotent),
      xray_state: result.body && result.body.xray && result.body.xray.state,
      flag: canaryEnabled() ? "on" : "off",
    }));

    return json(result.statusCode, headers, result.body);
  } catch (err) {
    safeLog("error", "conversion_intake_exception", {
      code: err && err.message ? String(err.message).slice(0, 80) : "error",
    });
    return json(500, headers, publicErrorBody({
      error: "error",
      message: "Nao foi possivel processar a solicitacao.",
    }));
  }
};
