/**
 * EPIC-TD-001 suite: export, cohorts, DSAR, GSC parity, script modules.
 * Uses real modules + temp FileStore fixtures.
 */
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import {
  buildExportPackage,
  packageToJsonl,
  SCHEMA_VERSION,
  filterLeads,
} from "../revops/export_leads.mjs";
import { buildCohorts, COHORT_SCHEMA_VERSION } from "../revops/attribution_cohorts.mjs";
import {
  contactHash,
  listLeads,
  findByIdOrHash,
  retentionDue,
  redactedExport,
} from "../revops/dsar_cli.mjs";
import { checkParity, syncFrom, PRIMARY, FUNCTIONS_COPY } from "../revops/gsc_insights_sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

let failed = 0;
function pass(n, d) {
  console.log("PASS", n, d || "");
}
function fail(n, d) {
  failed++;
  console.error("FAIL", n, d);
}

// --- fixtures ---
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epic-td-leads-"));
const now = "2026-08-05T12:00:00.000Z";
const leads = [
  {
    lead_id: "lead_real_1",
    record_kind: "real",
    nome: "Ana Real",
    email: "ana@example.com",
    telefone: "48999990001",
    received_at: "2026-07-01T10:00:00.000Z",
    delete_after: "2028-07-01T10:00:00.000Z",
    jornada: "contrato",
    landing_page: "/",
    utm_source: "google",
  },
  {
    lead_id: "lead_synth_1",
    record_kind: "synthetic",
    nome: "Bot",
    email: "bot@example.com",
    telefone: "48999990002",
    received_at: "2026-07-02T10:00:00.000Z",
    jornada: "edital",
    landing_page: "/conteudos/",
    utm_source: "newsletter",
  },
  {
    lead_id: "lead_old_1",
    record_kind: "real",
    nome: "Velho",
    email: "old@example.com",
    telefone: "48999990003",
    received_at: "2020-01-01T00:00:00.000Z",
    delete_after: "2022-01-01T00:00:00.000Z",
    jornada: "operacao",
    landing_page: "/ferramentas/",
    utm_source: "(direct)",
  },
];
for (const l of leads) {
  fs.writeFileSync(path.join(dir, `${l.lead_id}.json`), JSON.stringify(l), "utf8");
}

// Export
{
  const pkg = buildExportPackage(leads, { kind: "real", now });
  if (pkg.schema_version !== SCHEMA_VERSION) fail("export_schema", pkg.schema_version);
  if (pkg.count !== 2) fail("export_real_count", pkg.count);
  else pass("export_real_count", pkg.count);
  const jsonl = packageToJsonl(pkg);
  if (!jsonl.includes('"type":"meta"') || !jsonl.includes("lead_real_1")) fail("export_jsonl");
  else pass("export_jsonl");
  const all = filterLeads(leads, { kind: "all" });
  if (all.length !== 3) fail("export_all", all.length);
  else pass("export_all");
}

// CLI export path-only
{
  process.env.LEAD_STORE_DIR = dir;
  const out = path.join(dir, "out.jsonl");
  const r = spawnSync(
    process.execPath,
    [path.join(root, "scripts/revops/export_leads.mjs"), "--out", out, "--kind", "real"],
    { encoding: "utf8", env: process.env },
  );
  if (r.status !== 0) fail("export_cli", r.stderr || r.stdout);
  else {
    const line = (r.stdout || "").trim();
    if (line.includes("ana@example.com")) fail("export_cli_pii_stdout", line);
    else pass("export_cli_path_only");
  }
}

// Cohorts
{
  const events = [
    { page_path: "/", event: "page_view" },
    { page_path: "/", event: "lead_form_submit" },
    { page_path: "/conteudos/", event: "page_view" },
  ];
  const c = buildCohorts({ leads, events, kind: "real", now });
  if (c.schema_version !== COHORT_SCHEMA_VERSION) fail("cohort_schema");
  if (c.totals.leads_commercial !== 2) fail("cohort_excludes_synthetic", c.totals);
  else pass("cohort_excludes_synthetic");
  if (c.policy.adr_007 !== "cohort_or_path_only_never_query_to_lead") fail("cohort_adr");
  else pass("cohort_adr007");
  // no lead_id next to query fields
  const dump = JSON.stringify(c);
  if (dump.includes("lead_real_1") && dump.includes("query")) fail("cohort_identity_join_risk");
  else pass("cohort_no_identity_join");
}

