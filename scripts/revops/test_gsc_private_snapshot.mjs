import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

import {
  persistPrivateGscSnapshot,
  readPrivateGscSnapshot,
  rollbackPrivateGscSnapshot,
} from "../../netlify/functions/lib/gsc-private-snapshot.cjs";
import { evaluateConsumerPayload } from "./verify_gsc_freshness.mjs";

const require = createRequire(import.meta.url);
const { historyHash, observationHash } = require("../../netlify/functions/lib/gsc-history.cjs");
const { FileStore } = require("../../netlify/functions/lib/lead-store.cjs");

const NOW = new Date("2026-08-29T12:00:00Z");
const AS_OF = "2026-08-26";
const MANIFEST_SHA256 = "a".repeat(64);
const NEXT_MANIFEST_SHA256 = "b".repeat(64);

class MemorySystemStore {
  constructor(records = new Map()) {
    this.records = records;
  }

  async getSystemRecord(id) {
    return structuredClone(this.records.get(id) || null);
  }

  async putSystemRecord(id, value, { onlyIfNew = false } = {}) {
    if (onlyIfNew && this.records.has(id)) {
      const error = new Error("already_exists");
      error.code = "ALREADY_EXISTS";
      error.existing = structuredClone(this.records.get(id));
      throw error;
    }
    this.records.set(id, structuredClone(value));
    return value;
  }
}

function validHistory() {
  const observations = [2, 1, 0].map((daysAgo, index) => {
    const asOf = new Date(Date.parse(`${AS_OF}T00:00:00Z`) - daysAgo * 864e5)
      .toISOString()
      .slice(0, 10);
    const start = new Date(Date.parse(`${asOf}T00:00:00Z`) - 27 * 864e5)
      .toISOString()
      .slice(0, 10);
    const observation = {
      source: "search_analytics_api",
      synthetic: false,
      complete: true,
      as_of: asOf,
      start,
      end: asOf,
      observed_dates: Array.from({ length: 28 }, (_, offset) =>
        new Date(Date.parse(`${start}T00:00:00Z`) + offset * 864e5).toISOString().slice(0, 10)),
      reprocessed_dates: Array.from({ length: 3 }, (_, offset) =>
        new Date(Date.parse(`${asOf}T00:00:00Z`) - (2 - offset) * 864e5).toISOString().slice(0, 10)),
      snapshot_sha256: index === 2 ? MANIFEST_SHA256 : String(index + 1).repeat(64),
      observed_at: new Date(NOW.getTime() - daysAgo * 864e5).toISOString(),
      run_id: `run-${index + 1}`,
    };
    observation.observation_id = observationHash(observation);
    return observation;
  });
  const latest = observations.at(-1);
  const observedDates = latest.observed_dates;
  const history = {
    schema: "confenge_private_gsc_history_v1",
    contract_version: "gsc-readiness/v2",
    window_days: 28,
    minimum_distinct_as_of: 3,
    max_as_of_lag_days: 14,
    created_at: observations[0].observed_at,
    updated_at: latest.observed_at,
    parent_state_sha256: null,
    observations,
    last_attempt: {
      attempted_at: latest.observed_at,
      run_id: latest.run_id,
      outcome: "OBSERVATION_MERGED",
      as_of: latest.as_of,
      snapshot_sha256: latest.snapshot_sha256,
      reason_codes: [],
    },
    last_known_good: {
      observation_id: latest.observation_id,
      snapshot_sha256: latest.snapshot_sha256,
      as_of: latest.as_of,
      observed_at: latest.observed_at,
    },
    readiness: {
      ready_for_product_decisions: true,
      status: "READY",
      access_mode: "READ_WRITE",
      reason_codes: [],
      window_start: observedDates[0],
      window_end: AS_OF,
      observed_dates: observedDates,
      missing_dates: [],
      distinct_as_of: 3,
      freshness_as_of: AS_OF,
    },
  };
  history.state_sha256 = historyHash(history);
  return history;
}

function validInsights(history) {
  return {
    source: "search_analytics_api",
    as_of: AS_OF,
    generated_at: "2026-08-29T11:55:00Z",
    ready_for_product_decisions: true,
    synthetic: false,
    fixture: false,
    live_baseline_invented: false,
    query_text_redacted: true,
    raw_query_rows_in_git: false,
    readiness_contract_version: "gsc-readiness/v2",
    history_state_sha256: history.state_sha256,
    snapshot_sha256: MANIFEST_SHA256,
    counts: { query_count: 71 },
  };
}

function producer() {
  return {
    schema_version: "gsc-sync-state/v1",
    manifest_schema_version: "gsc_snapshot_manifest_v1",
    manifest_sha256: MANIFEST_SHA256,
    as_of: AS_OF,
    produced_at: "2026-08-29T11:55:00Z",
    source: "search_analytics_api",
  };
}

