"use strict";

const crypto = require("crypto");
const { canonicalJson, validateHistoryState } = (() => {
  const history = require("./gsc-history.cjs");
  return {
    canonicalJson: history.canonicalJson,
    validateHistoryState: history.validateHistoryState,
  };
})();

const SNAPSHOT_SCHEMA_VERSION = "confenge-private-gsc-snapshot/v1";
const POINTER_SCHEMA_VERSION = "confenge-private-gsc-pointer/v1";
const CURRENT_POINTER_ID = "gsc-private-current-v1";
const VERSION_PREFIX = "gsc-private-snapshot-v1:";
const MAX_AGE_MS = 14 * 864e5;
const SHA256_RE = /^[a-f0-9]{64}$/;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function seal(value, field) {
  const unsigned = { ...value };
  delete unsigned[field];
  return { ...unsigned, [field]: sha256(canonicalJson(unsigned)) };
}

function classifyFreshness({ asOf, producedAt, ingestedAt }, now) {
  const nowMs = now.getTime();
  const asOfStart = Date.parse(`${asOf || ""}T00:00:00Z`);
  const asOfEnd = asOfStart + 864e5 - 1;
  const producedMs = Date.parse(producedAt || "");
  const ingestedMs = Date.parse(ingestedAt || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(asOf || "")) ||
    !Number.isFinite(asOfStart) ||
    !Number.isFinite(producedMs) ||
    !Number.isFinite(ingestedMs) ||
    producedMs > nowMs + 5 * 60_000 ||
    ingestedMs > nowMs + 5 * 60_000
  ) {
    return { status: "UNKNOWN", reason_codes: ["freshness_unreadable"] };
  }
  if (
    nowMs - asOfEnd > MAX_AGE_MS ||
    nowMs - producedMs > MAX_AGE_MS ||
    nowMs - ingestedMs > MAX_AGE_MS
  ) {
    return { status: "STALE", reason_codes: ["snapshot_stale"] };
  }
  return { status: "CURRENT", reason_codes: [] };
}

function versionId(snapshotSha256) {
  return `${VERSION_PREFIX}${snapshotSha256}`;
}

function validatePointer(pointer) {
  if (!pointer) return { ok: false, error: "gsc_private_pointer_missing" };
  if (
    pointer.schema_version !== POINTER_SCHEMA_VERSION ||
    (pointer.current_snapshot_sha256 !== null &&
      !SHA256_RE.test(String(pointer.current_snapshot_sha256 || ""))) ||
    !SHA256_RE.test(String(pointer.latest_snapshot_sha256 || ""))
  ) {
    return { ok: false, error: "gsc_private_pointer_invalid" };
  }
  const expected = seal(pointer, "pointer_sha256").pointer_sha256;
  if (pointer.pointer_sha256 !== expected) {
    return { ok: false, error: "gsc_private_pointer_hash_mismatch" };
  }
  return { ok: true };
}

function validateSnapshot(snapshot, { now = new Date() } = {}) {
  if (
    !snapshot ||
    snapshot.schema_version !== SNAPSHOT_SCHEMA_VERSION ||
    snapshot.manifest_schema_version !== "gsc_snapshot_manifest_v1" ||
    !SHA256_RE.test(String(snapshot.history_state_sha256 || "")) ||
    !SHA256_RE.test(String(snapshot.snapshot_sha256 || "")) ||
    snapshot.source !== "search_analytics_api"
  ) {
    return { ok: false, status: "UNKNOWN", error: "gsc_private_snapshot_invalid" };
  }
  if (seal(snapshot, "snapshot_sha256").snapshot_sha256 !== snapshot.snapshot_sha256) {
    return { ok: false, status: "UNKNOWN", error: "gsc_private_snapshot_hash_mismatch" };
  }
  const historyValidation = validateHistoryState(snapshot.history, { now: now.getTime() });
  if (!historyValidation.ok || snapshot.history.state_sha256 !== snapshot.history_state_sha256) {
    return { ok: false, status: "UNKNOWN", error: historyValidation.error || "gsc_private_history_mismatch" };
  }
  const freshness = classifyFreshness(
    { asOf: snapshot.as_of, producedAt: snapshot.produced_at, ingestedAt: snapshot.ingested_at },
    now,
  );
  if (!snapshot.insights) {
    if (
      snapshot.content_sha256 !== null ||
      snapshot.history.readiness?.ready_for_product_decisions === true
    ) {
      return { ok: false, status: "UNKNOWN", error: "gsc_private_partial_snapshot_invalid" };
    }
    const status = snapshot.history.readiness?.status === "STALE" ? "STALE" : "UNKNOWN";
    return {
      ok: true,
      status,
      freshness,
      reason_codes: snapshot.history.readiness?.reason_codes || ["producer_not_ready"],
    };
  }
  if (
    !SHA256_RE.test(String(snapshot.manifest_sha256 || "")) ||
    !SHA256_RE.test(String(snapshot.content_sha256 || "")) ||
    sha256(JSON.stringify(snapshot.insights)) !== snapshot.content_sha256 ||
    snapshot.insights.as_of !== snapshot.as_of ||
    snapshot.insights.snapshot_sha256 !== snapshot.manifest_sha256 ||
    snapshot.insights.history_state_sha256 !== snapshot.history_state_sha256 ||
    snapshot.history.last_known_good?.snapshot_sha256 !== snapshot.manifest_sha256 ||
    snapshot.history.last_known_good?.as_of !== snapshot.as_of
  ) {
    return { ok: false, status: "UNKNOWN", error: "gsc_private_snapshot_provenance_mismatch" };
  }
  if (
    snapshot.history.readiness?.ready_for_product_decisions !== true ||
    snapshot.insights.ready_for_product_decisions !== true
  ) {
    return { ok: true, status: "UNKNOWN", freshness, reason_codes: ["producer_not_ready"] };
  }
  return { ok: true, status: freshness.status, freshness, reason_codes: freshness.reason_codes };
}

