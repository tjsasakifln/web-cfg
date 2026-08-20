/**
 * Structural + unit proof that scheduled operations are versioned and runnable.
 * Does not require production secrets for core assertions.
 */
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let failed = 0;
function pass(n, d = "") {
  console.log("PASS", n, d);
}
function fail(n, d) {
  console.error("FAIL", n, d);
  failed += 1;
}

// 1) Workflow exists and is the single primary scheduler
const wf = resolve(ROOT, ".github/workflows/revops-scheduled.yml");
if (!existsSync(wf)) fail("workflow_present");
else {
  pass("workflow_present");
  const y = readFileSync(wf, "utf8");
  if (!y.includes("cron:") || !y.includes("15 11 * * *")) fail("daily_cron", y.slice(0, 200));
  else pass("daily_cron");
  if (!y.includes("0 12 * * 1")) fail("weekly_cron");
  else pass("weekly_cron");
  if (!y.includes("scheduled_daily.mjs")) fail("daily_entry");
  else pass("daily_entry");
  if (!y.includes("scheduled_nurture.mjs")) fail("nurture_entry");
  else pass("nurture_entry");
  if (!y.includes("scheduled_weekly.mjs")) fail("weekly_entry");
  else pass("weekly_entry");
  if (!y.includes("search_demand_observatory.py sync")) fail("gsc_sync_entry");
  else pass("gsc_sync_entry");
  if (!y.includes("--allow-missing-creds")) fail("gsc_allow_missing_creds");
  else pass("gsc_allow_missing_creds");
  // Secrets not hardcoded
  if (/OPS_TOKEN:\s*['\"][^$]/.test(y)) fail("secret_hardcoded");
  else pass("secrets_via_env");
}

{
  const daily = readFileSync(resolve(ROOT, "scripts/revops/scheduled_daily.mjs"), "utf8");
  if (!daily.includes("produce_search_observation") || !daily.includes("drain_search_observation")) {
    fail("daily_search_observation");
  } else pass("daily_search_observation");
  const toml = readFileSync(resolve(ROOT, "netlify.toml"), "utf8");
  if (!toml.includes("search-observation-tick") || !toml.includes("schedule")) {
    fail("netlify_search_observation_tick");
  } else pass("netlify_search_observation_tick");
}

// 2) Entry scripts exist
for (const rel of [
  "scripts/revops/scheduled_daily.mjs",
  "scripts/revops/scheduled_nurture.mjs",
  "scripts/revops/scheduled_weekly.mjs",
]) {
  if (!existsSync(resolve(ROOT, rel))) fail("script_" + rel);
  else pass("script_" + rel);
}

function parseJsonBlob(text) {
  const t = String(text || "").trim();
  try {
    return JSON.parse(t);
  } catch {
    // pretty-printed multi-line JSON
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("no_json_in_output");
  }
}

// 3) GSC sync fixture path works (real shipped CLI)
{
  const out = execSync(
    "python3 scripts/revops/search_demand_observatory.py sync --fixture",
    { cwd: ROOT, encoding: "utf8" }
  );
  const j = parseJsonBlob(out);
  if (!j.ok || j.rows < 1) fail("gsc_fixture_sync", out.slice(0, 200));
  else pass("gsc_fixture_sync", `rows=${j.rows}`);
  const latestImport = resolve(ROOT, "data/revops/gsc/latest_import.json");
  if (existsSync(latestImport)) {
    const latest = JSON.parse(readFileSync(latestImport, "utf8"));
    if (latest.source === "fixture" || latest.synthetic === true) {
      fail("fixture_did_not_clobber_latest_import", latest.source);
    } else pass("fixture_did_not_clobber_latest_import", latest.source);
  }
  if (!existsSync(resolve(ROOT, "data/revops/gsc/last_sync.json"))) fail("last_sync_written");
  else {
    const ls = JSON.parse(readFileSync(resolve(ROOT, "data/revops/gsc/last_sync.json"), "utf8"));
    if (!ls.last_sync_at) fail("last_sync_at", ls);
    else pass("last_sync_at", ls.last_sync_at);
    if (ls.ready_for_product_decisions === true) fail("fixture_not_product", ls);
    else pass("fixture_not_product");
    if (ls.source === "search_analytics_api" || ls.source_kind === "search_analytics_api") {
      fail("fixture_not_live_source", ls);
    } else pass("fixture_not_live_source", ls.source_kind || ls.source);
  }
}

// 4) Missing credentials reported exactly, not invented series
{
  const env = { ...process.env };
  delete env.GSC_CREDENTIALS_JSON;
  delete env.GSC_CLIENT_SECRETS_JSON;
  delete env.GSC_TOKEN_JSON;
  const out = execSync(
    "python3 scripts/revops/search_demand_observatory.py sync --allow-missing-creds --days 7",
    { cwd: ROOT, encoding: "utf8", env }
  );
  const j = parseJsonBlob(out);
  if (j.error !== "missing_credentials") fail("missing_creds_error", j);
  else pass("missing_creds_exact_error");
  if (!Array.isArray(j.required_env) || !j.required_env.some((x) => /GSC_CREDENTIALS/.test(x))) {
    fail("required_env_named", j.required_env);
  } else pass("required_env_named");
}

// 5) Package scripts wired
{
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  for (const k of ["revops:scheduled-daily", "revops:gsc:sync", "test:schedules"]) {
    if (!pkg.scripts[k]) fail("npm_script_" + k);
    else pass("npm_script_" + k);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nALL schedule structural checks passed");
