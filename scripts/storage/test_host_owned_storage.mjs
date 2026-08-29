import { createRequire } from "module";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const {
  HostFileBackend,
  StorageError,
  DIR_MODE,
  FILE_MODE,
} = require("../../netlify/functions/lib/host-file-store.cjs");
const {
  FileStore,
  createStore,
  storageReadiness,
} = require("../../netlify/functions/lib/lead-store.cjs");
const { FileCorrectionStore } = require("../../netlify/functions/correction.cjs");
const { FileOfferStore } = require("../offers/stores/sandbox-store.cjs");
const { createCommercialStore } = require("../../netlify/functions/lib/commercial-event.cjs");
const { createObservationStore } = require("../../netlify/functions/lib/search-observation.cjs");
const { resolveStorageConfig } = require("../../netlify/functions/lib/storage-config.cjs");
const ops = require("../../netlify/functions/ops.cjs");
const {
  buildMigrationBundle,
  importMigrationBundle,
  snapshotStore,
  restoreSnapshot,
  verifySnapshot,
  pruneSnapshots,
} = require("./lib.cjs");

function assert(condition, message, detail) {
  if (!condition) throw new Error(`${message}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
}

function privateDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.chmodSync(dir, DIR_MODE);
  return dir;
}

function sampleLead(id = "lead_host_1", idem = "idem-host-1") {
  return {
    lead_id: id,
    idempotency_key: idem,
    nome: "Pessoa Sensível",
    email: "pii-canary@example.invalid",
    consentimento: true,
    received_at: "2026-08-26T12:00:00.000Z",
    delete_after: "2028-08-26T12:00:00.000Z",
    source: "CONFENGE_WEB",
  };
}

if (process.argv[2] === "--worker-create") {
  const [, , , storeRoot, id, idem] = process.argv;
  try {
    const store = new FileStore(storeRoot);
    await store.put(sampleLead(id, idem), { onlyIfNew: true });
    process.stdout.write("inserted\n");
  } catch (err) {
    if (err && err.code === "ALREADY_EXISTS") process.stdout.write("exists\n");
    else throw err;
  }
  process.exit(0);
}

if (process.argv[2] === "--worker-read") {
  const store = new FileStore(process.argv[3]);
  const row = await store.get(process.argv[4]);
  process.stdout.write(row ? "found\n" : "missing\n");
  process.exit(row ? 0 : 2);
}

const cleanup = [];
try {
  // A read-only readiness call against a provisioned-but-empty host root must
  // observe it without creating the layout, namespaces, locks or probe files.
  const untouchedRoot = privateDir("confenge-read-only-empty-");
  cleanup.push(untouchedRoot);
  const untouchedBefore = fs.readdirSync(untouchedRoot);
  const untouchedReady = storageReadiness({
    NODE_ENV: "production",
    CONFENGE_STORAGE_BACKEND: "filesystem",
    CONFENGE_STORAGE_DIR: untouchedRoot,
  }, { writeProbe: false });
  assert(untouchedReady.ok, "empty provisioned root is not read-only ready", untouchedReady);
  assert(
    JSON.stringify(fs.readdirSync(untouchedRoot)) === JSON.stringify(untouchedBefore),
    "read-only readiness created storage state",
    fs.readdirSync(untouchedRoot),
  );

  const initializedEmptyRoot = privateDir("confenge-read-only-layout-");
  cleanup.push(initializedEmptyRoot);
  const initializedLayout = path.join(initializedEmptyRoot, "v1");
  fs.mkdirSync(initializedLayout, { mode: 0o700 });
  const initializedBefore = fs.readdirSync(initializedLayout);
  const initializedReady = storageReadiness({
    NODE_ENV: "production",
    CONFENGE_STORAGE_BACKEND: "filesystem",
    CONFENGE_STORAGE_DIR: initializedEmptyRoot,
  }, { writeProbe: false });
  assert(initializedReady.ok, "initialized empty root is not read-only ready", initializedReady);
  assert(
    JSON.stringify(fs.readdirSync(initializedLayout)) === JSON.stringify(initializedBefore),
    "read-only readiness created namespaces",
    fs.readdirSync(initializedLayout),
  );

  // The scheduled consumer calls this authenticated GET. Opening the actual
  // ops store for that route must be just as non-mutating as readiness itself.
  const readOnlyOpsRoot = privateDir("confenge-read-only-ops-");
  cleanup.push(readOnlyOpsRoot);
  const envKeys = [
    "NODE_ENV", "CONFENGE_STORAGE_BACKEND", "CONFENGE_STORAGE_DIR",
    "LEAD_REQUIRE_ORIGIN", "LEAD_REQUIRE_TURNSTILE", "TURNSTILE_SECRET_KEY",
    "IP_HASH_SALT", "OPS_TOKEN", "LEAD_STORE", "LEAD_STORE_DIR",
  ];
  const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: "production",
    CONFENGE_STORAGE_BACKEND: "filesystem",
    CONFENGE_STORAGE_DIR: readOnlyOpsRoot,
    LEAD_REQUIRE_ORIGIN: "1",
    LEAD_REQUIRE_TURNSTILE: "1",
    TURNSTILE_SECRET_KEY: "test-turnstile-secret-123456",
    IP_HASH_SALT: "test-private-ip-hash-salt-32-characters",
    OPS_TOKEN: "test-ops-token-at-least-16-chars",
  });
  delete process.env.LEAD_STORE;
  delete process.env.LEAD_STORE_DIR;
  try {
    const beforeOpsGet = fs.readdirSync(readOnlyOpsRoot);
    const response = await ops.handler({
      httpMethod: "GET",
      headers: { authorization: "Bearer test-ops-token-at-least-16-chars" },
      queryStringParameters: { action: "gsc_insights" },
      rawUrl: "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights",
    });
    const body = JSON.parse(response.body);
    assert(response.statusCode === 200 && body.status === "UNKNOWN", "empty GSC consumer did not fail closed", body);
    assert(
      JSON.stringify(fs.readdirSync(readOnlyOpsRoot)) === JSON.stringify(beforeOpsGet),
      "authenticated GSC GET initialized storage",
      fs.readdirSync(readOnlyOpsRoot),
    );
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  // CRUD/list/system/idempotency, modes and restart durability.
  const storeRoot = privateDir("confenge-host-store-");
  cleanup.push(storeRoot);
  let store = new FileStore(storeRoot);
  const lead = sampleLead();
  await store.put(lead, { onlyIfNew: true });
  assert((await store.get(lead.lead_id)).email === lead.email, "get failed");
  assert((await store.getByIdempotency(lead.idempotency_key)).lead_id === lead.lead_id, "idempotency lookup failed");
  assert((await store.list()).length === 1, "list failed");
  const updated = await store.update(lead.lead_id, { status: "updated" });
  assert(updated.status === "updated" && (await store.get(lead.lead_id)).status === "updated", "update failed");
  const immutable = await store.update(lead.lead_id, { lead_id: "changed", idempotency_key: "changed" });
  assert(immutable.lead_id === lead.lead_id && immutable.idempotency_key === lead.idempotency_key, "update mutated record identity");
  await store.putSystemRecord("system-state", { version: 1 });
  assert((await store.getSystemRecord("system-state")).version === 1, "system record failed");
  const recordFile = store.records.pathForKey(lead.lead_id);
  assert(!path.basename(recordFile).includes("lead_host") && !path.basename(recordFile).includes("Pessoa"), "PII or logical ID leaked in filename");
  assert((fs.statSync(storeRoot).mode & 0o777) === DIR_MODE, "root mode is not 0700");
  assert((fs.statSync(path.dirname(recordFile)).mode & 0o777) === DIR_MODE, "namespace mode is not 0700");
  assert((fs.statSync(recordFile).mode & 0o777) === FILE_MODE, "record mode is not 0600");
  const restarted = await execFileAsync(process.execPath, [fileURLToPath(import.meta.url), "--worker-read", storeRoot, lead.lead_id]);
  assert(restarted.stdout.trim() === "found", "restart did not retain data");
  // A read-only audit must not acquire/create the writer lock. This makes the
  // production store inspectable without changing its evidence timestamps.
  const writerLock = path.join(store.backend.layoutDir, ".writer-lock");
  const originalOpenSync = fs.openSync;
  let writerLockCreateAttempts = 0;
  fs.openSync = function auditedOpenSync(target, flags, ...args) {
    if (target === writerLock && (Number(flags) & fs.constants.O_CREAT) !== 0) {
      writerLockCreateAttempts += 1;
      const err = new Error("read_only_audit_attempted_writer_lock");
      err.code = "EROFS";
      throw err;
    }
    return originalOpenSync.call(fs, target, flags, ...args);
  };
  let readOnlyReady;
  try {
    readOnlyReady = storageReadiness({
      CONFENGE_STORAGE_BACKEND: "filesystem",
      CONFENGE_STORAGE_DIR: storeRoot,
    }, { writeProbe: false });
  } finally {
    fs.openSync = originalOpenSync;
  }
  assert(readOnlyReady.ok, "read-only readiness failed", readOnlyReady);
  assert(writerLockCreateAttempts === 0 && !fs.existsSync(writerLock), "read-only readiness mutated the writer lock", {
    writerLockCreateAttempts,
    writerLockExists: fs.existsSync(writerLock),
  });
  assert(await store.delete(lead.lead_id), "delete failed");
  assert(await store.get(lead.lead_id) === null && await store.getByIdempotency(lead.idempotency_key) === null, "delete left record or index");

  // Crash between the atomic record commit and derived index commit never
  // loses the durable receipt or admits a duplicate. Read-only readiness fails
  // closed until an authorized read/write process repairs the derived index.
  const interruptedRoot = privateDir("confenge-interrupted-index-");
  cleanup.push(interruptedRoot);
  const interruptedStore = new FileStore(interruptedRoot);
  const interruptedLead = sampleLead("lead_interrupted", "idem_interrupted");
  const originalIndexPut = interruptedStore.idempotency._putUnlocked.bind(interruptedStore.idempotency);
  interruptedStore.idempotency._putUnlocked = () => {
    const error = new Error("injected_index_commit_failure");
    error.code = "STORE_WRITE_FAILED";
    throw error;
  };
  let interruptedCode = null;
  try { await interruptedStore.put(interruptedLead, { onlyIfNew: true }); } catch (err) { interruptedCode = err.code; }
  assert(interruptedCode === "STORE_WRITE_FAILED", "index interruption was not injected", interruptedCode);
  assert((await interruptedStore.get(interruptedLead.lead_id)).lead_id === interruptedLead.lead_id, "committed receipt was rolled back");
  interruptedStore.idempotency._putUnlocked = originalIndexPut;
  const missingIndexReady = storageReadiness({
    CONFENGE_STORAGE_BACKEND: "filesystem",
    CONFENGE_STORAGE_DIR: interruptedRoot,
  }, { writeProbe: false });
  assert(!missingIndexReady.ok && missingIndexReady.code === "STORE_INDEX_MISSING", "missing derived index did not fail closed", missingIndexReady);
  const repairStore = new FileStore(interruptedRoot);
  assert((await repairStore.getByIdempotency(interruptedLead.idempotency_key)).lead_id === interruptedLead.lead_id, "derived index did not self-heal");
  let replayCode = null;
  try { await repairStore.put({ ...interruptedLead, lead_id: "lead_interrupted_duplicate" }, { onlyIfNew: true }); } catch (err) { replayCode = err.code; }
  assert(replayCode === "ALREADY_EXISTS", "interrupted retry admitted a duplicate", replayCode);
  assert(storageReadiness({ CONFENGE_STORAGE_BACKEND: "filesystem", CONFENGE_STORAGE_DIR: interruptedRoot }, { writeProbe: false }).ok, "repaired index remained unready");

  // 64 independent processes racing on the same deterministic receipt.
  const raceIds = ["lead_race_same_receipt_a", "lead_race_same_receipt_b"];
  const raceIdem = "idem-race-same-request";
  const workers = Array.from({ length: 64 }, (_, index) =>
    execFileAsync(process.execPath, [fileURLToPath(import.meta.url), "--worker-create", storeRoot, raceIds[index % 2], raceIdem]),
  );
  const results = await Promise.all(workers);
  const outcomes = results.map((row) => row.stdout.trim());
  assert(outcomes.filter((row) => row === "inserted").length === 1, "concurrent create must have one winner", outcomes);
  assert(outcomes.filter((row) => row === "exists").length === 63, "concurrent create must dedupe all replays", outcomes);
  store = new FileStore(storeRoot);
  assert((await store.list()).length === 1, "race produced duplicate records");
  assert(raceIds.includes((await store.getByIdempotency(raceIdem)).lead_id), "race lost idempotency index");

  // Traversal is inert because all logical keys are full-hash filenames.
  const traversalNs = store.backend.namespace("traversal-test");
  traversalNs.put("../../outside-sensitive.json", { safe: true }, { onlyIfNew: true });
  assert(!fs.existsSync(path.join(path.dirname(storeRoot), "outside-sensitive.json")), "path traversal escaped store");
  assert(/^[0-9a-f]{64}\.json$/.test(path.basename(traversalNs.pathForKey("../../outside-sensitive.json"))), "key was not hashed");

  // Symlink records and namespace paths are rejected without touching targets.
  const symlinkNs = store.backend.namespace("symlink-test");
  const outside = path.join(path.dirname(storeRoot), `confenge-outside-${process.pid}.json`);
  fs.writeFileSync(outside, "outside-safe", { mode: FILE_MODE });
  cleanup.push(outside);
  const symlinkFile = symlinkNs.pathForKey("attacked");
  fs.symlinkSync(outside, symlinkFile);
  let symlinkCode = null;
  try { symlinkNs.get("attacked"); } catch (err) { symlinkCode = err.code; }
  assert(symlinkCode === "STORE_SYMLINK", "symlink attack was not rejected", symlinkCode);
  assert(fs.readFileSync(outside, "utf8") === "outside-safe", "symlink target was modified");
  fs.unlinkSync(symlinkFile);
  const namespaceTarget = privateDir("confenge-namespace-target-");
  cleanup.push(namespaceTarget);
  const namespaceLink = path.join(store.backend.layoutDir, "namespace-link");
  fs.symlinkSync(namespaceTarget, namespaceLink);
  let namespaceLinkCode = null;
  try { store.backend.namespace("namespace-link"); } catch (err) { namespaceLinkCode = err.code; }
  assert(namespaceLinkCode === "STORE_SYMLINK", "symlink namespace accepted", namespaceLinkCode);
  fs.unlinkSync(namespaceLink);

  // Corrupt records fail explicitly, remain on disk, and make readiness false.
  const corruptNs = store.backend.namespace("corrupt-test");
  corruptNs.put("bad", { ok: true });
  const corruptFile = corruptNs.pathForKey("bad");
  fs.writeFileSync(corruptFile, "{truncated", { mode: FILE_MODE });
  let corruptCode = null;
  try { corruptNs.get("bad"); } catch (err) { corruptCode = err.code; }
  assert(corruptCode === "STORE_CORRUPT" && fs.existsSync(corruptFile), "corruption was hidden or deleted", corruptCode);
  const corruptReady = storageReadiness({ CONFENGE_STORAGE_BACKEND: "filesystem", CONFENGE_STORAGE_DIR: storeRoot }, { writeProbe: false });
  assert(!corruptReady.ok && corruptReady.code === "STORE_CORRUPT", "corruption did not fail readiness", corruptReady);
  fs.unlinkSync(corruptFile);
  const orphan = path.join(corruptNs.dir, `.tmp-orphan-${process.pid}`);
  fs.writeFileSync(orphan, "orphan", { mode: FILE_MODE });
  const orphanReady = storageReadiness({ CONFENGE_STORAGE_BACKEND: "filesystem", CONFENGE_STORAGE_DIR: storeRoot }, { writeProbe: false });
  assert(!orphanReady.ok && orphanReady.code === "STORE_TEMP_ORPHANED", "orphan temp did not fail readiness", orphanReady);
  fs.unlinkSync(orphan);

  // Missing, relative, insecure and symlinked roots fail closed.
  for (const [label, factory, codes] of [
    ["relative", () => new HostFileBackend("relative/store"), ["STORE_PATH_NOT_ABSOLUTE"]],
    ["missing", () => new HostFileBackend(path.join(os.tmpdir(), `missing-${cryptoRandom()}`)), ["STORE_ROOT_MISSING"]],
  ]) {
    let code = null;
    try { factory(); } catch (err) { code = err.code; }
    assert(codes.includes(code), `${label} path did not fail closed`, code);
  }
  const insecure = privateDir("confenge-insecure-");
  cleanup.push(insecure);
  fs.chmodSync(insecure, 0o755);
  let insecureCode = null;
  try { new HostFileBackend(insecure); } catch (err) { insecureCode = err.code; }
  assert(insecureCode === "STORE_INSECURE_PERMISSIONS", "insecure permissions accepted", insecureCode);
  fs.chmodSync(insecure, 0o500);
  const deniedReady = storageReadiness({ NODE_ENV: "production", CONFENGE_STORAGE_BACKEND: "filesystem", CONFENGE_STORAGE_DIR: insecure }, { writeProbe: false });
  assert(!deniedReady.ok, "permission-denied storage reported ready", deniedReady);
  fs.chmodSync(insecure, DIR_MODE);
  const rootTarget = privateDir("confenge-root-target-");
  const rootLink = `${rootTarget}-link`;
  cleanup.push(rootTarget, rootLink);
  fs.symlinkSync(rootTarget, rootLink);
  let rootLinkCode = null;
  try { new HostFileBackend(rootLink); } catch (err) { rootLinkCode = err.code; }
  assert(rootLinkCode === "STORE_SYMLINK", "symlink root accepted", rootLinkCode);

  // Production filesystem starts and probes without Blobs context or package load.
  const netcupRoot = privateDir("confenge-netcup-store-");
  cleanup.push(netcupRoot);
  const productionEnv = {
    NODE_ENV: "production",
    CONFENGE_STORAGE_BACKEND: "filesystem",
    CONFENGE_STORAGE_DIR: netcupRoot,
    LEAD_REQUIRE_ORIGIN: "1",
    LEAD_REQUIRE_TURNSTILE: "1",
    TURNSTILE_SECRET_KEY: "test-turnstile-secret-123456",
    IP_HASH_SALT: "test-private-ip-hash-salt-32-characters",
  };
  const Module = require("module");
  const originalLoad = Module._load;
  let blobLoads = 0;
  Module._load = function patched(request, ...rest) {
    if (request === "@netlify/blobs") { blobLoads += 1; throw new Error("blobs_forbidden_on_netcup"); }
    return originalLoad.call(this, request, ...rest);
  };
  try {
    const netcupStore = await createStore({ env: productionEnv });
    assert(netcupStore && !netcupStore.ephemeral, "production filesystem did not start");
    await netcupStore.put(sampleLead("lead_netcup", "idem_netcup"), { onlyIfNew: true });
    assert((await netcupStore.get("lead_netcup")).lead_id === "lead_netcup", "production filesystem roundtrip failed");
    assert(storageReadiness(productionEnv).ok, "production filesystem readiness false");
    assert(blobLoads === 0, "filesystem path loaded @netlify/blobs", blobLoads);
  } finally {
    Module._load = originalLoad;
  }
  const missingReady = storageReadiness({ NODE_ENV: "production" });
  assert(!missingReady.ok && missingReady.code === "storage_backend_required", "missing production backend did not fail readiness", missingReady);
  const legacyNetlify = resolveStorageConfig({ NODE_ENV: "production" }, { blobs: {} });
  assert(legacyNetlify.ok && legacyNetlify.backend === "netlify-blobs" && legacyNetlify.legacy, "Netlify event context compatibility was removed", legacyNetlify);
  const explicitFilesystem = resolveStorageConfig(productionEnv, { blobs: {} });
  assert(explicitFilesystem.ok && explicitFilesystem.backend === "filesystem", "explicit filesystem selection lost precedence", explicitFilesystem);
  const missingPathReady = storageReadiness({ NODE_ENV: "production", CONFENGE_STORAGE_BACKEND: "filesystem", CONFENGE_STORAGE_DIR: path.join(os.tmpdir(), `missing-${cryptoRandom()}`) });
  assert(!missingPathReady.ok && missingPathReady.code === "STORE_ROOT_MISSING", "missing storage path did not fail readiness", missingPathReady);
  const memoryReady = storageReadiness({ NODE_ENV: "production", CONFENGE_STORAGE_BACKEND: "memory" });
  assert(!memoryReady.ok, "production memory readiness was true", memoryReady);
  assert(await createCommercialStore({ NODE_ENV: "production", LEAD_STORE: "memory" }) === null, "commercial store accepted production memory");
  assert(await createObservationStore({ NODE_ENV: "production", LEAD_STORE: "memory" }) === null, "observation store accepted production memory");

  // Correction and offer adapters use the same durable primitive.
  const correction = new FileCorrectionStore(netcupRoot);
  await correction.put({ receipt_id: "correction_1", contact: "pii@example.invalid" });
  assert((await correction.list()).length === 1 && (await correction.get("correction_1")).contact, "correction adapter failed");
  await correction.delete("correction_1");
  const offers = new FileOfferStore(netcupRoot, { namespace: "offers-sandbox" });
  const offerFirst = await offers.putIfAbsent("checkout:key", { kind: "checkout" });
  const offerReplay = await offers.putIfAbsent("checkout:key", { kind: "other" });
  assert(offerFirst.inserted && !offerReplay.inserted && offerReplay.value.kind === "checkout", "offer create-only failed");

  // Migration: dry-run, create-only import, second import idempotent, no PII in manifest.
  const bundleRoot = path.join(privateDir("confenge-bundle-parent-"), "bundle");
  cleanup.push(path.dirname(bundleRoot));
  const migrationRecords = [
    { class: "leads", key: "lead_migration", value: sampleLead("lead_migration", "idem_migration") },
    { class: "nurture_suppressions", key: "email-hash", value: { email_hash: "email-hash", reason: "unsubscribe" } },
    { class: "analytics", key: "events/by-id/test", value: { events: [{ event: "lead_created", ts: "2026-08-26T00:00:00Z" }] } },
  ];
  const manifest = buildMigrationBundle(migrationRecords, bundleRoot);
  assert(!JSON.stringify(manifest).includes("pii-canary"), "migration manifest leaked payload");
  const importRoot = privateDir("confenge-import-store-");
  cleanup.push(importRoot);
  const dryImport = await importMigrationBundle(bundleRoot, importRoot);
  assert(dryImport.dry_run && dryImport.status === "DRY_RUN_READY" && dryImport.inserted === 3 && (await new FileStore(importRoot).get("lead_migration")) === null, "migration dry-run wrote data");
  const firstImport = await importMigrationBundle(bundleRoot, importRoot, { apply: true });
  const secondImport = await importMigrationBundle(bundleRoot, importRoot, { apply: true });
  assert(firstImport.inserted === 3 && secondImport.idempotent === 3 && secondImport.conflicts === 0, "migration import is not idempotent", { firstImport, secondImport });
  assert((await new FileStore(importRoot).getByIdempotency("idem_migration")).lead_id === "lead_migration", "migration did not rebuild idempotency index");
  const migrationScript = path.join(root, "scripts/storage/migrate.mjs");
  const reconciled = JSON.parse((await execFileAsync(process.execPath, [migrationScript, "reconcile", "--source", bundleRoot, "--store", importRoot])).stdout);
  assert(reconciled.status === "RECONCILED" && reconciled.present === 3 && reconciled.missing === 0, "reconciliation report is incomplete", reconciled);
  const exportEnv = { ...process.env };
  for (const name of ["NETLIFY_BLOBS_SITE_ID", "SITE_ID", "NETLIFY_SITE_ID", "NETLIFY_BLOBS_TOKEN", "NETLIFY_API_TOKEN", "NETLIFY_AUTH_TOKEN"]) delete exportEnv[name];
  let externalExport;
  try {
    await execFileAsync(process.execPath, [migrationScript, "export-netlify"], { env: exportEnv });
  } catch (err) {
    externalExport = JSON.parse(err.stdout);
  }
  assert(externalExport?.status === "EXTERNAL_EXPORT_REQUIRED" && externalExport?.required_env?.length === 2, "external export procedure missing", externalExport);

  // Retention deletes expired records + idempotency, but preserves suppressions.
  const retentionLead = sampleLead("lead_expired", "idem_expired");
  retentionLead.delete_after = "2020-01-01T00:00:00Z";
  const importStore = new FileStore(importRoot);
  await importStore.put(retentionLead, { onlyIfNew: true });
  const retentionScript = path.join(root, "scripts/storage/retention.mjs");
  const dryRetention = JSON.parse((await execFileAsync(process.execPath, [retentionScript, "--store", importRoot, "--now", "2026-08-26T00:00:00Z"])).stdout);
  assert(dryRetention.expired >= 1 && await importStore.get("lead_expired"), "retention dry-run mutated data");
  const appliedRetention = JSON.parse((await execFileAsync(process.execPath, [retentionScript, "--store", importRoot, "--now", "2026-08-26T00:00:00Z", "--apply"])).stdout);
  assert(appliedRetention.deleted >= 1 && await importStore.get("lead_expired") === null && await importStore.getByIdempotency("idem_expired") === null, "retention apply failed");
  assert(appliedRetention.suppressions_preserved === 1, "retention removed suppression");

  // Apply is all-or-nothing when any governed record has no valid timestamp.
  const malformedRetentionRoot = privateDir("confenge-retention-malformed-");
  cleanup.push(malformedRetentionRoot);
  const malformedRetentionStore = new FileStore(malformedRetentionRoot);
  await malformedRetentionStore.put({ ...sampleLead("lead_retention_expired", "idem_retention_expired"), delete_after: "2020-01-01T00:00:00Z" }, { onlyIfNew: true });
  await malformedRetentionStore.put({ ...sampleLead("lead_retention_missing", "idem_retention_missing"), delete_after: undefined, received_at: undefined }, { onlyIfNew: true });
  await malformedRetentionStore.put({ ...sampleLead("lead_retention_invalid", "idem_retention_invalid"), delete_after: "not-a-date" }, { onlyIfNew: true });
  let blockedRetention;
  try {
    await execFileAsync(process.execPath, [retentionScript, "--store", malformedRetentionRoot, "--now", "2026-08-26T00:00:00Z", "--apply"]);
  } catch (err) {
    blockedRetention = JSON.parse(err.stdout);
  }
  assert(
    blockedRetention?.blocked === true && blockedRetention.reason === "malformed_retention" && blockedRetention.deleted === 0,
    "malformed retention did not block the whole apply",
    blockedRetention,
  );
  assert(await malformedRetentionStore.get("lead_retention_expired"), "blocked retention partially deleted expired data");
  assert(await malformedRetentionStore.get("lead_retention_missing"), "missing timestamp was silently deleted");
  assert(await malformedRetentionStore.get("lead_retention_invalid"), "invalid timestamp was silently deleted");

  // Consistent snapshot/checksum and restore only into a new directory.
  const backupRoot = privateDir("confenge-backups-");
  cleanup.push(backupRoot);
  const drySnapshot = snapshotStore(importRoot, backupRoot);
  assert(drySnapshot.dry_run && !fs.existsSync(drySnapshot.snapshot), "snapshot dry-run wrote files");
  const snapshot = snapshotStore(importRoot, backupRoot, { apply: true, now: new Date("2026-08-26T15:00:00Z") });
  const verified = verifySnapshot(snapshot.snapshot);
  assert(verified.manifest.aggregate_sha256 === snapshot.aggregate_sha256, "snapshot verification failed");
  let invalidRetain = false;
  try { pruneSnapshots(backupRoot, "invalid", { apply: true }); } catch { invalidRetain = true; }
  assert(invalidRetain && fs.existsSync(snapshot.snapshot), "invalid backup retention removed data");
  const restoredRoot = path.join(os.tmpdir(), `confenge-restored-${process.pid}-${Date.now()}`);
  cleanup.push(restoredRoot);
  const restoreDry = restoreSnapshot(snapshot.snapshot, restoredRoot);
  assert(restoreDry.dry_run && !fs.existsSync(restoredRoot), "restore dry-run wrote target");
  const restored = restoreSnapshot(snapshot.snapshot, restoredRoot, { apply: true });
  assert(restored.status === "RESTORE_VALIDATED_NOT_ACTIVATED", "restore status unsafe", restored);
  assert((await new FileStore(restoredRoot).get("lead_migration")).lead_id === "lead_migration", "restored data mismatch");
  let existingTargetCode = null;
  try { restoreSnapshot(snapshot.snapshot, restoredRoot, { apply: true }); } catch (err) { existingTargetCode = err.code; }
  assert(existingTargetCode === "PATH_EXISTS", "restore overwrote existing target", existingTargetCode);

  console.log("HOST_OWNED_STORAGE_TESTS_OK", JSON.stringify({ concurrency: 64, migration: manifest.total, snapshot_files: snapshot.file_count }));
} finally {
  for (const target of cleanup.reverse()) {
    try {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || stat.isFile()) fs.unlinkSync(target);
      else fs.rmSync(target, { recursive: true });
    } catch {
      // test cleanup only
    }
  }
}

function cryptoRandom() {
  return `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
