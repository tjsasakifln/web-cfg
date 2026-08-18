/**
 * Sandbox-only Asaas webhook. Authenticated, deduped, no mutating provider calls.
 */
const { resolveConfig, requireSandboxRuntime } = require("../../scripts/offers/providers/config.cjs");
const {
  createAsaasSandboxProvider,
  mapProviderEventToCanonicalEvent,
  applySandboxWebhookEvent,
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

    const mapped = mapProviderEventToCanonicalEvent(payload, {});
    if (!mapped.event || mapped.error === "event_id_missing") {
      return json(400, {
        ok: false,
        error: mapped.error || "event_id_missing",
        status: mapped.status || "UNKNOWN",
        environment: "sandbox",
      });
    }

    try {
      const applied = await applySandboxWebhookEvent(store, mapped, payload);
      if (applied.duplicate) {
        return json(200, {
          ok: true,
          duplicate: true,
          environment: "sandbox",
          provider_event_id: mapped.event.provider_event_id,
          type: (applied.event && applied.event.type) || mapped.event.type,
          transition: (applied.decision && applied.decision.action) || "idempotent",
          object_status: applied.object_status || null,
        });
      }

      const body = {
        ok: mapped.ok !== false,
        duplicate: false,
        environment: "sandbox",
        provider_event_id: mapped.event.provider_event_id,
        offer_id: mapped.event.offer_id,
        type: mapped.event.type,
        canonical_status: mapped.event.canonical_status,
        object_status: applied.object_status || null,
        transition: applied.decision && applied.decision.action,
        financial_confirmation: mapped.event.financial_confirmation,
        revenue: mapped.event.revenue,
        exception: Boolean(mapped.exception) || mapped.event.type === "commercial_exception",
      };
      if (mapped.ok === false) {
        body.error = mapped.error;
        body.status = mapped.status || "UNKNOWN";
      }
      return json(200, body);
    } catch {
      return json(500, { ok: false, error: "apply_incomplete", environment: "sandbox" });
    }
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
