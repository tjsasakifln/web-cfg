import { readFileSync } from "fs";
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
  ok(`intent:${id}`, p.intent && p.intent !== "—" && !String(p.intent).includes("undefined"));
  ok(`material_diff:${id}`, p.material_difference && p.material_difference !== "—" && p.material_difference.length > 40);
  ok(`risk:${id}`, p.legal_risk && p.legal_risk !== "ver packet" && p.legal_risk.length > 20);
  ok(`competitor:${id}`, p.competitor && p.competitor !== "—");
  ok(`cann_object:${id}`, p.cannibalization && typeof p.cannibalization === "object");
}
ok("ui_has_intencao_labels", (html.match(/<dt>Intenção<\/dt>/g) || []).length >= 11);
ok("ui_has_diff_labels", (html.match(/Diferença material/g) || []).length >= 11);
ok("ui_not_all_em_dash_intent", !html.includes("<dt>Intenção</dt><dd>—</dd>"));
// pilot
const man = JSON.parse(readFileSync(resolve(ROOT, "docs/pseo/PILOT-MANIFEST.json"), "utf8"));
ok("pilot_10_20", man.count >= 10 && man.count <= 20, String(man.count));
ok("pilot_noindex", (man.pages || []).every((p) => p.robots === "noindex,follow"));
ok("pilot_not_sitemap", (man.pages || []).every((p) => p.in_sitemap === false));
let pagesOk = 0;
for (const p of man.pages || []) {
  const rel = p.url.replace(/^\//, "") + "index.html";
  try {
    const h = readFileSync(resolve(ROOT, rel), "utf8");
    if (/noindex/i.test(h) && /Metodologia/i.test(h) && /Limita/i.test(h) && /contract|contrato|PNCP|pncp/i.test(h)) pagesOk++;
  } catch { /* missing */ }
}
ok("pilot_pages_on_disk_with_method", pagesOk >= 10, String(pagesOk));
if (fail) process.exit(1);
console.log("ALL wave1+pilot field checks passed");
