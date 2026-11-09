"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const client = require("./lib/market-radar-client.cjs");

const DEFAULT_ROOT = "/var/lib/confenge-market-radar";
const IDS = /^[a-f0-9]{24}$/;
const UFS = new Set(["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]);
const MONTHS = new Set(["3", "6", "12", "24", "all"]);
const ENDING = new Set(["all", "90", "180"]);
const SORT = new Set(["recent", "ending"]);
const limiter = new Map();
const LIMIT_WINDOW = 5 * 60_000;
const LIMIT_COUNT = 60;
const LIMIT_KEYS = 2048;

function response(statusCode, body, extra = {}, head = false) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
    body: head ? "" : JSON.stringify(body),
  };
}

function rootDirectory() {
  const profile = String(process.env.RUNTIME_PROFILE || "").toLowerCase();
  const production = process.env.NODE_ENV === "production" || profile === "netcup-production";
  if (production) return DEFAULT_ROOT;
  return path.resolve(process.env.MARKET_RADAR_DIR || DEFAULT_ROOT);
}

function headers(event) {
  const result = {};
  for (const [key, value] of Object.entries(event.headers || {})) result[key.toLowerCase()] = String(value || "");
  return result;
}

function sameSite(event) {
  const h = headers(event);
  if (h["sec-fetch-site"] === "cross-site") return false;
  if (!h.origin) return true;
  try {
    const host = new URL(h.origin).hostname;
    if (host === "confenge.com.br" || host === "www.confenge.com.br") return true;
    return process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(host);
  } catch { return false; }
}

function clientKey(event) {
  const h = headers(event);
  const ip = (h["x-forwarded-for"] || h["client-ip"] || "unknown").split(",")[0].trim().slice(0, 80);
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

function rateLimit(event) {
  const now = Date.now();
  for (const [key, bucket] of limiter) if (now - bucket.start >= LIMIT_WINDOW) limiter.delete(key);
  while (limiter.size >= LIMIT_KEYS) limiter.delete(limiter.keys().next().value);
  const key = clientKey(event);
  const bucket = limiter.get(key);
  if (!bucket) { limiter.set(key, { start: now, count: 1 }); return { ok: true }; }
  if (bucket.count >= LIMIT_COUNT) return { ok: false, retry: Math.max(1, Math.ceil((bucket.start + LIMIT_WINDOW - now) / 1000)) };
  bucket.count += 1;
  return { ok: true };
}

function parseBody(event) {
  let raw = String(event.body || "");
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  if (Buffer.byteLength(raw) > 4096) return { ok: false, error: "body_too_large" };
  try {
    const data = raw.trim() ? JSON.parse(raw) : {};
    return data && typeof data === "object" && !Array.isArray(data) ? { ok: true, data } : { ok: false, error: "body_invalid" };
  } catch { return { ok: false, error: "body_invalid" }; }
}

function normalizeQuery(value) {
  const text = String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!text) return { ok: true, q: "", match: "" };
  if (text.length > 120 || /@|(?:\d[\s()./+_-]*){10,}|\b\d{4,5}[- ]\d{4}\b/.test(text)) return { ok: false };
  const tokens = text.toLocaleLowerCase("pt-BR").match(/[\p{L}\p{N}]+/gu) || [];
  if (!tokens.length || tokens.length > 8 || tokens.some((token) => token.length < 2 || token.length > 32)) return { ok: false };
  const safe = tokens.map((token) => `"${token.replaceAll('"', '""')}"${token.length >= 3 ? "*" : ""}`);
  return { ok: true, q: text, match: safe.join(" AND ") };
}

function filters(input) {
  const allowed = new Set(["q","uf","months","ending","sort","page","buyer","supplier"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return { ok: false, error: "filter_unknown" };
  const query = normalizeQuery(input.q);
  if (!query.ok) return { ok: false, error: "query_invalid" };
  const uf = String(input.uf || "").toUpperCase();
  const months = String(input.months || "12");
  const ending = String(input.ending || "all");
  const sort = String(input.sort || "recent");
  const page = Number(input.page || 1);
  const buyer = String(input.buyer || "");
  const supplier = String(input.supplier || "");
  if ((uf && !UFS.has(uf)) || !MONTHS.has(months) || !ENDING.has(ending) || !SORT.has(sort) || !Number.isInteger(page) || page < 1 || page > 100 || (buyer && !IDS.test(buyer)) || (supplier && !IDS.test(supplier))) {
    return { ok: false, error: "filter_invalid" };
  }
  return { ok: true, value: { q: query.q, match: query.match, uf, months, ending, sort, page, buyer, supplier } };
}

function publicMeta(meta) {
  return {
    schema: meta.schema,
    generated_at: meta.generated_at,
    source_as_of: meta.source_as_of,
    ingestion_latest_at: meta.ingestion_latest_at || null,
    window_start: meta.window_start,
    window_end: meta.window_end,
    record_count: meta.record_count,
    excluded_count: meta.excluded_count,
    coverage_note: meta.coverage_note,
    source: meta.source,
    state: meta.state,
    value_note: meta.value_note,
    value_aggregation: false,
    limitations: [...meta.limitations],
    stale: false,
  };
}

exports.handler = async (event) => {
  const method = String(event.httpMethod || "GET").toUpperCase();
  if (!["GET", "HEAD", "POST"].includes(method)) return response(405, { ok: false, error: "method_not_allowed", message: "Método não permitido." }, { Allow: "GET, HEAD, POST" });
  if (event.queryStringParameters && Object.keys(event.queryStringParameters).length) return response(400, { ok: false, error: "query_string_forbidden", message: "Use o corpo seguro da consulta." });
  if (!sameSite(event)) return response(403, { ok: false, error: "origin_denied", message: "Origem não autorizada." });
  const limit = rateLimit(event);
  if (!limit.ok) return response(429, { ok: false, error: "rate_limited", message: "Muitas consultas. Tente novamente em alguns minutos." }, { "Retry-After": String(limit.retry) }, method === "HEAD");
  try {
    if (method === "GET" || method === "HEAD") {
      const result = await client.request("meta", rootDirectory());
      return response(200, { ok: true, meta: publicMeta(result.meta) }, { ETag: `"${result.hash}"`, "Cache-Control": "public, max-age=60" }, method === "HEAD");
    }
    const parsed = parseBody(event);
    if (!parsed.ok) return response(400, { ok: false, error: parsed.error, message: "Requisição inválida." });
    const checked = filters(parsed.data);
    if (!checked.ok) return response(422, { ok: false, error: checked.error, message: "Revise os filtros da consulta." });
    const result = await client.request("query", rootDirectory(), checked.value);
    return response(200, {
      ok: true,
      meta: publicMeta(result.meta),
      filters: { ...checked.value, match: undefined },
      summary: result.summary,
      buyers: result.buyers,
      suppliers: result.suppliers,
      records: result.records,
      pagination: result.pagination,
    });
  } catch (error) {
    const status = Number(error.status) || 503;
    return response(status, { ok: false, error: error.code || "data_unavailable", message: status === 503 ? "Os dados do radar estão temporariamente indisponíveis." : "Não foi possível concluir a consulta." }, status === 503 ? { "Retry-After": "60" } : {});
  }
};

exports._test = { filters, normalizeQuery, rateLimit, rootDirectory, limiter, publicMeta };
