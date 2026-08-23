import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let fail=0;
const pages=["ferramentas/index.html","ferramentas/limite-acrescimos-supressoes/index.html","ferramentas/checklist-reequilibrio/index.html","ferramentas/matriz-atraso-obra/index.html","ferramentas/diagnostico-defesa-margem/index.html"];
if(!existsSync(resolve(ROOT,"styles-tools.css"))){console.error("FAIL styles-tools");fail++;}else console.log("PASS styles-tools");
for(const rel of pages){
  const html=readFileSync(resolve(ROOT,rel),"utf8");
  if(html.includes("#0b5fff")){console.error("FAIL blue",rel);fail++;}else console.log("PASS no_blue",rel);
  if(rel!=="ferramentas/index.html" && !html.includes("styles-tools.css")){console.error("FAIL csslink",rel);fail++;}
  else if(rel!=="ferramentas/index.html") console.log("PASS csslink",rel);
  if(!/<form/i.test(html) && rel!=="ferramentas/index.html"){console.error("FAIL form",rel);fail++;}
}
const hub=readFileSync(resolve(ROOT,"ferramentas/index.html"),"utf8");
if(!/CollectionPage|ItemList/.test(hub)){console.error("FAIL schema");fail++;}else console.log("PASS schema");
const unit=readFileSync(resolve(ROOT,"scripts/site/test_tool_compute.mjs"),"utf8");
if(!unit.includes("computeLimiteAditivo")||!unit.includes("parseBRL")){console.error("FAIL unit");fail++;}else console.log("PASS unit_cov");
const compute=readFileSync(resolve(ROOT,"assets/js/tool-compute.js"),"utf8");
if(!compute.includes("0.25")||!compute.includes("0.5")){console.error("FAIL thr");fail++;}else console.log("PASS thr");
const reequilibrio=readFileSync(resolve(ROOT,"ferramentas/checklist-reequilibrio/index.html"),"utf8");
if(!reequilibrio.includes("Método e limites")||!reequilibrio.includes("licitacoesecontratos.tcu.gov.br")){console.error("FAIL reequilibrio_method");fail++;}else console.log("PASS reequilibrio_method");
if(reequilibrio.includes("#contato?")){console.error("FAIL reequilibrio_attribution_order");fail++;}else console.log("PASS reequilibrio_attribution_order");
if(!reequilibrio.includes('data-route-family="reequilibrio"') || !reequilibrio.includes('data-asset-id="checklist-reequilibrio"')){console.error("FAIL reequilibrio_attribution");fail++;}else console.log("PASS reequilibrio_attribution");
const money=readFileSync(resolve(ROOT,"ferramentas/diagnostico-defesa-margem/index.html"),"utf8");
if(!money.includes("Identificação do contrato")||!money.includes("Resumo executivo factual")||!money.includes("Timeline")||!money.includes("Eventos de defesa de margem")||!money.includes("Evidências e fontes")||!money.includes("O que merece conferência")||!money.includes("Limites e UNKNOWN")||!money.includes("Quero uma segunda leitura deste contrato")){console.error("FAIL money_asset_sections");fail++;}else console.log("PASS money_asset_sections");
if(money.includes("pode ter direito")||/\btem direito\b/i.test(money)){console.error("FAIL money_asset_claims");fail++;}else console.log("PASS money_asset_claims");
if(money.toLowerCase().includes("extra-cli")){console.error("FAIL money_asset_brand");fail++;}else console.log("PASS money_asset_brand");
const resultRoutes = new Map([
  ["ferramentas/checklist-reequilibrio/index.html", "/reequilibrio-obras-publicas/"],
  ["ferramentas/limite-acrescimos-supressoes/index.html", "/aditivos-obras-publicas/"],
  ["ferramentas/matriz-atraso-obra/index.html", "/atrasos-prorrogacao-obras-publicas/"],
]);
for (const [rel, destination] of resultRoutes) {
  const html = readFileSync(resolve(ROOT, rel), "utf8");
  const occurrences = html.split(`href="${destination}"`).length - 1;
  if (occurrences < 2) { console.error("FAIL both_result_branches", rel, destination, occurrences); fail++; }
  else console.log("PASS both_result_branches", rel, destination, occurrences);
  if (!html.includes("data-cta-id=") || !html.includes("data-route-family=") || !html.includes("data-asset-id=")) {
    console.error("FAIL attributed_result_cta", rel); fail++;
  } else console.log("PASS attributed_result_cta", rel);
}
if(fail) process.exit(1);
console.log("ALL tools structure checks passed");
