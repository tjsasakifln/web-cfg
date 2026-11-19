import {exportToolResult} from '/assets/js/tool-credits.mjs';
const el=id=>document.getElementById(id);let worker,bounds,svg,serial=0,name='';
function stop(){serial++;worker?.terminate();worker=null;bounds=null;el('gerar').disabled=true;el('abrir').disabled=false;el('exemplo').disabled=false;el('cancelar').hidden=true;}
function coordinate(){if(!bounds)return;const i=['x','y','z'].indexOf(el('eixo').value);el('coordenada').value=((bounds.min[i]+bounds.max[i])/2).toFixed(3);el('limites').textContent=`Intervalo do modelo no eixo ${el('eixo').value.toUpperCase()}: ${bounds.min[i].toFixed(3)} a ${bounds.max[i].toFixed(3)} m.`;}
async function open(example=false){stop();const current=serial;svg=null;el('resultado').hidden=true;
  try{let file=el('arquivo').files[0];if(example){const r=await fetch(new URL('../examples/modelo-piloto.ifc',import.meta.url));if(!r.ok)throw Error('O exemplo não está disponível.');file=new File([await r.blob()],'modelo-piloto.ifc');}
    if(current!==serial)return;if(!file||!file.size||file.size>25*1024*1024||!/\.ifc$/i.test(file.name))throw Error('Escolha um IFC de até 25 MiB.');name=file.name;
    el('abrir').disabled=true;el('exemplo').disabled=true;el('cancelar').hidden=false;el('status').textContent='Lendo os sólidos do IFC…';
    worker=new Worker(new URL('./geometria-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{if(current!==serial)return;el('abrir').disabled=false;el('exemplo').disabled=false;el('cancelar').hidden=true;
      if(data.error){el('status').textContent=data.error;el('gerar').disabled=!bounds;return;}
      if(data.action==='loaded'){bounds=data.bounds;coordinate();el('gerar').disabled=false;el('status').textContent=`${name}: ${data.elements} elementos com geometria. Escolha o plano e gere o desenho.`;}
      if(data.action==='cut'){const documentSvg=new DOMParser().parseFromString(data.svg,'image/svg+xml');el('gerar').disabled=false;if(documentSvg.documentElement.localName!=='svg'||documentSvg.querySelector('parsererror')){svg=null;el('resultado').hidden=true;el('status').textContent='O desenho não passou na conferência de formato. Nenhum arquivo será exportado.';return;}svg=data.svg;el('vista').replaceChildren(documentSvg.documentElement);el('resultado').hidden=false;el('status').textContent=`Corte gerado: ${data.elements} elementos interceptados e ${data.segments} segmentos.`;}
    };worker.onerror=()=>{stop();el('status').textContent='A leitura foi interrompida. Tente um recorte menor do IFC.';};worker.postMessage({action:'load',file});
  }catch(error){stop();el('status').textContent=error.message;}
}
el('abrir').onclick=()=>open();el('exemplo').onclick=()=>open(true);el('cancelar').onclick=()=>{stop();el('status').textContent='Leitura cancelada.';};
el('eixo').onchange=()=>{coordinate();svg=null;el('resultado').hidden=true;};
for(const id of ['coordenada','escala'])el(id).oninput=()=>{svg=null;el('resultado').hidden=true;};
el('arquivo').onchange=()=>{stop();svg=null;el('resultado').hidden=true;};
el('gerar').onclick=()=>{if(!bounds||!worker)return;svg=null;el('resultado').hidden=true;el('gerar').disabled=true;el('status').textContent='Intersectando os sólidos com o plano…';worker.postMessage({action:'cut',axis:el('eixo').value,coordinate:el('coordenada').valueAsNumber,scale:el('escala').valueAsNumber,title:name});};
el('svg').onclick=async()=>{if(!svg)return;const content=svg;await exportToolResult({toolId:'bim-cortes',format:'svg',content,deliver:()=>{const url=URL.createObjectURL(new Blob([content],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download='corte-ifc.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}});};
addEventListener('pagehide',stop);