function failedHistory(current) {
  const failed = structuredClone(current);
  failed.parent_state_sha256 = current.state_sha256;
  failed.updated_at = "2026-08-29T12:05:00Z";
  failed.last_attempt = {
    attempted_at: failed.updated_at,
    run_id: "run-4",
    outcome: "RUN_FAILED",
    as_of: null,
    snapshot_sha256: null,
    reason_codes: ["dependency_unavailable"],
  };
  failed.readiness = {
    ...failed.readiness,
    ready_for_product_decisions: false,
    status: "UNKNOWN",
    access_mode: "READ_ONLY",
    reason_codes: ["dependency_unavailable"],
  };
  failed.state_sha256 = historyHash(failed);
  return failed;
}

function nextCurrentHistory(current) {
  const next = structuredClone(current);
  const start = "2026-07-31";
  const observation = {
    source: "search_analytics_api",
    synthetic: false,
    complete: true,
    as_of: "2026-08-27",
    start,
    end: "2026-08-27",
    observed_dates: Array.from({ length: 28 }, (_, offset) =>
      new Date(Date.parse(`${start}T00:00:00Z`) + offset * 864e5).toISOString().slice(0, 10)),
    reprocessed_dates: ["2026-08-25", "2026-08-26", "2026-08-27"],
    snapshot_sha256: NEXT_MANIFEST_SHA256,
    observed_at: "2026-08-29T13:00:00Z",
    run_id: "run-4",
  };
  observation.observation_id = observationHash(observation);
  next.parent_state_sha256 = current.state_sha256;
  next.observations.push(observation);
  next.updated_at = observation.observed_at;
  next.last_attempt = {
    attempted_at: observation.observed_at,
    run_id: observation.run_id,
    outcome: "OBSERVATION_MERGED",
    as_of: observation.as_of,
    snapshot_sha256: observation.snapshot_sha256,
    reason_codes: [],
  };
  next.last_known_good = {
    observation_id: observation.observation_id,
    snapshot_sha256: observation.snapshot_sha256,
    as_of: observation.as_of,
    observed_at: observation.observed_at,
  };
  next.readiness = {
    ...next.readiness,
    window_start: start,
    window_end: observation.as_of,
    observed_dates: observation.observed_dates,
    distinct_as_of: 4,
    freshness_as_of: observation.as_of,
  };
  next.state_sha256 = historyHash(next);
  return next;
}

test("CURRENT survives a consumer restart with equal producer and consumer manifest", async () => {
  const records = new Map();
  const history = validHistory();
  const written = await persistPrivateGscSnapshot(
    new MemorySystemStore(records),
    { producer: producer(), history, insights: validInsights(history) },
    { now: NOW },
  );

  assert.equal(written.status, "CURRENT");
  assert.equal(written.producer_manifest_sha256, MANIFEST_SHA256);
  assert.equal(written.consumer_manifest_sha256, MANIFEST_SHA256);
  assert.equal(written.as_of, AS_OF);
  assert.equal(written.schema_version, "confenge-private-gsc-snapshot/v1");

  const afterRestart = await readPrivateGscSnapshot(new MemorySystemStore(records), { now: NOW });
  assert.equal(afterRestart.status, "CURRENT");
  assert.equal(afterRestart.meta.delivery_source, "durable_store");
  assert.equal(afterRestart.meta.producer_manifest_sha256, MANIFEST_SHA256);
  assert.equal(afterRestart.meta.consumer_manifest_sha256, MANIFEST_SHA256);
  assert.equal(afterRestart.meta.producer_as_of, AS_OF);
  assert.equal(afterRestart.meta.consumer_as_of, AS_OF);
  assert.equal(afterRestart.meta.producer_as_of, afterRestart.meta.consumer_as_of);
  assert.equal(afterRestart.meta.source_freshness.status, "CURRENT");
  assert.match(afterRestart.meta.ingested_at, /^2026-08-29T12:00:00\.000Z$/);
  const scheduledProof = evaluateConsumerPayload(afterRestart, { now: NOW });
  assert.equal(scheduledProof.status, "CURRENT");
  assert.equal(scheduledProof.ok, true);

  const repeated = await persistPrivateGscSnapshot(
    new MemorySystemStore(records),
    { producer: producer(), history, insights: validInsights(history) },
    { now: NOW },
  );
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.promoted, false);
  assert.equal(repeated.contains_insights, true);
});

test("storage and scheduled verifier share freshness boundary vectors", async () => {
  const records = new Map();
  const history = validHistory();
  const store = new MemorySystemStore(records);
  await persistPrivateGscSnapshot(
    store,
    { producer: producer(), history, insights: validInsights(history) },
    { now: NOW },
  );

  const lastCurrent = new Date("2026-09-09T23:59:59.999Z");
  const currentRead = await readPrivateGscSnapshot(store, { now: lastCurrent });
  assert.equal(currentRead.status, "CURRENT");
  assert.equal(evaluateConsumerPayload(currentRead, { now: lastCurrent }).status, "CURRENT");

  const firstStale = new Date("2026-09-10T00:00:00.000Z");
  const staleRead = await readPrivateGscSnapshot(store, { now: firstStale });
  assert.equal(staleRead.status, "STALE");
  assert.equal(evaluateConsumerPayload(currentRead, { now: firstStale }).status, "STALE");

  const beyondFutureSkew = new Date("2026-08-29T11:49:59.000Z");
  const futureRead = await readPrivateGscSnapshot(store, { now: beyondFutureSkew });
  assert.equal(futureRead.status, "UNKNOWN");
  assert.equal(evaluateConsumerPayload(currentRead, { now: beyondFutureSkew }).status, "UNKNOWN");
});

