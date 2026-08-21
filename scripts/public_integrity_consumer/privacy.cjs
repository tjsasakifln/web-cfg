"use strict";

const { containsCnpj, normalizeCnpj, cnpjNeedles, assertNoCnpjInUrl } = require("../conversion/cnpj.cjs");

const FORMATTED_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
const ISOLATED_14 = /(?<![\dA-Fa-f])\d{14}(?![\dA-Fa-f])/g;
const CNPJ_KEY = /cnpj/i;

function stripCnpjKeys(obj, cnpj) {
  if (Array.isArray(obj)) return obj.map((item) => stripCnpjKeys(item, cnpj));
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      if (CNPJ_KEY.test(key) || key === "queried_cnpj") continue;
      out[key] = stripCnpjKeys(value, cnpj);
    }
    return out;
  }
  if (typeof obj === "string" && cnpj && containsCnpj(obj, cnpj)) return "[redacted]";
  return obj;
}

function redactLog(fields, { cnpj } = {}) {
  const src = fields && typeof fields === "object" ? fields : {};
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (CNPJ_KEY.test(key) || key === "queried_cnpj") continue;
    if (value == null) continue;
    if (typeof value === "object") {
      out[key] = stripCnpjKeys(value, cnpj);
      continue;
    }
    const text = String(value);
    if (cnpj && containsCnpj(text, cnpj)) continue;
    if (FORMATTED_CNPJ.test(text)) continue;
    out[key] = typeof value === "string" ? text.slice(0, 180) : value;
  }
  return out;
}

function scanCnpjLeaks(haystack, cnpj) {
  const text = typeof haystack === "string" ? haystack : JSON.stringify(haystack);
  const hits = [];
  if (cnpj && containsCnpj(text, cnpj)) hits.push("cnpj_value");
  const formatted = text.match(FORMATTED_CNPJ) || [];
  for (const item of formatted) hits.push(`formatted:${item}`);
  const isolated = text.match(ISOLATED_14) || [];
  for (const item of isolated) {
    if (cnpj && item === normalizeCnpj(cnpj)) hits.push(`digits:${item}`);
    else if (!cnpj) hits.push(`digits:${item}`);
  }
  return hits;
}

function scanCnpjLeaksPublic(haystack, cnpj) {
  return scanCnpjLeaks(haystack, cnpj);
}

function analyticsSafe(eventName, payload) {
  const src = payload && typeof payload === "object" ? payload : {};
  const out = { event: String(eventName || "").slice(0, 80) };
  for (const [key, value] of Object.entries(src)) {
    if (CNPJ_KEY.test(key) || key === "queried_cnpj" || key === "records") continue;
    if (value == null) continue;
    if (typeof value === "object") continue;
    const text = String(value).slice(0, 180);
    if (FORMATTED_CNPJ.test(text) || ISOLATED_14.test(text)) continue;
    out[key] = text;
  }
  return out;
}

module.exports = {
  redactLog,
  stripCnpjKeys,
  scanCnpjLeaks,
  scanCnpjLeaksPublic,
  analyticsSafe,
  assertNoCnpjInUrl,
  cnpjNeedles,
  FORMATTED_CNPJ,
  ISOLATED_14,
};
