/**
 * Fail-closed Asaas Sandbox config. Never reads production secrets as fallback.
 */
const crypto = require("crypto");
const { loadFlags } = require("../flags.cjs");

const DEFAULT_SANDBOX_BASE = "https://api-sandbox.asaas.com/v3";
const SANDBOX_API_HOSTS = Object.freeze(["api-sandbox.asaas.com"]);
const SANDBOX_LINK_HOSTS = Object.freeze(["api-sandbox.asaas.com", "sandbox.asaas.com"]);
const PRODUCTION_HOSTS = Object.freeze(["api.asaas.com", "www.asaas.com", "asaas.com"]);
const PRODUCTION_KEY_PREFIX = "$aact_prod_";
const SANDBOX_KEY_PREFIX = "$aact_hmlg_";
const PRODUCTION_ENV_KEYS = Object.freeze([
  "ASAAS_API_KEY",
  "ASAAS_PRODUCTION_API_KEY",
  "ASAAS_ACCESS_TOKEN",
  "ASAAS_WEBHOOK_TOKEN",
  "ASAAS_BASE_URL",
  "ASAAS_WEBHOOK_SECRET",
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
    const url = new URL(String(raw || ""));
    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isProductionHost(host) {
  const name = String(host || "").toLowerCase();
  return PRODUCTION_HOSTS.includes(name);
}

function isSandboxApiHost(host) {
  return SANDBOX_API_HOSTS.includes(String(host || "").toLowerCase());
}

function isAllowedSandboxLinkHost(host) {
  return SANDBOX_LINK_HOSTS.includes(String(host || "").toLowerCase());
}

function assertSandboxApiUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || ""));
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "non_https_url" };
  if (isProductionHost(url.hostname)) return { ok: false, error: "production_host_blocked" };
  if (!isSandboxApiHost(url.hostname)) return { ok: false, error: "host_not_allowlisted" };
  if (url.username || url.password) return { ok: false, error: "url_credentials_blocked" };
  return { ok: true, url: url.toString().replace(/\/$/, "") };
}

function assertSandboxLinkUrl(raw) {
  if (raw == null || raw === "") return { ok: true, url: null };
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return { ok: false, error: "invalid_link_url" };
  }
  if (url.protocol !== "https:") return { ok: false, error: "non_https_url" };
  if (isProductionHost(url.hostname)) return { ok: false, error: "production_host_blocked" };
  if (!isAllowedSandboxLinkHost(url.hostname)) return { ok: false, error: "link_host_not_allowlisted" };
  return { ok: true, url: url.toString() };
}

function sandboxEnabled(env = {}) {
  const value = env.CONFENGE_OFFER_SANDBOX_ENABLED;
  return value === "1" || value === "true";
}

function resolveConfig(env = process.env) {
  const flags = loadFlags(env);
  const mode = String(flags.ASAAS_MODE || "disabled").trim();
  if (flags.decision_blocked_activation) {
    const requestedMode = String(env.ASAAS_MODE || "disabled").trim();
    if (requestedMode !== "disabled" && requestedMode !== "sandbox") {
      return { ok: false, error: "asaas_mode_blocked", mode: requestedMode };
    }
    if (["CONFENGE_PRODUCTION_CHECKOUT", "CONFENGE_PRODUCTION_WEBHOOK", "CONFENGE_REAL_MONEY"]
      .some((name) => env[name] === "1" || env[name] === "true")) {
      return { ok: false, error: "production_money_blocked", mode };
    }
    return { ok: false, error: "decision_blocked_activation", mode };
  }
  if (mode !== "disabled" && mode !== "sandbox") {
    return { ok: false, error: "asaas_mode_blocked", mode };
  }
  if (flags.production_checkout_enabled || flags.production_webhook_enabled || flags.real_money_mutation_enabled) {
    return { ok: false, error: "production_money_blocked", mode };
  }

  const requestedBase = String(env.ASAAS_SANDBOX_BASE_URL || DEFAULT_SANDBOX_BASE).trim() || DEFAULT_SANDBOX_BASE;
  const baseCheck = assertSandboxApiUrl(requestedBase);
  if (!baseCheck.ok) {
    return { ok: false, error: baseCheck.error === "production_host_blocked" ? "production_base_url_blocked" : baseCheck.error, mode };
  }

  const apiKey = String(env.ASAAS_SANDBOX_API_KEY || "");
  const webhookToken = String(env.ASAAS_SANDBOX_WEBHOOK_TOKEN || "");
  const adminToken = String(env.CONFENGE_OFFER_SANDBOX_ADMIN_TOKEN || "");

  if (apiKey.startsWith(PRODUCTION_KEY_PREFIX) || webhookToken.startsWith(PRODUCTION_KEY_PREFIX)) {
    return { ok: false, error: "production_key_blocked", mode };
  }

  return {
    ok: true,
    mode,
    sandboxFlag: sandboxEnabled(env),
    baseUrl: baseCheck.url,
    apiKey,
    webhookToken,
    adminToken,
    timeoutMs: Math.min(Math.max(Number(env.ASAAS_SANDBOX_TIMEOUT_MS || 8000), 500), 20000),
    maxRetries: 1,
    circuitThreshold: 5,
    circuitCooldownMs: 30000,
    maxBodyBytes: 64 * 1024,
    userAgent: "CONFENGE-web-cfg/asaas-sandbox (Node.js; sandbox)",
  };
}

function requireSandboxRuntime(config, { needApiKey = false, needAdmin = false, needWebhook = false } = {}) {
  if (!config || !config.ok) return { ok: false, error: (config && config.error) || "config_invalid" };
  if (config.mode === "disabled") return { ok: false, error: "feature_disabled", statusCode: 404 };
  if (config.mode !== "sandbox") return { ok: false, error: "asaas_mode_blocked", statusCode: 403 };
  if (!config.sandboxFlag) return { ok: false, error: "sandbox_flag_required", statusCode: 403 };
  if (needApiKey && !config.apiKey) return { ok: false, error: "sandbox_secret_missing", statusCode: 503 };
  if (needApiKey && !config.apiKey.startsWith(SANDBOX_KEY_PREFIX) && !config.apiKey.startsWith("test_")) {
    return { ok: false, error: "sandbox_key_prefix_invalid", statusCode: 403 };
  }
  if (needAdmin && !config.adminToken) return { ok: false, error: "admin_token_missing", statusCode: 401 };
  if (needWebhook && !config.webhookToken) return { ok: false, error: "webhook_token_missing", statusCode: 401 };
  return { ok: true };
}

function verifyAdminToken(config, provided) {
  if (!config || !config.adminToken) return false;
  return safeEqual(config.adminToken, provided);
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
  DEFAULT_SANDBOX_BASE,
  SANDBOX_API_HOSTS,
  SANDBOX_LINK_HOSTS,
  PRODUCTION_HOSTS,
  PRODUCTION_KEY_PREFIX,
  SANDBOX_KEY_PREFIX,
  PRODUCTION_ENV_KEYS,
  safeEqual,
  hostnameOf,
  isProductionHost,
  isSandboxApiHost,
  isAllowedSandboxLinkHost,
  assertSandboxApiUrl,
  assertSandboxLinkUrl,
  sandboxEnabled,
  resolveConfig,
  requireSandboxRuntime,
  verifyAdminToken,
  verifyWebhookToken,
  headerValue,
};
