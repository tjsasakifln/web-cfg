#!/usr/bin/env node
/** Read-only verifier for the authenticated private GSC consumer. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_AGE_MS = 14 * 864e5;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function unknown(reasonCode) {
  return {
    ok: false,
    status: "UNKNOWN",
    reason_codes: [reasonCode],
    producer_manifest_sha256: null,
    consumer_manifest_sha256: null,
    as_of: null,
    delivery_source: null,
  };
}

export function evaluateConsumerPayload(payload, { now = new Date() } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return unknown("consumer_payload_invalid");
  }
  const meta = payload.meta;
  const insights = payload.insights;
  if (payload.status === "STALE") {
    return {
      ...unknown(meta?.reason_codes?.[0] || "snapshot_stale"),
      status: "STALE",
      producer_manifest_sha256: meta?.producer_manifest_sha256 || null,
      consumer_manifest_sha256: meta?.consumer_manifest_sha256 || null,
      as_of: meta?.as_of || null,
      delivery_source: meta?.delivery_source || null,
    };
  }
  if (payload.status === "UNKNOWN") {
    return {
      ...unknown(meta?.reason_codes?.[0] || "consumer_unknown"),
      delivery_source: meta?.delivery_source || null,
    };
  }
  if (!meta || !insights || typeof meta !== "object" || typeof insights !== "object") {
    return unknown("consumer_snapshot_absent");
  }
  if (
    payload.ok !== true ||
    payload.status !== "CURRENT" ||
    payload.access_mode !== "READ_WRITE" ||
    meta.schema_version !== "confenge-private-gsc-snapshot/v1" ||
    meta.manifest_schema_version !== "gsc_snapshot_manifest_v1" ||
    meta.delivery_source !== "durable_store" ||
    meta.ready_for_product_decisions !== true ||
    meta.source_freshness?.status !== "CURRENT" ||
    insights.ready_for_product_decisions !== true ||
    insights.readiness_status !== "CURRENT" ||
    insights.readiness_access_mode !== "READ_WRITE"
  ) {
    return unknown("consumer_not_current");
  }
  const producerManifest = String(meta.producer_manifest_sha256 || "");
  const consumerManifest = String(meta.consumer_manifest_sha256 || "");
  if (
    !SHA256_RE.test(producerManifest) ||
    producerManifest !== consumerManifest ||
    insights.snapshot_sha256 !== producerManifest
  ) {
    return unknown("manifest_hash_mismatch");
  }
  if (
    !SHA256_RE.test(String(meta.snapshot_sha256 || "")) ||
    !SHA256_RE.test(String(meta.history_state_sha256 || "")) ||
    insights.history_state_sha256 !== meta.history_state_sha256 ||
    !SHA256_RE.test(String(meta.content_sha256 || "")) ||
    !SHA256_RE.test(String(meta.snapshot_content_sha256 || "")) ||
    sha256(JSON.stringify(insights)) !== meta.content_sha256 ||
    meta.as_of !== insights.as_of ||
    meta.producer_as_of !== meta.as_of ||
    meta.consumer_as_of !== meta.as_of ||
    meta.source !== "search_analytics_api" ||
    insights.source !== "search_analytics_api" ||
    insights.synthetic !== false ||
    insights.fixture !== false ||
    insights.live_baseline_invented !== false ||
    insights.query_text_redacted !== true ||
    insights.raw_query_rows_in_git !== false
  ) {
    return unknown("snapshot_integrity_mismatch");
  }
  const nowMs = now.getTime();
  const asOfStart = Date.parse(`${meta.as_of || ""}T00:00:00Z`);
  const asOfEnd = asOfStart + 864e5 - 1;
  const producedAt = Date.parse(meta.produced_at || "");
  const ingestedAt = Date.parse(meta.ingested_at || "");
  if (![nowMs, asOfStart, producedAt, ingestedAt].every(Number.isFinite)) {
    return unknown("freshness_unreadable");
  }
  if (producedAt > nowMs + 5 * 60_000 || ingestedAt > nowMs + 5 * 60_000) {
    return unknown("freshness_unreadable");
  }
  if (
    nowMs - asOfEnd > MAX_AGE_MS ||
    nowMs - producedAt > MAX_AGE_MS ||
    nowMs - ingestedAt > MAX_AGE_MS
  ) {
    return {
      ...unknown("snapshot_stale"),
      status: "STALE",
      producer_manifest_sha256: producerManifest,
      consumer_manifest_sha256: consumerManifest,
      as_of: meta.as_of,
      delivery_source: meta.delivery_source,
    };
  }
  return {
    ok: true,
    status: "CURRENT",
    schema_version: meta.schema_version,
    manifest_schema_version: meta.manifest_schema_version,
    snapshot_sha256: meta.snapshot_sha256,
    snapshot_content_sha256: meta.snapshot_content_sha256,
    producer_manifest_sha256: producerManifest,
    consumer_manifest_sha256: consumerManifest,
    as_of: meta.as_of,
    producer_as_of: meta.producer_as_of,
    consumer_as_of: meta.consumer_as_of,
    produced_at: meta.produced_at,
    ingested_at: meta.ingested_at,
    delivery_source: meta.delivery_source,
    reason_codes: [],
  };
}

export async function probePrivateConsumer({
  baseUrl,
  token,
  now = new Date(),
  timeoutMs = 10_000,
  fetchImpl = fetch,
}) {
  if (!/^https:\/\//.test(String(baseUrl || ""))) return unknown("base_url_https_required");
  if (String(token || "").length < 16) return unknown("ops_token_required");
  const endpoint = `${String(baseUrl).replace(/\/$/, "")}/.netlify/functions/ops?action=gsc_insights`;
  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return unknown(`consumer_http_${response.status}`);
    let payload;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      return unknown("consumer_non_json");
    }
    return evaluateConsumerPayload(payload, { now });
  } catch (error) {
    const timeout = error?.name === "AbortError" || error?.name === "TimeoutError";
    return unknown(timeout ? "consumer_timeout" : "consumer_request_failed");
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const fixtureAt = argv.indexOf("--fixture");
  const nowAt = argv.indexOf("--now");
  const now = nowAt >= 0 ? new Date(argv[nowAt + 1]) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("GSC_FRESHNESS_NOW_INVALID");
  let payload;
  if (fixtureAt >= 0) {
    const fixture = String(argv[fixtureAt + 1] || "");
    if (!new Set(["current", "stale", "unknown"]).has(fixture)) {
      throw new Error("GSC_FRESHNESS_FIXTURE_INVALID");
    }
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures",
      `gsc-consumer-${fixture}.json`,
    );
    payload = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  } else {
    const result = await probePrivateConsumer({
      baseUrl: process.env.BASE_URL || "https://confenge.com.br",
      token: process.env.OPS_TOKEN || process.env.REVOPS_TOKEN || "",
      now,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.ok ? 0 : 1;
  }
  const result = evaluateConsumerPayload(payload, { now });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stdout.write(`${JSON.stringify(unknown(String(error.message || error)))}\n`);
      process.exitCode = 1;
    },
  );
}
