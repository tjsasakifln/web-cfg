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
  if(!html.includes('data-tool-job') || !html.includes('data-tool-decision')){
    console.error("FAIL job_decision",rel); fail++;
  } else console.log("PASS job_decision",rel);
  const lower = html.toLowerCase();
  if(!lower.includes("fato") || !lower.includes("cálculo") || !lower.includes("inferência") || !(lower.includes("desconhecido") || lower.includes("unknown"))){
    console.error("FAIL layers_language",rel); fail++;
  } else console.log("PASS layers_language",rel);
}
const hub=readFileSync(resolve(ROOT,"ferramentas/index.html"),"utf8");
if(!/CollectionPage|ItemList/.test(hub)){console.error("FAIL schema");fail++;}else console.log("PASS schema");
const unit=readFileSync(resolve(ROOT,"scripts/site/test_tool_compute.mjs"),"utf8");
if(!unit.includes("computeLimiteAditivo")||!unit.includes("parseBRL")||!unit.includes("explainLimite")){console.error("FAIL unit");fail++;}else console.log("PASS unit_cov");
if(!unit.includes("fixtures/tools/tool-compute.json")){console.error("FAIL unit_fixtures");fail++;}else console.log("PASS unit_fixtures");
const compute=readFileSync(resolve(ROOT,"assets/js/tool-compute.js"),"utf8");
if(!compute.includes("0.25")||!compute.includes("0.5")){console.error("FAIL thr");fail++;}else console.log("PASS thr");
if(!compute.includes("explainLimite")||!compute.includes("explainReequilibrio")||!compute.includes("explainMatriz")){
  console.error("FAIL explainers"); fail++;
} else console.log("PASS explainers");
const reequilibrio=readFileSync(resolve(ROOT,"ferramentas/checklist-reequilibrio/index.html"),"utf8");
if(!reequilibrio.includes("Método e limites")||!reequilibrio.includes("licitacoesecontratos.tcu.gov.br")){console.error("FAIL reequilibrio_method");fail++;}else console.log("PASS reequilibrio_method");
if(reequilibrio.includes("#contato?")){console.error("FAIL reequilibrio_attribution_order");fail++;}else console.log("PASS reequilibrio_attribution_order");
if(!reequilibrio.includes('data-route-family="reequilibrio"') || !reequilibrio.includes('data-asset-id="checklist-reequilibrio"')){console.error("FAIL reequilibrio_attribution");fail++;}else console.log("PASS reequilibrio_attribution");
const money=readFileSync(resolve(ROOT,"ferramentas/diagnostico-defesa-margem/index.html"),"utf8");
if(!money.includes("Identificação do contrato")||!money.includes("Resumo executivo factual")||!money.includes("Timeline")||!money.includes("Eventos de defesa de margem")||!money.includes("Evidências e fontes")||!money.includes("O que merece conferência")||!money.includes("Limites e UNKNOWN")||!money.includes("Quero uma segunda leitura deste contrato")){console.error("FAIL money_asset_sections");fail++;}else console.log("PASS money_asset_sections");
if(money.includes("pode ter direito")||/\btem direito\b/i.test(money)){console.error("FAIL money_asset_claims");fail++;}else console.log("PASS money_asset_claims");
if(money.toLowerCase().includes("extra-cli")){console.error("FAIL money_asset_brand");fail++;}else console.log("PASS money_asset_brand");
if(!money.includes("btn-copy")||!money.includes("btn-dl")||!money.includes("btn-print")||!money.includes("btn-reset")){
  console.error("FAIL money_export_clear"); fail++;
} else console.log("PASS money_export_clear");
if(!money.includes("bindToolLifecycle")||!money.includes("tool_complete")){
  console.error("FAIL money_events"); fail++;
} else console.log("PASS money_events");
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
  if (!html.includes("btn-copy") || !html.includes("btn-dl") || !html.includes("btn-print") || !html.includes("btn-reset")) {
    console.error("FAIL clear_export", rel); fail++;
  } else console.log("PASS clear_export", rel);
  if (!html.includes("Premissas") && !html.includes("premissas")) {
    console.error("FAIL premises", rel); fail++;
  } else console.log("PASS premises", rel);
}

function cadastroGatesResult(rel, html) {
  const leadIdx = html.search(/<form[^>]*(id="lead-form"|name="diagnostico-b2g")|<input[^>]*(id="nome"|name="nome")[^>]*required/i);
  const resultIdx = Math.min(
    ...['id="resultado"', 'id="out"', 'id="identificacao"', 'id="h-identificacao"', 'id="camadas-diagnostico"']
      .map((n) => html.indexOf(n)).filter((i) => i >= 0).concat([html.length])
  );
  if (leadIdx >= 0 && leadIdx < resultIdx) {
    console.error("FAIL cadastro_before_result", rel, { leadIdx, resultIdx });
    fail++;
    return;
  }
  console.log("PASS no_cadastro_before_result", rel);
}
for (const rel of pages) {
  if (rel === "ferramentas/index.html") continue;
  cadastroGatesResult(rel, readFileSync(resolve(ROOT, rel), "utf8"));
}

const ci = readFileSync(resolve(ROOT, ".github/workflows/site-ci.yml"), "utf8");
if (!ci.includes("test:tool-compute")) { console.error("FAIL site_ci_compute"); fail++; }
else console.log("PASS site_ci_compute");

if(fail) process.exit(1);
console.log("ALL tools structure checks passed");
