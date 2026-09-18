import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "../../../../../../../../scripts/site/resolve_chrome.mjs";
const BASE="https://confenge.com.br";
const SPEC={
 "/quantitativos-orcamento-obras/": ["#amostra-quantitativos figure.plate--dominant figcaption","#amostra-quantitativos .qty-memory, #amostra-quantitativos h3","#amostra-quantitativos figure.plate:not(.plate--dominant)","#amostra-quantitativos figure.plate:not(.plate--dominant) figcaption","#o-que-contratar ~ section a[href='#triagem-quantitativos'], section.sec--rule-top a[href='#triagem-quantitativos']","#exemplos-conferiveis a[href='#triagem-quantitativos']","#o-que-influencia","#publico-e-privado","#condicoes-da-proposta ul.conditions, #condicoes-da-proposta h3:last-of-type"],
 "/compatibilizacao-projetos-engenharia/": ["#registro-interferencias figure.plate:not(.plate--dominant)","#registro-interferencias figure.plate:not(.plate--dominant) figcaption","#registro-interferencias h3:last-of-type","section.sec--rule-top a[href='#pedido-compatibilizacao']"],
 "/medicoes-glosas-obras-publicas/": ["section.sec--rule-top a[href='#captura-pilar']","aside.lead-inline","#captura-pilar button, #captura-pilar [type=submit]"]
};
const b=await puppeteer.launch({executablePath:resolveChromePath(),headless:true,args:["--no-sandbox"]});
const out=[];
for (const [route,sels] of Object.entries(SPEC)) for (const [w,h] of [[390,844],[1440,1000]]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:h});
  await p.goto(BASE+route,{waitUntil:"networkidle0",timeout:60000});
  const r=await p.evaluate(async (sels)=>{
    document.querySelectorAll("*").forEach(el=>{const cs=getComputedStyle(el); if(cs.contentVisibility&&cs.contentVisibility!=="visible") el.style.contentVisibility="visible";});
    document.querySelectorAll("img[loading=lazy]").forEach(i=>{i.loading="eager";});
    if(document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...document.images].filter(i=>!i.complete).map(i=>new Promise(r=>{i.onload=i.onerror=r;})));
    window.scrollTo(0,document.body.scrollHeight); await new Promise(r=>setTimeout(r,300)); window.scrollTo(0,0);
    return sels.map(s=>{const el=document.querySelector(s); if(!el) return {sel:s,missing:true}; const r=el.getBoundingClientRect(); return {sel:s,top:Math.round(r.top+scrollY),bottom:Math.round(r.bottom+scrollY),h:Math.round(r.height),text:(el.innerText||"").replace(/\s+/g," ").trim().slice(0,70)};});
  },sels);
  out.push({route,viewport:`${w}x${h}`,height:await p.evaluate(()=>document.documentElement.scrollHeight),elements:r});
  console.log(route,`${w}x${h}`); for(const e of r) console.log("   ",e.missing?`MISSING ${e.sel}`:`${String(e.top).padStart(6)}-${String(e.bottom).padEnd(6)} ${e.sel}  | ${e.text.slice(0,50)}`);
  await p.close();
}
await b.close();
writeFileSync(process.argv[2],JSON.stringify({base:BASE,measured_at:new Date().toISOString(),rows:out},null,1));
