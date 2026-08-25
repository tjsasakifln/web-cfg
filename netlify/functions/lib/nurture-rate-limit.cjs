/** In-process abuse guard for the public nurture subscribe endpoint. */
const crypto = require("crypto");

const buckets = new Map();
const PROCESS_HASH_PEPPER = crypto.randomBytes(32);
const MAX_BUCKETS = 10_000;

function positiveEnv(env, name, fallback) {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function privateHash(value, env = process.env) {
  const configured = String(env.IP_HASH_SALT || "");
  const key = configured.length >= 16 ? configured : PROCESS_HASH_PEPPER;
  return crypto.createHmac("sha256", key).update(String(value || "unknown")).digest("hex");
}

function setBucket(key, recent) {
  if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest) buckets.delete(oldest);
  }
  // Refresh insertion order so capacity eviction prefers inactive identities.
  buckets.delete(key);
  buckets.set(key, recent);
}

function hit(key, limit, windowMs, now) {
  const recent = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    setBucket(key, recent);
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)),
    };
  }
  recent.push(now);
  setBucket(key, recent);
  return { allowed: true, retryAfter: 0 };
}

function nurtureRateLimit({ ip, fingerprint, now = Date.now(), env = process.env }) {
  const windowMs = positiveEnv(env, "NURTURE_RATE_WINDOW_MS", 60 * 60 * 1000);
  const maxIp = positiveEnv(env, "NURTURE_RATE_MAX_IP", 5);
  const maxFingerprint = positiveEnv(env, "NURTURE_RATE_MAX_FP", 8);
  const ipKey = `ip:${privateHash(ip, env).slice(0, 24)}`;
  const fingerprintKey = `fp:${String(fingerprint || "unknown").slice(0, 64)}`;
  const ipResult = hit(ipKey, maxIp, windowMs, now);
  if (!ipResult.allowed) return { ...ipResult, reason: "ip" };
  const fingerprintResult = hit(fingerprintKey, maxFingerprint, windowMs, now);
  if (!fingerprintResult.allowed) return { ...fingerprintResult, reason: "fingerprint" };
  return { allowed: true, retryAfter: 0 };
}

function nurtureFingerprint(event, ip, env = process.env) {
  const headers = event?.headers || {};
  const ua = String(headers["user-agent"] || headers["User-Agent"] || "").slice(0, 200);
  const language = String(headers["accept-language"] || headers["Accept-Language"] || "").slice(0, 80);
  return privateHash(`${String(ip || "unknown")}|${ua}|${language}`, env).slice(0, 24);
}

function nurtureIpHash(ip, env = process.env) {
  return privateHash(ip, env).slice(0, 12);
}

function _reset() {
  buckets.clear();
}

module.exports = { nurtureRateLimit, nurtureFingerprint, nurtureIpHash, _reset };