function buildSnapshot({ producer, history, insights }, { now }) {
  const historyValidation = validateHistoryState(history, { now: now.getTime() });
  if (!historyValidation.ok) throw new Error(historyValidation.error || "gsc_private_history_invalid");
  if (
    !producer ||
    producer.schema_version !== "gsc-sync-state/v1" ||
    producer.manifest_schema_version !== "gsc_snapshot_manifest_v1" ||
    producer.source !== "search_analytics_api" ||
    !Number.isFinite(Date.parse(producer.produced_at || ""))
  ) {
    throw new Error("gsc_private_producer_consumer_mismatch");
  }
  const containsInsights = insights != null;
  if (
    containsInsights &&
    (!SHA256_RE.test(String(producer.manifest_sha256 || "")) ||
      producer.manifest_sha256 !== insights.snapshot_sha256 ||
      producer.manifest_sha256 !== history.last_known_good?.snapshot_sha256 ||
      producer.as_of !== insights.as_of ||
      producer.as_of !== history.last_known_good?.as_of)
  ) {
    throw new Error("gsc_private_producer_consumer_mismatch");
  }
  if (!containsInsights && history.readiness?.ready_for_product_decisions === true) {
    throw new Error("gsc_private_partial_snapshot_invalid");
  }
  const asOf = producer.as_of || history.readiness?.freshness_as_of || null;
  const snapshot = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    manifest_schema_version: producer.manifest_schema_version,
    manifest_sha256: producer.manifest_sha256 || null,
    as_of: asOf,
    source: producer.source,
    produced_at: producer.produced_at,
    ingested_at: now.toISOString(),
    content_sha256: insights ? sha256(JSON.stringify(insights)) : null,
    history_state_sha256: history.state_sha256,
    source_freshness: classifyFreshness(
      { asOf, producedAt: producer.produced_at, ingestedAt: now.toISOString() },
      now,
    ),
    history,
    insights,
  };
  const sealed = seal(snapshot, "snapshot_sha256");
  const validation = validateSnapshot(sealed, { now });
  if (!validation.ok) {
    throw new Error(validation.error || `gsc_private_snapshot_${validation.status.toLowerCase()}`);
  }
  return sealed;
}

async function putImmutable(store, snapshot) {
  const id = versionId(snapshot.snapshot_sha256);
  try {
    await store.putSystemRecord(id, snapshot, { onlyIfNew: true });
  } catch (err) {
    if (!err || err.code !== "ALREADY_EXISTS") throw err;
    const existing = err.existing || await store.getSystemRecord(id);
    if (!existing || existing.snapshot_sha256 !== snapshot.snapshot_sha256) {
      throw new Error("gsc_private_snapshot_version_conflict");
    }
  }
  const proof = await store.getSystemRecord(id);
  if (!proof || proof.snapshot_sha256 !== snapshot.snapshot_sha256) {
    throw new Error("gsc_private_snapshot_persist_verify_miss");
  }
}

