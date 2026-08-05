#!/usr/bin/env node
/**
 * Story 1.5 — Lead export pipeline (FileStore fixtures + durable store abstraction).
 *
 * Usage:
 *   LEAD_STORE_DIR=./.leads node scripts/revops/export_leads.mjs --out /tmp/leads.jsonl
 *   LEAD_STORE_DIR=./.leads node scripts/revops/export_leads.mjs --kind real --from 2026-01-01 --to 2026-12-31
 *
 * Default stdout is path-only (no full PII dump). Use --stdout-json for CI fixtures.
 * Never write under public _site/.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const { createStore } = require(path.join(root, "netlify/functions/lib/lead-store.cjs"));

export const SCHEMA_VERSION = "1.0.0";

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    out: null,
    kind: "all", // all | real
    from: null,
    to: null,
    stdoutJson: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out.out = argv[++i];
    else if (a === "--kind") out.kind = argv[++i];
    else if (a === "--from") out.from = argv[++i];
    else if (a === "--to") out.to = argv[++i];
    else if (a === "--stdout-json") out.stdoutJson = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

export function filterLeads(leads, { kind = "all", from = null, to = null } = {}) {
  const fromTs = from ? Date.parse(from) : null;
  const toTs = to ? Date.parse(to + (to.length === 10 ? "T23:59:59.999Z" : "")) : null;
  return (leads || []).filter((l) => {
    if (kind === "real" && l.record_kind && l.record_kind !== "real") return false;
    if (kind === "real" && !l.record_kind) {
      /* treat missing as real for legacy fixtures */
    }
    const ts = Date.parse(l.received_at || l.updated_at || 0);
    if (fromTs != null && !Number.isNaN(fromTs) && ts < fromTs) return false;
    if (toTs != null && !Number.isNaN(toTs) && ts > toTs) return false;
    return true;
  });
}

export function toExportRecord(lead) {
  return {
    schema_version: SCHEMA_VERSION,
    lead_id: lead.lead_id,
    record_kind: lead.record_kind || "real",
    commercial_stage: lead.commercial_stage || null,
    received_at: lead.received_at || null,
    updated_at: lead.updated_at || null,
    delete_after: lead.delete_after || null,
    jornada: lead.jornada || null,
    estagio: lead.estagio || null,
    urgencia: lead.urgencia || null,
    origem: lead.origem || null,
    landing_page: lead.landing_page || null,
    referrer: lead.referrer || null,
    utm_source: lead.utm_source || null,
    utm_medium: lead.utm_medium || null,
    utm_campaign: lead.utm_campaign || null,
    content_cluster: lead.content_cluster || null,
    session_id: lead.session_id || null,
    // Contact fields included in file artifact only (ops-side). Not printed to stdout by default.
    nome: lead.nome || null,
    email: lead.email || null,
    telefone: lead.telefone || null,
    empresa: lead.empresa || null,
  };
}

export function buildExportPackage(leads, opts = {}) {
  const filtered = filterLeads(leads, opts);
  const records = filtered.map(toExportRecord);
  return {
    schema_version: SCHEMA_VERSION,
    exported_at: opts.now || new Date().toISOString(),
    filters: {
      kind: opts.kind || "all",
      from: opts.from || null,
      to: opts.to || null,
    },
    count: records.length,
    records,
  };
}

export function packageToJsonl(pkg) {
  const lines = [
    JSON.stringify({
      type: "meta",
      schema_version: pkg.schema_version,
      exported_at: pkg.exported_at,
      filters: pkg.filters,
      count: pkg.count,
    }),
    ...pkg.records.map((r) => JSON.stringify({ type: "lead", ...r })),
  ];
  return lines.join("\n") + "\n";
}

async function loadLeadsFromStore() {
  const store = await createStore();
  if (!store) throw new Error("store_unavailable — set LEAD_STORE_DIR for fixtures");
  if (typeof store.list === "function") return store.list();
  // FileStore has no list — scan dir
  const dir = process.env.LEAD_STORE_DIR;
  if (!dir) throw new Error("store has no list() and LEAD_STORE_DIR unset");
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    if (name === "idem" || name.startsWith("idem")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
    } catch {
      /* skip */
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`export_leads.mjs — schema_version=${SCHEMA_VERSION}
  --out PATH       write JSONL (preferred) or .json package
  --kind all|real  default all
  --from ISO       received_at lower bound
  --to ISO         received_at upper bound
  --stdout-json    print full package JSON (CI only; contains PII from fixtures)
Default: prints output path only (no PII on stdout).`);
    return 0;
  }
  const leads = await loadLeadsFromStore();
  const pkg = buildExportPackage(leads, args);
  const outPath =
    args.out ||
    path.join(root, "data", "revops", "exports", `leads-export-${Date.now()}.jsonl`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (outPath.endsWith(".json") && !outPath.endsWith(".jsonl")) {
    fs.writeFileSync(outPath, JSON.stringify(pkg, null, 2), "utf8");
  } else {
    fs.writeFileSync(outPath, packageToJsonl(pkg), "utf8");
  }
  if (args.stdoutJson) {
    // intentional for tests — fixtures only
    process.stdout.write(JSON.stringify({ ok: true, path: outPath, count: pkg.count, schema_version: SCHEMA_VERSION }) + "\n");
  } else {
    // path-only, no PII
    console.log(JSON.stringify({ ok: true, path: outPath, count: pkg.count, schema_version: SCHEMA_VERSION }));
  }
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((c) => process.exit(c || 0)).catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }));
    process.exit(1);
  });
}
