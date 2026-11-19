import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readBimSource} from '../../scripts/bim/read-source.mjs';

const moduleFromSource=async name=>import('data:text/javascript;base64,'+Buffer.from(readBimSource('web/'+name)).toString('base64'));
const {validateParameters,fitControlPoints,mapPoint,readControlPoints,crsFromCode}=await moduleFromSource('georef-core.mjs');
const {indexStep,patchGeoreference}=await moduleFromSource('georef-step.mjs');
const {inspectGeoreference}=await moduleFromSource('georef-ifc.mjs');
const pilot=readBimSource('examples/modelo-piloto.ifc');
const parameters=validateParameters({epsg:31982,easting:500000,northing:7000000,height:100,rotation:30,verticalDatum:'Referência do levantamento'});
const info={contextId:4,metresPerUnit:1,metreUnitId:5,existing:null};
const close=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);

test('rigid fit recovers independent 30-degree control network in millimetres',()=>{
  // Analytic oracle, no call to the production point-transform helper.
  const c=Math.sqrt(3)/2,s=.5;
  const points=[[0,0,0],[10000,0,2000],[0,10000,4000],[8000,7000,3000]].map(([x,y,z])=>[x,y,z,500000+c*x/1000-s*y/1000,7000000+s*x/1000+c*y/1000,100+z/1000]);
  const fit=fitControlPoints(points,.001);
  for(const [key,expected] of Object.entries({easting:500000,northing:7000000,height:100,rotation:30}))close(fit.parameters[key],expected);
  assert.ok(fit.maxHorizontal<1e-8);assert.ok(fit.maxHeight<1e-8);
  close(Math.hypot(...mapPoint([10000,0,0],parameters,.001).map((v,i)=>v-mapPoint([0,0,0],parameters,.001)[i])),10);
});

test('control fit exposes scale and vertical disagreement instead of silently stretching the IFC',()=>{
  const fit=fitControlPoints([[0,0,0,500000,7000000,100],[10,0,0,500020,7000000,100],[0,10,0,500000,7000020,103]],1);
  assert.equal(fit.parameters.physicalScale,1);assert.ok(fit.maxHorizontal>5);assert.ok(fit.maxHeight>=2);
  assert.throws(()=>fitControlPoints([[0,0,0,500000,7000000,100],[1,0,0,500001,7000000,100],[2,0,0,500002,7000000,100]],1),/direções/);
  assert.throws(()=>fitControlPoints([[0,0,0,500000,7000000,100],[0,0,0,500001,7000000,100],[0,1,0,500000,7000001,100]],1),/repetidos/);
});

test('projected CRS and parameter inputs cannot be confused with geographic coordinates or code',()=>{
  assert.deepEqual(crsFromCode(31982),{code:31982,zone:22,hemisphere:'S'});
  assert.deepEqual(crsFromCode(31975),{code:31975,zone:21,hemisphere:'N'});
  assert.throws(()=>crsFromCode(4674));assert.throws(()=>crsFromCode('31982'));
  assert.throws(()=>validateParameters({...parameters,easting:-48}));
  assert.throws(()=>validateParameters({...parameters,rotation:Infinity}));
  assert.throws(()=>validateParameters({...parameters,verticalDatum:'a\u0000b'}));
  assert.throws(()=>readControlPoints('x;y;z;E;N;H\n0;0;0;500000;7000000;100\n1;1;0;500001;7000001;100'));
});

test('STEP record indexing ignores fake records inside strings and comments',()=>{
  const injected=pilot.replace("'Terreno'","'Terreno; ENDSEC; #999=IFCMAPCONVERSION(''teste'');'").replace('DATA;','DATA;\n/* #999=IFCSIUNIT(); ENDSEC; */');
  const indexed=indexStep(injected);assert.equal(indexed.records.size,64);assert.equal(indexed.maxId,64);
  const patched=patchGeoreference(indexed,info,parameters),next=indexStep(patched.text);
  for(const record of indexed.records.values()){
    const after=next.records.get(record.id);
    assert.equal(patched.text.slice(after.start,after.end),injected.slice(record.start,record.end));
  }
  assert.throws(()=>indexStep(pilot.replace('DATA;','DATA;\n#5=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);')),/repetidos/);
  assert.throws(()=>indexStep(pilot.replace('END-ISO-10303-21;','DATA; ENDSEC; END-ISO-10303-21;')),/único/);
});

