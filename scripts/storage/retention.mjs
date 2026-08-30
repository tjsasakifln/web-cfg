#!/usr/bin/env node
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { HostFileBackend, sha256 } = require("../../netlify/functions/lib/host-file-store.cjs");
const { FileStore } = require("../../netlify/functions/lib/lead-store.cjs");
const { ensureAbsoluteOutside } = require("./lib.cjs");

const REPORT_SCHEMA = "confenge-storage-retention-report/v1";

function parse(argv) {
  const out = { apply: false, now: new Date() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--apply") out.apply = true;
    else if (argv[i] === "--store") out.store = argv[++i];
    else if (argv[i] === "--now") out.now = new Date(argv[++i]);
    else throw new Error(`unexpected_argument:${argv[i]}`);
  }
  if (!out.store || !Number.isFinite(out.now.getTime())) throw new Error("--store and a valid --now are required");
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
  if (typeof value !== "string" || !value.trim()) return NaN;
  return Date.parse(value);
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
  const current = leads.records.get(item.key);
  if (!current) return false;
  leads.records._deleteUnlocked(item.key);
  if (current.idempotency_key) {
    leads.idempotency._deleteUnlocked(sha256(String(current.idempotency_key)));
  }
  return true;
}

async function main() {
  const options = parse(process.argv.slice(2));
  const root = ensureAbsoluteOutside(options.store, [], { mustExist: true });
  const backend = new HostFileBackend(root);
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
  backend.withExclusiveLock(() => {
    // Validate both durable envelopes and lead/idempotency relationships before
    // planning any mutation. The same global writer lock covers scan, apply and
    // the post-apply validation, so an application write cannot invalidate the
    // decision between those phases.
    backend.validate({ writeProbe: false });
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
      backend.validate({ writeProbe: false });
      report.indexes_preserved = backend.namespace("leads-idempotency").list().length;
    }
  });
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
