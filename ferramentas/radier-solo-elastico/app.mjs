import {byId,number,table,format,csv,exportResult,message,catchAction} from '/assets/js/engineering-ui.mjs';
import {example} from './engine.mjs';
let result=null,revision=0,worker=null,timer;
const ns='http://www.w3.org/2000/svg',fields=Object.keys(example);
const node=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!=null)e.textContent=text;return e;};
function clear(){revision++;result=null;byId('resultado').hidden=true;worker?.terminate();worker=null;clearTimeout(timer);byId('calcular').disabled=false;}
function draw(){
 if(!result)return;const svg=byId('mapa'),p=result.input,mode=byId('grandeza').value,points=new Map(result.nodes.map(n=>[n.id,n]));
 const cells=result.plates.map(e=>({e,value:mode==='mx'||mode==='my'?e[mode]:e.nodes.reduce((s,id)=>s+points.get(id)[mode],0)/4}));
 const min=Math.min(...cells.map(e=>e.value)),max=Math.max(...cells.map(e=>e.value)),unit=mode==='settlement'?'mm':mode==='pressure'?'kPa':'kN·m/m';
 svg.replaceChildren(node('title',{},'CONFENGE | Mapa de '+byId('grandeza').selectedOptions[0].textContent));svg.setAttribute('viewBox','0 0 '+p.length+' '+p.width);
 for(const {e,value}of cells){const pts=e.nodes.map(id=>points.get(id));const v=max-min>1e-12?(value-min)/(max-min):.5;const color='hsl('+(195-v*165)+' 60% '+(65-v*20)+'%)';
  const cell=node('polygon',{points:pts.map(n=>n.x+','+(p.width-n.y)).join(' '),fill:color,stroke:'#143a46','stroke-width':Math.max(p.length,p.width)/1000});cell.append(node('title',{},e.id+': '+format(value,5)+' '+unit));svg.append(cell);
 }
 byId('legenda').textContent='Mapa: '+format(min,5)+' a '+format(max,5)+' '+unit+'. Valores por elemento. A tabela abaixo contém os resultados numéricos.';
}
function show(){
 const s=result.summary;byId('resumo').textContent='Recalque máximo: '+format(s.maxSettlement,4)+' mm. Pressão no solo: '+format(s.minPressure,3)+' a '+format(s.maxPressure,3)+' kPa. Reação total: '+format(s.reaction,3)+' kN para '+format(s.applied,3)+' kN de carga.';
 byId('avisos').textContent=result.warnings.join(' ');byId('avisos').hidden=!result.warnings.length;
 table('nos',['Nó','x (m)','y (m)','Área de influência (m²)','Recalque (mm)','Reação (kN)','Pressão (kPa)'],result.nodes.map(n=>[n.id,format(n.x),format(n.y),format(n.area),format(n.settlement,5),format(n.reaction),format(n.pressure)]));
 table('esforcos',['Elemento','Mx (kN·m/m)','My (kN·m/m)','Mxy (kN·m/m)','Qx (kN/m)','Qy (kN/m)'],result.plates.map(e=>[e.id,format(e.mx),format(e.my),format(e.mxy),format(e.qx),format(e.qy)]));
 const ul=byId('hipoteses');ul.replaceChildren(...result.assumptions.map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));draw();byId('resultado').hidden=false;
}
async function run(){
 clear();const token=revision;const input=Object.fromEntries(fields.map(k=>[k,number(byId(k).value,byId(k).labels[0].textContent)]));
 byId('calcular').disabled=true;message('Montando a malha e resolvendo o radier no navegador…');worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
 const done=()=>{worker?.terminate();worker=null;clearTimeout(timer);byId('calcular').disabled=false;};
 worker.onmessage=({data})=>{if(token!==revision)return;done();if(!data.ok){message(data.message,true);return;}result=data.result;show();message('Análise concluída. Confira equilíbrio, contato com o solo e convergência da malha.');};
 worker.onerror=()=>{done();message('Não foi possível executar o cálculo. Confira os dados e tente novamente.',true);};
 timer=setTimeout(()=>{done();message('A análise ultrapassou 20 segundos. Reduza o número de divisões.',true);},20000);worker.postMessage(input);
}
byId('dados').addEventListener('input',clear);byId('dados').addEventListener('submit',catchAction(async event=>{event.preventDefault();await run();}));
byId('exemplo').addEventListener('click',catchAction(async()=>{for(const[k,v]of Object.entries(example))byId(k).value=String(v).replace('.',',');await run();}));
byId('grandeza').addEventListener('change',draw);
byId('csv').addEventListener('click',catchAction(async()=>{if(!result)return;const rows=[['CONFENGE','Radier sobre solo elástico'],['Motor',result.engine],['Parâmetro','Valor'],...Object.entries(result.input),[],['Nó','x (m)','y (m)','Área (m²)','Recalque (mm)','Reação (kN)','Pressão (kPa)'],...result.nodes.map(n=>[n.id,n.x,n.y,n.area,n.settlement,n.reaction,n.pressure]),[],['Elemento','Mx (kN·m/m)','My (kN·m/m)','Mxy (kN·m/m)','Qx (kN/m)','Qy (kN/m)'],...result.plates.map(e=>[e.id,e.mx,e.my,e.mxy,e.qx,e.qy]),[],['Hipóteses'],...result.assumptions.map(x=>[x]),...result.warnings.map(x=>[x])];await exportResult('radier-solo-elastico','csv','CONFENGE-radier.csv',csv(rows),'text/csv;charset=utf-8');}));
byId('json').addEventListener('click',catchAction(async()=>{if(result)await exportResult('radier-solo-elastico','json','CONFENGE-radier.json',JSON.stringify(result,null,2),'application/json');}));
byId('svg').addEventListener('click',catchAction(async()=>{if(!result)return;const svg=byId('mapa').cloneNode(true);svg.setAttribute('xmlns',ns);svg.prepend(node('desc',{},byId('legenda').textContent+' '+result.assumptions.join(' ')));await exportResult('radier-solo-elastico','svg','CONFENGE-radier-mapa.svg',new XMLSerializer().serializeToString(svg),'image/svg+xml');}));
