/**
 * In-process rate limiting by IP hash + technical fingerprint.
 * Not a global distributed limiter; pairs with Turnstile for abuse control.
 * Optional File/Blob bucket via injected store interface with get/put.
 */
const crypto = require("crypto");

const WINDOW_MS = Number(process.env.LEAD_RATE_WINDOW_MS || 10 * 60 * 1000);
const MAX_PER_IP = Number(process.env.LEAD_RATE_MAX_IP || 8);
const MAX_PER_FP = Number(process.env.LEAD_RATE_MAX_FP || 12);

/** @type {Map<string, number[]>} */
const buckets = new Map();

function prune(tsList, now) {
  return tsList.filter((t) => now - t < WINDOW_MS);
}

function checkAndHit(key, max) {
  const now = Date.now();
  const prev = prune(buckets.get(key) || [], now);
  if (prev.length >= max) {
    buckets.set(key, prev);
    const retryAfter = Math.ceil((prev[0] + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter), remaining: 0 };
  }
  prev.push(now);
  buckets.set(key, prev);
  return { allowed: true, remaining: Math.max(0, max - prev.length), retryAfter: 0 };
}

function rateLimit({ ip, fingerprint }) {
  const ipKey = `ip:${crypto.createHash("sha256").update(String(ip || "unknown")).digest("hex").slice(0, 24)}`;
  const fpKey = `fp:${String(fingerprint || "none")}`;
  const ipRes = checkAndHit(ipKey, MAX_PER_IP);
  if (!ipRes.allowed) {
    return { allowed: false, reason: "ip", retryAfter: ipRes.retryAfter };
  }
  const fpRes = checkAndHit(fpKey, MAX_PER_FP);
  if (!fpRes.allowed) {
    return { allowed: false, reason: "fingerprint", retryAfter: fpRes.retryAfter };
  }
  return {
    allowed: true,
    remaining: Math.min(ipRes.remaining, fpRes.remaining),
  };
}

/** Test helper */
function _reset() {
  buckets.clear();
}

module.exports = {
  rateLimit,
  WINDOW_MS,
  MAX_PER_IP,
  MAX_PER_FP,
  _reset,
};
