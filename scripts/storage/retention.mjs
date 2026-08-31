#!/usr/bin/env node
import { createRequire } from "module";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
const { HostFileBackend } = require("../../netlify/functions/lib/host-file-store.cjs");
const { FileStore } = require("../../netlify/functions/lib/lead-store.cjs");
const { ensureAbsoluteOutside } = require("./lib.cjs");

const REPORT_SCHEMA = "confenge-storage-retention-report/v1";
const GATE_SCHEMA = "confenge.schedule-cutover/v1";
const RETENTION_JOB = "storage-retention";
const FULL_SHA = /^[0-9a-f]{40}$/;

function parse(argv) {
  const out = { apply: false, now: new Date() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--apply") out.apply = true;
    else if (argv[i] === "--store") out.store = argv[++i];
    else if (argv[i] === "--now") out.now = new Date(argv[++i]);
    else if (argv[i] === "--authority-fd") out.authorityFd = Number(argv[++i]);
    else if (argv[i] === "--lock-fd") out.lockFd = Number(argv[++i]);
    else if (argv[i] === "--deploy-lock-fd") out.deployLockFd = Number(argv[++i]);
    else if (argv[i] === "--release-root") out.releaseRoot = argv[++i];
    else if (argv[i] === "--release-sha") out.releaseSha = argv[++i];
    else throw new Error(`unexpected_argument:${argv[i]}`);
  }
  if (!out.store || !Number.isFinite(out.now.getTime())) throw new Error("--store and a valid --now are required");
  const authorityFields = [out.authorityFd, out.lockFd, out.deployLockFd, out.releaseRoot, out.releaseSha];
  if (!out.apply && authorityFields.some((value) => value !== undefined)) {
    throw new Error("apply authority is invalid for dry-run");
  }
  return out;
}

function retentionDays(name, fallback) {
  const days = Number(process.env[name] || fallback);
  if (!Number.isInteger(days) || days < 1) throw new Error(`invalid_retention_days:${name}`);
  return days;
}

const POLICIES = {
  leads: { days: retentionDays("LEAD_RETAIN_DAYS", 730), fields: ["delete_after", "received_at"] },
  "analytics-events": { days: retentionDays("ANALYTICS_RETAIN_DAYS", 90), fields: ["delete_after", "ts"] },
  "nurture-subscriptions": { days: retentionDays("NURTURE_RETAIN_DAYS", 730), fields: ["delete_after", "updated_at", "created_at"] },
  corrections: { days: retentionDays("CORRECTION_RETAIN_DAYS", 730), fields: ["delete_after", "received_at"] },
  "commercial-events": { days: retentionDays("COMMERCIAL_EVENT_RETAIN_DAYS", 730), fields: ["delete_after", "occurred_at", "created_at"] },
  "search-observations": { days: retentionDays("SEARCH_OBSERVATION_RETAIN_DAYS", 730), fields: ["delete_after", "observed_at", "created_at"] },
  "offers-sandbox": { days: 2, fields: ["expires_at"] },
  "offers-production": { days: 730, fields: ["expires_at", "updated_at", "created_at"] },
};

function eventTimestamp(value) {
  if (value && Array.isArray(value.events)) {
    const times = value.events.map((row) => parseTimestamp(row && row.ts));
    if (times.some((timestamp) => !Number.isFinite(timestamp))) return NaN;
    return times.length ? Math.max(...times) : NaN;
  }
  return NaN;
}