async function persistPrivateGscSnapshot(store, input, { now = new Date() } = {}) {
  const previousPointer = await store.getSystemRecord(CURRENT_POINTER_ID);
  if (validatePointer(previousPointer).ok) {
    const latest = await store.getSystemRecord(versionId(previousPointer.latest_snapshot_sha256));
    const expectedContentSha256 = input.insights ? sha256(JSON.stringify(input.insights)) : null;
    if (
      latest &&
      latest.history_state_sha256 === input.history?.state_sha256 &&
      latest.manifest_sha256 === (input.producer?.manifest_sha256 || null) &&
      latest.content_sha256 === expectedContentSha256 &&
      latest.produced_at === input.producer?.produced_at
    ) {
      const read = await readPrivateGscSnapshot(store, { now });
      return {
        ok: read.status === "CURRENT",
        status: read.status,
        promoted: false,
        contains_insights: Boolean(input.insights),
        idempotent: true,
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        snapshot_sha256: latest.snapshot_sha256,
        producer_manifest_sha256: read.meta?.producer_manifest_sha256 || null,
        consumer_manifest_sha256: read.meta?.consumer_manifest_sha256 || null,
        as_of: read.meta?.as_of || latest.as_of,
        ingested_at: latest.ingested_at,
        published_at: read.meta?.ingested_at || null,
        content_sha256: latest.content_sha256,
        history_state_sha256: latest.history_state_sha256,
      };
    }
  }
  const snapshot = buildSnapshot(input, { now });
  const snapshotValidation = validateSnapshot(snapshot, { now });
  await putImmutable(store, snapshot);
  const promoted = snapshotValidation.status === "CURRENT";
  const pointer = seal({
    schema_version: POINTER_SCHEMA_VERSION,
    current_snapshot_sha256: promoted
      ? snapshot.snapshot_sha256
      : previousPointer?.current_snapshot_sha256 || null,
    latest_snapshot_sha256: snapshot.snapshot_sha256,
    previous_snapshot_sha256: promoted
      ? previousPointer?.current_snapshot_sha256 || null
      : previousPointer?.previous_snapshot_sha256 || null,
    updated_at: now.toISOString(),
  }, "pointer_sha256");
  await store.putSystemRecord(CURRENT_POINTER_ID, pointer);
  const read = await readPrivateGscSnapshot(store, { now });
  if (read.status !== snapshotValidation.status) {
    throw new Error(read.error || "gsc_private_read_after_write_failed");
  }
  return {
    ok: true,
    current: read.status === "CURRENT",
    status: read.status,
    promoted,
    contains_insights: Boolean(snapshot.insights),
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    snapshot_sha256: snapshot.snapshot_sha256,
    producer_manifest_sha256: read.meta?.producer_manifest_sha256 || null,
    consumer_manifest_sha256: read.meta?.consumer_manifest_sha256 || null,
    as_of: read.meta?.as_of || snapshot.as_of,
    ingested_at: snapshot.ingested_at,
    published_at: read.meta?.ingested_at || null,
    content_sha256: snapshot.content_sha256,
    history_state_sha256: snapshot.history_state_sha256,
  };
}

async function readPrivateGscSnapshot(store, { now = new Date() } = {}) {
  const pointer = await store.getSystemRecord(CURRENT_POINTER_ID);
  const pointerValidation = validatePointer(pointer);
  if (!pointerValidation.ok) {
    return { ok: false, status: "UNKNOWN", error: pointerValidation.error, insights: null, meta: null };
  }
  const latest = await store.getSystemRecord(versionId(pointer.latest_snapshot_sha256));
  const latestValidation = validateSnapshot(latest, { now });
  if (!latestValidation.ok) {
    return { ok: false, status: "UNKNOWN", error: latestValidation.error, insights: null, meta: null };
  }
  const snapshot = pointer.current_snapshot_sha256
    ? await store.getSystemRecord(versionId(pointer.current_snapshot_sha256))
    : null;
  const validation = snapshot
    ? validateSnapshot(snapshot, { now })
    : { ok: true, status: "UNKNOWN", freshness: latestValidation.freshness, reason_codes: latestValidation.reason_codes };
  if (!validation.ok) {
    return { ok: false, status: "UNKNOWN", error: validation.error, insights: null, meta: null };
  }
  const latestFailed = pointer.latest_snapshot_sha256 !== pointer.current_snapshot_sha256;
  const effective = latestFailed ? latestValidation : validation;
  const status = effective.status;
  const reasonCodes = effective.reason_codes || [];
  const manifestSha256 = snapshot?.manifest_sha256 || null;
  const deliveredInsights = snapshot?.insights ? {
    ...snapshot.insights,
    ready_for_product_decisions: status === "CURRENT",
    readiness_status: status,
    readiness_access_mode: status === "CURRENT" ? "READ_WRITE" : "READ_ONLY",
    readiness_reason_codes: reasonCodes,
  } : null;
  return {
    ok: status === "CURRENT",
    status,
    access_mode: status === "CURRENT" ? "READ_WRITE" : (snapshot ? "READ_ONLY" : "NONE"),
    insights: deliveredInsights,
    meta: {
      schema_version: snapshot?.schema_version || latest.schema_version,
      manifest_schema_version: snapshot?.manifest_schema_version || latest.manifest_schema_version,
      snapshot_sha256: snapshot?.snapshot_sha256 || null,
      latest_attempt_snapshot_sha256: latest.snapshot_sha256,
      producer_manifest_sha256: manifestSha256,
      consumer_manifest_sha256: manifestSha256,
      as_of: snapshot?.as_of || latest.as_of,
      producer_as_of: snapshot?.as_of || latest.as_of,
      consumer_as_of: snapshot?.insights?.as_of || null,
      produced_at: snapshot?.produced_at || latest.produced_at,
      ingested_at: snapshot?.ingested_at || latest.ingested_at,
      source: snapshot?.source || latest.source,
      source_freshness: effective.freshness,
      delivery_source: "durable_store",
      content_sha256: deliveredInsights ? sha256(JSON.stringify(deliveredInsights)) : null,
      snapshot_content_sha256: snapshot?.content_sha256 || null,
      history_state_sha256: latest.history_state_sha256,
      ready_for_product_decisions: status === "CURRENT",
      reason_codes: reasonCodes,
    },
  };
}

