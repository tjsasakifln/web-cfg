#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import {
  contentHash,
  publish,
  validatePublishable,
  validateSyncProvenance,
} from "./publish_gsc_insights.mjs";

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
  query_text_redacted: true,
  raw_query_rows_in_git: false,
  analyses: [{ query_hash: "sha256:abc123", clicks: 2 }],
};

check("publishable_redacted_snapshot", validatePublishable(insights).as_of === insights.as_of);
const syncState = {
  source: "search_analytics_api",
  synthetic: false,
  truncated: false,
  ready_for_product_decisions: true,
  as_of: insights.as_of,
  last_sync_at: insights.generated_at,
};
check("current_sync_provenance", validateSyncProvenance(insights, syncState));
try {
  validatePublishable({ ...insights, query: "private raw query" });
  check("raw_query_rejected", false);
} catch (error) {
  check("raw_query_rejected", error.message === "gsc_insights_sensitive_field", error.message);
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
fs.writeFileSync(input, JSON.stringify(insights), "utf8");
fs.writeFileSync(statePath, JSON.stringify(syncState), "utf8");
const sha = contentHash(insights);
let posted = false;
const fakeFetch = async (url, options = {}) => {
  if (url.includes("gsc_insights_ingest")) {
    posted = true;
    const body = JSON.parse(options.body);
    return new Response(
      JSON.stringify({ ok: true, durable: true, content_sha256: contentHash(body.insights) }),
      { status: 200 }
    );
  }
  return new Response(
    JSON.stringify({
      ok: true,
      meta: {
        as_of: insights.as_of,
        delivery_source: "durable_store",
        content_sha256: sha,
        published_at: now.toISOString(),
      },
    }),
    { status: 200 }
  );
};
const proof = await publish({
  input,
  syncStatePath: statePath,
  baseUrl: "https://confenge.com.br",
  token: "test-token-at-least-16-chars",
  fetchImpl: fakeFetch,
});
check("publisher_posts", posted);
check("publisher_read_after_write_proof", proof.ok && proof.content_sha256 === sha, proof.content_sha256);
fs.rmSync(tmp, { recursive: true, force: true });

if (failed) process.exit(1);
console.log("GSC_INSIGHTS_PUBLISH_TEST_OK");
