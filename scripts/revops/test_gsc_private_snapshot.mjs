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
    counts: {
      returned_rows: 71,
      branded_rows: 5,
      nonbranded_rows: 66,
    },
    analyses: {
      "3_commercial_demand_without_page_join": [
        { query_hash: "sha256:abc123", impressions: 2 },
      ],
      legacy_entity_demand_still_ranking: [],
    },
  };
}

function preThresholdHistory() {
  const current = validHistory();
  const first = structuredClone(current.observations[0]);
  const history = {
    ...current,
    created_at: first.observed_at,
    updated_at: first.observed_at,
    parent_state_sha256: null,
    observations: [first],
    last_attempt: {
      attempted_at: first.observed_at,
      run_id: first.run_id,
      outcome: "OBSERVATION_MERGED",
      as_of: first.as_of,
      snapshot_sha256: first.snapshot_sha256,
      reason_codes: ["history_store_empty", "minimum_distinct_as_of"],
    },
    last_known_good: null,
    readiness: {
      ready_for_product_decisions: false,
      status: "UNKNOWN",
      access_mode: "NONE",
      reason_codes: ["minimum_distinct_as_of"],
      window_start: first.start,
      window_end: first.as_of,
      observed_dates: first.observed_dates,
      missing_dates: [],
      distinct_as_of: 1,
      freshness_as_of: first.as_of,
    },
  };
  history.state_sha256 = historyHash(history);
  return history;
}

function producer() {
  return {
    schema_version: "gsc-sync-state/v1",
    manifest_schema_version: "gsc_snapshot_manifest_v1",
    manifest_sha256: MANIFEST_SHA256,
    as_of: AS_OF,
    produced_at: NOW.toISOString(),
    source: "search_analytics_api",
  };
}

test("a valid pre-threshold observation persists its manifest while remaining UNKNOWN", async () => {
  const records = new Map();
  const store = new MemorySystemStore(records);
  const history = preThresholdHistory();
  const observation = history.observations[0];
  const preThresholdProducer = {
    ...producer(),
    manifest_sha256: observation.snapshot_sha256,
    as_of: observation.as_of,
    produced_at: observation.observed_at,
  };

  const written = await persistPrivateGscSnapshot(
    store,
    { producer: preThresholdProducer, history, insights: null },
    { now: NOW },
  );
  assert.equal(written.ok, true);
  assert.equal(written.status, "UNKNOWN");
  assert.equal(written.promoted, false);
  assert.equal(written.producer_manifest_sha256, observation.snapshot_sha256);
  assert.equal(written.consumer_manifest_sha256, observation.snapshot_sha256);
  assert.equal(written.as_of, observation.as_of);

  const stored = [...records.values()].find(
    (record) => record?.schema_version === "confenge-private-gsc-snapshot/v1",
  );
  assert.equal(stored.manifest_sha256, observation.snapshot_sha256);
  assert.equal(stored.as_of, observation.as_of);
  assert.equal(stored.insights, null);

  const consumed = await readPrivateGscSnapshot(store, { now: NOW });
  assert.equal(consumed.ok, false);
  assert.equal(consumed.status, "UNKNOWN");
  assert.equal(consumed.meta.latest_attempt_manifest_sha256, observation.snapshot_sha256);
  assert.equal(consumed.meta.latest_attempt_as_of, observation.as_of);
  assert.equal(consumed.meta.latest_attempt_produced_at, observation.observed_at);
  assert.equal(consumed.meta.latest_attempt_ingested_at, NOW.toISOString());
  assert.equal(consumed.meta.latest_attempt_source_freshness.status, "CURRENT");

  const repeated = await persistPrivateGscSnapshot(
    store,
    { producer: preThresholdProducer, history, insights: null },
    { now: NOW },
  );
  assert.equal(repeated.ok, true);
  assert.equal(repeated.idempotent, true);
  assert.equal(repeated.status, "UNKNOWN");
});

test("pre-threshold provenance must match the durable history attempt", async () => {
  const records = new Map();
  const history = preThresholdHistory();
  const observation = history.observations[0];
  await assert.rejects(
    persistPrivateGscSnapshot(
      new MemorySystemStore(records),
      {
        producer: {
          ...producer(),
          manifest_sha256: "c".repeat(64),
          as_of: observation.as_of,
          produced_at: observation.observed_at,
        },
        history,
        insights: null,
      },
      { now: NOW },
    ),
    /gsc_private_producer_consumer_mismatch/,
  );
  assert.equal(records.size, 0);
});

test("idempotent replay rejects a divergent producer as_of", async () => {
  const records = new Map();
  const store = new MemorySystemStore(records);
  const history = preThresholdHistory();
  const observation = history.observations[0];
  const validProducer = {
    ...producer(),
    manifest_sha256: observation.snapshot_sha256,
    as_of: observation.as_of,
    produced_at: observation.observed_at,
  };
  await persistPrivateGscSnapshot(store, { producer: validProducer, history, insights: null }, { now: NOW });
  const recordCount = records.size;

  await assert.rejects(
    persistPrivateGscSnapshot(
      store,
      { producer: { ...validProducer, as_of: "2026-08-25" }, history, insights: null },
      { now: NOW },
    ),
    /gsc_private_producer_consumer_mismatch/,
  );
  assert.equal(records.size, recordCount);
});

test("idempotent replay fails closed on a corrupt pointer", async () => {
  const records = new Map();
  const store = new MemorySystemStore(records);
  const history = preThresholdHistory();
  const observation = history.observations[0];
  const validProducer = {
    ...producer(),
    manifest_sha256: observation.snapshot_sha256,
    as_of: observation.as_of,
    produced_at: observation.observed_at,
  };
  await persistPrivateGscSnapshot(store, { producer: validProducer, history, insights: null }, { now: NOW });
  const corruptPointer = records.get("gsc-private-current-v1");
  corruptPointer.pointer_sha256 = "0".repeat(64);
  records.set("gsc-private-current-v1", corruptPointer);

  await assert.rejects(
    persistPrivateGscSnapshot(store, { producer: validProducer, history, insights: null }, { now: NOW }),
    /gsc_private_pointer_hash_mismatch/,
  );
  assert.equal(records.get("gsc-private-current-v1").pointer_sha256, "0".repeat(64));
});

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