// DSAR
{
  const entries = listLeads(dir);
  const h = contactHash("ana@example.com", "48999990001");
  const byHash = findByIdOrHash(entries, { hash: h });
  if (byHash.length !== 1) fail("dsar_hash_lookup", byHash.length);
  else pass("dsar_hash_lookup");
  const exp = redactedExport(byHash[0].record);
  if (exp.email !== "ana@example.com") fail("dsar_export_fields");
  else pass("dsar_export_fields");
  const due = retentionDue(entries, { now: new Date("2026-08-05T00:00:00Z") });
  if (!due.find((d) => d.lead_id === "lead_old_1")) fail("dsar_purge_due", due);
  else pass("dsar_purge_due", due.length);

  const del = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/revops/dsar_cli.mjs"),
      "delete",
      "--id",
      "lead_synth_1",
      "--dry-run",
      "--out",
      path.join(dir, "del-report.json"),
    ],
    { encoding: "utf8", env: { ...process.env, LEAD_STORE_DIR: dir } },
  );
  if (del.status !== 0) fail("dsar_delete_dry", del.stderr || del.stdout);
  else if (!fs.existsSync(path.join(dir, "lead_synth_1.json"))) fail("dsar_dry_mutated");
  else pass("dsar_delete_dry_run");
}

// GSC parity
{
  if (!fs.existsSync(PRIMARY)) {
    // create minimal private fixture for parity if missing
    const sample = JSON.stringify({ ok: true, generated_at: now, queries: [] }, null, 2);
    fs.mkdirSync(path.dirname(PRIMARY), { recursive: true });
    fs.writeFileSync(PRIMARY, sample, "utf8");
  }
  const synced = syncFrom(PRIMARY);
  if (!synced.ok) fail("gsc_sync_parity", synced);
  else pass("gsc_sync_parity", synced.sha256_primary?.slice(0, 12));
  const chk = checkParity();
  if (!chk.ok) fail("gsc_check_parity", chk);
  else pass("gsc_check_parity");
}

// Script modules
{
  const r = spawnSync(process.execPath, [path.join(root, "scripts/site/build_script_modules.mjs")], {
    encoding: "utf8",
  });
  if (r.status !== 0) fail("script_modules", r.stderr || r.stdout);
  else pass("script_modules");
  for (const n of ["analytics", "nav", "form"]) {
    if (!fs.existsSync(path.join(root, "js/modules", `${n}.js`))) fail(`module_${n}`);
    else pass(`module_${n}`);
  }
}

// public CSS allowlist must ship tools + tokens
{
  const art = fs.readFileSync(path.join(root, "scripts/pseo/public_artifact.py"), "utf8");
  for (const name of ["styles-tokens.css", "styles-tools.css"]) {
    if (!art.includes(`"${name}"`)) fail(`public_allow_${name}`);
    else pass(`public_allow_${name}`);
  }
  if (!fs.existsSync(path.join(root, "styles-tools.css"))) fail("styles_tools_missing");
  else pass("styles_tools_file");
}

// tokens file
{
  const tok = path.join(root, "styles-tokens.css");
  if (!fs.existsSync(tok)) fail("styles_tokens_missing");
  else {
    const t = fs.readFileSync(tok, "utf8");
    if (!t.includes("--navy-950") || !t.includes("--green-700")) fail("styles_tokens_palette");
    else pass("styles_tokens");
  }
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  if (!styles.includes("styles-tokens.css")) fail("styles_import_tokens");
  else pass("styles_import_tokens");
}

fs.rmSync(dir, { recursive: true, force: true });
if (failed) {
  console.error("EPIC_TD_SUITE_FAIL", failed);
  process.exit(1);
}
console.log("EPIC_TD_SUITE_OK");
