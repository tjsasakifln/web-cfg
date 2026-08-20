"use strict";

const crypto = require("crypto");

function canonicalDumps(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("non_finite_number");
    }
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalDumps).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalDumps(value[key])}`).join(",")}}`;
  }
  throw new Error("unsupported_type");
}

function digest(obj) {
  return crypto.createHash("sha256").update(canonicalDumps(obj), "utf8").digest("hex");
}

function contentHash(payload) {
  const src = payload && typeof payload === "object" ? payload : {};
  const filtered = {};
  for (const key of Object.keys(src).sort()) {
    if (key === "content_hash") continue;
    filtered[key] = src[key];
  }
  return digest(filtered);
}

function attachHash(payload) {
  const body = { ...(payload || {}) };
  delete body.content_hash;
  return { ...body, content_hash: contentHash(body) };
}

function hashMatches(payload) {
  const claimed = payload && payload.content_hash;
  if (typeof claimed !== "string" || !/^[0-9a-f]{64}$/.test(claimed)) {
    return false;
  }
  return claimed === contentHash(payload);
}

module.exports = {
  canonicalDumps,
  digest,
  contentHash,
  attachHash,
  hashMatches,
};
