import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let fail=0;
const pages=["ferramentas/index.html","ferramentas/limite-acrescimos-supressoes/index.html","ferramentas/checklist-reequilibrio/index.html","ferramentas/matriz-atraso-obra/index.html"];
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
if(!reequilibrio.includes("origem=%2Fferramentas%2Fchecklist-reequilibrio%2F#contato")){console.error("FAIL reequilibrio_attribution");fail++;}else console.log("PASS reequilibrio_attribution");
if(fail) process.exit(1);
console.log("ALL tools structure checks passed");
