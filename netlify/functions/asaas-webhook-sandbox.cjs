/**
 * Sandbox-only Asaas webhook. Authenticated, deduped, no mutating provider calls.
 */
const { resolveConfig, requireSandboxRuntime } = require("../../scripts/offers/providers/config.cjs");
const {
  createAsaasSandboxProvider,
  mapProviderEventToCanonicalEvent,
  redactProviderPayload,
} = require("../../scripts/offers/providers/asaas-sandbox.cjs");
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
      const status = config.error === "asaas_mode_blocked" || config.error === "production_money_blocked"
        ? 403
        : 400;
      return json(status, { ok: false, error: config.error });
    }
    const runtime = requireSandboxRuntime(config, { needWebhook: true });
    if (!runtime.ok) {
      return json(runtime.statusCode || 403, { ok: false, error: runtime.error });
    }

    const provider = createAsaasSandboxProvider({
      http: deps.http,
      clock: deps.clock,
      store: deps.store,
      config,
      env,
      logger: deps.logger,
    });
    const verified = provider.verifySandboxWebhook(event.headers || {});
    if (!verified.ok) {
      return json(401, { ok: false, error: verified.error });
    }

    const rawBody = event.body == null ? "" : String(event.body);
    if (Buffer.byteLength(rawBody, "utf8") > (deps.maxBodyBytes || MAX_BODY)) {
      return json(413, { ok: false, error: "body_too_large" });
    }
    let payload = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
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

    const mapped = mapProviderEventToCanonicalEvent(payload, {
      offer_id: payload.offer_id || null,
    });
    if (!mapped.event || mapped.error === "event_id_missing") {
      return json(400, {
        ok: false,
        error: mapped.error || "event_id_missing",
        status: mapped.status || "UNKNOWN",
      });
    }

    const providerEventId = mapped.event.provider_event_id;
    const marked = await store.markProviderEventProcessed(providerEventId, {
      event_type: mapped.event.type,
      offer_id: mapped.event.offer_id,
      correlation_id: mapped.event.external_reference,
    });
    if (!marked.inserted) {
      return json(200, {
        ok: true,
        duplicate: true,
        provider_event_id: providerEventId,
        type: marked.value && marked.value.event_type || mapped.event.type,
      });
    }

    if (store.appendCanonicalEvent) {
      await store.appendCanonicalEvent(mapped.event);
    }

    const body = {
      ok: mapped.ok !== false,
      duplicate: false,
      provider_event_id: providerEventId,
      offer_id: mapped.event.offer_id,
      type: mapped.event.type,
      canonical_status: mapped.event.canonical_status,
      financial_confirmation: mapped.event.financial_confirmation,
      revenue: mapped.event.revenue,
      exception: Boolean(mapped.exception) || mapped.event.type === "commercial_exception",
    };
    if (mapped.ok === false) {
      body.error = mapped.error;
      body.status = mapped.status || "UNKNOWN";
    }
    return json(200, body);
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