test("a failed producer attempt makes the consumer UNKNOWN without discarding its LKG", async () => {
  const records = new Map();
  const history = validHistory();
  const store = new MemorySystemStore(records);
  await persistPrivateGscSnapshot(
    store,
    { producer: producer(), history, insights: validInsights(history) },
    { now: NOW },
  );

  const failure = failedHistory(history);
  const receipt = await persistPrivateGscSnapshot(
    store,
    {
      producer: {
        schema_version: "gsc-sync-state/v1",
        manifest_schema_version: "gsc_snapshot_manifest_v1",
        manifest_sha256: null,
        as_of: null,
        produced_at: "2026-08-29T12:05:00Z",
        source: "search_analytics_api",
      },
      history: failure,
      insights: null,
    },
    { now: new Date("2026-08-29T12:05:00Z") },
  );

  assert.equal(receipt.status, "UNKNOWN");
  assert.equal(receipt.promoted, false);
  const consumed = await readPrivateGscSnapshot(store, {
    now: new Date("2026-08-29T12:05:00Z"),
  });
  assert.equal(consumed.status, "UNKNOWN");
  assert.equal(consumed.access_mode, "READ_ONLY");
  assert.equal(consumed.insights.snapshot_sha256, MANIFEST_SHA256);
  assert.equal(consumed.insights.ready_for_product_decisions, false);
  assert.equal(consumed.meta.producer_manifest_sha256, MANIFEST_SHA256);
  assert.equal(consumed.meta.consumer_manifest_sha256, MANIFEST_SHA256);
  assert.deepEqual(consumed.meta.reason_codes, ["dependency_unavailable"]);
});

test("rollback selects the prior durable version and does not disguise it as CURRENT", async () => {
  const records = new Map();
  const store = new MemorySystemStore(records);
  const firstHistory = validHistory();
  const first = await persistPrivateGscSnapshot(
    store,
    { producer: producer(), history: firstHistory, insights: validInsights(firstHistory) },
    { now: NOW },
  );
  const secondHistory = nextCurrentHistory(firstHistory);
  const secondInsights = {
    ...validInsights(secondHistory),
    as_of: "2026-08-27",
    generated_at: "2026-08-29T13:00:00Z",
    snapshot_sha256: NEXT_MANIFEST_SHA256,
  };
  await persistPrivateGscSnapshot(
    store,
    {
      producer: {
        ...producer(),
        manifest_sha256: NEXT_MANIFEST_SHA256,
        as_of: "2026-08-27",
        produced_at: "2026-08-29T13:00:00Z",
      },
      history: secondHistory,
      insights: secondInsights,
    },
    { now: new Date("2026-08-29T13:00:00Z") },
  );

  const rolledBack = await rollbackPrivateGscSnapshot(
    store,
    {
      snapshot_sha256: first.snapshot_sha256,
      reason: "operator_selected_known_good",
    },
    { now: new Date("2026-09-20T12:00:00Z") },
  );
  assert.equal(rolledBack.status, "STALE");
  assert.equal(rolledBack.rolled_back_to_snapshot_sha256, first.snapshot_sha256);
  assert.equal(rolledBack.producer_manifest_sha256, MANIFEST_SHA256);
  assert.equal(rolledBack.consumer_manifest_sha256, MANIFEST_SHA256);

  const consumed = await readPrivateGscSnapshot(store, { now: new Date("2026-09-20T12:00:00Z") });
  assert.equal(consumed.status, "STALE");
  assert.equal(consumed.access_mode, "READ_ONLY");
  assert.equal(consumed.meta.snapshot_sha256, first.snapshot_sha256);
  assert.equal(consumed.meta.producer_manifest_sha256, MANIFEST_SHA256);
});

test("CURRENT survives a real host-filesystem adapter restart", async () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-gsc-durable-"));
  fs.chmodSync(storageRoot, 0o700);
  try {
    const history = validHistory();
    const written = await persistPrivateGscSnapshot(
      new FileStore(storageRoot),
      { producer: producer(), history, insights: validInsights(history) },
      { now: NOW },
    );
    const restarted = await readPrivateGscSnapshot(new FileStore(storageRoot), { now: NOW });
    assert.equal(restarted.status, "CURRENT");
    assert.equal(restarted.meta.snapshot_sha256, written.snapshot_sha256);
    assert.equal(restarted.meta.producer_manifest_sha256, restarted.meta.consumer_manifest_sha256);
  } finally {
    fs.rmSync(storageRoot, { recursive: true, force: true });
  }
});