test('source millimetres write Scale 0.001 while retaining original geometry records',()=>{
  const indexed=indexStep(pilot),patch=patchGeoreference(indexed,{...info,metresPerUnit:.001,metreUnitId:null},parameters);
  const next=indexStep(patch.text);assert.equal(next.records.size,indexed.records.size+3);
  const operation=next.records.get(patch.operationId),text=patch.text.slice(operation.start,operation.end);
  assert.match(text,/,0\.0010+\);$/);
  for(const original of indexed.records.values()){
    const after=next.records.get(original.id);
    assert.equal(patch.text.slice(after.start,after.end),pilot.slice(original.start,original.end));
  }
});

test('updating an existing map edits exactly CRS and operation, without accumulating entities',()=>{
  const original=patchGeoreference(indexStep(pilot),info,parameters),indexed=indexStep(original.text);
  const updated=patchGeoreference(indexed,{...info,existing:{crsId:original.crsId,operationId:original.operationId}},{...parameters,easting:500050});
  const next=indexStep(updated.text);assert.equal(next.records.size,indexed.records.size);assert.equal(updated.addedCount,0);
  const changed=[];
  for(const before of indexed.records.values()){
    const after=next.records.get(before.id);
    if(original.text.slice(before.start,before.end)!==updated.text.slice(after.start,after.end))changed.push(before.id);
  }
  assert.deepEqual(changed,[original.operationId]);
  const shared=indexStep(original.text.replace('ENDSEC;\r\nEND-ISO',`#100=IFCPROPERTYREFERENCEVALUE('ref',$,$,#${original.crsId});\nENDSEC;\r\nEND-ISO`));
  assert.throws(()=>patchGeoreference(shared,{...info,existing:{crsId:original.crsId,operationId:original.operationId}},parameters),/compartilhado/);
});

// The release build already installs web-ifc in the BIM stage. Point this
// environment variable to that stage's node_modules for a real WASM round trip.
const modules=process.env.CONFENGE_BIM_NODE_MODULES;
test('real web-ifc rereads m/mm references, preserves geometry and rejects ambiguous source contexts',{skip:!modules},async()=>{
  const require=createRequire(import.meta.url),IFC=require(resolve(modules,'web-ifc/web-ifc-api-node.js'));
  const api=new IFC.IfcAPI();await api.Init();
  const opened=[];
  const read=text=>{const model=api.OpenModel(new TextEncoder().encode(text),{COORDINATE_TO_ORIGIN:false});opened.push(model);return inspectGeoreference(api,model,IFC,indexStep(text));};
  try {
    for(const [prefix,factor] of [['$',1],['.MILLI.',.001],['.CENTI.',.01]]){
      const source=pilot.replace('#5=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);',`#5=IFCSIUNIT(*,.LENGTHUNIT.,${prefix},.METRE.);`);
      const metadata=read(source);assert.equal(metadata.metresPerUnit,factor);
      const patch=patchGeoreference(indexStep(source),metadata,parameters),reread=read(patch.text);
      assert.equal(reread.existing.epsg,31982);assert.equal(reread.existing.verticalDatum,parameters.verticalDatum);
      for(const key of ['easting','northing','height','rotation'])close(reread.existing[key],parameters[key]);
      const second=patchGeoreference(indexStep(patch.text),reread,{...parameters,height:120});close(read(second.text).existing.height,120);
    }
    const ifc43=pilot.replace("FILE_SCHEMA(('IFC4'))","FILE_SCHEMA(('IFC4X3_ADD2'))");
    const info43=read(ifc43);assert.match(info43.schema,/^IFC4X3/);
    const patch43=patchGeoreference(indexStep(ifc43),info43,parameters);assert.equal(read(patch43.text).existing.epsg,31982);
    const duplicated=patch43.text.replace('ENDSEC;\r\nEND-ISO',`#100=IFCMAPCONVERSION(#4,#${patch43.crsId},500000.,7000000.,100.,1.,0.,1.);\nENDSEC;\r\nEND-ISO`);
    assert.throws(()=>read(duplicated),/mais de uma operação/);
    assert.throws(()=>read(pilot.replace("FILE_SCHEMA(('IFC4'))","FILE_SCHEMA(('IFC2X3'))")),/IFC4/);
    assert.throws(()=>read(pilot.replace('#2=IFCCARTESIANPOINT((0.000,0.000,0.000));','#2=IFCCARTESIANPOINT((100.000,0.000,0.000));')),/WorldCoordinateSystem/);
    assert.throws(()=>read(pilot.replace('#19=IFCCARTESIANPOINT((0.000,0.000,0.000));','#19=IFCCARTESIANPOINT((500000.000,7000000.000,0.000));')),/embutidas/);
    assert.throws(()=>read(pilot.replace('DATA;','DATA;\n#500=IFCGEOMETRICREPRESENTATIONCONTEXT($,\'Model\',3,1.E-5,#3,$);')),/único contexto/);
  }finally{for(const model of opened)api.CloseModel(model);api.Dispose();}
});
