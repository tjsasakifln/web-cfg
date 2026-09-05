import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let fail=0;
const pages=["ferramentas/index.html","ferramentas/limite-acrescimos-supressoes/index.html","ferramentas/checklist-reequilibrio/index.html","ferramentas/matriz-atraso-obra/index.html","ferramentas/diagnostico-defesa-margem/index.html","ferramentas/prontidao-tecnica-obra-privada/index.html"];
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

  if (rel !== "ferramentas/index.html") {
    const clientForm = html.match(/<form\b[^>]*\b(id="(?:limite-form|f|lookup|diagnostico)")[^>]*>/i);
    if (!clientForm || !/\bmethod="post"/i.test(clientForm[0])) {
      console.error("FAIL client_form_post_no_url_leak", rel); fail++;
    } else console.log("PASS client_form_post_no_url_leak", rel);
    if (!html.includes("data-tool-runtime-status") || !/<button\b[^>]*\btool-run[^>]*\bdisabled\b/i.test(html) ||
        !/<fieldset\b[^>]*data-tool-runtime-fields[^>]*\bdisabled\b/i.test(html)) {
      console.error("FAIL js_error_state", rel); fail++;
    } else console.log("PASS js_error_state", rel);
  }
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
const limite=readFileSync(resolve(ROOT,"ferramentas/limite-acrescimos-supressoes/index.html"),"utf8");
for (const state of ["CONFIRMED", "UNKNOWN", "CONFIRMED_COMPLETE", "KNOWN_PARTIAL"]) {
  if (!limite.includes(`value="${state}"`)) { console.error("FAIL limite_premise_state", state); fail++; }
  else console.log("PASS limite_premise_state", state);
}
if (!limite.includes("computeArt125Triage")) { console.error("FAIL limite_triage_public_api"); fail++; }
else console.log("PASS limite_triage_public_api");
if (/\b(?:box|out|cta)\.innerHTML\s*=/.test(limite)) {
  console.error("FAIL limite_persisted_state_html_sink"); fail++;
} else console.log("PASS limite_persisted_state_text_safe_dom");
const reequilibrio=readFileSync(resolve(ROOT,"ferramentas/checklist-reequilibrio/index.html"),"utf8");
if(!reequilibrio.includes("Método e limites")||!reequilibrio.includes("licitacoesecontratos.tcu.gov.br")){console.error("FAIL reequilibrio_method");fail++;}else console.log("PASS reequilibrio_method");
if(reequilibrio.includes("#contato?")){console.error("FAIL reequilibrio_attribution_order");fail++;}else console.log("PASS reequilibrio_attribution_order");
if(!reequilibrio.includes('data-route-family="reequilibrio"') || !reequilibrio.includes('data-asset-id="checklist-reequilibrio"')){console.error("FAIL reequilibrio_attribution");fail++;}else console.log("PASS reequilibrio_attribution");
const matriz=readFileSync(resolve(ROOT,"ferramentas/matriz-atraso-obra/index.html"),"utf8");
const matrizCss=readFileSync(resolve(ROOT,"ferramentas/matriz-atraso-obra/styles.css"),"utf8");
if (/\bout\.innerHTML\s*=/.test(matriz)) {
  console.error("FAIL matriz_result_dom_html_sink"); fail++;
} else console.log("PASS matriz_result_dom_text_only");
if (/style=["']grid-column\s*:\s*1\s*\/\s*-1/i.test(matriz)
    || !matriz.includes("tool-field--full")
    || !/\.tool-field--full\s*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1/i.test(matrizCss)) {
  console.error("FAIL matriz_dynamic_inline_grid_style"); fail++;
} else console.log("PASS matriz_dynamic_grid_class");
const money=readFileSync(resolve(ROOT,"ferramentas/diagnostico-defesa-margem/index.html"),"utf8");
if(!money.includes("Identificação do contrato")||!money.includes("Resumo executivo factual")||!money.includes("Timeline")||!money.includes("Eventos de defesa de margem")||!money.includes("Evidências e fontes")||!money.includes("O que merece conferência")||!money.includes("Limites e UNKNOWN")||!money.includes("Registrar pedido de segunda leitura deste contrato")){console.error("FAIL money_asset_sections");fail++;}else console.log("PASS money_asset_sections");
if(money.includes("pode ter direito")||/\btem direito\b/i.test(money)){console.error("FAIL money_asset_claims");fail++;}else console.log("PASS money_asset_claims");
if(money.toLowerCase().includes("extra-cli")){console.error("FAIL money_asset_brand");fail++;}else console.log("PASS money_asset_brand");
if(!money.includes("btn-copy")||!money.includes("btn-dl")||!money.includes("btn-print")||!money.includes("btn-reset")){
  console.error("FAIL money_export_clear"); fail++;
} else console.log("PASS money_export_clear");
if(!money.includes("bindToolLifecycle")||!money.includes("tool_complete")){
  console.error("FAIL money_events"); fail++;
} else console.log("PASS money_events");
if (/<section\b[^>]*data-tool-to-offer/i.test(money)) {
  console.error("FAIL money_section_false_offer_attribution"); fail++;
} else console.log("PASS money_offer_attribution_click_only");
const analyticsCalls = [...money.matchAll(/(?:T\.track|window\.confengeTrack)\([\s\S]*?\}\);/g)]
  .map((m) => m[0]).join("\n");
