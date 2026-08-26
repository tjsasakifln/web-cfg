const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  HostFileBackend,
  DIR_MODE,
  FILE_MODE,
  canonicalJson,
  isWithin,
} = require("../../netlify/functions/lib/host-file-store.cjs");
const { FileStore } = require("../../netlify/functions/lib/lead-store.cjs");

const REPO_ROOT = path.resolve(__dirname, "../..");
const BUNDLE_SCHEMA = "confenge-storage-migration/v1";
const SNAPSHOT_SCHEMA = "confenge-storage-snapshot/v1";
const CLASS_NAMESPACES = Object.freeze({
  leads: "leads",
  analytics: "analytics-events",
  nurture_subscriptions: "nurture-subscriptions",
  nurture_suppressions: "nurture-suppressions",
  corrections: "corrections",
  commercial_events: "commercial-events",
  search_observations: "search-observations",
  system_records: "ops-system",
  offers_sandbox: "offers-sandbox",
  offers_production: "offers-production",
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function ensureAbsoluteOutside(candidate, forbidden, { mustExist = false, mustNotExist = false } = {}) {
  if (!candidate || !path.isAbsolute(candidate)) throw Object.assign(new Error("path_not_absolute"), { code: "PATH_NOT_ABSOLUTE" });
  const resolved = path.resolve(candidate);
  for (const root of [REPO_ROOT, ...(forbidden || [])].map((p) => path.resolve(p))) {
    if (isWithin(resolved, root) || isWithin(root, resolved)) {
      throw Object.assign(new Error("path_overlaps_forbidden_root"), { code: "PATH_OVERLAPS_FORBIDDEN_ROOT" });
    }
  }
  if (mustExist && !fs.existsSync(resolved)) throw Object.assign(new Error("path_missing"), { code: "PATH_MISSING" });
  if (mustNotExist && fs.existsSync(resolved)) throw Object.assign(new Error("path_exists"), { code: "PATH_EXISTS" });
  const inspected = fs.existsSync(resolved) ? resolved : path.dirname(resolved);
  let stat;
  try {
    stat = fs.lstatSync(inspected);
  } catch {
    throw Object.assign(new Error("path_parent_missing"), { code: "PATH_PARENT_MISSING" });
  }
  if (stat.isSymbolicLink()) throw Object.assign(new Error("path_symlink_refused"), { code: "PATH_SYMLINK_REFUSED" });
  const real = fs.realpathSync.native(inspected);
  if (real !== inspected) throw Object.assign(new Error("path_symlink_component_refused"), { code: "PATH_SYMLINK_REFUSED" });
  return resolved;
}

function assertPrivateDirectory(dir) {
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("private_directory_invalid");
  if ((stat.mode & 0o777) !== DIR_MODE) throw new Error("private_directory_permissions_invalid");
}

function assertPrivateFile(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("private_file_invalid");
  if ((stat.mode & 0o777) !== FILE_MODE) throw new Error("private_file_permissions_invalid");
}

function fsyncFile(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function fsyncDirectory(dir) {
  const fd = fs.openSync(dir, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0));
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function writePrivateJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: FILE_MODE, flag: "wx" });
  fs.chmodSync(file, FILE_MODE);
  fsyncFile(file);
  fsyncDirectory(path.dirname(file));
}

