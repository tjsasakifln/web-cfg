import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const C = require(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/js/tool-compute.cjs"));
let failed=0; const pass=(n,d="")=>console.log("PASS",n,d); const fail=(n,d)=>{console.error("FAIL",n,d);failed++}; const almost=(a,b,e=0.01)=>Math.abs(a-b)<=e;
for (const [raw,exp] of [["10000000",1e7],["10000000,50",1e7+.5],["10.000.000",1e7],["10.000.000,50",1e7+.5]]){const r=C.parseBRL(raw);if(!r.ok||!almost(r.value,exp))fail("p_"+raw,r);else pass("p_"+raw);}
if(C.parseBRL("x").ok)fail("bad");else pass("bad");
{const r=C.computeLimiteAditivo({valorInicial:1e7,tipo:"geral",acrescimosPrevios:1.8e6,supressoesPrevias:0,acrescimoProposto:9e5,supressaoProposta:0});if(!r.ok||r.withinAc!==false||r.level!=="bad")fail("over",r);else pass("over");if(!String(r.acrescimos.labelStatus).includes("limite numérico"))fail("word");else pass("word");}
{const r=C.computeLimiteAditivo({valorInicial:1e6,tipo:"reforma",acrescimosPrevios:0,supressoesPrevias:0,acrescimoProposto:4e5,supressaoProposta:0});if(r.limAc!==0.5||!r.withinAc)fail("ref");else pass("ref");}
{const all={};for(const c of Object.values(C.REEQ_CATEGORIES))for(const i of c.items)all[i.key]="met";const h=C.computeReequilibrio(all);if(h.readiness!=="alta")fail("hi",h);else pass("hi");const b=C.computeReequilibrio({...all,fato_gerador:"missing"});if(b.readiness==="alta"||!b.hasCentralBlocker)fail("blk",b);else pass("blk");}
{const r=C.computeMatrizEventos([{causa:"A",parte:"administracao",comunicacaoContemporanea:false,documentoDisponivel:false,impactoCaminhoCritico:"sim"}]);if(r.level!=="hypothesis")fail("mx",r);else pass("mx");}
{const r=C.computeMatrizAtraso(["projeto","pagamento"],10,"sim");if(r.level==="ok"||r.level==="bad")fail("leg",r.level);else pass("leg",r.level);}
{const r=C.computeAditivoReadiness([{id:"1",category:"essential",state:"pending",label:"A"},{id:"2",category:"blocker",state:"met",label:"B"}]);if(r.readiness==="alta")fail("ad");else pass("ad",r.readiness);}
if(failed){console.error(failed+" fail");process.exit(1);}console.log("ALL tool compute unit tests passed");
