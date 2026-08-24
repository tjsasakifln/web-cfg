/**
 * Production hosted checkout for CFG-DIAG-EXP-v1. Fail-closed. Acceptance required.
 */
const { resolveProductionConfig, requireProductionRuntime } = require("../../scripts/offers/providers/config-production.cjs");
const { createAsaasProductionProvider } = require("../../scripts/offers/providers/asaas-production.cjs");
const { redactProviderPayload } = require("../../scripts/offers/providers/redact.cjs");
const { resolveProductionStore } = require("../../scripts/offers/stores/sandbox-store.cjs");

const MAX_BODY = 64 * 1024;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(redactProviderPayload(payload)),
  };
}

function createHandler(deps = {}) {
  return async function handler(event = {}) {
    if (event.httpMethod && event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" });
    }
    const env = deps.env || process.env;
    const config = deps.config || resolveProductionConfig(env);
    if (!config.ok) {
      const runtime = requireProductionRuntime(config, { needApiKey: true });
      return json(runtime.statusCode || 404, { ok: false, error: config.error || "feature_disabled" });
    }
    const runtime = requireProductionRuntime(config, { needApiKey: true });
    if (!runtime.ok) return json(runtime.statusCode || 403, { ok: false, error: runtime.error });

    const rawBody = event.body == null ? "" : String(event.body);
    if (Buffer.byteLength(rawBody, "utf8") > (deps.maxBodyBytes || MAX_BODY)) {
      return json(413, { ok: false, error: "body_too_large" });
    }
    let payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return json(400, { ok: false, error: "invalid_json" });
    }

    const store = await resolveProductionStore(deps, event);
    if (!store) return json(503, { ok: false, error: "store_unavailable" });
    const provider = createAsaasProductionProvider({
      http: deps.http,
      clock: deps.clock,
      store,
      config,
      env,
      logger: deps.logger,
      sleep: deps.sleep,
    });
    const result = await provider.createProductionCheckout({
      offer_id: payload.offer_id,
      acceptance_id: payload.acceptance_id,
      cnpj: payload.cnpj,
      amount_cents: payload.amount_cents,
      currency: payload.currency,
      chargeTypes: payload.chargeTypes,
      billingTypes: payload.billingTypes,
      description: payload.description,
      callback_origin: payload.callback_origin || "https://confenge.com.br",
      correlation_id: payload.correlation_id,
    });
    if (!result.ok) {
      return json(result.statusCode || 422, { ok: false, error: result.error });
    }
    return json(result.idempotent ? 200 : 201, {
      ok: true,
      payment: false,
      revenue: false,
      received_revenue: false,
      environment: "production",
      idempotent: Boolean(result.idempotent),
      correlation_id: result.correlation_id,
      created: result.created,
    });
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
