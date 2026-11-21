/**
 * Production acceptance before checkout. OTP / magic-link confirmation via email.
 */
const { createHmac, randomBytes } = require("node:crypto");
const { resolveProductionConfig, requireProductionRuntime } = require("../../scripts/offers/providers/config-production.cjs");
const { redactProviderPayload } = require("../../scripts/offers/providers/redact.cjs");
const { requestAcceptance, confirmAcceptance } = require("../../scripts/offers/acceptance.cjs");
const { sendAcceptanceChallenge } = require("../../scripts/offers/acceptance-mail.cjs");
const { resolveProductionStore } = require("../../scripts/offers/stores/sandbox-store.cjs");

const MAX_BODY = 64 * 1024;
const REQUEST_WINDOW_MS = 60 * 60 * 1000;
const REQUEST_MAX_PER_IP = 3;
const REQUEST_MAX_PER_EMAIL = 3;
const MAX_BUCKETS = 10_000;
const requestPepper = randomBytes(32);
const requestBuckets = new Map();

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

function limit(key, max, now = Date.now()) {
  const timestamps = (requestBuckets.get(key) || []).filter((value) => now - value < REQUEST_WINDOW_MS);
  if (timestamps.length >= max) return false;
  timestamps.push(now);
  if (!requestBuckets.has(key) && requestBuckets.size >= MAX_BUCKETS) {
    requestBuckets.delete(requestBuckets.keys().next().value);
  }
  requestBuckets.delete(key);
  requestBuckets.set(key, timestamps);
  return true;
}

function digest(value) {
  return createHmac("sha256", requestPepper).update(String(value || "")).digest("hex").slice(0, 24);
}

function createHandler(deps = {}) {
  return async function handler(event = {}) {
    if (event.httpMethod && event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" });
    }
    const env = deps.env || process.env;
    const config = deps.config || resolveProductionConfig(env);
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
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json(400, { ok: false, error: "invalid_json" });
    }
    const origin = String((event.headers && (event.headers.origin || event.headers.Origin)) || "");
    if (origin && origin !== "https://confenge.com.br" && origin !== "https://www.confenge.com.br") {
      return json(403, { ok: false, error: "origin_forbidden" });
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
    if (payload.action && payload.action !== "request") {
      return json(422, { ok: false, error: "action_invalid" });
    }
    const ip = clientIp(event.headers || {});
    const email = String(payload.email || "").trim().toLowerCase();
    if (!limit(`ip:${digest(ip)}`, REQUEST_MAX_PER_IP) || !limit(`email:${digest(email)}`, REQUEST_MAX_PER_EMAIL)) {
      return json(429, { ok: false, error: "rate_limited" });
    }

    const requested = requestAcceptance(payload, {
      clock: deps.clock,
      otp: deps.otp,
      magicLinkToken: deps.magicLinkToken,
      exposeOtp: deps.exposeOtp === true,
      legalHash: config.legalHash,
    });
    if (!requested.ok) return json(requested.statusCode || 422, { ok: false, error: requested.error, field: requested.field });

    const pendingSaved = await store.putIfAbsent(`acceptance-pending:${requested.pending.pending_id}`, requested.pending, { ttlMs: 15 * 60 * 1000 });
    if (!pendingSaved.inserted) return json(503, { ok: false, error: "challenge_store_unavailable" });

    const publicOrigin = "https://confenge.com.br";
    const magicLinkUrl = `${publicOrigin}/diagnostico-b2g-expansao/?pending_id=${encodeURIComponent(requested.pending.pending_id)}&magic_link_token=${encodeURIComponent(requested.challenge.magic_link_token)}`;
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
