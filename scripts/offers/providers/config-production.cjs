/**
 * Fail-closed Asaas production config. Never reads sandbox secrets as fallback.
 * Inverse of providers/config.cjs — do not hybridize that file.
 */
const crypto = require("crypto");
const { loadFlags } = require("../flags.cjs");

const DEFAULT_PRODUCTION_BASE = "https://api.asaas.com/v3";
const PRODUCTION_API_HOSTS = Object.freeze(["api.asaas.com"]);
const PRODUCTION_LINK_HOSTS = Object.freeze(["api.asaas.com", "www.asaas.com", "asaas.com"]);
const SANDBOX_HOSTS = Object.freeze(["api-sandbox.asaas.com", "sandbox.asaas.com"]);
const PRODUCTION_KEY_PREFIX = "$aact_prod_";
const SANDBOX_KEY_PREFIX = "$aact_hmlg_";
const PINNED_LEGAL_HASH = "sha256:5fd69a314d6b6aab74ba2ab87ae5e90d12ade6360193a18275c9c3377e1fd778";
const APPROVED_OFFER = "CFG-DIAG-EXP-v1";
const APPROVED_AMOUNT_CENTS = 800000;
const TERMS_VERSION = "CFG-LEGAL-TERMS-DIAG-EXP-FOUNDER-v1";
const CALLBACK_HOST_ALLOW = Object.freeze(["confenge.com.br", "www.confenge.com.br"]);

const SANDBOX_ENV_KEYS = Object.freeze([
  "ASAAS_SANDBOX_API_KEY",
  "ASAAS_SANDBOX_WEBHOOK_TOKEN",
  "ASAAS_SANDBOX_BASE_URL",
  "CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN",
]);

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (!a.length || !b.length) return false;
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function hostnameOf(raw) {
  try {
    return new URL(String(raw || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSandboxHost(host) {
  return SANDBOX_HOSTS.includes(String(host || "").toLowerCase());
}

function isProductionApiHost(host) {
  return PRODUCTION_API_HOSTS.includes(String(host || "").toLowerCase());
}

function assertProductionApiUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || ""));
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "non_https_url" };
  if (isSandboxHost(url.hostname)) return { ok: false, error: "sandbox_host_blocked" };
  if (!isProductionApiHost(url.hostname)) return { ok: false, error: "host_not_allowlisted" };
  if (url.username || url.password) return { ok: false, error: "url_credentials_blocked" };
  return { ok: true, url: url.toString().replace(/\/$/, "") };
}

function assertProductionLinkUrl(raw) {
  if (raw == null || raw === "") return { ok: true, url: null };
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return { ok: false, error: "invalid_link_url" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "non_https_url" };
  if (isSandboxHost(url.hostname)) return { ok: false, error: "sandbox_host_blocked" };
  if (!PRODUCTION_LINK_HOSTS.includes(url.hostname.toLowerCase())) {
    return { ok: false, error: "link_host_not_allowlisted" };
  }
  return { ok: true, url: url.toString() };
}

function assertCallbackUrl(raw) {
  if (!raw) return { ok: false, error: "callback_missing" };
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return { ok: false, error: "callback_invalid" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "non_https_url" };
  if (url.username || url.password) return { ok: false, error: "url_credentials_blocked" };
  if (!CALLBACK_HOST_ALLOW.includes(url.hostname.toLowerCase())) {
    return { ok: false, error: "callback_host_not_allowlisted" };
  }
  return { ok: true, url: url.toString() };
}

