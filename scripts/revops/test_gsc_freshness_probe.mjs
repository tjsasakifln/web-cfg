import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { evaluateConsumerPayload, probePrivateConsumer } from "./verify_gsc_freshness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const current = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/revops/fixtures/gsc-consumer-current.json"), "utf8"),
);
const cli = path.join(root, "scripts/revops/verify_gsc_freshness.mjs");

test("CURRENT requires a durable versioned consumer with exact manifest parity", () => {
  const result = evaluateConsumerPayload(current, { now: new Date("2026-08-29T12:20:39Z") });
  assert.equal(result.ok, true);
  assert.equal(result.status, "CURRENT");
  assert.equal(result.producer_manifest_sha256, "a".repeat(64));
  assert.equal(result.consumer_manifest_sha256, "a".repeat(64));
  assert.equal(result.producer_as_of, "2026-08-26");
  assert.equal(result.consumer_as_of, "2026-08-26");
  assert.equal(result.producer_as_of, result.consumer_as_of);
  assert.equal(result.delivery_source, "durable_store");
});

test("CLI fixtures make CURRENT green and STALE/UNKNOWN red without logging insights", () => {
  for (const [fixture, expectedStatus, expectedExit] of [
    ["current", "CURRENT", 0],
    ["stale", "STALE", 1],
    ["unknown", "UNKNOWN", 1],
  ]) {
    const ran = spawnSync(
      process.execPath,
      [cli, "--fixture", fixture, "--now", "2026-08-29T12:20:39Z"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(ran.status, expectedExit, `${fixture}: ${ran.stdout}\n${ran.stderr}`);
    const proof = JSON.parse(ran.stdout);
    assert.equal(proof.status, expectedStatus, fixture);
    assert.equal(proof.fixture, true, `${fixture}: a fixture run must mark itself`);
    assert.equal(Object.hasOwn(proof, "insights"), false, fixture);
    assert.doesNotMatch(`${ran.stdout}\n${ran.stderr}`, /query_text|private query|individual query/i);
  }
});

test("manifest disagreement is UNKNOWN even when the producer claims CURRENT", () => {
  const mismatch = structuredClone(current);
  mismatch.meta.consumer_manifest_sha256 = "b".repeat(64);
  const result = evaluateConsumerPayload(mismatch, { now: new Date("2026-08-29T12:20:39Z") });
  assert.equal(result.ok, false);
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(result.reason_codes, ["manifest_hash_mismatch"]);
});

test("carried content is CURRENT only with explicit source and parent bindings", () => {
  const carried = structuredClone(current);
  carried.meta.content_carried_forward = true;
  carried.meta.source_history_state_sha256 = "b".repeat(64);
  carried.meta.history_parent_state_sha256 = "e".repeat(64);
  carried.meta.source_snapshot_sha256 = "f".repeat(64);
  const accepted = evaluateConsumerPayload(carried, {
    now: new Date("2026-08-29T12:20:39Z"),
  });
  assert.equal(accepted.status, "CURRENT");
  delete carried.meta.history_parent_state_sha256;
  const rejected = evaluateConsumerPayload(carried, {
    now: new Date("2026-08-29T12:20:39Z"),
  });
  assert.equal(rejected.status, "UNKNOWN");
  assert.deepEqual(rejected.reason_codes, ["snapshot_integrity_mismatch"]);
});

test("live probe performs one authenticated GET and evaluates only the private consumer response", async () => {
  const requests = [];
  const result = await probePrivateConsumer({
    baseUrl: "https://confenge.com.br",
    token: "test-token-at-least-16-chars",
    now: new Date("2026-08-29T12:20:39Z"),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(current), { status: 200 });
    },
  });
  assert.equal(result.status, "CURRENT");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(Object.hasOwn(requests[0].options, "body"), false);
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-token-at-least-16-chars");
});

