"use strict";

const crypto = require("crypto");
const { TOKEN_BYTES, TOKEN_TTL_SECONDS } = require("./constants.cjs");

function mintToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function mintCorrelationId() {
  return `pi-${crypto.randomBytes(8).toString("hex")}`;
}

function tokenLooksOpaque(token) {
  const t = String(token || "");
  if (t.length < 32) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return false;
  if (/\d{14}/.test(t)) return false;
  if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(t)) return false;
  return true;
}

function expiresAt(now, ttlSeconds = TOKEN_TTL_SECONDS) {
  const ms = (now instanceof Date ? now.getTime() : Date.parse(now) || Date.now()) + ttlSeconds * 1000;
  return new Date(ms).toISOString();
}

function isExpired(expires, now) {
  if (!expires) return true;
  const exp = Date.parse(expires);
  const current = now instanceof Date ? now.getTime() : Date.parse(now) || Date.now();
  if (!Number.isFinite(exp)) return true;
  return exp <= current;
}

module.exports = {
  mintToken,
  mintCorrelationId,
  tokenLooksOpaque,
  expiresAt,
  isExpired,
};