if (/public_id_slug|public_contract_id|\bqid\b|\bquery\b/.test(analyticsCalls)) {
  console.error("FAIL money_identifier_in_analytics"); fail++;
} else console.log("PASS money_identifier_not_in_analytics");
// Only the tools that still end by attributing the result to another page.
// #556 and #561 replaced that ending with a persisted on-page capture.
const resultRoutes = new Map([
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
if (!limite.includes('id="cfg-d19-handoff"') || !limite.includes('action="/.netlify/functions/lead"') || !limite.includes('data-receipt-required="true"')) {
  console.error("FAIL limite_terminal_capture"); fail++;
} else console.log("PASS limite_terminal_capture");
if (!limite.includes('name="deliverable_id" type="hidden" value="CFG-D19"') || !limite.includes('name="contract_event" type="hidden" value="mudanca_escopo"')) {
  console.error("FAIL limite_cfg_d19_contract"); fail++;
} else console.log("PASS limite_cfg_d19_contract");

// #561: the reequilibrio checklist ends with a persisted terminal capture,
// result-gated, and never ships a computed readiness value to the server.
if (!reequilibrio.includes('id="reequilibrio-handoff"')
    || !reequilibrio.includes('action="/.netlify/functions/lead"')
    || !reequilibrio.includes('data-receipt-required="true"')
    || !reequilibrio.includes('data-result-gated-capture="true"')
    || !reequilibrio.includes('data-result-source="#out"')) {
  console.error("FAIL reequilibrio_terminal_capture"); fail++;
} else console.log("PASS reequilibrio_terminal_capture");
{
  const capture = reequilibrio.match(/<form\b[^>]*id="reequilibrio-capture-form"[^>]*>[\s\S]*?<\/form>/i)?.[0] || "";
  const computed = ["readiness", "score_pct", "level", "blockers", "missingBlockers", "cta_branch", "artifact"];
  const leaked = computed.filter((name) => new RegExp(`name=["'][^"']*${name}[^"']*["']`, "i").test(capture));
  if (!capture || leaked.length) {
    console.error("FAIL reequilibrio_capture_without_computed_values", leaked); fail++;
  } else console.log("PASS reequilibrio_capture_without_computed_values");
}
if (!reequilibrio.includes("btn-copy") || !reequilibrio.includes("btn-dl") || !reequilibrio.includes("btn-print") || !reequilibrio.includes("btn-reset")) {
  console.error("FAIL reequilibrio_clear_export"); fail++;
} else console.log("PASS reequilibrio_clear_export");
if (!reequilibrio.includes("Premissas") && !reequilibrio.includes("premissas")) {
  console.error("FAIL reequilibrio_premises"); fail++;
} else console.log("PASS reequilibrio_premises");

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
