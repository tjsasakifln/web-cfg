#!/usr/bin/env node
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { HostFileBackend } = require("../../netlify/functions/lib/host-file-store.cjs");
const { FileStore } = require("../../netlify/functions/lib/lead-store.cjs");
const { ensureAbsoluteOutside } = require("./lib.cjs");

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
    const times = value.events.map((row) => Date.parse(row.ts || 0)).filter(Number.isFinite);
    return times.length ? Math.max(...times) : NaN;
  }
  return NaN;
}

function expiryFor(namespace, value) {
  const policy = POLICIES[namespace];
  if (!policy) return NaN;
  if (namespace === "analytics-events") {
    const ts = eventTimestamp(value);
    return Number.isFinite(ts) ? ts + policy.days * 864e5 : NaN;
  }
  for (const field of policy.fields) {
    const timestamp = Date.parse(value && value[field] || 0);
    if (!Number.isFinite(timestamp)) continue;
    return field === "delete_after" || field === "expires_at"
      ? timestamp
      : timestamp + policy.days * 864e5;
  }
  return NaN;
}

async function main() {
  const options = parse(process.argv.slice(2));
  const root = ensureAbsoluteOutside(options.store, [], { mustExist: true });
  const backend = new HostFileBackend(root);
  const leads = new FileStore(root, { backend });
  const report = { dry_run: !options.apply, scanned: 0, expired: 0, deleted: 0, malformed_retention: 0, by_namespace: {} };
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
      if (options.apply) {
        if (namespace === "leads") await leads.delete(row.key);
        else backend.namespace(namespace).delete(row.key);
        stats.deleted += 1;
        report.deleted += 1;
      }
    }
    report.by_namespace[namespace] = stats;
  }
  report.suppressions_preserved = backend.namespace("nurture-suppressions").list().length;
  process.stdout.write(JSON.stringify(report) + "\n");
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(err.code || err.message || "retention_failed").slice(0, 120) }) + "\n");
  process.exit(1);
});