function readJson(file) {
  assertPrivateFile(file);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function aggregateHash(entries) {
  return sha256(entries
    .map((row) => `${row.class || "file"}\0${row.key_sha256 || row.path}\0${row.payload_sha256 || row.sha256}`)
    .sort()
    .join("\n"));
}

function buildMigrationBundle(records, outDir, { source = "netlify-blobs", createdAt = new Date().toISOString() } = {}) {
  const target = ensureAbsoluteOutside(outDir, [], { mustNotExist: true });
  assertPrivateDirectory(path.dirname(target));
  fs.mkdirSync(target, { mode: DIR_MODE });
  fs.mkdirSync(path.join(target, "records"), { mode: DIR_MODE });
  fs.chmodSync(target, DIR_MODE);
  fs.chmodSync(path.join(target, "records"), DIR_MODE);
  const entries = [];
  const counts = {};
  records
    .slice()
    .sort((a, b) => `${a.class}:${a.key}`.localeCompare(`${b.class}:${b.key}`))
    .forEach((record, index) => {
      if (!CLASS_NAMESPACES[record.class]) throw new Error(`unsupported_class:${record.class}`);
      const payloadSha = sha256(canonicalJson(record.value));
      const keySha = sha256(String(record.key));
      const name = `${String(index + 1).padStart(8, "0")}-${keySha}.json`;
      writePrivateJson(path.join(target, "records", name), {
        schema: "confenge-storage-migration-record/v1",
        class: record.class,
        key: String(record.key),
        value: record.value,
      });
      entries.push({ class: record.class, record_file: name, key_sha256: keySha, payload_sha256: payloadSha });
      counts[record.class] = (counts[record.class] || 0) + 1;
    });
  const manifest = {
    schema: BUNDLE_SCHEMA,
    state: "LIVE_DATA_MIGRATION_NOT_YET_EXECUTED",
    source,
    created_at: createdAt,
    counts,
    total: entries.length,
    aggregate_sha256: aggregateHash(entries),
    entries,
  };
  writePrivateJson(path.join(target, "manifest.json"), manifest);
  fsyncDirectory(path.join(target, "records"));
  fsyncDirectory(target);
  fsyncDirectory(path.dirname(target));
  return manifest;
}

function loadMigrationBundle(bundleDir) {
  const source = ensureAbsoluteOutside(bundleDir, [], { mustExist: true });
  assertPrivateDirectory(source);
  assertPrivateDirectory(path.join(source, "records"));
  const manifest = readJson(path.join(source, "manifest.json"));
  if (manifest.schema !== BUNDLE_SCHEMA || !Array.isArray(manifest.entries)) throw new Error("migration_manifest_invalid");
  const actualRecordFiles = fs.readdirSync(path.join(source, "records")).sort();
  const declaredRecordFiles = manifest.entries.map((entry) => entry.record_file).sort();
  if (canonicalJson(actualRecordFiles) !== canonicalJson(declaredRecordFiles)) throw new Error("migration_record_set_mismatch");
  const records = [];
  const counts = {};
  const identities = new Set();
  for (const entry of manifest.entries) {
    if (!/^[0-9]{8}-[0-9a-f]{64}\.json$/.test(entry.record_file || "")) throw new Error("migration_record_path_invalid");
    if (!CLASS_NAMESPACES[entry.class]) throw new Error("migration_class_invalid");
    const row = readJson(path.join(source, "records", entry.record_file));
    if (
      row.schema !== "confenge-storage-migration-record/v1" ||
      row.class !== entry.class ||
      sha256(String(row.key)) !== entry.key_sha256 ||
      sha256(canonicalJson(row.value)) !== entry.payload_sha256
    ) throw new Error("migration_record_hash_mismatch");
    const identity = `${row.class}\0${row.key}`;
    if (identities.has(identity)) throw new Error("migration_record_duplicate");
    identities.add(identity);
    if (row.class === "leads" && String(row.value && row.value.lead_id || "") !== String(row.key)) {
      throw new Error("migration_lead_identity_mismatch");
    }
    counts[row.class] = (counts[row.class] || 0) + 1;
    records.push(row);
  }
  if (
    manifest.total !== records.length ||
    canonicalJson(manifest.counts || {}) !== canonicalJson(counts) ||
    manifest.aggregate_sha256 !== aggregateHash(manifest.entries)
  ) {
    throw new Error("migration_manifest_reconciliation_failed");
  }
  return { source, manifest, records };
}

async function importMigrationBundle(bundleDir, storeRoot, { apply = false } = {}) {
  const bundle = loadMigrationBundle(bundleDir);
  const root = ensureAbsoluteOutside(storeRoot, [bundle.source], { mustExist: true });
  const backend = new HostFileBackend(root);
  const report = { dry_run: !apply, inserted: 0, idempotent: 0, conflicts: 0, classes: {} };
  const leads = new FileStore(root, { backend, namespace: "leads" });
  for (const record of bundle.records) {
    const cls = record.class;
    const stats = report.classes[cls] || (report.classes[cls] = { inserted: 0, idempotent: 0, conflicts: 0 });
    let existing;
    if (cls === "leads") existing = await leads.get(record.key);
    else existing = backend.namespace(CLASS_NAMESPACES[cls]).get(record.key);
    if (existing) {
      if (canonicalJson(existing) === canonicalJson(record.value)) {
        report.idempotent += 1;
        stats.idempotent += 1;
      } else {
        report.conflicts += 1;
        stats.conflicts += 1;
      }
      continue;
    }
    if (apply) {
      if (cls === "leads") await leads.put(record.value, { onlyIfNew: true });
      else backend.namespace(CLASS_NAMESPACES[cls]).put(record.key, record.value, { onlyIfNew: true });
    }
    report.inserted += 1;
    stats.inserted += 1;
  }
  report.status = report.conflicts
    ? "RECONCILIATION_CONFLICT"
    : report.inserted
      ? (apply ? "IMPORTED" : "DRY_RUN_READY")
      : "RECONCILED";
  if (apply && report.conflicts) throw Object.assign(new Error("migration_conflict"), { code: "MIGRATION_CONFLICT", report });
  return report;
}

function listFiles(root, relative = "", { skipTransient = false } = {}) {
  const out = [];
  const dir = path.join(root, relative);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".writer-lock" || entry.name.startsWith(".tmp-")) {
      if (skipTransient) continue;
      throw new Error("snapshot_transient_file_refused");
    }
    const rel = path.join(relative, entry.name);
    const abs = path.join(root, rel);
    const stat = fs.lstatSync(abs);
    if (stat.isSymbolicLink()) throw new Error("snapshot_symlink_refused");
    if (entry.isDirectory()) out.push(...listFiles(root, rel, { skipTransient }));
    else if (entry.isFile()) out.push(rel);
    else throw new Error("snapshot_special_file_refused");
  }
  return out;
}