async function readPrivateGscHistory(store, { now = new Date() } = {}) {
  const pointer = await store.getSystemRecord(CURRENT_POINTER_ID);
  const pointerValidation = validatePointer(pointer);
  if (!pointerValidation.ok) {
    return { ok: false, status: "UNKNOWN", error: pointerValidation.error };
  }
  const latest = await store.getSystemRecord(versionId(pointer.latest_snapshot_sha256));
  const validation = validateSnapshot(latest, { now });
  if (!validation.ok) {
    return { ok: false, status: "UNKNOWN", error: validation.error };
  }
  return {
    ok: true,
    status: validation.status,
    history: latest.history,
    meta: {
      state_sha256: latest.history_state_sha256,
      stored_at: latest.ingested_at,
      snapshot_sha256: latest.snapshot_sha256,
      schema_version: latest.schema_version,
    },
  };
}

async function rollbackPrivateGscSnapshot(
  store,
  { snapshot_sha256: targetSnapshotSha256, reason },
  { now = new Date() } = {},
) {
  if (
    !SHA256_RE.test(String(targetSnapshotSha256 || "")) ||
    !/^[a-z0-9][a-z0-9_:-]{2,79}$/.test(String(reason || ""))
  ) {
    throw new Error("gsc_private_rollback_request_invalid");
  }
  const currentPointer = await store.getSystemRecord(CURRENT_POINTER_ID);
  const pointerValidation = validatePointer(currentPointer);
  if (!pointerValidation.ok) throw new Error(pointerValidation.error);
  const target = await store.getSystemRecord(versionId(targetSnapshotSha256));
  const targetValidation = validateSnapshot(target, { now });
  if (!targetValidation.ok || !target?.insights) {
    throw new Error(targetValidation.error || "gsc_private_rollback_target_invalid");
  }
  const pointer = seal({
    schema_version: POINTER_SCHEMA_VERSION,
    current_snapshot_sha256: targetSnapshotSha256,
    latest_snapshot_sha256: targetSnapshotSha256,
    previous_snapshot_sha256: currentPointer.current_snapshot_sha256,
    updated_at: now.toISOString(),
    rollback: {
      from_snapshot_sha256: currentPointer.current_snapshot_sha256,
      to_snapshot_sha256: targetSnapshotSha256,
      reason,
      rolled_back_at: now.toISOString(),
    },
  }, "pointer_sha256");
  await store.putSystemRecord(CURRENT_POINTER_ID, pointer);
  const read = await readPrivateGscSnapshot(store, { now });
  if (read.meta?.snapshot_sha256 !== targetSnapshotSha256) {
    throw new Error("gsc_private_rollback_verify_miss");
  }
  return {
    ok: true,
    current: read.status === "CURRENT",
    status: read.status,
    rolled_back_from_snapshot_sha256: currentPointer.current_snapshot_sha256,
    rolled_back_to_snapshot_sha256: targetSnapshotSha256,
    producer_manifest_sha256: read.meta.producer_manifest_sha256,
    consumer_manifest_sha256: read.meta.consumer_manifest_sha256,
    as_of: read.meta.as_of,
    reason_codes: read.meta.reason_codes,
  };
}

module.exports = {
  SNAPSHOT_SCHEMA_VERSION,
  POINTER_SCHEMA_VERSION,
  persistPrivateGscSnapshot,
  readPrivateGscSnapshot,
  readPrivateGscHistory,
  rollbackPrivateGscSnapshot,
  validateSnapshot,
};
