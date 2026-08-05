#!/usr/bin/env node
/**
 * Story 1.12 — GSC insights single-source parity + optional private backup export.
 *
 * Primary generator remains scripts/revops/search_demand_observatory.py (dashboard).
 * This module:
 *  1) asserts hash parity between data/ops and netlify/functions/data copies
 *  2) optionally copies both from a single source path
 *  3) optional backup to a private directory (not public _site)
 *
 * Usage:
 *   node scripts/revops/gsc_insights_sync.mjs --check
 *   node scripts/revops/gsc_insights_sync.mjs --sync-from data/ops/gsc-insights.json
 *   GSC_BACKUP_DIR=/secure/backups node scripts/revops/gsc_insights_sync.mjs --backup
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

export const PRIMARY = path.join(root, "data", "ops", "gsc-insights.json");
export const FUNCTIONS_COPY = path.join(
  root,
  "netlify",
  "functions",
  "data",
  "gsc-insights.json",
);

export function fileSha256(p) {
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function checkParity() {
  const a = fileSha256(PRIMARY);
  const b = fileSha256(FUNCTIONS_COPY);
  return {
    ok: Boolean(a && b && a === b),
    primary: PRIMARY,
    functions_copy: FUNCTIONS_COPY,
    sha256_primary: a,
    sha256_functions: b,
  };
}

export function syncFrom(sourcePath) {
  const src = path.resolve(sourcePath);
  if (!fs.existsSync(src)) throw new Error(`source missing: ${src}`);
  const body = fs.readFileSync(src);
  // refuse public paths
  const rel = path.relative(root, src);
  if (rel.startsWith("_site") || rel.startsWith("ops/data")) {
    throw new Error("refusing public/legacy path as source");
  }
  for (const dest of [PRIMARY, FUNCTIONS_COPY]) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, body);
  }
  return checkParity();
}

export function backupTo(dir) {
  const destDir = path.resolve(dir);
  if (destDir.includes(`${path.sep}_site`) || destDir.endsWith(`${path.sep}_site`)) {
    throw new Error("backup destination must not be public _site");
  }
  fs.mkdirSync(destDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(destDir, `gsc-insights-${stamp}.json`);
  fs.copyFileSync(PRIMARY, dest);
  return { ok: true, path: dest, sha256: fileSha256(dest) };
}

function parseArgs(argv) {
  const o = { check: false, syncFrom: null, backup: false, backupDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") o.check = true;
    else if (a === "--sync-from") o.syncFrom = argv[++i];
    else if (a === "--backup") o.backup = true;
    else if (a === "--backup-dir") o.backupDir = argv[++i];
  }
  return o;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.syncFrom) {
    const r = syncFrom(args.syncFrom);
    console.log(JSON.stringify({ action: "sync", ...r }));
    process.exit(r.ok ? 0 : 1);
  }
  if (args.backup) {
    const dir = args.backupDir || process.env.GSC_BACKUP_DIR;
    if (!dir) {
      console.error(JSON.stringify({ ok: false, error: "GSC_BACKUP_DIR or --backup-dir required" }));
      process.exit(2);
    }
    const r = backupTo(dir);
    console.log(JSON.stringify(r));
    process.exit(0);
  }
  // default check
  const r = checkParity();
  console.log(JSON.stringify({ action: "check", ...r }));
  process.exit(r.ok ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
