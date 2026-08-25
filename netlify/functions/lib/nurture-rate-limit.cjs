/** In-process abuse guard for the public nurture subscribe endpoint. */
const crypto = require("crypto");

const buckets = new Map();

function positiveEnv(env, name, fallback) {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hit(key, limit, windowMs, now) {
  const recent = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)),
    };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true, retryAfter: 0 };
}

function nurtureRateLimit({ ip, fingerprint, now = Date.now(), env = process.env }) {
  const windowMs = positiveEnv(env, "NURTURE_RATE_WINDOW_MS", 60 * 60 * 1000);
  const maxIp = positiveEnv(env, "NURTURE_RATE_MAX_IP", 5);
  const maxFingerprint = positiveEnv(env, "NURTURE_RATE_MAX_FP", 8);
  const ipKey = `ip:${crypto.createHash("sha256").update(String(ip || "unknown")).digest("hex").slice(0, 24)}`;
  const fingerprintKey = `fp:${String(fingerprint || "unknown").slice(0, 64)}`;
  const ipResult = hit(ipKey, maxIp, windowMs, now);
  if (!ipResult.allowed) return { ...ipResult, reason: "ip" };
  const fingerprintResult = hit(fingerprintKey, maxFingerprint, windowMs, now);
  if (!fingerprintResult.allowed) return { ...fingerprintResult, reason: "fingerprint" };
  return { allowed: true, retryAfter: 0 };
}

function nurtureFingerprint(event) {
  const headers = event?.headers || {};
  const ua = String(headers["user-agent"] || headers["User-Agent"] || "").slice(0, 200);
  const language = String(headers["accept-language"] || headers["Accept-Language"] || "").slice(0, 80);
  return crypto.createHash("sha256").update(`${ua}|${language}`).digest("hex").slice(0, 24);
}

function _reset() {
  buckets.clear();
}

module.exports = { nurtureRateLimit, nurtureFingerprint, _reset };
