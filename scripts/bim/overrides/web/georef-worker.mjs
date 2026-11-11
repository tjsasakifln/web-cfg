import {comModelo} from './ifc-runtime.mjs';
import {extrairCena} from './visualizador-worker.mjs';
import {limitesCena} from './cortes-core.mjs';
import {inspectGeoreference} from './georef-ifc.mjs';
import {indexStep,patchGeoreference} from './georef-step.mjs';
import {validateParameters,fitControlPoints,mapPoint,finiteNumber,crsFromCode} from './georef-core.mjs';
import {fromUtm} from '/ferramentas/conversor-utm-sirgas-2000/conversor.js';
let source,info,sourceHash;
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const validatePoint=(p,crs)=>fromUtm(p[0],p[1],crs.zone,crs.hemisphere);
self.onmessage=async({data})=>{
  try {
    if(data.action==='load') {
      source=null;info=null;sourceHash=null;
      if(!data.file?.size||data.file.size>25*1024*1024)throw Error('Escolha um IFC de até 25 MiB.');
      const bytes=new Uint8Array(await data.file.arrayBuffer());
      source=indexStep(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      info=await comModelo(bytes,(api,model,IFC)=>{
        const metadata=inspectGeoreference(api,model,IFC,source);
        const bounds=limitesCena(extrairCena(api,model));
        if([...bounds.min,...bounds.max].some(n=>Math.abs(n)>50000))throw Error('O posicionamento acumulado ultrapassa 50 km. Confira as coordenadas já embutidas no modelo antes de georreferenciar.');
        return {...metadata,bounds};
      },{coordinateToOrigin:false});
      sourceHash=await digest(bytes);
      self.postMessage({action:'loaded',info});
    } else if(data.action==='prepare') {
      if(!source||!info)throw Error('Abra e confira um IFC antes de preparar a exportação.');
      let fit=null;const input=data.input;
      let parameters;
      if(input.mode==='points') {
        const crs=crsFromCode(input.epsg);
        fit=fitControlPoints(input.points,info.metresPerUnit);
        for(const residual of fit.residuals)validatePoint(residual.target,crs);
        parameters=validateParameters({...input,...fit.parameters});
        const tolerance=finiteNumber(input.tolerance,.001,5,'Erro máximo por ponto (m)');
        if(fit.maxHorizontal>tolerance||fit.maxHeight>tolerance) {
          self.postMessage({action:'residuals',requestId:data.requestId,fit,message:'Os resíduos superam o limite informado. Confira pontos, unidades, fuso e escala do levantamento antes de exportar.'});return;
        }
      } else if(input.mode==='manual')parameters=validateParameters(input);
      else throw Error('Modo de georreferenciamento inválido.');
      const origin=validatePoint([parameters.easting,parameters.northing],parameters);
      for(const x of [info.bounds.min[0],info.bounds.max[0]])for(const y of [info.bounds.min[1],info.bounds.max[1]]) {
        validatePoint(mapPoint([x,y,0],parameters),parameters);
      }
      const patched=patchGeoreference(source,info,parameters);
      const bytes=new TextEncoder().encode(patched.text);
      const reopenedIndex=indexStep(patched.text);
      // Reopen with the actual IFC reader and verify the recorded transform.
      const roundtrip=await comModelo(bytes,(api,model,IFC)=>inspectGeoreference(api,model,IFC,reopenedIndex),{coordinateToOrigin:false});
      const read=roundtrip.existing;
      if(!read||read.epsg!==parameters.epsg||read.operationId!==patched.operationId||read.crsId!==patched.crsId||
        read.verticalDatum!==parameters.verticalDatum||['easting','northing','height','rotation'].some(k=>Math.abs(read[k]-parameters[k])>1e-7))throw Error('A transformação não passou na releitura do IFC. Nenhum arquivo será exportado.');
      const report={schema:'confenge.ifc-georeference/v1',sourceSha256:sourceHash,resultSha256:await digest(bytes),
        ifcSchema:info.schema,sourceUnit:info.unit,metresPerSourceUnit:info.metresPerUnit,contextId:info.contextId,
        parameters,mapConversionScale:info.metresPerUnit,originGeographic:{latitude:origin.lat,longitude:origin.lon},
        mode:input.mode,controlPoints:input.mode==='points'?input.points:[],fit,tolerance:input.mode==='points'?input.tolerance:null,
        editedIds:patched.replacedIds,addedEntities:patched.addedCount,retainedTrueNorth:info.trueNorth,
        assumptions:['Escala física 1:1. Scale converte a unidade do IFC para metro.','Sem transformação de datum horizontal ou vertical.','Geometria, posicionamentos, GlobalIds e propriedades originais permanecem intactos.','IfcSite e TrueNorth são preservados; a referência projetada é definida por MapConversion.']};
      self.postMessage({action:'prepared',requestId:data.requestId,report,bytes},[bytes.buffer]);
    }
  } catch(error) {
    self.postMessage({requestId:data.requestId,error:error instanceof Error?error.message:'Não foi possível conferir este IFC.'});
  }
};
