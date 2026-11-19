import {inventoryColumns} from './inventario-core.mjs';
import {gerarCsv} from './csv-seguro.mjs';
import {exportToolResult} from '/assets/js/tool-credits.mjs';
const el=id=>document.getElementById(id);
let worker,result,filename,serial=0;
function stop(){serial++;worker?.terminate();worker=null;el('abrir').disabled=false;el('exemplo').disabled=false;el('cancelar').hidden=true;}
function view(){
  const q=el('filtro').value.toLocaleLowerCase('pt-BR');
  const visible=result.rows.filter(r=>[r.name,r.class,r.tag,r.spatial,r.set,r.property,r.value].some(v=>String(v??'').toLocaleLowerCase('pt-BR').includes(q)));
  el('previa').replaceChildren();
  for(const r of visible.slice(0,100)){const tr=el('previa').insertRow();for(const v of [r.name||r.class,r.spatial,r.origin,r.set,r.property,r.value??'',r.state])tr.insertCell().textContent=String(v??'');}
  el('contagem').textContent=`${visible.length.toLocaleString('pt-BR')} linhas encontradas. Prévia de até 100 linhas; a exportação contém o inventário completo.`;
}
async function open(example=false){
  stop();const current=serial;result=null;el('resultado').hidden=true;
  try{
    let file=el('arquivo').files[0];
    if(example){const response=await fetch(new URL('../examples/inventario-piloto.ifc',import.meta.url));if(!response.ok)throw Error('O exemplo não está disponível.');file=new File([await response.blob()],'inventario-piloto.ifc');}
    if(current!==serial)return;
    if(!file||!file.size||file.size>25*1024*1024||!/\.ifc$/i.test(file.name))throw Error('Selecione um IFC de até 25 MiB.');
    filename=file.name;el('abrir').disabled=true;el('exemplo').disabled=true;el('cancelar').hidden=false;el('status').textContent='Lendo elementos, espaços, tipos e propriedades…';
    worker=new Worker(new URL('./inventario-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(current!==serial)return;stop();if(data.error){el('status').textContent=data.error;return;}
      result=data.result;el('status').textContent=`${filename}: ${result.summary.elements} elementos e espaços; ${result.summary.rows} linhas de inventário.`;
      el('filtro').value='';el('resultado').hidden=false;view();};
    worker.onerror=()=>{if(current===serial){stop();el('status').textContent='O leitor não pôde concluir. Tente um recorte menor do IFC.';}};worker.postMessage(file);
  }catch(error){stop();el('status').textContent=error.message;}
}
async function download(format){
  if(!result)return;const data={...result,file:filename};
  const content=format==='json'?JSON.stringify(data,null,2):gerarCsv([inventoryColumns.map(c=>c[0]),...result.rows.map(r=>inventoryColumns.map(c=>r[c[1]]))]);
  await exportToolResult({toolId:'bim-inventario',format,content,deliver:()=>{const url=URL.createObjectURL(new Blob([content],{type:format==='json'?'application/json':'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='inventario-ifc.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}});
}
el('abrir').onclick=()=>open();el('exemplo').onclick=()=>open(true);el('cancelar').onclick=()=>{stop();el('status').textContent='Leitura cancelada.';};
el('arquivo').onchange=()=>{stop();result=null;el('resultado').hidden=true;el('status').textContent='Arquivo selecionado. Clique em gerar inventário.';};
el('filtro').oninput=view;el('csv').onclick=()=>download('csv');el('json').onclick=()=>download('json');
addEventListener('pagehide',stop);