function snapshotStore(storeRoot, backupRoot, { apply = false, now = new Date() } = {}) {
  const live = ensureAbsoluteOutside(storeRoot, [], { mustExist: true });
  const destinationRoot = ensureAbsoluteOutside(backupRoot, [live], { mustExist: true });
  assertPrivateDirectory(destinationRoot);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const name = `confenge-storage-${stamp}`;
  const finalDir = path.join(destinationRoot, name);
  if (fs.existsSync(finalDir)) throw new Error("snapshot_already_exists");
  if (!apply) return { dry_run: true, snapshot: finalDir, status: "SNAPSHOT_PLANNED" };
  const backend = new HostFileBackend(live);
  const staging = path.join(destinationRoot, `.staging-${name}-${process.pid}`);
  fs.mkdirSync(staging, { mode: DIR_MODE });
  fs.chmodSync(staging, DIR_MODE);
  const entries = backend.withExclusiveLock(() => {
    backend._validateUnlocked();
    const files = listFiles(live, "", { skipTransient: true });
    const rows = [];
    for (const rel of files) {
      const source = path.join(live, rel);
      const target = path.join(staging, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: DIR_MODE });
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(target, FILE_MODE);
      fsyncFile(target);
      const bytes = fs.readFileSync(target);
      rows.push({ path: rel.split(path.sep).join("/"), bytes: bytes.length, sha256: sha256(bytes) });
    }
    return rows;
  });
  const manifest = {
    schema: SNAPSHOT_SCHEMA,
    created_at: now.toISOString(),
    source_layout: "v1",
    file_count: entries.length,
    byte_count: entries.reduce((sum, row) => sum + row.bytes, 0),
    aggregate_sha256: aggregateHash(entries),
    files: entries,
  };
  writePrivateJson(path.join(staging, "manifest.json"), manifest);
  for (const dir of [...new Set(entries.map((row) => path.dirname(path.join(staging, row.path))))].sort().reverse()) {
    fs.chmodSync(dir, DIR_MODE);
    fsyncDirectory(dir);
  }
  fsyncDirectory(staging);
  fs.renameSync(staging, finalDir);
  fs.chmodSync(finalDir, DIR_MODE);
  fsyncDirectory(destinationRoot);
  return { dry_run: false, snapshot: finalDir, status: "SNAPSHOT_CREATED", ...manifest };
}

