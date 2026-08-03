import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pages = [
  "ferramentas/index.html",
  "ferramentas/limite-acrescimos-supressoes/index.html",
  "ferramentas/checklist-reequilibrio/index.html",
  "ferramentas/matriz-atraso-obra/index.html",
  "radar/nacional-obras-publicas/index.html",
];
let fail = 0;
for (const rel of pages) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) { console.error("FAIL missing", rel); fail++; continue; }
  const html = readFileSync(p, "utf8");
  if (!/canonical/i.test(html)) { console.error("FAIL canonical", rel); fail++; }
  else console.log("PASS canonical", rel);
  if (/datalake|pipeline|slug de ingest/i.test(html)) { console.error("FAIL internal lang", rel); fail++; }
  else console.log("PASS no_internal_lang", rel);
  if (rel.includes("ferramentas/") && rel !== "ferramentas/index.html") {
    if (!/não substitui|Nao substitui|não é autorização|não emite|orientativ/i.test(html)) {
      console.error("FAIL disclaimer", rel); fail++;
    } else console.log("PASS disclaimer", rel);
    // Must compute before contact - has form submit handler
    if (!/<form/i.test(html)) { console.error("FAIL form", rel); fail++; }
    else console.log("PASS form", rel);
  }
  if (rel.includes("radar") && !/pending_lineage|lineage/i.test(html)) {
    console.error("FAIL radar lineage honesty", rel); fail++;
  } else if (rel.includes("radar")) console.log("PASS radar_lineage", rel);
}
// sitemap lists tools
const sm = readFileSync(resolve(ROOT, "sitemap.xml"), "utf8");
for (const u of [
  "ferramentas/limite-acrescimos-supressoes",
  "ferramentas/checklist-reequilibrio",
  "ferramentas/matriz-atraso-obra",
  "radar/nacional-obras-publicas",
]) {
  if (!sm.includes(u)) { console.error("FAIL sitemap", u); fail++; }
  else console.log("PASS sitemap", u);
}
// art 125 numbers
const lim = readFileSync(resolve(ROOT, "ferramentas/limite-acrescimos-supressoes/index.html"), "utf8");
if (!lim.includes("0.25") || !lim.includes("0.50")) { console.error("FAIL thresholds"); fail++; }
else console.log("PASS art125_thresholds");
if (fail) process.exit(1);
// pSEO build must not wipe hand-authored research radar page
import { readFileSync as rf2 } from "fs";
const buildPy = rf2(resolve(ROOT, "scripts/pseo/build.py"), "utf8");
if (!buildPy.includes("radar/nacional-obras-publicas/index.html")) {
  console.error("FAIL pseo_build_protects_radar_research");
  process.exit(1);
} else console.log("PASS pseo_build_protects_radar_research");
console.log("ALL tools structure checks passed");