function resolveProductionConfig(env = process.env) {
  const flags = loadFlags(env);
  const mode = String(flags.ASAAS_MODE || "disabled").trim();
  if (mode !== "production") {
    return { ok: false, error: "feature_disabled", mode };
  }
  if (flags.production_checkout_enabled !== true) {
    return { ok: false, error: "production_checkout_disabled", mode };
  }
  if (flags.production_webhook_enabled !== true) {
    return { ok: false, error: "production_webhook_disabled", mode };
  }
  if (flags.real_money_mutation_enabled !== true) {
    return { ok: false, error: "real_money_disabled", mode };
  }
  if (flags.diag_checkout_enabled !== true) {
    return { ok: false, error: "diag_checkout_disabled", mode };
  }
  if (flags.CONFENGE_OFFER_CATALOG_PUBLIC !== true) {
    return { ok: false, error: "catalog_not_public", mode };
  }
  const providedHash = String(flags.legal_authority_hash || "").trim();
  if (!providedHash) return { ok: false, error: "legal_hash_missing", mode };
  if (!safeEqual(providedHash, PINNED_LEGAL_HASH)) {
    return { ok: false, error: "legal_hash_mismatch", mode };
  }

  const requestedBase = String(env.ASAAS_PRODUCTION_BASE_URL || DEFAULT_PRODUCTION_BASE).trim() || DEFAULT_PRODUCTION_BASE;
  const baseCheck = assertProductionApiUrl(requestedBase);
  if (!baseCheck.ok) {
    return { ok: false, error: baseCheck.error === "sandbox_host_blocked" ? "sandbox_base_url_blocked" : baseCheck.error, mode };
  }

  const apiKey = String(env.ASAAS_PRODUCTION_API_KEY || "");
  const webhookToken = String(env.ASAAS_PRODUCTION_WEBHOOK_TOKEN || "");
  if (!apiKey) return { ok: false, error: "production_secret_missing", mode };
  if (!webhookToken) return { ok: false, error: "webhook_token_missing", mode };
  if (apiKey.startsWith(SANDBOX_KEY_PREFIX) || apiKey.startsWith("test_") || webhookToken.startsWith(SANDBOX_KEY_PREFIX)) {
    return { ok: false, error: "sandbox_key_blocked", mode };
  }
  if (!apiKey.startsWith(PRODUCTION_KEY_PREFIX) && process.env.NODE_ENV !== "test" && env.NODE_ENV !== "test") {
    return { ok: false, error: "production_key_prefix_invalid", mode };
  }
  if (safeEqual(apiKey, webhookToken)) {
    return { ok: false, error: "webhook_token_must_differ", mode };
  }

  return {
    ok: true,
    mode,
    baseUrl: baseCheck.url,
    apiKey,
    webhookToken,
    webhookApply: flags.webhook_apply_enabled === true,
    onboardingEnabled: flags.onboarding_enabled === true,
    legalHash: PINNED_LEGAL_HASH,
    termsVersion: TERMS_VERSION,
    approvedOffer: APPROVED_OFFER,
    approvedAmountCents: APPROVED_AMOUNT_CENTS,
    timeoutMs: Math.min(Math.max(Number(env.ASAAS_PRODUCTION_TIMEOUT_MS || 8000), 500), 20000),
    maxRetries: 1,
    maxBodyBytes: 64 * 1024,
    minutesToExpire: Math.min(Math.max(Number(env.ASAAS_CHECKOUT_MINUTES || 60), 60), 1440),
    userAgent: "CONFENGE-web-cfg/asaas-production",
  };
}

function requireProductionRuntime(config, { needApiKey = false, needWebhook = false } = {}) {
  if (!config || !config.ok) {
    const error = (config && config.error) || "feature_disabled";
    const statusCode = error === "feature_disabled" || error === "production_checkout_disabled"
      || error === "production_webhook_disabled" || error === "real_money_disabled"
      || error === "diag_checkout_disabled" || error === "catalog_not_public"
      ? 404
      : 403;
    return { ok: false, error, statusCode };
  }
  if (needApiKey && !config.apiKey) return { ok: false, error: "production_secret_missing", statusCode: 503 };
  if (needWebhook && !config.webhookToken) return { ok: false, error: "webhook_token_missing", statusCode: 401 };
  return { ok: true };
}

function verifyWebhookToken(config, provided) {
  if (!config || !config.webhookToken) return false;
  return safeEqual(config.webhookToken, provided);
}

function headerValue(headers, name) {
  if (!headers) return "";
  const want = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === want) return Array.isArray(value) ? value[0] : value;
  }
  return "";
}

module.exports = {
  DEFAULT_PRODUCTION_BASE,
  PRODUCTION_API_HOSTS,
  PRODUCTION_LINK_HOSTS,
  PRODUCTION_KEY_PREFIX,
  SANDBOX_KEY_PREFIX,
  SANDBOX_ENV_KEYS,
  PINNED_LEGAL_HASH,
  APPROVED_OFFER,
  APPROVED_AMOUNT_CENTS,
  TERMS_VERSION,
  CALLBACK_HOST_ALLOW,
  safeEqual,
  hostnameOf,
  assertProductionApiUrl,
  assertProductionLinkUrl,
  assertCallbackUrl,
  resolveProductionConfig,
  requireProductionRuntime,
  verifyWebhookToken,
  headerValue,
};
