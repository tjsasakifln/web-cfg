#!/usr/bin/env node
import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import {
  contentHash,
  publish,
  restoreHistory,
  rollback,
  validatePublishable,
  validateSyncProvenance,
} from "./publish_gsc_insights.mjs";

const require = createRequire(import.meta.url);
const { historyHash, observationHash, validateHistoryState } = require("../../netlify/functions/lib/gsc-history.cjs");

let failed = 0;
function check(name, condition, detail = "") {
  console.log(condition ? "PASS" : "FAIL", name, detail);
  if (!condition) failed += 1;
}

const now = new Date();
const insights = {
  source: "search_analytics_api",
  as_of: now.toISOString().slice(0, 10),
  generated_at: now.toISOString(),
  ready_for_product_decisions: true,
  synthetic: false,
  fixture: false,
  live_baseline_invented: false,
  query_text_redacted: true,
  raw_query_rows_in_git: false,
  "11_emerging_terms": [],
  analyses: [{ query_hash: "sha256:abc123", clicks: 2 }],
};
const asOf = insights.as_of;
const observations = [0, 1, 2].map((offset) => {
  const observation = {
    source: "search_analytics_api",
    synthetic: false,
    complete: true,
    as_of: new Date(Date.parse(`${asOf}T00:00:00Z`) - (2 - offset) * 864e5).toISOString().slice(0, 10),
    start: new Date(Date.parse(`${asOf}T00:00:00Z`) - (29 - offset) * 864e5).toISOString().slice(0, 10),
    end: new Date(Date.parse(`${asOf}T00:00:00Z`) - (2 - offset) * 864e5).toISOString().slice(0, 10),
    observed_dates: Array.from({ length: 28 }, (_, day) =>
      new Date(Date.parse(`${asOf}T00:00:00Z`) - (29 - offset - day) * 864e5).toISOString().slice(0, 10)
    ),
    reprocessed_dates: Array.from({ length: 3 }, (_, day) =>
      new Date(Date.parse(`${asOf}T00:00:00Z`) - (4 - offset - day) * 864e5).toISOString().slice(0, 10)
    ),
    snapshot_sha256: String(offset + 1).repeat(64),
    observed_at: new Date(now.getTime() - (2 - offset) * 864e5).toISOString(),
    run_id: `run-${offset + 1}`,
  };
  observation.observation_id = observationHash(observation);
  return observation;
});
const observedDates = [...new Set(observations.flatMap((observation) => observation.observed_dates))]
  .filter((day) => day <= asOf)
  .slice(-28);
let history = {
  schema: "confenge_private_gsc_history_v1",
  contract_version: "gsc-readiness/v2",
  window_days: 28,
  minimum_distinct_as_of: 3,
  max_as_of_lag_days: 14,
  created_at: observations[0].observed_at,
  updated_at: observations[2].observed_at,
  parent_state_sha256: null,
  observations,
  last_attempt: {
    attempted_at: observations[2].observed_at,
    run_id: "run-3",
    outcome: "OBSERVATION_MERGED",
    as_of: asOf,
    snapshot_sha256: observations[2].snapshot_sha256,
    reason_codes: [],
  },
  last_known_good: {
    observation_id: observations[2].observation_id,
    snapshot_sha256: observations[2].snapshot_sha256,
    as_of: asOf,
    observed_at: observations[2].observed_at,
  },
  readiness: {
    ready_for_product_decisions: true,
    status: "READY",
    access_mode: "READ_WRITE",
    reason_codes: [],
    window_start: observedDates[0],
    window_end: asOf,
    observed_dates: observedDates,
    missing_dates: [],
    distinct_as_of: 3,
    freshness_as_of: asOf,
  },
};
history.state_sha256 = historyHash(history);
insights.readiness_contract_version = "gsc-readiness/v2";
insights.history_state_sha256 = history.state_sha256;
insights.snapshot_sha256 = history.last_known_good.snapshot_sha256;
check("history_contract_valid", validateHistoryState(history).ok);

