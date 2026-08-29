#!/usr/bin/env node
/** Publish the latest redacted GSC insights to authenticated durable ops state. */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { validateHistoryState } = require("../../netlify/functions/lib/gsc-history.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_INPUT = path.join(root, "data/revops/gsc/insights_latest.json");
const DEFAULT_SYNC_STATE = path.join(root, "data/revops/gsc/last_sync.json");
const DEFAULT_HISTORY_STATE = path.join(root, "data/revops/gsc/history.json");
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
  if (/^(?:sha256:)?[a-f0-9]{16,64}$/i.test(value)) return false;
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  ) return false;
  if (/^(?:https?:\/\/|\/)[^\s]*[?#]/i.test(value)) return true;
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
    insights.fixture !== false ||
    insights.live_baseline_invented !== false ||
    insights.query_text_redacted !== true ||
    insights.raw_query_rows_in_git !== false ||
    insights.readiness_contract_version !== "gsc-readiness/v2" ||
    !/^[a-f0-9]{64}$/.test(String(insights.history_state_sha256 || "")) ||
    !/^[a-f0-9]{64}$/.test(String(insights.snapshot_sha256 || ""))
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

export function validateSyncProvenance(insights, syncState, history) {
  if (
    !syncState ||
    syncState.schema_version !== "gsc-sync-state/v1" ||
    syncState.manifest_schema_version !== "gsc_snapshot_manifest_v1" ||
    syncState.source !== "search_analytics_api" ||
    syncState.synthetic !== false ||
    syncState.fixture !== false ||
    syncState.live_baseline_invented !== false ||
    syncState.truncated === true ||
    syncState.ready_for_product_decisions !== true ||
    syncState.promote_insights !== true ||
    syncState.as_of !== insights.as_of ||
    !history ||
    syncState.history_state_sha256 !== history.state_sha256 ||
    history.readiness?.ready_for_product_decisions !== true ||
    history.last_known_good?.snapshot_sha256 !== syncState.manifest_sha256 ||
    insights.history_state_sha256 !== history.state_sha256 ||
    insights.snapshot_sha256 !== syncState.manifest_sha256
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

export async function restoreHistory({
  output = DEFAULT_HISTORY_STATE,
  baseUrl,
  token,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error("BASE_URL_https_required");
  if (!token || token.length < 16) throw new Error("OPS_TOKEN_required");
  const endpoint = `${baseUrl.replace(/\/$/, "")}/.netlify/functions/ops?action=gsc_history`;
  const response = await fetchImpl(endpoint, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const body = await responseJson(response);
  if (response.status === 404 && body.error === "gsc_history_empty") {
    if (fs.existsSync(output)) fs.unlinkSync(output);
    return { ok: true, empty: true, reason_code: "history_store_empty" };
  }
  if (!response.ok || body.ok !== true || !body.history) {
    throw new Error(`gsc_history_restore_failed:${response.status}:${body.error || "invalid"}`);
  }
  const validation = validateHistoryState(body.history);
  if (!validation.ok || body.meta?.state_sha256 !== body.history.state_sha256) {
    throw new Error(validation.error || "gsc_history_restore_hash_mismatch");
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(body.history, null, 2)}\n`, "utf8");
  return { ok: true, empty: false, state_sha256: body.history.state_sha256 };
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
  historyStatePath = DEFAULT_HISTORY_STATE,
  baseUrl,
  token,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error("BASE_URL_https_required");
  if (!token || token.length < 16) throw new Error("OPS_TOKEN_required");
  const syncState = JSON.parse(fs.readFileSync(syncStatePath, "utf8"));
  const history = JSON.parse(fs.readFileSync(historyStatePath, "utf8"));
  const historyValidation = validateHistoryState(history);
  if (!historyValidation.ok || syncState.history_state_sha256 !== history.state_sha256) {
    throw new Error(historyValidation.error || "gsc_history_sync_hash_mismatch");
  }
  if (
    syncState.source !== "search_analytics_api" ||
    syncState.synthetic !== false ||
    syncState.fixture !== false ||
    syncState.live_baseline_invented !== false
  ) {
    throw new Error("gsc_sync_state_not_publishable");
  }
  const promoteInsights = syncState.promote_insights === true;
  let insights = null;
  let expected = null;
  if (promoteInsights) {
    insights = JSON.parse(fs.readFileSync(input, "utf8"));
    expected = validatePublishable(insights);
    validateSyncProvenance(insights, syncState, history);
  }
  const hasProducerSnapshot = /^[a-f0-9]{64}$/.test(String(syncState.manifest_sha256 || "")) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(syncState.as_of || ""));
  const hasPartialProducerSnapshot = Boolean(syncState.manifest_sha256) !== Boolean(syncState.as_of);
  if (hasPartialProducerSnapshot || ((!hasProducerSnapshot) && (syncState.manifest_sha256 || syncState.as_of))) {
    throw new Error("gsc_sync_producer_manifest_invalid");
  }
  const matchingObservation = hasProducerSnapshot && history.observations.some((observation) =>
    observation.snapshot_sha256 === syncState.manifest_sha256 &&
    observation.as_of === syncState.as_of &&
    observation.observed_at === syncState.last_sync_at
  );
  if (
    (hasProducerSnapshot &&
      (history.last_attempt?.snapshot_sha256 !== syncState.manifest_sha256 ||
        history.last_attempt?.as_of !== syncState.as_of ||
        !matchingObservation)) ||
    (!hasProducerSnapshot &&
      (history.last_attempt?.snapshot_sha256 != null || history.last_attempt?.as_of != null))
  ) {
    throw new Error("gsc_sync_producer_history_mismatch");
  }
  const producer = {
    schema_version: syncState.schema_version,
    manifest_schema_version: syncState.manifest_schema_version,
    manifest_sha256: hasProducerSnapshot ? syncState.manifest_sha256 : null,
    as_of: hasProducerSnapshot ? syncState.as_of : null,
    produced_at: syncState.last_sync_at,
    source: "search_analytics_api",
  };
  const endpoint = `${baseUrl.replace(/\/$/, "")}/.netlify/functions/ops`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const post = await fetchImpl(`${endpoint}?action=gsc_insights_ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify({ producer, history, ...(insights ? { insights } : {}) }),
  });
  const posted = await responseJson(post);
  if (
    !post.ok ||
    posted.ok !== true ||
    posted.history_state_sha256 !== history.state_sha256 ||
    (hasProducerSnapshot &&
      (posted.producer_manifest_sha256 !== producer.manifest_sha256 ||
        posted.consumer_manifest_sha256 !== producer.manifest_sha256)) ||
    (expected &&
      (posted.status !== "CURRENT" ||
        posted.content_sha256 !== expected.content_sha256 ||
        posted.producer_manifest_sha256 !== producer.manifest_sha256 ||
        posted.consumer_manifest_sha256 !== producer.manifest_sha256))
  ) {
    throw new Error(`gsc_insights_ingest_failed:${post.status}:${posted.error || "hash_mismatch"}`);
  }
  const historyGet = await fetchImpl(`${endpoint}?action=gsc_history`, { headers });
  const historyRead = await responseJson(historyGet);
  if (
    !historyGet.ok ||
    historyRead.ok !== true ||
    historyRead.meta?.state_sha256 !== history.state_sha256 ||
    historyRead.history?.state_sha256 !== history.state_sha256 ||
    (hasProducerSnapshot &&
      (historyRead.meta?.manifest_sha256 !== producer.manifest_sha256 ||
        historyRead.meta?.as_of !== producer.as_of))
  ) {
    throw new Error(`gsc_history_read_proof_failed:${historyGet.status}`);
  }
  const get = await fetchImpl(`${endpoint}?action=gsc_insights`, { headers });
  const read = await responseJson(get);
  const expectedStatus = expected ? "CURRENT" : history.readiness.status;
  if (
    !get.ok ||
    read.ok !== (expectedStatus === "CURRENT") ||
    read.status !== expectedStatus ||
    read.meta?.delivery_source !== "durable_store" ||
    read.meta?.history_state_sha256 !== history.state_sha256 ||
    read.meta?.ready_for_product_decisions !== history.readiness.ready_for_product_decisions ||
    (hasProducerSnapshot &&
      (read.meta?.latest_attempt_manifest_sha256 !== producer.manifest_sha256 ||
        read.meta?.latest_attempt_as_of !== producer.as_of ||
        read.meta?.latest_attempt_produced_at !== producer.produced_at ||
        !Number.isFinite(Date.parse(read.meta?.latest_attempt_ingested_at || "")) ||
        !["CURRENT", "STALE"].includes(read.meta?.latest_attempt_source_freshness?.status))) ||
    (expected &&
      (read.meta?.snapshot_content_sha256 !== expected.content_sha256 ||
        read.meta?.as_of !== expected.as_of ||
        read.meta?.producer_as_of !== expected.as_of ||
        read.meta?.consumer_as_of !== expected.as_of ||
        read.meta?.producer_manifest_sha256 !== producer.manifest_sha256 ||
        read.meta?.consumer_manifest_sha256 !== producer.manifest_sha256))
  ) {
    throw new Error(`gsc_insights_read_proof_failed:${get.status}`);
  }
  return {
    ok: read.status === "CURRENT",
    status: read.status,
    durable: true,
    promoted: Boolean(expected),
    as_of: read.meta?.as_of || history.readiness.freshness_as_of || null,
    content_sha256: read.meta?.snapshot_content_sha256 || null,
    history_state_sha256: history.state_sha256,
    snapshot_sha256:
      posted.snapshot_sha256 ||
      read.meta?.latest_attempt_snapshot_sha256 ||
      read.meta?.snapshot_sha256 ||
      null,
    producer_manifest_sha256: posted.producer_manifest_sha256 || null,
    consumer_manifest_sha256: posted.consumer_manifest_sha256 || null,
    producer_as_of: producer.as_of,
    consumer_as_of: read.meta?.consumer_as_of || null,
    source_freshness: read.meta?.latest_attempt_source_freshness || null,
    ingested_at: posted.ingested_at || read.meta?.latest_attempt_ingested_at || null,
    readiness_status: history.readiness.status,
    published_at: read.meta.published_at || posted.published_at || null,
  };
}

export async function rollback({
  snapshotSha256,
  reason,
  baseUrl,
  token,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error("BASE_URL_https_required");
  if (!token || token.length < 16) throw new Error("OPS_TOKEN_required");
  if (!/^[a-f0-9]{64}$/.test(String(snapshotSha256 || ""))) {
    throw new Error("gsc_private_rollback_snapshot_invalid");
  }
  if (!/^[a-z0-9][a-z0-9_:-]{2,79}$/.test(String(reason || ""))) {
    throw new Error("gsc_private_rollback_reason_invalid");
  }
  const endpoint = `${baseUrl.replace(/\/$/, "")}/.netlify/functions/ops`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const postedResponse = await fetchImpl(`${endpoint}?action=gsc_insights_rollback`, {
    method: "POST",
    headers,
    body: JSON.stringify({ snapshot_sha256: snapshotSha256, reason }),
  });
  const posted = await responseJson(postedResponse);
  if (
    !postedResponse.ok ||
    posted.ok !== true ||
    posted.durable !== true ||
    posted.rolled_back_to_snapshot_sha256 !== snapshotSha256 ||
    posted.producer_manifest_sha256 !== posted.consumer_manifest_sha256
  ) {
    throw new Error(`gsc_private_rollback_failed:${postedResponse.status}:${posted.error || "proof_mismatch"}`);
  }
  const readResponse = await fetchImpl(`${endpoint}?action=gsc_insights`, { method: "GET", headers });
  const read = await responseJson(readResponse);
  if (
    !readResponse.ok ||
    read.status !== posted.status ||
    read.meta?.delivery_source !== "durable_store" ||
    read.meta?.snapshot_sha256 !== snapshotSha256 ||
    read.meta?.producer_manifest_sha256 !== posted.producer_manifest_sha256 ||
    read.meta?.consumer_manifest_sha256 !== posted.consumer_manifest_sha256
  ) {
    throw new Error(`gsc_private_rollback_read_proof_failed:${readResponse.status}`);
  }
  return posted;
}

async function main() {
  const baseUrl = process.env.BASE_URL || "https://confenge.com.br";
  const token = process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "";
  if (process.argv.includes("--restore-history")) {
    const restored = await restoreHistory({ baseUrl, token });
    console.log(
      restored.empty
        ? "GSC_HISTORY_RESTORED status=EMPTY"
        : `GSC_HISTORY_RESTORED sha256=${restored.state_sha256}`,
    );
    return;
  }
  const rollbackAt = process.argv.indexOf("--rollback");
  if (rollbackAt >= 0) {
    const reasonAt = process.argv.indexOf("--reason");
    const receipt = await rollback({
      snapshotSha256: process.argv[rollbackAt + 1],
      reason: reasonAt >= 0 ? process.argv[reasonAt + 1] : "operator_selected_known_good",
      baseUrl,
      token,
    });
    console.log(
      `GSC_STATE_ROLLED_BACK status=${receipt.status} snapshot_sha256=${receipt.rolled_back_to_snapshot_sha256} producer_manifest_sha256=${receipt.producer_manifest_sha256} consumer_manifest_sha256=${receipt.consumer_manifest_sha256}`,
    );
    return;
  }
  const inputArg = process.argv.indexOf("--input");
  const input = inputArg >= 0 ? path.resolve(process.argv[inputArg + 1]) : DEFAULT_INPUT;
  const receipt = await publish({
    input,
    baseUrl,
    token,
  });
  const receiptPath = path.join(root, "data/revops/gsc/publish_receipt.json");
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(
    `GSC_STATE_PUBLISHED status=${receipt.status} producer_as_of=${receipt.producer_as_of || "none"} consumer_as_of=${receipt.consumer_as_of || "none"} producer_manifest_sha256=${receipt.producer_manifest_sha256 || "none"} consumer_manifest_sha256=${receipt.consumer_manifest_sha256 || "none"} snapshot_sha256=${receipt.snapshot_sha256 || "none"} history_sha256=${receipt.history_state_sha256}`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`GSC_INSIGHTS_PUBLISH_FAILED ${String(error.message || error)}`);
    process.exit(1);
  });
}