function verifySnapshot(snapshotDir) {
  const source = ensureAbsoluteOutside(snapshotDir, [], { mustExist: true });
  assertPrivateDirectory(source);
  const manifest = readJson(path.join(source, "manifest.json"));
  if (manifest.schema !== SNAPSHOT_SCHEMA || !Array.isArray(manifest.files)) throw new Error("snapshot_manifest_invalid");
  const actualFiles = listFiles(source).map((file) => file.split(path.sep).join("/")).sort();
  const declaredFiles = ["manifest.json", ...manifest.files.map((row) => row.path)].sort();
  if (canonicalJson(actualFiles) !== canonicalJson(declaredFiles)) throw new Error("snapshot_file_set_mismatch");
  const seen = [];
  for (const row of manifest.files) {
    if (!row.path || path.isAbsolute(row.path) || row.path.split("/").includes("..")) throw new Error("snapshot_path_invalid");
    const file = path.join(source, ...row.path.split("/"));
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("snapshot_file_invalid");
    if ((stat.mode & 0o777) !== FILE_MODE) throw new Error("snapshot_file_permissions_invalid");
    const bytes = fs.readFileSync(file);
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error("snapshot_checksum_mismatch");
    seen.push(row);
  }
  if (manifest.file_count !== seen.length || manifest.aggregate_sha256 !== aggregateHash(seen)) throw new Error("snapshot_reconciliation_failed");
  return { source, manifest };
}

function restoreSnapshot(snapshotDir, targetDir, { apply = false } = {}) {
  const verified = verifySnapshot(snapshotDir);
  const target = ensureAbsoluteOutside(targetDir, [verified.source], { mustNotExist: true });
  if (!apply) return { dry_run: true, target, status: "RESTORE_PLANNED", file_count: verified.manifest.file_count };
  fs.mkdirSync(target, { mode: DIR_MODE });
  fs.chmodSync(target, DIR_MODE);
  for (const row of verified.manifest.files) {
    const source = path.join(verified.source, ...row.path.split("/"));
    const dest = path.join(target, ...row.path.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: DIR_MODE });
    fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(dest, FILE_MODE);
    fsyncFile(dest);
  }
  for (const dir of [...new Set(verified.manifest.files.map((row) => path.dirname(path.join(target, row.path))))].sort().reverse()) {
    fs.chmodSync(dir, DIR_MODE);
    fsyncDirectory(dir);
  }
  fsyncDirectory(target);
  fsyncDirectory(path.dirname(target));
  const backend = new HostFileBackend(target);
  backend.validate({ writeProbe: false });
  return {
    dry_run: false,
    target,
    status: "RESTORE_VALIDATED_NOT_ACTIVATED",
    file_count: verified.manifest.file_count,
    aggregate_sha256: verified.manifest.aggregate_sha256,
  };
}

function pruneSnapshots(backupRoot, retain, { apply = false } = {}) {
  const root = ensureAbsoluteOutside(backupRoot, [], { mustExist: true });
  assertPrivateDirectory(root);
  const keep = Number(retain == null ? 7 : retain);
  if (!Number.isInteger(keep) || keep < 1) throw new Error("snapshot_retain_invalid");
  const snapshots = fs.readdirSync(root)
    .filter((name) => /^confenge-storage-\d{8}T\d{6}Z$/.test(name))
    .sort()
    .reverse();
  const candidates = [];
  for (const name of snapshots.slice(keep)) {
    const dir = path.join(root, name);
    try {
      verifySnapshot(dir);
      candidates.push(dir);
    } catch {
      // Never delete an unverified directory.
    }
  }
  if (apply) {
    for (const dir of candidates) fs.rmSync(dir, { recursive: true });
    if (candidates.length) fsyncDirectory(root);
  }
  return { dry_run: !apply, retained: Math.min(keep, snapshots.length), removed: apply ? candidates.length : 0, candidates: candidates.length };
}

module.exports = {
  REPO_ROOT,
  BUNDLE_SCHEMA,
  SNAPSHOT_SCHEMA,
  CLASS_NAMESPACES,
  sha256,
  ensureAbsoluteOutside,
  buildMigrationBundle,
  loadMigrationBundle,
  importMigrationBundle,
  snapshotStore,
  verifySnapshot,
  restoreSnapshot,
  pruneSnapshots,
};
