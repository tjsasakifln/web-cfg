#!/usr/bin/env node
/**
 * Story 1.11 — DSAR export/delete + retention purge report (FileStore fixtures).
 *
 * Usage:
 *   LEAD_STORE_DIR=./.leads node scripts/revops/dsar_cli.mjs export --id lead_x --out /tmp/dsar.json
 *   LEAD_STORE_DIR=./.leads node scripts/revops/dsar_cli.mjs delete --id lead_x --dry-run
 *   LEAD_STORE_DIR=./.leads node scripts/revops/dsar_cli.mjs purge --dry-run --out /tmp/purge-report.json
 *
 * Defaults: delete/purge are dry-run unless --apply is set.
 * Never write under public _site/.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const DEFAULT_RETAIN_DAYS = 730;

export function contactHash(email, telefone) {
  const e = String(email || "").trim().toLowerCase();
  const p = String(telefone || "").replace(/\D/g, "");
  const raw = `${e}|${p}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function listLeads(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    if (name.startsWith("idem")) continue;
    try {
      out.push({
        file: path.join(dir, name),
        record: JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")),
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

export function findByIdOrHash(entries, { id, hash } = {}) {
  return entries.filter(({ record }) => {
    if (id && record.lead_id === id) return true;
    if (hash) {
      const h = contactHash(record.email, record.telefone);
      if (h === hash) return true;
      if (record.contact_hash === hash) return true;
    }
    return false;
  });
}

export function redactedExport(record) {
  return {
    schema_version: "dsar-1.0.0",
    lead_id: record.lead_id,
    received_at: record.received_at,
    delete_after: record.delete_after,
    record_kind: record.record_kind,
    jornada: record.jornada,
    estagio: record.estagio,
    // DSAR subject access: include contact in secured file only
    nome: record.nome,
    email: record.email,
    telefone: record.telefone,
    empresa: record.empresa,
    contact_hash: contactHash(record.email, record.telefone),
    landing_page: record.landing_page,
    utm_source: record.utm_source,
  };
}

export function retentionDue(entries, { now = new Date(), retainDays = DEFAULT_RETAIN_DAYS } = {}) {
  const nowMs = now.getTime();
  const due = [];
  for (const { file, record } of entries) {
    let cutoff = null;
    if (record.delete_after) cutoff = Date.parse(record.delete_after);
    else if (record.received_at) {
      cutoff = Date.parse(record.received_at) + retainDays * 864e5;
    }
    if (cutoff != null && !Number.isNaN(cutoff) && cutoff <= nowMs) {
      due.push({
        lead_id: record.lead_id,
        file,
        delete_after: record.delete_after || new Date(cutoff).toISOString(),
        record_kind: record.record_kind || null,
      });
    }
  }
  return due;
}

function parseArgs(argv) {
  const cmd = argv[0];
  const o = {
    cmd,
    id: null,
    hash: null,
    out: null,
    dryRun: true,
    apply: false,
    now: process.env.DSAR_NOW || null,
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id") o.id = argv[++i];
    else if (a === "--hash") o.hash = argv[++i];
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--apply") {
      o.apply = true;
      o.dryRun = false;
    } else if (a === "--dry-run") o.dryRun = true;
  }
  return o;
}

function storeDir() {
  return process.env.LEAD_STORE_DIR || path.join(root, ".leads");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.cmd || !["export", "delete", "purge"].includes(args.cmd)) {
    console.error(
      "Usage: dsar_cli.mjs export|delete|purge [--id ID] [--hash SHA256] [--out PATH] [--dry-run|--apply]",
    );
    process.exit(2);
  }
  const dir = storeDir();
  const entries = listLeads(dir);
  const now = args.now ? new Date(args.now) : new Date();

  if (args.cmd === "export") {
    const hits = findByIdOrHash(entries, { id: args.id, hash: args.hash });
    if (!hits.length) {
      console.log(JSON.stringify({ ok: false, error: "not_found" }));
      return 1;
    }
    const payload = {
      schema_version: "dsar-1.0.0",
      exported_at: now.toISOString(),
      count: hits.length,
      records: hits.map((h) => redactedExport(h.record)),
    };
    const out =
      args.out ||
      path.join(root, "data", "revops", "dsar", `dsar-export-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(payload, null, 2), "utf8");
    console.log(JSON.stringify({ ok: true, path: out, count: hits.length }));
    return 0;
  }

  if (args.cmd === "delete") {
    const hits = findByIdOrHash(entries, { id: args.id, hash: args.hash });
    const report = {
      schema_version: "dsar-delete-1.0.0",
      dry_run: args.dryRun,
      at: now.toISOString(),
      would_delete: hits.map((h) => h.record.lead_id),
      deleted: [],
    };
    if (!args.dryRun && args.apply) {
      for (const h of hits) {
        fs.unlinkSync(h.file);
        report.deleted.push(h.record.lead_id);
      }
    }
    if (args.out) {
      fs.mkdirSync(path.dirname(args.out), { recursive: true });
      fs.writeFileSync(args.out, JSON.stringify(report, null, 2), "utf8");
    }
    console.log(
      JSON.stringify({
        ok: true,
        dry_run: report.dry_run,
        count: hits.length,
        path: args.out || null,
      }),
    );
    return 0;
  }

  if (args.cmd === "purge") {
    const retain = Number(process.env.LEAD_RETAIN_DAYS || DEFAULT_RETAIN_DAYS);
    const due = retentionDue(entries, { now, retainDays: retain });
    const report = {
      schema_version: "retention-purge-1.0.0",
      dry_run: args.dryRun,
      at: now.toISOString(),
      retain_days: retain,
      count: due.length,
      ids: due.map((d) => d.lead_id),
      items: due,
    };
    const out =
      args.out ||
      path.join(root, "data", "revops", "dsar", `retention-purge-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (!args.dryRun && args.apply) {
      for (const d of due) {
        try {
          fs.unlinkSync(d.file);
        } catch {
          /* ignore */
        }
      }
      report.applied = true;
    }
    fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
    console.log(
      JSON.stringify({
        ok: true,
        dry_run: report.dry_run,
        count: due.length,
        path: out,
      }),
    );
    return 0;
  }
  return 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((c) => process.exit(c || 0)).catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e.message || e).slice(0, 200) }));
    process.exit(1);
  });
}