function parseTimestamp(value) {
  if (typeof value !== "string") return NaN;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/);
  if (!match) return NaN;
  const fraction = (match[7] || "").padEnd(3, "0");
  const canonical = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${fraction}Z`;
  const timestamp = Date.parse(canonical);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== canonical) return NaN;
  return timestamp;
}

function descriptorPath(descriptor) {
  if (!Number.isInteger(descriptor) || descriptor < 3) return "";
  try {
    return fs.realpathSync(`/proc/self/fd/${descriptor}`);
  } catch {
    return "";
  }
}

function validateApplyAuthority(options) {
  if (!options.apply) return;
  if (!FULL_SHA.test(String(options.releaseSha || "")) || !path.isAbsolute(String(options.releaseRoot || ""))) {
    throw Object.assign(new Error("retention apply authority is incomplete"), { code: "RETENTION_APPLY_NOT_AUTHORIZED" });
  }
  const root = fs.realpathSync(options.releaseRoot);
  const expectedGate = path.join(root, "shared", "schedule-cutover.json");
  const expectedLock = path.join(root, "shared", "storage-retention.lock");
  const expectedDeployLock = path.join(root, "locks", "deploy.lock");
  if (
    descriptorPath(options.authorityFd) !== expectedGate
    || descriptorPath(options.lockFd) !== expectedLock
    || descriptorPath(options.deployLockFd) !== expectedDeployLock
  ) {
    throw Object.assign(new Error("retention apply authority descriptors are invalid"), { code: "RETENTION_APPLY_NOT_AUTHORIZED" });
  }
  const gateStat = fs.fstatSync(options.authorityFd);
  const lockStat = fs.fstatSync(options.lockFd);
  const deployLockStat = fs.fstatSync(options.deployLockFd);
  if (
    !gateStat.isFile()
    || !lockStat.isFile()
    || !deployLockStat.isFile()
    || (gateStat.mode & 0o777) !== 0o640
    || (lockStat.mode & 0o777) !== 0o640
    || (deployLockStat.mode & 0o777) !== 0o640
  ) {
    throw Object.assign(new Error("retention apply authority files are invalid"), { code: "RETENTION_APPLY_NOT_AUTHORIZED" });
  }
  const gate = JSON.parse(fs.readFileSync(options.authorityFd, "utf8"));
  const current = path.basename(fs.realpathSync(path.join(root, "current")));
  const release = path.join(root, "releases", options.releaseSha);
  const runningScript = fs.realpathSync(new URL(import.meta.url));
  const productionStore = fs.realpathSync(options.store) === "/var/lib/confenge-web";
  if (productionStore) {
    const parentCommand = fs.readFileSync(`/proc/${process.ppid}/cmdline`, "utf8").split("\0");
    const canonicalParent = parentCommand.includes("/opt/confenge-web/lib/schedule_gate.py")
      && parentCommand.includes(RETENTION_JOB);
    const jobLockProbe = spawnSync("/usr/bin/flock", ["--nonblock", expectedLock, "/usr/bin/true"]);
    const deployLockProbe = spawnSync("/usr/bin/flock", ["--nonblock", expectedDeployLock, "/usr/bin/true"]);
    const jobLockBusy = jobLockProbe.status === 1 && !jobLockProbe.error;
    const deployLockBusy = deployLockProbe.status === 1 && !deployLockProbe.error;
    if (
      root !== "/opt/confenge-web"
      || gateStat.uid !== 0
      || runningScript !== path.join(release, "scripts", "storage", "retention.mjs")
      || !canonicalParent
      || !jobLockBusy
      || !deployLockBusy
    ) {
      throw Object.assign(new Error("production retention authority is not held by the canonical runner"), { code: "RETENTION_APPLY_NOT_AUTHORIZED" });
    }
  }
  if (
    gate?.schema !== GATE_SCHEMA
    || gate?.authorized_release_sha !== options.releaseSha
    || gate?.jobs?.[RETENTION_JOB] !== true
    || current !== options.releaseSha
  ) {
    throw Object.assign(new Error("retention apply is not bound to the current release/job"), { code: "RETENTION_APPLY_NOT_AUTHORIZED" });
  }
}

function expiryFor(namespace, value) {
  const policy = POLICIES[namespace];
  if (!policy) return NaN;
  if (namespace === "analytics-events") {
    const ts = eventTimestamp(value);
    return Number.isFinite(ts) ? ts + policy.days * 864e5 : NaN;
  }
  for (const field of policy.fields) {
    const raw = value && value[field];
    if (raw != null && String(raw).trim() && !Number.isFinite(parseTimestamp(raw))) return NaN;
    const timestamp = parseTimestamp(raw);
    if (!Number.isFinite(timestamp)) continue;
    return field === "delete_after" || field === "expires_at"
      ? timestamp
      : timestamp + policy.days * 864e5;
  }
  return NaN;
}

function safeErrorCode(err) {
  const code = String(err && err.code || "");
  if (/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) return code;
  const message = String(err && err.message || "");
  if (message.startsWith("invalid_retention_days:")) return "RETENTION_POLICY_INVALID";
  if (message.startsWith("unexpected_argument:") || message.startsWith("--store")) return "RETENTION_ARGUMENT_INVALID";
  return "RETENTION_FAILED";
}

function deleteUnlocked(backend, leads, item) {
  if (item.namespace !== "leads") {
    return backend.namespace(item.namespace)._deleteUnlocked(item.key);
  }
  return leads._deleteUnlocked(item.key);
}

async function main() {
  const options = parse(process.argv.slice(2));
  validateApplyAuthority(options);
  const root = ensureAbsoluteOutside(options.store, [], { mustExist: true });
  const backend = new HostFileBackend(root, { readOnly: !options.apply });
  const leads = new FileStore(root, { backend });
  const report = {
    schema: REPORT_SCHEMA,
    dry_run: !options.apply,
    scanned: 0,
    expired: 0,
    deleted: 0,
    malformed_retention: 0,
    by_namespace: {},
  };
  const inspectAndApply = () => {
    // Validate both durable envelopes and lead/idempotency relationships before
    // planning any mutation. Apply holds the global writer lock across scan,
    // repair, mutation and post-validation. Dry-run uses the read-only backend:
    // it creates neither namespaces nor a lock file and may fail conservatively
    // if a concurrent writer changes the snapshot.
    // Recover only the safe interruption boundary (lead exists, derived index
    // missing) before the strict scan. Dangling or malformed indexes still
    // block the run. The global writer lock makes repair+planning one serial
    // operation.
    // Dry-run is strictly read-only. Only an already authorized apply may
    // repair the one recoverable interruption boundary before retrying.
    leads.validateUnlocked({ repairIdempotency: options.apply });
    const pendingDeletes = [];
    for (const namespace of Object.keys(POLICIES)) {
      const rows = backend.namespace(namespace).list();
      const stats = { scanned: rows.length, expired: 0, deleted: 0, malformed_retention: 0 };
      report.scanned += rows.length;
      for (const row of rows) {
        const expiry = expiryFor(namespace, row.value);
        if (!Number.isFinite(expiry)) {
          stats.malformed_retention += 1;
          report.malformed_retention += 1;
          continue;
        }
        if (expiry > options.now.getTime()) continue;
        stats.expired += 1;
        report.expired += 1;
        pendingDeletes.push({ namespace, key: row.key });
      }
      report.by_namespace[namespace] = stats;
    }
    report.suppressions_preserved = backend.namespace("nurture-suppressions").list().length;
    report.indexes_preserved = backend.namespace("leads-idempotency").list().length;
    if (options.apply && report.malformed_retention > 0) {
      report.ok = false;
      report.blocked = true;
      report.reason = "malformed_retention";
      return;
    }
    if (options.apply) {
      for (const item of pendingDeletes) {
        if (!deleteUnlocked(backend, leads, item)) {
          throw Object.assign(new Error("retention target disappeared under exclusive lock"), {
            code: "RETENTION_TARGET_MISSING",
          });
        }
        report.by_namespace[item.namespace].deleted += 1;
        report.deleted += 1;
      }
      leads.validateUnlocked();
      report.indexes_preserved = backend.namespace("leads-idempotency").list().length;
    }
  };
  if (options.apply) backend.withExclusiveLock(inspectAndApply);
  else inspectAndApply();
  if (report.blocked) {
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exitCode = 2;
    return;
  }
  report.ok = true;
  process.stdout.write(JSON.stringify(report) + "\n");
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ schema: REPORT_SCHEMA, ok: false, error_code: safeErrorCode(err) }) + "\n");
  process.exit(1);
});
