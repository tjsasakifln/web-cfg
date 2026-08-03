import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pages = [
  "nurture/index.html",
  "nurture/sair/index.html",
  "casos/index.html",
  "casos/aditivo-art125-demonstrativo/index.html",
  "casos/medicao-glosa-demonstrativo/index.html",
  "imprensa/index.html",
  "data/nurture/tracks.json",
  "netlify/functions/nurture.cjs",
  "netlify/functions/lib/nurture-core.cjs",
];
let fail=0;
for (const rel of pages) {
  if (!existsSync(resolve(ROOT, rel))) { console.error("FAIL missing", rel); fail++; }
  else console.log("PASS exists", rel);
}
const tracks = JSON.parse(readFileSync(resolve(ROOT, "data/nurture/tracks.json"), "utf8"));
for (const id of ["contrato","edital","operacao"]) {
  const n = tracks.tracks[id]?.messages?.length;
  if (n !== 5) { console.error("FAIL messages", id, n); fail++; }
  else console.log("PASS messages", id, n);
}
const caseHtml = readFileSync(resolve(ROOT, "casos/aditivo-art125-demonstrativo/index.html"), "utf8");
if (!/DEMONSTRATIVO|NÃO É CASE/i.test(caseHtml)) { console.error("FAIL case label"); fail++; }
else console.log("PASS case_demo_label");
if (/economia de R\$\s*[0-9]|vitória em licitação|nosso cliente ganhou/i.test(caseHtml)) { console.error("FAIL fake client claim"); fail++; }
else console.log("PASS no_fake_client_claims");
const sm = readFileSync(resolve(ROOT, "sitemap.xml"), "utf8");
for (const u of ["/nurture/","/casos/","/imprensa/"]) {
  if (!sm.includes(u)) { console.error("FAIL sitemap", u); fail++; }
  else console.log("PASS sitemap", u);
}
if (fail) process.exit(1);
console.log("ALL nurture/cases/press structure checks passed");