test("timeout and partial responses are UNKNOWN", async () => {
  const timedOut = await probePrivateConsumer({
    baseUrl: "https://confenge.com.br",
    token: "test-token-at-least-16-chars",
    now: new Date("2026-08-29T12:20:39Z"),
    fetchImpl: async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    },
  });
  assert.equal(timedOut.status, "UNKNOWN");
  assert.deepEqual(timedOut.reason_codes, ["consumer_timeout"]);

  const partial = await probePrivateConsumer({
    baseUrl: "https://confenge.com.br",
    token: "test-token-at-least-16-chars",
    now: new Date("2026-08-29T12:20:39Z"),
    fetchImpl: async () => new Response("{truncated", { status: 200 }),
  });
  assert.equal(partial.status, "UNKNOWN");
  assert.deepEqual(partial.reason_codes, ["consumer_non_json"]);
});

// --- MEDICAO-11: the tracked snapshot ages; a dated readout says so, never zero ---
const MAX_AS_OF_LAG_DAYS = 14;
const readoutsDir = path.join(root, "data/revops/gsc/readouts");

function snapshotStatusOn(insights, dateIso) {
  const asOfMs = Date.parse(`${insights.as_of}T00:00:00Z`);
  const onMs = Date.parse(`${dateIso}T00:00:00Z`);
  if (![asOfMs, onMs].every(Number.isFinite)) return { status: "UNKNOWN", lag_days: null };
  const lagDays = Math.round((onMs - asOfMs) / 864e5);
  return { status: lagDays > MAX_AS_OF_LAG_DAYS ? "STALE" : "CURRENT", lag_days: lagDays };
}

test("tracked insights_latest.json read on 2026-09-19 is STALE even with ready_for_product_decisions=true", () => {
  const insights = JSON.parse(fs.readFileSync(path.join(root, "data/revops/gsc/insights_latest.json"), "utf8"));
  const evaluated = snapshotStatusOn(insights, "2026-09-19");
  assert.equal(insights.ready_for_product_decisions, true, "the flag is frozen in the file; freshness must be re-evaluated on read");
  assert.equal(evaluated.status, "STALE");
  assert.ok(evaluated.lag_days > MAX_AS_OF_LAG_DAYS, `lag ${evaluated.lag_days}d`);
});

test("a dated readout exists, matches the repository snapshot evaluation and carries no query text", () => {
  assert.ok(fs.existsSync(path.join(readoutsDir, "README.md")), "readouts/README.md with the host read command");
  const readme = fs.readFileSync(path.join(readoutsDir, "README.md"), "utf8");
  assert.match(readme, /action=gsc_insights/);
  assert.match(readme, /action=gsc_history/);
  assert.match(readme, /INDISPON[IÍ]VEL/);
  const files = fs.readdirSync(readoutsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  assert.ok(files.length >= 1, "at least one dated readout");
  const latestName = files[files.length - 1];
  const raw = fs.readFileSync(path.join(readoutsDir, latestName), "utf8");
  assert.doesNotMatch(raw, /query_text|"query"\s*:|"queries"\s*:\s*\[/i, "no query text in a readout");
  const readout = JSON.parse(raw);
  assert.equal(readout.readout_date, latestName.replace(/\.json$/, ""));
  assert.ok(readout.readout_date >= "2026-09-08", "pendência 6 asks for a readout on or after 2026-09-08");
  if (readout.executed !== true) {
    assert.equal(readout.status, "INDISPONIVEL", "a readout that was not executed must say INDISPONIVEL");
    assert.equal(readout.host_consumer.gsc_insights, null);
  } else {
    assert.ok(readout.host_consumer.gsc_insights, "an executed readout carries the host payload");
    assert.match(String(readout.host_consumer.response_sha256 || ""), /^[a-f0-9]{64}/);
  }
  const insights = JSON.parse(fs.readFileSync(path.join(root, "data/revops/gsc/insights_latest.json"), "utf8"));
  const evaluated = snapshotStatusOn(insights, readout.readout_date);
  const repo = readout.repository_snapshot || {};
  assert.equal(repo.as_of, insights.as_of, "readout must evaluate the tracked snapshot's own as_of");
  assert.equal(repo.status, evaluated.status);
  assert.equal(repo.lag_days_on_readout_date, evaluated.lag_days);
  assert.equal(repo.max_as_of_lag_days, MAX_AS_OF_LAG_DAYS);
  if (evaluated.status === "STALE") assert.equal(repo.usable_for_decisions, false);
});
