/**
 * Production Asaas webhook. Dedicated token. Persist-then-2xx. No provider mutation.
 */
const { resolveProductionConfig, requireProductionRuntime } = require("../../scripts/offers/providers/config-production.cjs");
const { createAsaasProductionProvider, mapProductionEvent } = require("../../scripts/offers/providers/asaas-production.cjs");
const { redactProviderPayload } = require("../../scripts/offers/providers/redact.cjs");
const { MemoryOfferStore } = require("../../scripts/offers/stores/sandbox-store.cjs");

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
      const runtime = requireProductionRuntime(config, { needWebhook: true });
      return json(runtime.statusCode || 404, { ok: false, error: config.error || "feature_disabled" });
    }
    const runtime = requireProductionRuntime(config, { needWebhook: true });
    if (!runtime.ok) return json(runtime.statusCode || 403, { ok: false, error: runtime.error });

    const store = deps.store || new MemoryOfferStore({ clock: deps.clock });
    const provider = createAsaasProductionProvider({
      http: deps.http,
      clock: deps.clock,
      store,
      config,
      env,
      logger: deps.logger,
    });
    const verified = provider.verifyProductionWebhook(event.headers || {});
    if (!verified.ok) return json(401, { ok: false, error: verified.error });

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
    if (!payload || typeof payload !== "object") return json(400, { ok: false, error: "invalid_json" });

    const mapped = mapProductionEvent(payload, {});
    if (!mapped.event || mapped.error === "event_id_missing") {
      return json(400, { ok: false, error: mapped.error || "event_id_missing", environment: "production" });
    }

    const receiptKey = `receipt:${mapped.event.provider_event_id}`;
    await store.putIfAbsent(receiptKey, { kind: "webhook_receipt", raw_redacted: true, event_id: mapped.event.provider_event_id });

    if (config.webhookApply !== true) {
      return json(200, {
        ok: true,
        persisted: true,
        apply: false,
        environment: "production",
        provider_event_id: mapped.event.provider_event_id,
      });
    }

    try {
      const applied = await provider.applyProductionWebhookEvent(mapped, payload);
      if (applied.duplicate) {
        return json(200, {
          ok: true,
          duplicate: true,
          environment: "production",
          provider_event_id: mapped.event.provider_event_id,
          type: mapped.event.type,
          canonical_status: mapped.event.canonical_status,
          financial_confirmation: mapped.event.financial_confirmation,
          received_revenue: mapped.event.received_revenue,
          revenue: false,
        });
      }
      return json(200, {
        ok: true,
        duplicate: false,
        environment: "production",
        provider_event_id: mapped.event.provider_event_id,
        type: mapped.event.type,
        canonical_status: mapped.event.canonical_status,
        financial_confirmation: mapped.event.financial_confirmation,
        received_revenue: mapped.event.received_revenue,
        revenue: false,
        nfse_manual_queue: Boolean(mapped.event.nfse_manual_queue),
        counsel_review_trigger: Boolean(mapped.event.counsel_review_trigger),
        exception: mapped.event.type === "commercial_exception",
      });
    } catch {
      return json(500, { ok: false, error: "apply_incomplete", environment: "production" });
    }
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
