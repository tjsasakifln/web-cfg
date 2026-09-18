import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { resolveChromePath } from "../../../../../../../../scripts/site/resolve_chrome.mjs";
const BASE="https://confenge.com.br";
const SPEC={
 "/servicos/": ["#servico-avaliacao","#servico-avaliacao figure.plate","#servico-avaliacao figcaption","#servico-avaliacao .service-output","#servico-avaliacao .contact-actions a[href^='https://wa.me']","#servico-avaliacao a[href*='triagem']","#servico-pericia"],
 "/quantitativos-orcamento-obras/": ["#amostra-quantitativos","#amostra-quantitativos figure.plate--dominant","#amostra-quantitativos figure.plate--dominant figcaption","#amostra-quantitativos h3","#amostra-quantitativos figure:nth-of-type(2)","#amostra-quantitativos figure:nth-of-type(2) figcaption","#o-que-contratar","#metodo-quantitativos","#exemplos-conferiveis","#qty-sample-trail","#condicoes-da-proposta","#decisoes","#triagem-quantitativos","#triagem-quantitativos a[href^='https://wa.me']"],
 "/compatibilizacao-projetos-engenharia/": ["#registro-interferencias","#registro-interferencias figure.plate--dominant figcaption","#registro-interferencias article.coord-finding","#registro-interferencias figure:nth-of-type(2)","#tipos-apontamento","#metodo-compatibilizacao","#etapas-combinadas","#condicoes-e-limites","#pedido-compatibilizacao","#pedido-compatibilizacao a[href^='https://wa.me']"],
 "/medicoes-glosas-obras-publicas/": ["#exemplo-demonstrativo","#exemplo-demonstrativo figure figcaption","#entrega-dossie","#quando-ajuda","#executado-medido-contratado-evidenciado","#guias","#captura-pilar","#captura-pilar form","#metodo"],
 "/": ["#situacao-avaliacao","#situacao-avaliacao a","#formulario-contato"]
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
