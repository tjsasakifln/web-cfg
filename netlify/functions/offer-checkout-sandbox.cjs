/**
 * Admin-only Sandbox checkout. Fail-closed. Invokes the Asaas adapter directly.
 * Does not edit journey.cjs / sandbox.cjs.
 */
const { resolveConfig, requireSandboxRuntime, verifyAdminToken, headerValue } = require("../../scripts/offers/providers/config.cjs");
const { createAsaasSandboxProvider, redactProviderPayload } = require("../../scripts/offers/providers/asaas-sandbox.cjs");
const { createSandboxStore } = require("../../scripts/offers/stores/sandbox-store.cjs");

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
    const config = deps.config || resolveConfig(env);
    if (!config.ok) {
      const blocked = /blocked|production/.test(String(config.error || ""));
      return json(blocked ? 403 : 400, { ok: false, error: config.error });
    }
    const runtime = requireSandboxRuntime(config, { needApiKey: true, needAdmin: true });
    if (!runtime.ok) {
      return json(runtime.statusCode || 403, { ok: false, error: runtime.error });
    }
    const adminHeader = headerValue(event.headers || {}, "x-confenge-sandbox-admin-token")
      || headerValue(event.headers || {}, "x-admin-token");
    if (!verifyAdminToken(config, adminHeader)) {
      return json(401, { ok: false, error: "admin_token_invalid" });
    }

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
    if (!payload || typeof payload !== "object") {
      return json(400, { ok: false, error: "invalid_json" });
    }

    let store = deps.store;
    if (store === undefined) {
      store = await createSandboxStore({ env, event, clock: deps.clock, allowMemory: false });
    }
    if (!store) {
      return json(503, { ok: false, error: "store_unavailable" });
    }

    const provider = createAsaasSandboxProvider({
      http: deps.http,
      clock: deps.clock,
      store,
      config,
      env,
      logger: deps.logger,
      sleep: deps.sleep,
      fixtures: deps.fixtures,
    });
    const result = await provider.createSandboxCheckout({
      offer_id: payload.offer_id,
      sandbox_test: payload.sandbox_test === true,
      fixture_id: payload.fixture_id,
      cpfCnpj: payload.cpfCnpj || payload.cnpj,
      email: payload.email,
      phone: payload.phone,
      representante: payload.representante,
      target_contract: payload.target_contract,
      start_date: payload.start_date,
      correlation_id: payload.correlation_id,
      inventory: deps.inventory,
    });
    if (!result.ok) {
      return json(result.statusCode || 422, {
        ok: false,
        error: result.error,
        status: result.status || null,
      });
    }
    return json(result.idempotent ? 200 : 201, {
      ok: true,
      payment: false,
      revenue: false,
      financial_confirmation: false,
      environment: "sandbox",
      idempotent: Boolean(result.idempotent),
      pending: Boolean(result.pending),
      correlation_id: result.correlation_id,
      created: result.created,
      event: result.event
        ? {
          schema: result.event.schema,
          type: result.event.type,
          event_id: result.event.event_id,
          offer_id: result.event.offer_id,
          provider_event_id: result.event.provider_event_id,
          financial_confirmation: result.event.financial_confirmation,
          revenue: result.event.revenue,
          canonical_status: result.event.canonical_status,
        }
        : null,
    });
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
