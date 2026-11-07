import {example,readNetwork,toInp} from "./rede.js";
const $=id=>document.getElementById(id);
const keys=Object.keys(example);
const fmt=(n,d=2)=>n.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d,useGrouping:false});
const raw=()=>Object.fromEntries(keys.map(id=>[id,$(id).value]));
let last,worker,timer,revision=0;

function invalidate() {
  revision++;
  if(worker)worker.terminate();
  worker=null;clearTimeout(timer);
  if(last||$("simular").disabled) $("estado").textContent="Modelo alterado. Simule novamente.";
  last=null;$("resultado").hidden=true;$("simular").disabled=false;
}
function fill(data){for(const k of keys)$(k).value=data[k];}
function download(name,contents,type="text/plain") {
  const a=document.createElement("a");const url=URL.createObjectURL(new Blob([contents],{type}));
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function table(id,rows) {
  const frag=document.createDocumentFragment();
  for(const row of rows){const tr=document.createElement("tr");for(const val of row){const td=document.createElement("td");td.textContent=val;tr.append(td);}frag.append(tr);}
  $(id).replaceChildren(frag);
}
function diagram(model) {
  const root=$("desenho");root.replaceChildren();const positions=new Map([["R",{x:0,y:0}],...model.nodes.map(n=>[n.id,n])]);
  const points=[...positions.values()];
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const scale=Math.min(460/(xmax-xmin||1),166/(ymax-ymin||1));
  const xy=id=>{const p=positions.get(id);return [280+(p.x-(xmax+xmin)/2)*scale,120-(p.y-(ymax+ymin)/2)*scale];};
  function draw(tag,attrs,text){const el=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text)el.textContent=text;root.append(el);}
  for(const pipe of model.pipes){const [x1,y1]=xy(pipe.a),[x2,y2]=xy(pipe.b);draw("line",{x1,y1,x2,y2,stroke:"#557991","stroke-width":2});}
  for(const id of positions.keys()){const [cx,cy]=xy(id);draw("circle",{cx,cy,r:id==="R"?7:4,fill:id==="R"?"#193752":"#33723e"});if(positions.size<=30)draw("text",{x:cx,y:cy-10,"text-anchor":"middle",fill:"#153851","font-size":13},id);}
}
function show(model,result) {
  last={model,result};
  const demand=result.variant.nodes.filter(n=>n.demand>0);
  const low=demand.reduce((a,b)=>a.pressure<b.pressure?a:b);
  $("resumo").textContent="No cenário 2, a menor pressão entre os pontos com consumo é "+fmt(low.pressure)+" mca em "+low.id+". A vazão atendida nesse ponto é "+fmt(low.delivered,3)+" L/s, para uma solicitação de "+fmt(low.demand,3)+" L/s.";
  const negativos=result.variant.nodes.filter(n=>n.pressure < -0.001);
  if(negativos.length) $("resumo").textContent+=" Há pressão manométrica negativa em "+negativos.map(n=>n.id).join(", ")+". Confira as cotas e a hipótese de que a tubulação permanece cheia.";
  diagram(model);
  table("nos",result.variant.nodes.map((n,i)=>[n.id,fmt(result.base.nodes[i].pressure),fmt(n.pressure),fmt(n.demand,3),fmt(n.delivered,3)]));
  table("tubos",result.variant.pipes.map(t=>[t.id,fmt(t.flow,3),fmt(t.velocity),fmt(t.loss)]));
  $("resultado").hidden=false;$("resultado-titulo").focus();$("estado").textContent="Simulação concluída.";
}
$("simular").addEventListener("click",()=>{
  invalidate();let model;
  try{model=readNetwork(raw());}catch(e){$("estado").textContent=e.message;return;}
  const token=revision;$("simular").disabled=true;$("estado").textContent="Calculando as duas condições de consumo…";
  function finish(msg){if(worker)worker.terminate();worker=null;clearTimeout(timer);$("simular").disabled=false;if(msg)$("estado").textContent=msg;}
  try {
    worker=new Worker(new URL("./motor.js",import.meta.url),{type:"module"});
    worker.onmessage=({data})=>{if(token!==revision)return;finish();if(data.ok)show(model,data.result);else $("estado").textContent=data.message;};
    worker.onerror=()=>{if(token===revision)finish("Não foi possível carregar o motor de cálculo. Recarregue a página e tente novamente.");};
    timer=setTimeout(()=>finish("O cálculo excedeu o tempo disponível. Confira a conectividade e as dimensões da rede."),30000);
    worker.postMessage(model);
  }catch(e){finish("Este navegador não conseguiu iniciar o motor EPANET.");}
});
$("controles").addEventListener("input",e=>{if(keys.includes(e.target.id))invalidate();});
$("salvar").addEventListener("click",()=>{try{readNetwork(raw());download("CONFENGE-rede-de-agua.json",JSON.stringify({version:1,model:raw()},null,2),"application/json");}catch(e){$("estado").textContent=e.message;}});
$("abrir").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>100000)throw Error("O projeto deve ter até 100 kB.");const d=JSON.parse(await file.text());
    if(d?.version!==1||!d.model||!keys.every(k=>typeof d.model[k]==="string"))throw Error("Selecione um projeto JSON salvo neste simulador.");
    readNetwork(d.model);invalidate();fill(d.model);$("estado").textContent="Projeto aberto. Simule para atualizar os resultados.";
  }catch(e){$("estado").textContent=e instanceof SyntaxError?"Arquivo JSON inválido.":e.message;}finally{$("abrir").value="";}
});
$("inp").addEventListener("click",()=>{if(last)download("CONFENGE-rede-cenario-2.inp",toInp(last.model,last.model.factor));});
$("csv").addEventListener("click",()=>{
  if(!last)return;
  const out=["Cenário;Ponto;Demanda solicitada (L/s);Demanda atendida (L/s);Pressão (mca)"];
  for(const [i,s] of [last.result.base,last.result.variant].entries())for(const n of s.nodes)out.push([i+1,n.id,fmt(n.demand,5),fmt(n.delivered,5),fmt(n.pressure,5)].join(";"));
  out.push("","Cenário;Trecho;Vazão (L/s);Velocidade (m/s);Perda de carga (m)");
  for(const [i,s] of [last.result.base,last.result.variant].entries())for(const t of s.pipes)out.push([i+1,t.id,fmt(t.flow,5),fmt(t.velocity,5),fmt(t.loss,5)].join(";"));
  download("CONFENGE-rede-resultados.csv","\uFEFF"+out.join("\r\n")+"\r\n","text/csv;charset=utf-8");
});
fill(example);$("controles").disabled=false;
