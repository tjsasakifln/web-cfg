/**
 * Host-owned durable JSON storage for the single-VPS runtime.
 *
 * The configured root is a pre-provisioned, private directory outside the
 * release tree. Logical keys are never used as paths: filenames are full
 * SHA-256 digests. Writes are durable (temp + fsync + atomic link/rename), and
 * every reader fails explicitly on corruption, unsafe permissions or symlinks.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SCHEMA = "confenge-host-file-record/v1";
const LAYOUT = "v1";
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const LOCK_STALE_MS = 120_000;
// A burst may queue 50+ independent server processes behind the same durable
// write. Keep the wait bounded while allowing a slow single-VPS disk to drain.
const LOCK_WAIT_MS = 30_000;
const sleepCell = new Int32Array(new SharedArrayBuffer(4));

class StorageError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = "StorageError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new StorageError(code, message, details);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function isWithin(candidate, parent) {
  const rel = path.relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== "..");
}

function checkMode(stat, expected, code, target) {
  if ((stat.mode & 0o777) !== expected) {
    fail(code, `${target} must have mode ${expected.toString(8)}`, {
      actual_mode: (stat.mode & 0o777).toString(8),
    });
  }
}

function checkDirectory(target, { mode = DIR_MODE } = {}) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (err) {
    if (err && err.code === "ENOENT") fail("STORE_ROOT_MISSING", "storage directory does not exist");
    fail("STORE_DIRECTORY_UNAVAILABLE", "storage directory is unavailable");
  }
  if (stat.isSymbolicLink()) fail("STORE_SYMLINK", "storage directory must not be a symlink");
  if (!stat.isDirectory()) fail("STORE_NOT_DIRECTORY", "storage path is not a directory");
  checkMode(stat, mode, "STORE_INSECURE_PERMISSIONS", "storage directory");
  try {
    fs.accessSync(target, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  } catch {
    fail("STORE_PERMISSION_DENIED", "storage directory is not readable and writable");
  }
}

function ensurePrivateDirectory(target) {
  try {
    fs.mkdirSync(target, { mode: DIR_MODE });
  } catch (err) {
    if (!err || err.code !== "EEXIST") {
      fail("STORE_DIRECTORY_CREATE_FAILED", "could not create private storage directory");
    }
  }
  checkDirectory(target);
}

function fsyncDirectory(target) {
  let fd;
  try {
    fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0));
    fs.fsyncSync(fd);
  } catch (err) {
    fail("STORE_FSYNC_FAILED", "could not fsync storage directory", { reason: err && err.code });
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

function safeFileStat(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    fail("STORE_READ_FAILED", "could not inspect storage record");
  }
  if (stat.isSymbolicLink()) fail("STORE_SYMLINK", "storage record must not be a symlink");
  if (!stat.isFile()) fail("STORE_RECORD_TYPE_INVALID", "storage record is not a regular file");
  checkMode(stat, FILE_MODE, "STORE_INSECURE_PERMISSIONS", "storage record");
  return stat;
}

function makeEnvelope(namespace, key, value) {
  const keyText = String(key);
  const payload = canonicalJson(value);
  return {
    schema: SCHEMA,
    namespace,
    key: keyText,
    key_sha256: sha256(keyText),
    payload_sha256: sha256(payload),
    value,
  };
}

function validateEnvelope(envelope, namespace, expectedDigest, file) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    fail("STORE_CORRUPT", "storage envelope is malformed", { file: path.basename(file) });
  }
  if (
    envelope.schema !== SCHEMA ||
    envelope.namespace !== namespace ||
    typeof envelope.key !== "string" ||
    envelope.key_sha256 !== sha256(envelope.key) ||
    envelope.key_sha256 !== expectedDigest ||
    envelope.payload_sha256 !== sha256(canonicalJson(envelope.value))
  ) {
    fail("STORE_CORRUPT", "storage envelope checksum or identity mismatch", {
      file: path.basename(file),
    });
  }
  return envelope;
}

class HostFileBackend {
  constructor(root, options = {}) {
    if (!root || !path.isAbsolute(String(root))) {
      fail("STORE_PATH_NOT_ABSOLUTE", "CONFENGE_STORAGE_DIR must be an absolute path");
    }
    this.root = path.resolve(String(root));
    this.releaseRoot = path.resolve(
      options.releaseRoot || path.resolve(__dirname, "../../.."),
    );
    if (!options.allowInsideRelease && isWithin(this.root, this.releaseRoot)) {
      fail("STORE_PATH_INSIDE_RELEASE", "storage directory must be outside the release tree");
    }
    this.maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES);
    checkDirectory(this.root);
    const real = fs.realpathSync.native(this.root);
    if (real !== this.root) fail("STORE_SYMLINK", "storage root must resolve to itself");
    this.layoutDir = path.join(this.root, LAYOUT);
    ensurePrivateDirectory(this.layoutDir);
    this.lockPath = path.join(this.layoutDir, ".writer-lock");
  }

  namespace(name) {
    return new DurableJsonNamespace(this, name);
  }

  _acquireLock() {
    const started = Date.now();
    for (;;) {
      let fd;
      try {
        fd = fs.openSync(
          this.lockPath,
          fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0),
          FILE_MODE,
        );
        fs.fchmodSync(fd, FILE_MODE);
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }));
        fs.closeSync(fd);
        return;
      } catch (err) {
        if (fd != null) {
          try { fs.closeSync(fd); } catch { /* noop */ }
        }
        if (!err || err.code !== "EEXIST") {
          fail("STORE_LOCK_FAILED", "could not acquire storage writer lock");
        }
        const stat = safeFileStat(this.lockPath);
        if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          const stale = `${this.lockPath}.stale-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
          try {
            fs.renameSync(this.lockPath, stale);
            fs.unlinkSync(stale);
            continue;
          } catch (staleErr) {
            if (!staleErr || !["ENOENT", "EEXIST"].includes(staleErr.code)) {
              fail("STORE_LOCK_FAILED", "could not recover stale storage lock");
            }
          }
        }
        if (Date.now() - started >= LOCK_WAIT_MS) {
          fail("STORE_LOCK_TIMEOUT", "timed out waiting for storage writer lock");
        }
        const elapsed = Date.now() - started;
        const backoff = Math.min(100, 20 + Math.floor(elapsed / 100) + (process.pid % 17));
        Atomics.wait(sleepCell, 0, 0, backoff);
      }
    }
  }

  _releaseLock() {
    try {
      fs.unlinkSync(this.lockPath);
    } catch {
      fail("STORE_LOCK_RELEASE_FAILED", "could not release storage writer lock");
    }
  }

  withExclusiveLock(fn) {
    this._acquireLock();
    try {
      return fn();
    } finally {
      this._releaseLock();
    }
  }

  _validateUnlocked() {
    checkDirectory(this.root);
    checkDirectory(this.layoutDir);
    const namespaces = fs.readdirSync(this.layoutDir, { withFileTypes: true });
    for (const entry of namespaces) {
      if (entry.name === ".writer-lock" || entry.name.startsWith(".writer-lock.stale-")) continue;
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        fail("STORE_NAMESPACE_INVALID", "storage layout contains an unsafe entry");
      }
      const ns = this.namespace(entry.name);
      ns.list({ rejectTemps: true });
    }
  }

  _validateLeadIdempotencyUnlocked({ repair = false } = {}) {
    const records = this.namespace("leads");
    const indexes = this.namespace("leads-idempotency");
    const expected = new Map();
    for (const row of records.list({ rejectTemps: true })) {
      const value = row.value;
      if (!value || !value.idempotency_key) continue;
      const digest = sha256(String(value.idempotency_key));
      if (expected.has(digest) && expected.get(digest).lead_id !== value.lead_id) {
        fail("STORE_CORRUPT", "duplicate durable idempotency key");
      }
      expected.set(digest, value);
    }
    const seen = new Set();
    for (const row of indexes.list({ rejectTemps: true })) {
      const value = row.value;
      const record = value && value.lead_id ? records.get(String(value.lead_id)) : null;
      if (
        !value || value.idempotency_sha256 !== row.key || !record
        || sha256(String(record.idempotency_key || "")) !== row.key
      ) {
        fail("STORE_CORRUPT", "idempotency index is corrupt or dangling");
      }
      seen.add(row.key);
    }
    for (const [digest, record] of expected) {
      if (seen.has(digest)) continue;
      if (!repair) fail("STORE_INDEX_MISSING", "durable idempotency index is missing");
      indexes._putUnlocked(digest, {
        lead_id: String(record.lead_id),
        idempotency_sha256: digest,
      }, { onlyIfNew: true });
    }
  }

  validate({ writeProbe = true } = {}) {
    const validate = () => {
      this._validateUnlocked();
      this._validateLeadIdempotencyUnlocked({ repair: writeProbe });
    };
    // Audits explicitly requesting a read-only check must not create the
    // writer lock. Concurrent atomic commits may make this conservative check
    // fail closed for one sample, but it must never mutate host-owned storage.
    if (writeProbe) this.withExclusiveLock(validate);
    else validate();
    if (writeProbe) {
      const probe = this.namespace("readiness-probes");
      const key = `probe:${process.pid}:${crypto.randomBytes(8).toString("hex")}`;
      probe.put(key, { at: new Date().toISOString() }, { onlyIfNew: true });
      probe.delete(key);
    }
    return { ok: true, backend: "filesystem" };
  }
}

class DurableJsonNamespace {
  constructor(backend, name) {
    const value = String(name || "");
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
      fail("STORE_NAMESPACE_INVALID", "invalid storage namespace");
    }
    this.backend = backend;
    this.name = value;
    this.dir = path.join(backend.layoutDir, value);
    ensurePrivateDirectory(this.dir);
  }

  _digest(key) {
    const value = String(key == null ? "" : key);
    if (!value || Buffer.byteLength(value, "utf8") > 2048 || value.includes("\0")) {
      fail("STORE_KEY_INVALID", "storage key is empty or too large");
    }
    return sha256(value);
  }

  pathForKey(key) {
    return path.join(this.dir, `${this._digest(key)}.json`);
  }

  _readFile(file, digest) {
    const stat = safeFileStat(file);
    if (!stat) return null;
    if (stat.size > this.backend.maxBytes) fail("STORE_RECORD_TOO_LARGE", "storage record exceeds limit");
    let fd;
    let raw;
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      raw = fs.readFileSync(fd, "utf8");
    } catch {
      fail("STORE_READ_FAILED", "could not read storage record");
    } finally {
      if (fd != null) fs.closeSync(fd);
    }
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      fail("STORE_CORRUPT", "storage record is not valid JSON", { file: path.basename(file) });
    }
    return validateEnvelope(envelope, this.name, digest, file);
  }

  _getEnvelope(key) {
    const digest = this._digest(key);
    return this._readFile(path.join(this.dir, `${digest}.json`), digest);
  }

  get(key) {
    const envelope = this._getEnvelope(key);
    return envelope ? envelope.value : null;
  }

  _writeTemp(envelope) {
    const raw = Buffer.from(JSON.stringify(envelope), "utf8");
    if (raw.length > this.backend.maxBytes) fail("STORE_RECORD_TOO_LARGE", "storage record exceeds limit");
    const temp = path.join(
      this.dir,
      `.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`,
    );
    let fd;
    try {
      fd = fs.openSync(
        temp,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0),
        FILE_MODE,
      );
      fs.fchmodSync(fd, FILE_MODE);
      fs.writeFileSync(fd, raw);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = null;
      return temp;
    } catch (err) {
      if (fd != null) {
        try { fs.closeSync(fd); } catch { /* noop */ }
      }
      try { fs.unlinkSync(temp); } catch { /* noop */ }
      fail("STORE_WRITE_FAILED", "could not write durable storage temp file", { reason: err && err.code });
    }
  }

  _putUnlocked(key, value, { onlyIfNew = false } = {}) {
    const digest = this._digest(key);
    const file = path.join(this.dir, `${digest}.json`);
    const existingStat = safeFileStat(file);
    if (onlyIfNew && existingStat) {
      return { inserted: false, value: this._readFile(file, digest).value };
    }
    const envelope = makeEnvelope(this.name, String(key), value);
    const temp = this._writeTemp(envelope);
    try {
      if (onlyIfNew) {
        try {
          fs.linkSync(temp, file);
        } catch (err) {
          if (err && err.code === "EEXIST") {
            return { inserted: false, value: this._readFile(file, digest).value };
          }
          fail("STORE_WRITE_FAILED", "could not atomically create storage record", {
            reason: err && err.code,
          });
        }
      } else {
        if (safeFileStat(file)?.isSymbolicLink?.()) fail("STORE_SYMLINK", "unsafe record target");
        fs.renameSync(temp, file);
      }
      fs.chmodSync(file, FILE_MODE);
      fsyncDirectory(this.dir);
      return { inserted: !existingStat, value };
    } finally {
      try { fs.unlinkSync(temp); } catch (err) {
        if (err && err.code !== "ENOENT") fail("STORE_TEMP_CLEANUP_FAILED", "could not clean storage temp file");
      }
    }
  }

  put(key, value, options = {}) {
    return this.backend.withExclusiveLock(() => this._putUnlocked(key, value, options));
  }

  _deleteUnlocked(key) {
    const file = this.pathForKey(key);
    const existing = this._getEnvelope(key);
    if (!existing) return false;
    try {
      fs.unlinkSync(file);
      fsyncDirectory(this.dir);
      return true;
    } catch {
      fail("STORE_DELETE_FAILED", "could not delete storage record");
    }
  }

  delete(key) {
    return this.backend.withExclusiveLock(() => this._deleteUnlocked(key));
  }

  list({ prefix = "", rejectTemps = false } = {}) {
    checkDirectory(this.dir);
    const out = [];
    let names;
    try {
      names = fs.readdirSync(this.dir).sort();
    } catch {
      fail("STORE_LIST_FAILED", "could not list storage namespace");
    }
    for (const name of names) {
      if (name.startsWith(".tmp-")) {
        if (rejectTemps) fail("STORE_TEMP_ORPHANED", "orphaned storage temp file requires review", { file: name });
        continue;
      }
      if (!/^[0-9a-f]{64}\.json$/.test(name)) {
        fail("STORE_CORRUPT", "unexpected entry in storage namespace", { file: name });
      }
      const digest = name.slice(0, 64);
      const envelope = this._readFile(path.join(this.dir, name), digest);
      if (!prefix || envelope.key.startsWith(prefix)) out.push({ key: envelope.key, value: envelope.value });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }
}

module.exports = {
  SCHEMA,
  DIR_MODE,
  FILE_MODE,
  StorageError,
  HostFileBackend,
  DurableJsonNamespace,
  canonicalJson,
  sha256,
  isWithin,
};
