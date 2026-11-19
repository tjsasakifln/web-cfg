import {gerarCsv} from './csv-seguro.mjs';
import {exportToolResult} from '/assets/js/tool-credits.mjs';
const el=id=>document.getElementById(id),number=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:5}).format(n);
const states={added:'Adicionado',removed:'Removido',modified:'Modificado',same:'Dentro da tolerância'};
const changes={transform:'Posicionamento / transformação das partes',mesh:'Malha ou triangulação'};
let worker,report,epoch=0,timer;
function busy(value){el('comparar').disabled=value;el('exemplo').disabled=value;el('cancelar').hidden=!value;}
function stop(){epoch++;worker?.terminate();worker=null;clearTimeout(timer);report=null;el('resultado').hidden=true;busy(false);}
function show(){
  if(!report)return;const filter=el('filtro').value;
  const rows=report.rows.filter(r=>filter==='all'||filter==='changes'&&r.status!=='same'||r.status===filter);
  el('linhas').replaceChildren();
  for(const row of rows.slice(0,300)) {
    const tr=el('linhas').insertRow(),item=row.after||row.before;
    const values=[states[row.status],item.class,item.name,row.guid,changes[row.change]||'',row.before?.triangles??'',row.after?.triangles??'',row.centerDelta?.map(number).join(' / ')||''];
    for(const text of values)tr.insertCell().textContent=text;
  }
  el('amostra').textContent=`${rows.length.toLocaleString('pt-BR')} elementos no filtro. A tabela mostra os primeiros 300; CSV e JSON incluem todos os elementos da comparação.`;
}
async function compare(example=false) {
  stop();const current=epoch;busy(true);
  try {
    let files=[el('antes').files[0],el('depois').files[0]];
    if(example)files=await Promise.all(['modelo-piloto.ifc','modelo-piloto-r02.ifc'].map(async name=>{const response=await fetch(new URL('../examples/'+name,import.meta.url));if(!response.ok)throw Error('Os exemplos não estão disponíveis.');return new File([await response.blob()],name);}));
    if(current!==epoch)return;
    if(files.some(file=>!file||!file.size||file.size>25*1024*1024||!/\.ifc$/i.test(file.name)))throw Error('Escolha dois IFCs de até 25 MiB cada.');
    const tolerance=el('tolerancia').valueAsNumber/1000;
    if(!Number.isFinite(tolerance)||tolerance<.00001||tolerance>.1)throw Error('Use tolerância entre 0,01 e 100 mm.');
    el('status').textContent='Lendo a geometria localmente. Os arquivos permanecem neste navegador…';
    worker=new Worker(new URL('./geometry-diff-worker.mjs',import.meta.url),{type:'module'});
    timer=setTimeout(()=>{if(current!==epoch)return;stop();el('status').textContent='A comparação ultrapassou 90 segundos. Exporte recortes por pavimento ou disciplina e tente novamente.';},90000);
    worker.onmessage=({data})=>{
      if(current!==epoch)return;
      if(data.progress){el('status').textContent=data.progress;return;}
      clearTimeout(timer);worker?.terminate();worker=null;busy(false);
      if(data.error){el('status').textContent=data.error;return;}
      report=data.report;el('resultado').hidden=false;el('filtro').value='changes';
      el('resumo').textContent=`${report.counts.added} adicionados · ${report.counts.removed} removidos · ${report.counts.modified} modificados · ${report.counts.same} dentro da tolerância de ${number(report.toleranceMetres*1000)} mm.`;
      el('referencia').textContent=report.referenceChanged?'As referências cartográficas declaradas são diferentes. A comparação usa as coordenadas do modelo, sem aplicar MapConversion. Confira a origem e o sistema de referência antes de interpretar os resultados.':'Comparação nas coordenadas de engenharia dos IFCs, em metros e sem recentrar os modelos. Operações cartográficas (MapConversion) não são aplicadas.';
      el('originais').textContent=report.sources.map(s=>`${s.name}: ${s.elements} elementos, ${s.triangles.toLocaleString('pt-BR')} triângulos (${s.schema})`).join(' · ');
      el('status').textContent='Comparação concluída. Confira os elementos alterados e baixe o relatório completo.';show();
    };
    worker.onerror=()=>{if(current!==epoch)return;stop();el('status').textContent='A leitura foi interrompida. Tente um IFC menor ou um recorte do modelo.';};
    worker.postMessage({files,tolerance});
  }catch(error){if(current===epoch){stop();el('status').textContent=error.message;}}
}
for(const id of ['antes','depois','tolerancia'])el(id).addEventListener('input',()=>{stop();el('status').textContent='Dados alterados. Compare novamente para atualizar o resultado.';});
el('comparar').onclick=()=>compare();el('exemplo').onclick=()=>compare(true);el('cancelar').onclick=()=>{stop();el('status').textContent='Comparação cancelada.';};el('filtro').onchange=show;
async function download(format) {
  if(!report)return;const result=report;
  const content=format==='json'?JSON.stringify(result,null,2):gerarCsv([
    ['GlobalId','Estado','Diferença','Classe anterior','Nome anterior','Classe revisada','Nome revisado','Triângulos antes','Triângulos depois','Delta centro X (m)','Delta centro Y (m)','Delta centro Z (m)','Tolerância (mm)','Assinatura mundial anterior','Assinatura mundial revisada'],
    ...result.rows.map(r=>[r.guid,states[r.status],changes[r.change]||'',r.before?.class,r.before?.name,r.after?.class,r.after?.name,r.before?.triangles,r.after?.triangles,...(r.centerDelta||['','','']),result.toleranceMetres*1000,r.before?.worldHash,r.after?.worldHash])]);
  const button=el(format);button.disabled=true;
  try{await exportToolResult({toolId:'bim-comparador-geometrico',format,content,deliver:()=>{const url=URL.createObjectURL(new Blob([content],{type:format==='json'?'application/json':'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='comparacao-geometrica-ifc.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}});}finally{button.disabled=false;}
}
el('csv').onclick=()=>download('csv');el('json').onclick=()=>download('json');addEventListener('pagehide',stop);
