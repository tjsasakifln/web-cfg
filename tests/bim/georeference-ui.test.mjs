import test from 'node:test';
import assert from 'node:assert/strict';
import {readBimSource} from '../../scripts/bim/read-source.mjs';

function environment() {
  const nodes=new Map(),workers=[],links=[],blobs=[];
  const node=id=>{
    if(nodes.has(id))return nodes.get(id);
    const value={value:'',files:[],hidden:false,disabled:false,textContent:'',append(){},replaceChildren(){},addEventListener(){},insertRow(){return{insertCell:()=>({textContent:''})};}};
    Object.defineProperty(value,'innerHTML',{set(){throw Error('Unsafe HTML sink');}});
    nodes.set(id,value);return value;
  };
  class Worker {constructor(){workers.push(this);}postMessage(data){this.last=data;}terminate(){this.stopped=true;}}
  class TestURL extends URL {static createObjectURL(blob){blobs.push(blob);return'blob:test';}static revokeObjectURL(){}}
  const document={getElementById:node,createElement:tag=>{assert.equal(tag,'a');const a={click(){links.push({...this});}};return a;}};
  let code=readBimSource('web/georef.mjs').replace(/^import .*;$/gm,'').replaceAll('import.meta.url',JSON.stringify('https://confenge.com.br/bim/web/georef.mjs'));
  new Function('document','Worker','URL','Option','crsSirgas','readControlPoints','exportToolResult','addEventListener','setTimeout',code)(
    document,Worker,TestURL,class Option{},[{code:31982,zone:22,hemisphere:'S'}],()=>[],async({content,deliver})=>{assert.ok(content instanceof Blob);assert.ok(content.size);await deliver();return true;},()=>{},()=>0
  );
  return {node,workers,links,blobs};
}
const hostile='</td><img src=x onerror=alert(1)>';
const inspection={schema:'IFC4',unit:'m',contextId:4,entities:64,existing:{epsg:31982,name:hostile,verticalDatum:hostile,easting:500000,northing:7000000,height:100,rotation:30}};
test('hostile project/CRS text stays literal and downloaded metadata stays a binary attachment',async()=>{
  const e=environment();e.node('arquivo').files=[{name:hostile+'.ifc',size:100}];await e.node('abrir').onclick();
  const w=e.workers.at(-1);w.onmessage({data:{action:'loaded',info:inspection}});
  assert.ok(e.node('modelo').textContent.includes(hostile));assert.ok(e.node('referencia').textContent.includes(hostile));
  w.onmessage({data:{action:'prepared',report:{parameters:inspection.existing,originGeographic:{latitude:-27,longitude:-51},mapConversionScale:1,fit:null},bytes:new Uint8Array([73,70,67])}});
  await e.node('baixar-json').onclick();
  assert.equal(e.blobs[0].type,'application/octet-stream');assert.equal(e.links[0].download,'relatorio-georreferenciamento.json');
  const report=JSON.parse(await e.blobs[0].text());assert.equal(report.sourceFile,hostile+'.ifc');assert.equal(report.parameters.verticalDatum,hostile);
  await e.node('baixar-ifc').onclick();assert.equal(e.blobs[1].type,'application/octet-stream');assert.equal(e.links[1].download,'modelo-georreferenciado.ifc');assert.equal(await e.blobs[1].text(),'IFC');
});
test('opening a different model clears the previous coordinate context and rejects stale responses',async()=>{
  const e=environment();e.node('arquivo').files=[{name:'anterior.ifc',size:100}];await e.node('abrir').onclick();
  const previous=e.workers.at(-1);previous.onmessage({data:{action:'loaded',info:inspection}});
  e.node('pontos').value='0;0;0;500000;7000000;100';
  e.node('arquivo').files=[{name:'novo.ifc',size:100}];await e.node('abrir').onclick();
  assert.equal(previous.stopped,true);for(const id of ['easting','northing','verticalDatum','pontos'])assert.equal(e.node(id).value,'');
  for(const id of ['height','rotation'])assert.equal(e.node(id).value,'0');
  previous.onmessage({data:{action:'loaded',info:inspection}});assert.equal(e.node('easting').value,'');
  e.workers.at(-1).onmessage({data:{action:'loaded',info:{...inspection,existing:null}}});assert.equal(e.node('easting').value,'');
});
