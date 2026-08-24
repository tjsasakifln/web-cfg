/**
 * Production acceptance before checkout. OTP / magic-link confirmation via email.
 */
const { resolveProductionConfig, requireProductionRuntime } = require("../../scripts/offers/providers/config-production.cjs");
const { redactProviderPayload } = require("../../scripts/offers/providers/redact.cjs");
const { requestAcceptance, confirmAcceptance } = require("../../scripts/offers/acceptance.cjs");
const { sendAcceptanceChallenge } = require("../../scripts/offers/acceptance-mail.cjs");
const { resolveProductionStore } = require("../../scripts/offers/stores/sandbox-store.cjs");

const MAX_BODY = 64 * 1024;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(redactProviderPayload(payload)),
  };
}

function clientIp(headers) {
  const raw = headers["x-forwarded-for"] || headers["X-Forwarded-For"] || "";
  return String(raw).split(",")[0].trim() || null;
}

function createHandler(deps = {}) {
  return async function handler(event = {}) {
    if (event.httpMethod && event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" });
    }
    const env = deps.env || process.env;
    const config = deps.config || resolveProductionConfig(env, {
      decision: deps.decision,
      evidence: deps.evidence,
    });
    if (!config.ok) {
      const runtime = requireProductionRuntime(config);
      return json(runtime.statusCode || 404, { ok: false, error: config.error || "feature_disabled" });
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

    const store = await resolveProductionStore(deps, event);
    if (!store) return json(503, { ok: false, error: "store_unavailable" });

    if (payload.action === "confirm") {
      const confirmed = await confirmAcceptance(store, {
        pending_id: payload.pending_id,
        otp: payload.otp,
        magic_link_token: payload.magic_link_token,
        ip: clientIp(event.headers || {}),
        user_agent: (event.headers && (event.headers["user-agent"] || event.headers["User-Agent"])) || null,
        correlation_id: payload.correlation_id,
      }, { clock: deps.clock });
      if (!confirmed.ok) return json(confirmed.statusCode || 422, { ok: false, error: confirmed.error });
      return json(201, {
        ok: true,
        acceptance_id: confirmed.acceptance.acceptance_id,
        amount_cents: confirmed.acceptance.amount_cents,
        terms_version: confirmed.acceptance.terms_version,
        cnpj: confirmed.acceptance.cnpj,
        download: {
          acceptance_id: confirmed.acceptance.acceptance_id,
          terms_version: confirmed.acceptance.terms_version,
          amount_cents: confirmed.acceptance.amount_cents,
          declarations: confirmed.acceptance.declaration_text_exact,
        },
      });
    }

    const requested = requestAcceptance(payload, {
      clock: deps.clock,
      otp: deps.otp,
      magicLinkToken: deps.magicLinkToken,
      exposeOtp: deps.exposeOtp === true,
      legalHash: config.legalHash,
    });
    if (!requested.ok) return json(requested.statusCode || 422, { ok: false, error: requested.error, field: requested.field });

    await store.put(`acceptance-pending:${requested.pending.pending_id}`, requested.pending);

    const origin = "https://confenge.com.br";
    const magicLinkUrl = `${origin}/diagnostico-b2g-expansao/?pending_id=${encodeURIComponent(requested.pending.pending_id)}&magic_link_token=${encodeURIComponent(requested.challenge.magic_link_token)}`;
    const mailer = deps.mailer || sendAcceptanceChallenge;
    const mailed = await mailer({
      to: requested.pending.email,
      otp: requested.challenge.otp,
      magicLinkUrl,
      env,
    });
    if (!mailed || mailed.ok !== true) {
      return json(503, { ok: false, error: (mailed && mailed.error) || "email_delivery_failed" });
    }

    const body = {
      ok: true,
      pending_id: requested.pending.pending_id,
      next: "confirm_email",
    };
    if (deps.exposeOtp === true && requested.otp_for_test) body.otp_for_test = requested.otp_for_test;
    return json(200, body);
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
