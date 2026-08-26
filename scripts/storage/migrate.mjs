#!/usr/bin/env node
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  buildMigrationBundle,
  importMigrationBundle,
  loadMigrationBundle,
} = require("./lib.cjs");

function args(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--apply") out.apply = true;
    else if (value.startsWith("--")) out[value.slice(2).replace(/-/g, "_")] = argv[++i];
    else if (!out.command) out.command = value;
    else throw new Error(`unexpected_argument:${value}`);
  }
  return out;
}

async function listAll(store, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await store.list({ prefix, cursor });
    out.push(...(page.blobs || []));
    cursor = page.cursor || page.next_cursor;
    if (!page.truncated) break;
  } while (cursor);
  return out;
}

const SOURCES = [
  { store: "confenge-leads", prefix: "leads/", class: "leads", strip: "leads/" },
  { store: "confenge-leads", prefix: "system/", class: "system_records", strip: "system/" },
  { store: "confenge-leads", prefix: "commercial-event/", class: "commercial_events", strip: "commercial-event/" },
  { store: "confenge-leads", prefix: "search-obs/", class: "search_observations", strip: "search-obs/" },
  { store: "confenge-analytics", prefix: "events/", class: "analytics", strip: "" },
  { store: "confenge-nurture", prefix: "subs/", class: "nurture_subscriptions", strip: "subs/" },
  { store: "confenge-nurture", prefix: "suppression/", class: "nurture_suppressions", strip: "suppression/" },
  { store: "confenge-corrections", prefix: "", class: "corrections", strip: "" },
  { store: "confenge-offers-sandbox", prefix: "offers-sandbox/", class: "offers_sandbox", strip: "offers-sandbox/", valueKey: true },
  { store: "confenge-offers-production", prefix: "offers-production/", class: "offers_production", strip: "offers-production/", valueKey: true },
];

async function exportNetlify(options) {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "";
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || "";
  if (!siteID || !token) {
    return {
      ok: false,
      status: "EXTERNAL_EXPORT_REQUIRED",
      dry_run: !options.apply,
      required_env: ["NETLIFY_BLOBS_SITE_ID", "NETLIFY_BLOBS_TOKEN"],
      procedure: "Configure read credentials locally, run storage:migrate:export without --apply, then repeat with --out ABS_PRIVATE_DIR --apply.",
    };
  }
  // Lazy by design: the Netcup runtime never reaches this tooling path.
  const { getStore } = require("@netlify/blobs");
  const stores = new Map();
  const records = [];
  const counts = {};
  for (const source of SOURCES) {
    let store = stores.get(source.store);
    if (!store) {
      store = getStore({ name: source.store, siteID, token });
      stores.set(source.store, store);
    }
    const blobs = await listAll(store, source.prefix);
    for (const blob of blobs) {
      const sourceKey = String(blob.key || blob);
      let value = await store.get(sourceKey, { type: "json" });
      if (value == null) {
        const text = await store.get(sourceKey, { type: "text" });
        value = JSON.parse(text);
      }
      const key = source.valueKey
        ? String(value && value.store_key || "")
        : sourceKey.slice(source.strip.length);
      if (!key) throw new Error(`migration_logical_key_missing:${source.class}`);
      records.push({ class: source.class, key, value });
      counts[source.class] = (counts[source.class] || 0) + 1;
    }
  }
  if (!options.apply) {
    return { ok: true, status: "DRY_RUN_COMPLETE", dry_run: true, counts, total: records.length };
  }
  if (!options.out) throw new Error("--out ABS_PRIVATE_DIR is required with --apply");
  const manifest = buildMigrationBundle(records, options.out, { source: "netlify-blobs" });
  return {
    ok: true,
    status: "EXPORT_CREATED_NOT_IMPORTED",
    dry_run: false,
    counts: manifest.counts,
    total: manifest.total,
    aggregate_sha256: manifest.aggregate_sha256,
  };
}

async function main() {
  const options = args(process.argv.slice(2));
  let result;
  if (options.command === "export-netlify") {
    result = await exportNetlify(options);
  } else if (options.command === "import-filesystem") {
    if (!options.source || !options.store) throw new Error("--source and --store are required");
    result = await importMigrationBundle(options.source, options.store, { apply: options.apply });
  } else if (options.command === "reconcile") {
    if (!options.source || !options.store) throw new Error("--source and --store are required");
    const bundle = loadMigrationBundle(options.source);
    const reconciliation = await importMigrationBundle(options.source, options.store, { apply: false });
    result = {
      ok: reconciliation.conflicts === 0 && reconciliation.inserted === 0,
      status: reconciliation.conflicts
        ? "RECONCILIATION_CONFLICT"
        : reconciliation.inserted
          ? "RECONCILIATION_INCOMPLETE"
          : "RECONCILED",
      dry_run: true,
      counts: bundle.manifest.counts,
      total: bundle.manifest.total,
      aggregate_sha256: bundle.manifest.aggregate_sha256,
      present: reconciliation.idempotent,
      missing: reconciliation.inserted,
      conflicts: reconciliation.conflicts,
    };
  } else {
    throw new Error("command must be export-netlify, import-filesystem, or reconcile");
  }
  // Only counts, hashes and state reach stdout. Record payloads never do.
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.conflicts) process.exitCode = 2;
  if (result.status === "RECONCILIATION_INCOMPLETE") process.exitCode = 2;
  if (result.status === "EXTERNAL_EXPORT_REQUIRED") process.exitCode = 3;
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ ok: false, error: String(err.code || err.message || "storage_migration_failed").slice(0, 120) }) + "\n");
  process.exit(1);
});
