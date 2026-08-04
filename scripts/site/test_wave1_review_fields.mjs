import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkt = JSON.parse(readFileSync(resolve(ROOT, "docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json"), "utf8"));
const html = readFileSync(resolve(ROOT, "ops/wave1-review.html"), "utf8");
let fail = 0;
function ok(n,c,d=""){ if(c) console.log("PASS",n); else { console.error("FAIL",n,d); fail++; } }
const pages = pkt.pages || [];
ok("pages_12", pages.length >= 11, String(pages.length));
for (const p of pages) {
  const id = p.page_id;
  ok(`intent:${id}`, p.intent && p.intent !== "—" && p.intent !== "n/d" && p.intent !== ", " && !String(p.intent).includes("undefined"));
  ok(`material_diff:${id}`, p.material_difference && p.material_difference !== "—" && p.material_difference !== "n/d" && p.material_difference !== ", " && p.material_difference.length > 40);
  ok(`risk:${id}`, p.legal_risk && p.legal_risk !== "ver packet" && p.legal_risk.length > 20);
  ok(`competitor:${id}`, p.competitor && p.competitor !== "—" && p.competitor !== "n/d" && p.competitor !== ", ");
  ok(`cann_object:${id}`, p.cannibalization && typeof p.cannibalization === "object");
}
ok("ui_has_intencao_labels", (html.match(/<dt>Intenção<\/dt>/g) || []).length >= 11);
ok("ui_has_diff_labels", (html.match(/Diferença material/g) || []).length >= 11);
ok("ui_not_all_em_dash_intent", !html.includes("<dt>Intenção</dt><dd>—</dd>") && !html.includes("<dt>Intenção</dt><dd>n/d</dd>") && !html.includes("<dt>Intenção</dt><dd>, </dd>"));
// REJECTED jurisprudence must not be approvable
ok(
  "rejected_jur_approve_blocked",
  /jur-sumula-260-art[\s\S]*?data-dec="approve"[\s\S]*?disabled/i.test(html) ||
    /data-approve-blocked="1"[\s\S]*?jur-sumula-260-art|jur-sumula-260-art[\s\S]*?data-approve-blocked="1"/i.test(html),
  "approve button for rejected page must be disabled"
);
ok(
  "export_cli_command_shape",
  html.includes("approve_cli.py") && html.includes("--material-hash") && html.includes("export-cli"),
  "must export exact approve_cli with material-hash"
);
ok("blocks_tester_reviewer", /tester\|ci\|bot/i.test(html) || html.includes("BLOCKED_REVIEWERS") || html.includes("tester/ci/bot"), "block tester");
// pilot
const man = JSON.parse(readFileSync(resolve(ROOT, "docs/pseo/PILOT-MANIFEST.json"), "utf8"));
ok("pilot_10_20", man.count >= 10 && man.count <= 20, String(man.count));
ok("pilot_noindex", (man.pages || []).every((p) => p.robots === "noindex,follow"));
ok("pilot_not_sitemap", (man.pages || []).every((p) => p.in_sitemap === false));
const INTERNAL_LANG = /datalake|pipeline|dataset_hash|sample_size\s*\(\s*ledger\s*\)|source_run_id|page_material_hash|pncp_contracts|ingerid|\bagency-\d{5,}|\bmarket-[\w-]+\b|\bcomp-[\w-]+\b/i;
let pagesOk = 0;
let internalHits = [];
let weakAgency = [];
for (const p of man.pages || []) {
  const rel = p.url.replace(/^\//, "") + "index.html";
  try {
    const h = readFileSync(resolve(ROOT, rel), "utf8");
    if (/noindex/i.test(h) && /Metodologia/i.test(h) && /Limita/i.test(h) && /contract|contrato|PNCP|pncp/i.test(h)) pagesOk++;
    if (INTERNAL_LANG.test(h)) {
      const m = h.match(INTERNAL_LANG);
      internalHits.push(`${rel}:${m && m[0]}`);
    }
    if (p.page_type === "agency" || /\/orgaos\//.test(p.url)) {
      const emptyUl = /Conclusão específica[\s\S]*?<ul>\s*<\/ul>/i.test(h);
      const naRank = /Sem ranking público de compradores/i.test(h);
      const hasMixRows = (h.match(/<tbody>[\s\S]*?<tr>/gi) || []).length >= 1
        && !/Sem ranking público de compradores/i.test(h);
      const hasBullets = /Conclusão específica[\s\S]*?<ul>\s*<li>/i.test(h);
      if (emptyUl || naRank || !hasMixRows || !hasBullets) {
        weakAgency.push(rel);
      }
    }
  } catch { /* missing */ }
}
ok("pilot_pages_on_disk_with_method", pagesOk >= 10, String(pagesOk));
// Fail closed: every piloto HTML on disk must be free of internal jargon
function walkPilot(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) walkPilot(full, acc);
    else if (name === "index.html") acc.push(full);
  }
  return acc;
}
const allPilot = walkPilot(resolve(ROOT, "piloto"));
ok("pilot_html_count", allPilot.length >= 10, String(allPilot.length));
for (const full of allPilot) {
  const h = readFileSync(full, "utf8");
  const rel = full.replace(ROOT + "/", "").replace(ROOT + "\\", "");
  if (INTERNAL_LANG.test(h)) {
    const m = h.match(INTERNAL_LANG);
    internalHits.push(`${rel}:${m && m[0]}`);
  }
}
ok("pilot_no_internal_lang", internalHits.length === 0, internalHits.slice(0, 8).join(" | "));
ok("pilot_agency_conclusion_not_empty", weakAgency.length === 0, weakAgency.join(" | "));
if (fail) process.exit(1);
console.log("ALL wave1+pilot field checks passed");
