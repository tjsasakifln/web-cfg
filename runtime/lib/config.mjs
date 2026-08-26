import { accessSync, constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createRuntimeIdentity,
  detectStorageBackend,
  identityValidationCodes,
  isProductionEnvironment,
} from "./identity.mjs";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_FUNCTIONS_DIR = resolve(REPO_ROOT, "netlify/functions");
export const DEFAULT_NETLIFY_TOML = resolve(REPO_ROOT, "netlify.toml");

function integerSetting(env, key, fallback, { min, max, allowZero = false } = {}) {
  const raw = String(env[key] || "").trim();
  if (!raw) return { value: fallback, error: null };
  const value = Number(raw);
  const minimum = allowZero && value === 0 ? 0 : min;
  if (!Number.isInteger(value) || value < minimum || value > max) {
    return { value: fallback, error: key.toLowerCase() + "_invalid" };
  }
  return { value, error: null };
}

export function isLoopbackHost(host) {
  const value = String(host || "").trim().toLowerCase();
  return value === "127.0.0.1" || value === "::1" || value === "localhost";
}

function safeHost(value) {
  const host = String(value || "127.0.0.1").trim();
  if (!host || /[\s/\\]/.test(host) || host.length > 255) return null;
  return host;
}

function validIpv4Cidr(value) {
  const match = String(value || "").match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) return false;
  return match[1].split(".").every((piece) => Number(piece) >= 0 && Number(piece) <= 255);
}

