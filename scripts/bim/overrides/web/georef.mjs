import {crsSirgas,readControlPoints} from './georef-core.mjs';
import {exportToolResult} from '/assets/js/tool-credits.mjs';
const el=id=>document.getElementById(id);
const number=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:6}).format(n);
let worker,info,prepared,filename='',epoch=0,revision=0;
for(const crs of crsSirgas)el('epsg').append(new Option(`SIRGAS 2000 / UTM ${crs.zone}${crs.hemisphere} (EPSG:${crs.code})`,String(crs.code)));
el('epsg').value='31982';

function status(text){el('status').textContent=text;}
function busy(value) {
  el('abrir').disabled=value;el('exemplo').disabled=value;el('preparar').disabled=value||!info;el('cancelar').hidden=!value;
}
function invalidate() {
  revision++;prepared=null;el('resultado').hidden=true;el('residuos-painel').hidden=true;
  if(info)status('Dados alterados. Confira a transformação novamente antes de exportar.');
}
function stop() {
  epoch++;revision++;worker?.terminate();worker=null;info=null;prepared=null;busy(false);
  el('dados').hidden=true;el('resultado').hidden=true;el('inspecao').hidden=true;el('residuos-painel').hidden=true;
}
function showFit(fit) {
  el('residuos').replaceChildren();el('residuos-painel').hidden=!fit;
  if(!fit)return;
  for(const r of fit.residuals){const tr=el('residuos').insertRow();for(const v of [r.point,...r.residual,r.horizontal])tr.insertCell().textContent=number(v);}
  el('erro').textContent=`RMS horizontal: ${number(fit.rmsHorizontal)} m; RMS vertical: ${number(fit.rmsHeight)} m. Máximos por ponto: ${number(fit.maxHorizontal)} m na horizontal e ${number(fit.maxHeight)} m na altura.`;
}
function showInspection(data) {
  info=data;el('inspecao').hidden=false;el('dados').hidden=false;
  el('modelo').textContent=`${filename} · ${data.schema} · unidade ${data.unit} · contexto #${data.contextId} · ${data.entities.toLocaleString('pt-BR')} registros.`;
  el('referencia').textContent=data.existing?`Referência existente: ${data.existing.name||'sem identificação'}. A conferência substituirá somente o CRS e o MapConversion indicados.`:'O modelo não declara MapConversion. A conferência acrescentará a referência projetada.';
  el('unidade-pontos').textContent=`As colunas x, y e z usam a unidade do IFC (${data.unit}); E, N e H são sempre metros. Os pontos locais precisam estar no contexto #${data.contextId}, depois dos posicionamentos dos objetos, sem aplicar a referência cartográfica.`;
  if(data.existing) {
    const known=crsSirgas.some(crs=>crs.code===data.existing.epsg);
    if(known)el('epsg').value=String(data.existing.epsg);
    for(const name of ['easting','northing','height','rotation'])el(name).value=known?String(data.existing[name]):'';
    el('verticalDatum').value=data.existing.verticalDatum;
    if(!known)el('referencia').textContent+=' Informe novas coordenadas no CRS escolhido. Não há transformação automática do datum anterior.';
  }
  busy(false);status('IFC conferido. Defina a origem ou informe os pontos de controle.');
}
async function open(example=false) {
  stop();const current=epoch;
  try {
    let file=el('arquivo').files[0];
    if(example){const response=await fetch(new URL('../examples/modelo-piloto.ifc',import.meta.url));if(!response.ok)throw Error('O exemplo não está disponível.');file=new File([await response.blob()],'modelo-piloto.ifc');}
    if(current!==epoch)return;
    if(!file||!file.size||file.size>25*1024*1024||!/\.ifc$/i.test(file.name))throw Error('Escolha um IFC de até 25 MiB.');
    filename=file.name;busy(true);status('Conferindo esquema, unidades, contexto e posicionamento da geometria…');
    worker=new Worker(new URL('./georef-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(current!==epoch)return;
      busy(false);
      if(data.requestId!==undefined&&data.requestId!==revision){status('Os dados mudaram durante o cálculo. Confira a transformação novamente.');return;}
      if(data.error){status(data.error);return;}
      if(data.action==='loaded')showInspection(data.info);
      if(data.action==='residuals'){prepared=null;showFit(data.fit);status(data.message);}
      if(data.action==='prepared') {
        prepared=data;const p=data.report.parameters;el('resultado').hidden=false;showFit(data.report.fit);
        el('transformacao').textContent=`EPSG:${p.epsg} · E₀ ${number(p.easting)} m · N₀ ${number(p.northing)} m · H₀ ${number(p.height)} m · rotação ${number(p.rotation)}° · escala física 1:1 · Scale IFC ${data.report.mapConversionScale}.`;
        const o=data.report.originGeographic;el('localizacao').textContent=`Origem calculada no mesmo SIRGAS 2000: latitude ${number(o.latitude)}°, longitude ${number(o.longitude)}°. Referência vertical: ${p.verticalDatum||'não declarada'}.`;
        status('Transformação gravada e relida com sucesso. Confira os parâmetros e os resíduos antes de baixar o IFC.');
      }
    };
    worker.onerror=()=>{if(current!==epoch)return;stop();status('A leitura não pôde ser concluída. Tente um recorte menor do IFC.');};
    worker.postMessage({action:'load',file});
  } catch(error){if(current===epoch){stop();status(error.message);}}
}

el('abrir').onclick=()=>open();el('exemplo').onclick=()=>open(true);el('arquivo').onchange=()=>{stop();status('Arquivo selecionado. Clique em conferir IFC.');};
el('cancelar').onclick=()=>{stop();status('Leitura cancelada. Abra o IFC para continuar.');};
el('modo').onchange=()=>{invalidate();el('manual').hidden=el('modo').value!=='manual';el('pontos-painel').hidden=el('modo').value!=='points';};
el('epsg').onchange=()=>{invalidate();el('easting').value='';el('northing').value='';status('CRS alterado. Informe E e N nesse sistema ou ajuste os pontos levantados. Alterar a identificação não transforma as coordenadas.');};
for(const id of ['easting','northing','height','rotation','verticalDatum','pontos','tolerancia'])el(id).addEventListener('input',invalidate);
el('preparar').onclick=()=>{
  if(!info||!worker)return;
  invalidate();
  try {
    const input={mode:el('modo').value,epsg:Number(el('epsg').value),verticalDatum:el('verticalDatum').value};
    if(input.mode==='points'){input.points=readControlPoints(el('pontos').value);input.tolerance=el('tolerancia').valueAsNumber;}
    else for(const name of ['easting','northing','height','rotation'])input[name]=el(name).valueAsNumber;
    busy(true);status('Ajustando a referência, conferindo o fuso e relendo o IFC preparado…');
    worker.postMessage({action:'prepare',requestId:revision,input});
  }catch(error){busy(false);status(error.message);}
};
async function download(format) {
  if(!prepared)return;
  const snapshot=prepared,content=format==='ifc'?new Blob([snapshot.bytes],{type:'application/x-step'}):JSON.stringify({...snapshot.report,sourceFile:filename},null,2);
  const stem=filename.replace(/\.ifc$/i,'').replace(/[\\/\u0000-\u001f]/g,'_');
  const button=el('baixar-'+format);button.disabled=true;
  try {
    await exportToolResult({toolId:'bim-georreferenciador',format,content,deliver:()=>{
      const blob=content instanceof Blob?content:new Blob([content],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=stem+'-georreferenciado.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }});
  }catch(error){status(error.message||'Exportação não concluída.');}finally{button.disabled=false;}
}
el('baixar-ifc').onclick=()=>download('ifc');el('baixar-json').onclick=()=>download('json');
addEventListener('pagehide',stop);
