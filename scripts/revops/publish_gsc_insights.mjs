#!/usr/bin/env node
/** Publish the latest redacted GSC insights to authenticated durable ops state. */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_INPUT = path.join(root, "data/revops/gsc/insights_latest.json");
const DEFAULT_SYNC_STATE = path.join(root, "data/revops/gsc/last_sync.json");
const SAFE_GSC_QUERY_KEYS = new Set([
  "query_class",
  "query_count",
  "query_hash",
  "query_text_redacted",
  "raw_query_rows_in_git",
]);

function isSensitiveGscKey(key) {
  const normalized = String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (SAFE_GSC_QUERY_KEYS.has(normalized) || /^\d+_emerging_terms$/.test(normalized)) return false;
  const tokens = new Set(normalized.split("_").filter(Boolean));
  return [
    "query", "queries", "term", "terms", "keyword", "keywords", "termo", "termos",
    "consulta", "consultas", "email", "telefone", "phone", "nome", "name", "cpf",
    "cnpj", "whatsapp", "pii", "contact", "contato", "person", "pessoa", "customer",
    "cliente", "user", "usuario", "fullname", "username",
  ].some((token) => tokens.has(token));
}

function isSensitiveGscValue(value) {
  if (typeof value !== "string") return false;
  return /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value) ||
    /(?:\+?\d[\s().-]*){10,15}/.test(value) ||
    /(?:wa\.me|whatsapp\.com)\//i.test(value);
}

export function contentHash(insights) {
  return crypto.createHash("sha256").update(JSON.stringify(insights)).digest("hex");
}

export function validatePublishable(insights, { now = new Date() } = {}) {
  if (!insights || typeof insights !== "object" || Array.isArray(insights)) {
    throw new Error("gsc_insights_invalid");
  }
  let sensitiveKey = null;
  let sensitiveValue = false;
  function inspect(value) {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (isSensitiveGscKey(key)) sensitiveKey ||= key;
        inspect(item);
      }
    } else if (isSensitiveGscValue(value)) {
      sensitiveValue = true;
    }
  }
  inspect(insights);
  if (sensitiveKey || sensitiveValue) {
    throw new Error("gsc_insights_sensitive_field");
  }
  if (
    insights.source !== "search_analytics_api" ||
    insights.ready_for_product_decisions !== true ||
    insights.synthetic !== false ||
    insights.query_text_redacted !== true ||
    insights.raw_query_rows_in_git !== false
  ) {
    throw new Error("gsc_insights_not_product_ready");
  }
  const generatedAt = Date.parse(insights.generated_at || "");
  const asOf = Date.parse(`${insights.as_of || ""}T23:59:59Z`);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(asOf)) {
    throw new Error("gsc_insights_invalid_freshness");
  }
  const maxAgeMs = 14 * 864e5;
  if (
    now.getTime() - generatedAt > maxAgeMs ||
    now.getTime() - asOf > maxAgeMs ||
    generatedAt > now.getTime() + 5 * 60_000 ||
    asOf > now.getTime() + 864e5
  ) {
    throw new Error("gsc_insights_stale");
  }
  return { content_sha256: contentHash(insights), as_of: insights.as_of };
}

export function validateSyncProvenance(insights, syncState) {
  if (
    !syncState ||
    syncState.source !== "search_analytics_api" ||
    syncState.synthetic !== false ||
    syncState.truncated === true ||
    syncState.ready_for_product_decisions !== true ||
    syncState.as_of !== insights.as_of
  ) {
    throw new Error("gsc_insights_sync_provenance_invalid");
  }
  const syncAt = Date.parse(syncState.last_sync_at || "");
  const generatedAt = Date.parse(insights.generated_at || "");
  if (!Number.isFinite(syncAt) || !Number.isFinite(generatedAt) || generatedAt + 5000 < syncAt) {
    throw new Error("gsc_insights_not_generated_by_current_sync");
  }
  return true;
}

async function responseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`gsc_insights_non_json_response:${response.status}`);
  }
}

export async function publish({
  input = DEFAULT_INPUT,
  syncStatePath = DEFAULT_SYNC_STATE,
  baseUrl,
  token,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error("BASE_URL_https_required");
  if (!token || token.length < 16) throw new Error("OPS_TOKEN_required");
  const insights = JSON.parse(fs.readFileSync(input, "utf8"));
  const expected = validatePublishable(insights);
  const syncState = JSON.parse(fs.readFileSync(syncStatePath, "utf8"));
  validateSyncProvenance(insights, syncState);
  const endpoint = `${baseUrl.replace(/\/$/, "")}/.netlify/functions/ops`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const post = await fetchImpl(`${endpoint}?action=gsc_insights_ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify({ insights }),
  });
  const posted = await responseJson(post);
  if (!post.ok || posted.ok !== true || posted.content_sha256 !== expected.content_sha256) {
    throw new Error(`gsc_insights_ingest_failed:${post.status}:${posted.error || "hash_mismatch"}`);
  }
  const get = await fetchImpl(`${endpoint}?action=gsc_insights`, { headers });
  const read = await responseJson(get);
  if (
    !get.ok ||
    read.ok !== true ||
    read.meta?.delivery_source !== "durable_store" ||
    read.meta?.content_sha256 !== expected.content_sha256 ||
    read.meta?.as_of !== expected.as_of
  ) {
    throw new Error(`gsc_insights_read_proof_failed:${get.status}`);
  }
  return {
    ok: true,
    durable: true,
    as_of: expected.as_of,
    content_sha256: expected.content_sha256,
    published_at: read.meta.published_at || posted.published_at || null,
  };
}

async function main() {
  const inputArg = process.argv.indexOf("--input");
  const input = inputArg >= 0 ? path.resolve(process.argv[inputArg + 1]) : DEFAULT_INPUT;
  const receipt = await publish({
    input,
    baseUrl: process.env.BASE_URL || "https://confenge.com.br",
    token: process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "",
  });
  const receiptPath = path.join(root, "data/revops/gsc/publish_receipt.json");
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(`GSC_INSIGHTS_PUBLISHED as_of=${receipt.as_of} sha256=${receipt.content_sha256}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`GSC_INSIGHTS_PUBLISH_FAILED ${String(error.message || error)}`);
    process.exit(1);
  });
}
