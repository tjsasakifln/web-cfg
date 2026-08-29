import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkt = JSON.parse(readFileSync(resolve(ROOT, "docs/editorial/WAVE1-HUMAN-REVIEW-PACKET.json"), "utf8"));
const html = readFileSync(resolve(ROOT, "ops/wave1-review.html"), "utf8");
const human = readFileSync(resolve(ROOT, "docs/editorial/HUMAN-ACTION-NOW.md"), "utf8");
let fail = 0;
function ok(n,c,d=""){ if(c) console.log("PASS",n); else { console.error("FAIL",n,d); fail++; } }
const expected = ["guia-checklist-aditivo", "lei-item-novo-desconto"];
const pages = pkt.pages || [];
ok("first_cohort_exactly_two", pages.length === 2, String(pages.length));
ok("first_cohort_order", pages.map((p) => p.page_id).join(",") === expected.join(","));
ok("commit_sha_informational", pkt.commit_sha_role === "informational_only");
const reviewTarget = pkt.review_target || {};
ok("preview_target_is_pr54", reviewTarget.preview_base_url === "https://deploy-preview-54--confenge.netlify.app");
ok("production_review_forbidden", reviewTarget.production_urls_allowed === false);
ok("runtime_preview_packet", /editorial-review-packet\.json$/.test(reviewTarget.runtime_evidence_url || ""));
for (const p of pages) {
  const id = p.page_id;
  ok(`material_hash:${id}`, /^[a-f0-9]{64}$/.test(p.material_hash || ""));
  ok(`intent:${id}`, Boolean(p.search_intent));
  ok(`demand:${id}`, Boolean(p.demand_evidence));
  ok(`objective:${id}`, Boolean(p.objective));
  ok(`sources:${id}`, Array.isArray(p.legal_sources) && p.legal_sources.length > 0);
  ok(`preview:${id}`, (p.preview || "").startsWith("https://deploy-preview-54--confenge.netlify.app/"));
  ok(`competitor:${id}`, Boolean(p.cannibalization && p.cannibalization.internal_competitor));
  ok(`cta:${id}`, Boolean(p.cta && p.cta.offer));
  ok(`human_command:${id}`, human.includes(`--page-id ${id}`) && human.includes(p.material_hash));
}
ok("noncohort_not_in_human_commands", !human.includes("--page-id lei-art124-alteracao-obra"));
ok("ops_is_not_approval_surface", html.includes('data-approval-source="registry"') && !html.includes("approve_cli.py"));

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