check("publishable_redacted_snapshot", validatePublishable(insights).as_of === insights.as_of);
const syncState = {
  schema_version: "gsc-sync-state/v1",
  manifest_schema_version: "gsc_snapshot_manifest_v1",
  source: "search_analytics_api",
  synthetic: false,
  fixture: false,
  live_baseline_invented: false,
  truncated: false,
  ready_for_product_decisions: true,
  as_of: insights.as_of,
  last_sync_at: insights.generated_at,
  promote_insights: true,
  history_state_sha256: history.state_sha256,
  manifest_sha256: history.last_known_good.snapshot_sha256,
};
check("current_sync_provenance", validateSyncProvenance(insights, syncState, history));
for (const [name, patch] of [
  ["fixture_snapshot_rejected", { fixture: true }],
  ["invented_baseline_rejected", { live_baseline_invented: true }],
]) {
  try {
    validatePublishable({ ...insights, ...patch });
    check(name, false);
  } catch (error) {
    check(name, error.message === "gsc_insights_not_product_ready", error.message);
  }
}
try {
  validateSyncProvenance(insights, { ...syncState, fixture: true }, history);
  check("fixture_sync_provenance_rejected", false);
} catch (error) {
  check("fixture_sync_provenance_rejected", error.message === "gsc_insights_sync_provenance_invalid", error.message);
}
try {
  validatePublishable({ ...insights, query: "private raw query" });
  check("raw_query_rejected", false);
} catch (error) {
  check("raw_query_rejected", error.message === "gsc_insights_sensitive_field", error.message);
}
try {
  validatePublishable({ ...insights, analyses: [{ search_term: "private nested term" }] });
  check("nested_raw_search_term_rejected", false);
} catch (error) {
  check("nested_raw_search_term_rejected", error.message === "gsc_insights_sensitive_field", error.message);
}
try {
  validatePublishable({ ...insights, analyses: [{ note: "contact me at private@example.com" }] });
  check("email_like_value_rejected", false);
} catch (error) {
  check("email_like_value_rejected", error.message === "gsc_insights_sensitive_field", error.message);
}
try {
  validatePublishable({ ...insights, analyses: [{ contactPhoneNumber: "redacted" }] });
  check("dynamic_pii_key_rejected", false);
} catch (error) {
  check("dynamic_pii_key_rejected", error.message === "gsc_insights_sensitive_field", error.message);
}
try {
  validatePublishable({ ...insights, analyses: [{ note: "+55 (48) 99999-0000" }] });
  check("phone_like_value_rejected", false);
} catch (error) {
  check("phone_like_value_rejected", error.message === "gsc_insights_sensitive_field", error.message);
}
try {
  validatePublishable({
    ...insights,
    analyses: [{ page: "https://confenge.com.br/path?email=private%40example.com" }],
  });
  check("sensitive_url_rejected", false);
} catch (error) {
  check("sensitive_url_rejected", error.message === "gsc_insights_sensitive_field", error.message);
}
try {
  validatePublishable(
    { ...insights, as_of: "2025-01-01", generated_at: "2025-01-02T00:00:00Z" },
    { now }
  );
  check("stale_snapshot_rejected", false);
} catch (error) {
  check("stale_snapshot_rejected", error.message === "gsc_insights_stale", error.message);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsc-publish-test-"));
const input = path.join(tmp, "insights.json");
const statePath = path.join(tmp, "last_sync.json");
const historyPath = path.join(tmp, "history.json");
fs.writeFileSync(input, JSON.stringify(insights), "utf8");
fs.writeFileSync(statePath, JSON.stringify(syncState), "utf8");
fs.writeFileSync(historyPath, JSON.stringify(history), "utf8");
const sha = contentHash(insights);
let posted = false;
let postedHistory = null;
let postedProducer = null;
const fakeFetch = async (url, options = {}) => {
  if (url.includes("gsc_insights_ingest")) {
    posted = true;
    const body = JSON.parse(options.body);
    postedHistory = body.history;
    postedProducer = body.producer;
    return new Response(
      JSON.stringify({
        ok: true,
        durable: true,
        status: "CURRENT",
        content_sha256: contentHash(body.insights),
        history_state_sha256: body.history.state_sha256,
        producer_manifest_sha256: body.producer.manifest_sha256,
        consumer_manifest_sha256: body.producer.manifest_sha256,
      }),
      { status: 200 }
    );
  }
  if (url.includes("gsc_history")) {
    return new Response(
      JSON.stringify({
        ok: true,
        history: postedHistory || history,
        meta: { state_sha256: (postedHistory || history).state_sha256 },
      }),
      { status: 200 },
    );
  }
  return new Response(
    JSON.stringify({
      ok: true,
      status: "CURRENT",
      meta: {
        as_of: insights.as_of,
        delivery_source: "durable_store",
        content_sha256: sha,
        snapshot_content_sha256: sha,
        history_state_sha256: history.state_sha256,
        ready_for_product_decisions: true,
        producer_manifest_sha256: syncState.manifest_sha256,
        consumer_manifest_sha256: syncState.manifest_sha256,
        producer_as_of: insights.as_of,
        consumer_as_of: insights.as_of,
        source_freshness: { status: "CURRENT", reason_codes: [] },
        published_at: now.toISOString(),
      },
    }),
    { status: 200 }
  );
};
const proof = await publish({
  input,
  syncStatePath: statePath,
  historyStatePath: historyPath,
  baseUrl: "https://confenge.com.br",
  token: "test-token-at-least-16-chars",
  fetchImpl: fakeFetch,
});
check("publisher_posts", posted);
check("publisher_posts_versioned_producer", postedProducer?.schema_version === "gsc-sync-state/v1");
check("publisher_read_after_write_proof", proof.ok && proof.status === "CURRENT" && proof.content_sha256 === sha, proof.content_sha256);
check("publisher_history_read_after_write", proof.history_state_sha256 === history.state_sha256);
check("publisher_manifest_hash_parity", proof.producer_manifest_sha256 === proof.consumer_manifest_sha256 && proof.consumer_manifest_sha256 === syncState.manifest_sha256);
check("publisher_as_of_parity", proof.producer_as_of === proof.consumer_as_of && proof.consumer_as_of === syncState.as_of);

const restoredPath = path.join(tmp, "restored-history.json");
const restored = await restoreHistory({
  output: restoredPath,
  baseUrl: "https://confenge.com.br",
  token: "test-token-at-least-16-chars",
  fetchImpl: fakeFetch,
});
check("history_restore_hash_verified", restored.state_sha256 === history.state_sha256);
check("history_restore_written", fs.existsSync(restoredPath));

const emptyRestore = await restoreHistory({
  output: restoredPath,
  baseUrl: "https://confenge.com.br",
  token: "test-token-at-least-16-chars",
  fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: "gsc_history_empty" }), { status: 404 }),
});
check("empty_store_bootstraps_fail_closed", emptyRestore.empty === true && !fs.existsSync(restoredPath));

