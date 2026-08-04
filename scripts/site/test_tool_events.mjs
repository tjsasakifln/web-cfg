/**
 * Assert tools emit canonical event names on the shipped path (static + tools-common).
 */
import { readFileSync, existsSync } from "fs";
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

const required = [
  "tool_view",
  "tool_start",
  "tool_complete",
  "tool_download",
  "tool_to_offer",
  "tool_to_whatsapp",
  "tool_to_form",
  "nurture_opt_in",
];

const common = readFileSync(resolve(ROOT, "assets/js/tools-common.js"), "utf8");
for (const ev of required) {
  if (!common.includes(ev) && !common.includes(`"${ev}"`) && !common.includes(`'${ev}'`)) {
    // bindToolLifecycle emits these as string literals
    if (!new RegExp(ev).test(common)) fail("common_has_" + ev);
    else pass("common_has_" + ev);
  } else pass("common_has_" + ev);
}
if (!common.includes("bindToolLifecycle")) fail("bindToolLifecycle");
else pass("bindToolLifecycle");
if (!common.includes("confengeTrack")) fail("uses_confengeTrack");
else pass("uses_confengeTrack");

const tools = [
  "ferramentas/limite-acrescimos-supressoes/index.html",
  "ferramentas/checklist-reequilibrio/index.html",
  "ferramentas/matriz-atraso-obra/index.html",
];
for (const rel of tools) {
  const t = readFileSync(resolve(ROOT, rel), "utf8");
  if (!t.includes("bindToolLifecycle")) fail("bind_" + rel);
  else pass("bind_" + rel);
  if (!t.includes("tool_complete")) fail("complete_" + rel);
  else pass("complete_" + rel);
  if (!existsSync(resolve(ROOT, rel))) fail("exists_" + rel);
}

// Content improvements cohort
const cohort = resolve(ROOT, "data/revops/organic-improvements-cohort.json");
if (!existsSync(cohort)) fail("cohort_missing");
else {
  const c = JSON.parse(readFileSync(cohort, "utf8"));
  if (!Array.isArray(c.improvements) || c.improvements.length < 5) fail("cohort_five", c.improvements?.length);
  else pass("cohort_five", c.improvements.length);
}

// Distribution kit 30 contacts
const kit = resolve(ROOT, "data/distribution/radar-outreach-kit.json");
if (!existsSync(kit)) fail("dist_kit");
else {
  const k = JSON.parse(readFileSync(kit, "utf8"));
  if (!k.contacts || k.contacts.length < 30) fail("contacts_30", k.contacts?.length);
  else pass("contacts_30", k.contacts.length);
  if (k.auto_send !== false) fail("no_auto_send");
  else pass("no_auto_send");
}

// Wave1 recommendations exist; zero human approved still
const rec = resolve(ROOT, "docs/editorial/WAVE1-MACHINE-RECOMMENDATIONS.json");
if (!existsSync(rec)) fail("wave1_rec");
else {
  const r = JSON.parse(readFileSync(rec, "utf8"));
  if (r.human_approved_count !== 0) fail("forged_human", r.human_approved_count);
  else pass("wave1_zero_human");
  if (!r.pages?.length) fail("wave1_pages");
  else pass("wave1_pages", r.pages.length);
}

// release-approved script refuses empty approvals
import { execSync } from "child_process";
const out = execSync("python3 scripts/editorial/release_approved.py", { cwd: ROOT, encoding: "utf8" });
const j = JSON.parse(out);
if (j.valid_human_approved !== 0) fail("release_has_approvals", j);
else pass("release_noop_without_human");
if (!(Array.isArray(j.blocked) ? j.blocked.join(" ") : String(j.blocked || "")).includes("no_valid_human")) {
  fail("release_blocked_msg");
} else pass("release_blocked_msg");

// pilot audit
const pilot = resolve(ROOT, "docs/pseo/PILOT-AUDIT.json");
if (!existsSync(pilot)) fail("pilot_audit");
else {
  const p = JSON.parse(readFileSync(pilot, "utf8"));
  if (p.total < 10) fail("pilot_count", p.total);
  else pass("pilot_count", p.total);
  const promoted = (p.pages || []).filter((x) => x.action === "promote");
  if (promoted.some((x) => String(x.proposed_final_url || "").includes("/piloto/"))) {
    fail("promote_still_piloto");
  } else pass("promote_not_under_piloto", promoted.length);
}

if (failed) {
  console.error(failed + " failures");
  process.exit(1);
}
console.log("\nALL tool/organic activation checks passed");
