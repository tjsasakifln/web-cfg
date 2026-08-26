import { execFileSync } from "node:child_process";

export const RUNTIME_CONTRACT_VERSION = "confenge-portable-runtime/v1";
export const RUNTIME_VERSION = "1.0.0";

const FULL_SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const SAFE_PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isProductionEnvironment(env = process.env) {
  return String(env.NODE_ENV || "").trim().toLowerCase() === "production";
}

export function detectStorageBackend(env = process.env) {
  const selected = [];
  if (String(env.LEAD_STORE || "").trim().toLowerCase() === "memory") selected.push("memory");
  if (String(env.LEAD_STORE_DIR || "").trim()) selected.push("file");
  if (String(env.LEAD_STORE_HTTP_URL || "").trim()) selected.push("http");
  if (
    String(env.NETLIFY_BLOBS_CONTEXT || "").trim()
    || (
      String(env.NETLIFY_BLOBS_SITE_ID || env.SITE_ID || env.NETLIFY_SITE_ID || "").trim()
      && String(
        env.NETLIFY_BLOBS_TOKEN
        || env.NETLIFY_API_TOKEN
        || env.NETLIFY_AUTH_TOKEN
        || "",
      ).trim()
    )
  ) {
    selected.push("netlify-blobs");
  }
  if (selected.length === 0) return { backend: "unconfigured", selected };
  if (selected.length > 1) return { backend: "ambiguous", selected };
  return { backend: selected[0], selected };
}

function gitSha(repoRoot) {
  try {
    const value = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    return FULL_SHA.test(value) ? value.toLowerCase() : "unknown";
  } catch {
    return "unknown";
  }
}

function buildTimestamp(env, now, production) {
  const candidate = String(
    env.RUNTIME_BUILD_TIMESTAMP
    || env.BUILD_TIMESTAMP
    || env.BUILD_TIME
    || "",
  ).trim();
  if (!candidate) return production ? "unknown" : now.toISOString();
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "invalid";
}

function releaseSha(env, repoRoot, production) {
  const candidate = String(
    env.RUNTIME_RELEASE_SHA
    || env.RELEASE_SHA
    || env.COMMIT_REF
    || env.GITHUB_SHA
    || "",
  ).trim();
  if (FULL_SHA.test(candidate)) return candidate.toLowerCase();
  return production ? "unknown" : gitSha(repoRoot);
}

function environmentName(env) {
  const value = String(env.NODE_ENV || "development").trim().toLowerCase();
  return SAFE_PROFILE.test(value) ? value : "invalid";
}

function profileName(env, production) {
  const fallback = production ? "portable-production" : "local";
  const value = String(env.RUNTIME_PROFILE || fallback).trim().toLowerCase();
  return SAFE_PROFILE.test(value) ? value : "invalid";
}

export function createRuntimeIdentity({
  env = process.env,
  repoRoot,
  now = new Date(),
  nodeVersion = process.version,
} = {}) {
  const production = isProductionEnvironment(env);
  const storage = detectStorageBackend(env);
  return Object.freeze({
    release_sha: releaseSha(env, repoRoot, production),
    build_timestamp: buildTimestamp(env, now, production),
    runtime_version: RUNTIME_VERSION,
    node_version: String(nodeVersion || "unknown"),
    storage_backend: storage.backend,
    environment: environmentName(env),
    profile: profileName(env, production),
    contract_version: RUNTIME_CONTRACT_VERSION,
  });
}

export function identityValidationCodes(identity, { production = false } = {}) {
  const codes = [];
  if (production && !FULL_SHA.test(String(identity.release_sha || ""))) {
    codes.push("release_sha_required");
  }
  if (
    production
    && (
      identity.build_timestamp === "invalid"
      || !Number.isFinite(Date.parse(String(identity.build_timestamp || "")))
    )
  ) {
    codes.push("build_timestamp_required");
  }
  if (identity.environment === "invalid") codes.push("environment_invalid");
  if (identity.profile === "invalid") codes.push("profile_invalid");
  return codes;
}

export function isFullReleaseSha(value) {
  return FULL_SHA.test(String(value || ""));
}