const rollbackTarget = "d".repeat(64);
let rollbackMethod = null;
const rollbackReceipt = await rollback({
  snapshotSha256: rollbackTarget,
  reason: "operator_selected_known_good",
  baseUrl: "https://confenge.com.br",
  token: "test-token-at-least-16-chars",
  fetchImpl: async (url, options = {}) => {
    if (url.includes("gsc_insights_rollback")) {
      rollbackMethod = options.method;
      const body = JSON.parse(options.body);
      return new Response(JSON.stringify({
        ok: true,
        durable: true,
        status: "STALE",
        rolled_back_to_snapshot_sha256: body.snapshot_sha256,
        producer_manifest_sha256: syncState.manifest_sha256,
        consumer_manifest_sha256: syncState.manifest_sha256,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      ok: false,
      status: "STALE",
      access_mode: "READ_ONLY",
      meta: {
        delivery_source: "durable_store",
        snapshot_sha256: rollbackTarget,
        producer_manifest_sha256: syncState.manifest_sha256,
        consumer_manifest_sha256: syncState.manifest_sha256,
      },
    }), { status: 200 });
  },
});
check("rollback_uses_authenticated_post", rollbackMethod === "POST");
check("rollback_selects_exact_snapshot", rollbackReceipt.rolled_back_to_snapshot_sha256 === rollbackTarget);
check("rollback_preserves_stale_signal", rollbackReceipt.status === "STALE");
fs.rmSync(tmp, { recursive: true, force: true });

if (failed) process.exit(1);
console.log("GSC_INSIGHTS_PUBLISH_TEST_OK");