function pathAccessible(directory) {
  try {
    accessSync(directory, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function loadRuntimeConfig({
  env = process.env,
  now = new Date(),
  nodeVersion = process.version,
} = {}) {
  const production = isProductionEnvironment(env);
  const errors = [];
  const host = safeHost(env.RUNTIME_HOST);
  if (!host) errors.push("runtime_host_invalid");

  const port = integerSetting(env, "RUNTIME_PORT", 8787, {
    min: 1,
    max: 65535,
    allowZero: !production,
  });
  const maxBodyBytes = integerSetting(env, "RUNTIME_MAX_BODY_BYTES", 512 * 1024, {
    min: 1024,
    max: 10 * 1024 * 1024,
  });
  const requestTimeoutMs = integerSetting(env, "RUNTIME_REQUEST_TIMEOUT_MS", 30_000, {
    min: 1000,
    max: 300_000,
  });
  const handlerTimeoutMs = integerSetting(env, "RUNTIME_HANDLER_TIMEOUT_MS", 25_000, {
    min: 100,
    max: 300_000,
  });
  const headersTimeoutMs = integerSetting(env, "RUNTIME_HEADERS_TIMEOUT_MS", 10_000, {
    min: 1000,
    max: 60_000,
  });
  const keepAliveTimeoutMs = integerSetting(env, "RUNTIME_KEEP_ALIVE_TIMEOUT_MS", 5_000, {
    min: 500,
    max: 60_000,
  });
  const shutdownGraceMs = integerSetting(env, "RUNTIME_SHUTDOWN_GRACE_MS", 30_000, {
    min: 100,
    max: 300_000,
  });
  for (const setting of [
    port,
    maxBodyBytes,
    requestTimeoutMs,
    handlerTimeoutMs,
    headersTimeoutMs,
    keepAliveTimeoutMs,
    shutdownGraceMs,
  ]) {
    if (setting.error) errors.push(setting.error);
  }

  const trustProxy = String(env.RUNTIME_TRUST_PROXY || "loopback").trim().toLowerCase();
  if (!["loopback", "none"].includes(trustProxy)) errors.push("runtime_trust_proxy_invalid");
  const trustProxyCidrs = String(env.RUNTIME_TRUST_PROXY_CIDRS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (trustProxyCidrs.some((cidr) => !validIpv4Cidr(cidr))) {
    errors.push("runtime_trust_proxy_cidrs_invalid");
  }
  if (trustProxy === "none" && trustProxyCidrs.length) {
    errors.push("runtime_trust_proxy_cidrs_disabled");
  }
  if (headersTimeoutMs.value > requestTimeoutMs.value) {
    errors.push("runtime_headers_timeout_exceeds_request_timeout");
  }

  const requestedFunctionsDir = String(env.RUNTIME_FUNCTIONS_DIR || "").trim();
  const functionsDir = requestedFunctionsDir
    ? resolve(requestedFunctionsDir)
    : DEFAULT_FUNCTIONS_DIR;
  if (production && requestedFunctionsDir && functionsDir !== DEFAULT_FUNCTIONS_DIR) {
    errors.push("functions_dir_override_forbidden");
  }

  if (
    production
    && host
    && !isLoopbackHost(host)
    && String(env.RUNTIME_ALLOW_PUBLIC_BIND || "") !== "1"
  ) {
    errors.push("public_bind_requires_explicit_override");
  }

  const identity = createRuntimeIdentity({
    env,
    repoRoot: REPO_ROOT,
    now,
    nodeVersion,
  });

  return Object.freeze({
    env,
    production,
    errors: [...new Set(errors)],
    host: host || "127.0.0.1",
    port: port.value,
    maxBodyBytes: maxBodyBytes.value,
    requestTimeoutMs: requestTimeoutMs.value,
    handlerTimeoutMs: handlerTimeoutMs.value,
    headersTimeoutMs: headersTimeoutMs.value,
    keepAliveTimeoutMs: keepAliveTimeoutMs.value,
    shutdownGraceMs: shutdownGraceMs.value,
    trustProxy,
    trustProxyCidrs,
    validateJson: String(env.RUNTIME_VALIDATE_JSON || "1") !== "0",
    functionsDir,
    netlifyTomlPath: DEFAULT_NETLIFY_TOML,
    identity,
  });
}

function check(name, ok, code) {
  return { name, ok: Boolean(ok), code: ok ? "ok" : code };
}

function productionStorePolicy(env) {
  try {
    const require = createRequire(import.meta.url);
    const module = require(resolve(REPO_ROOT, "netlify/functions/lib/lead-store.cjs"));
    if (typeof module.assertProductionStorePolicy !== "function") {
      return { ok: false, code: "production_store_policy_missing" };
    }
    return module.assertProductionStorePolicy(env);
  } catch {
    return { ok: false, code: "production_store_policy_unavailable" };
  }
}

export function evaluateReadiness(config, registry) {
  const checks = [];
  for (const code of config.errors) checks.push(check("runtime_config", false, code));
  checks.push(check("node_runtime", /^v22\./.test(String(config.identity.node_version)), "node_22_required"));
  checks.push(check("private_bind", !config.production || isLoopbackHost(config.host) || String(config.env.RUNTIME_ALLOW_PUBLIC_BIND || "") === "1", "private_bind_required"));
  checks.push(check("json_transport_guard", config.validateJson, "json_transport_guard_required"));

  const identityCodes = identityValidationCodes(config.identity, {
    production: config.production,
  });
  checks.push(check("runtime_identity", identityCodes.length === 0, identityCodes[0] || "identity_invalid"));

  const storage = detectStorageBackend(config.env);
  checks.push(check("storage_selected", storage.backend !== "unconfigured" && storage.backend !== "ambiguous", storage.backend === "ambiguous" ? "storage_backend_ambiguous" : "storage_backend_unconfigured"));
  if (config.production) {
    checks.push(check("portable_storage", storage.backend === "file", "portable_file_storage_required"));
  }
  if (storage.backend === "file") {
    const leadDirectory = String(config.env.LEAD_STORE_DIR || "");
    checks.push(check("lead_store_path", (!config.production || isAbsolute(leadDirectory)) && pathAccessible(leadDirectory), "lead_store_path_unavailable"));
  }

  if (config.production) {
    const correctionDirectory = String(config.env.CORRECTION_STORE_DIR || "");
    checks.push(check("correction_store_path", Boolean(correctionDirectory) && isAbsolute(correctionDirectory) && pathAccessible(correctionDirectory), "correction_store_path_unavailable"));

    const policy = productionStorePolicy(config.env);
    checks.push(check("lead_store_policy", policy.ok === true, policy.code || "lead_store_policy_invalid"));
    checks.push(check("ops_auth", String(config.env.OPS_TOKEN || config.env.REVOPS_TOKEN || "").length >= 16, "ops_token_required"));
    checks.push(check("nurture_token", String(config.env.NURTURE_TOKEN_SECRET || "").length >= 32, "nurture_token_secret_required"));
    checks.push(check("nurture_delivery", String(config.env.RESEND_API_KEY || "").length >= 8, "resend_api_key_required"));
  }

  const definitions = registry && Array.isArray(registry.definitions)
    ? registry.definitions.length
    : 0;
  const registryErrors = registry && Array.isArray(registry.errors)
    ? registry.errors
    : [{ code: "function_registry_unavailable" }];
  checks.push(check("function_registry", definitions > 0 && registryErrors.length === 0 && registry.loadedCount === definitions, registryErrors[0]?.code || "function_registry_empty"));

  const failed = checks.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    status: failed.length === 0 ? "ready" : "not_ready",
    checks,
    contract_version: config.identity.contract_version,
  };
}

export function fatalStartupCodes(config, readiness) {
  const codes = [...config.errors];
  if (config.production) {
    for (const item of readiness.checks || []) {
      if (!item.ok) codes.push(item.code);
    }
  }
  return [...new Set(codes)];
}
