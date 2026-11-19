import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readBimSource} from '../../scripts/bim/read-source.mjs';
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const cuts=url(readBimSource('web/cortes-core.mjs'));
const {describeScene,compareScenes,meshHash,meshesWithinTolerance}=await import(url(readBimSource('web/geometry-diff-core.mjs').replace("'./cortes-core.mjs'",JSON.stringify(cuts))));
const {cartographicReferences}=await import(url(readBimSource('web/geometry-reference.mjs')));
const matrix=[1,0,0,0,0,0,-1,0,0,1,0,0,0,0,0,1];
const guid='2nvdaQANHTmf62$TWsLWgo',guid2='3E5Powo5HK8vMXT2GbDn2c';
const scene=(points=[[0,0,0],[2,0,0],[0,3,0]],indices=[0,1,2],m=matrix,key=1)=>({
  buffers:[{key,vertices:new Float32Array(points.flatMap(p=>[...p,0,0,1])),indices:new Uint32Array(indices)}],
  elements:[{id:27,guid,name:'Parede',ifcClass:'IFCWALL',parts:[{key,matrix:m}]}]
});
const compare=async(a,b,tolerance=.001)=>compareScenes(await describeScene(a,tolerance),await describeScene(b,tolerance),tolerance);

test('signature ignores vertex order, winding, triangle order and internal mesh IDs',async()=>{
  const points=[[0,0,0],[2,0,0],[0,3,0],[0,0,4]],a=scene(points,[0,1,2,0,2,3]);
  const b=scene([points[3],points[2],points[1],points[0]],[0,1,3,1,2,3],matrix,998);
  b.elements[0].id=750;b.elements[0].name='Outra denominação';
  const r=await compare(a,b);assert.equal(r.counts.same,1);assert.equal(r.rows[0].before.worldHash,r.rows[0].after.worldHash);
});
test('real interior-vertex movement is found when AABB and triangle count stay unchanged',async()=>{
  const points=[[0,0,0],[2,0,0],[0,2,0],[0,0,2],[.5,.5,.5]],tri=[0,1,4,1,2,4,2,3,4,3,0,4];
  const revised=structuredClone(points);revised[4][2]=1.5;
  const r=await compare(scene(points,tri),scene(revised,tri));
  assert.deepEqual(r.rows[0].before.min,r.rows[0].after.min);assert.deepEqual(r.rows[0].before.max,r.rows[0].after.max);
  assert.equal(r.counts.modified,1);assert.equal(r.rows[0].change,'mesh');
});
test('a tolerance-cell boundary never causes a false difference within tolerance',async()=>{
  const a=scene(),m=matrix.slice();m[12]=.0008;
  const r=await compare(a,scene(undefined,undefined,m));
  assert.notEqual(r.rows[0].before.worldHash,r.rows[0].after.worldHash);assert.equal(r.counts.same,1);
  m[12]=.0011;const moved=await compare(a,scene(undefined,undefined,m));assert.equal(moved.counts.modified,1);assert.equal(moved.rows[0].change,'transform');
});
test('rotated placement is distinguished from changed local geometry or physical scale',async()=>{
  const rotated=[0,0,-1,0,-1,0,0,0,0,1,0,0,0,0,0,1];
  const r=await compare(scene(),scene(undefined,undefined,rotated));assert.equal(r.rows[0].change,'transform');
  const scaled=matrix.map((v,i)=>i<12?v*2:v);
  const s=await compare(scene(),scene(undefined,undefined,scaled));assert.equal(s.rows[0].change,'mesh');
});
test('triangle matching is bijective and can repair an ambiguous greedy assignment',()=>{
  const tri=x=>[x,0,0,x,2,0,x,0,2];
  // a0 matches b0,b1; a1 matches only b0. A greedy first choice would fail.
  const a=new Float64Array([...tri(.05),...tri(-.05)]),b=new Float64Array([...tri(0),...tri(.14)]);
  assert.equal(meshesWithinTolerance(a,b,.1),true);
  assert.equal(meshesWithinTolerance(new Float64Array([...tri(.05),...tri(.05)]),new Float64Array([...tri(0),...tri(.3)]),.1),false);
});
test('identity additions/removals, duplicate IDs and hostile geometric bounds are explicit',async()=>{
  const b=scene();b.elements[0].guid=guid2;const r=await compare(scene(),b);
  assert.deepEqual(r.counts,{added:1,removed:1,modified:0,same:0});
  const duplicate=scene();duplicate.elements.push({...duplicate.elements[0],id:28});await assert.rejects(()=>describeScene(duplicate,.001),/repetido/);
  const missing=scene();missing.elements[0].guid='bad';await assert.rejects(()=>describeScene(missing,.001),/GlobalId/);
  await assert.rejects(()=>describeScene(scene(),0));
  const invalid=matrix.slice();invalid[12]=1e10;await assert.rejects(()=>describeScene(scene(undefined,undefined,invalid),.001),/coordenadas/);
  assert.throws(()=>meshesWithinTolerance(new Float64Array([0,0,0,1,0,0,0,1,0]),new Float64Array([0,0,0,1,0,0,0,1,0]),.001,{checks:2000000}),/densa/);
});
test('different triangulation is conservatively reported as a mesh change',async()=>{
  const points=[[0,0,0],[2,0,0],[2,2,0],[0,2,0]];
  const r=await compare(scene(points,[0,1,2,0,2,3]),scene(points,[0,1,3,1,2,3]));assert.equal(r.rows[0].change,'mesh');
});
test('reference signature includes rigid coordinates, datum and map units while ignoring STEP IDs',()=>{
  const make=(offset=0,height=10,prefix=null)=>{
    const ref=id=>({type:5,value:id+offset});
    const lines={
      [1+offset]:{expressID:1+offset,type:77,SourceCRS:ref(99),TargetCRS:ref(2),FirstCoordinate:{type:4,name:'IFCLENGTHMEASURE',value:500000},SecondCoordinate:{type:4,name:'IFCLENGTHMEASURE',value:7000000},Height:{type:4,value:height}},
      [2+offset]:{expressID:2+offset,type:80,Name:{value:'EPSG:31982'},GeodeticDatum:{value:'SIRGAS2000'},MapProjection:{value:'UTM'},MapZone:{value:'22S'},MapUnit:ref(3)},
      [3+offset]:{expressID:3+offset,type:90,UnitType:{value:'LENGTHUNIT'},Prefix:prefix,Name:{value:'METRE'}}
    };
    return cartographicReferences({GetLineIDsWithType:()=>({size:()=>1,get:()=>1+offset}),GetLine:(_,id)=>lines[id]},0,{IFCRIGIDOPERATION:77});
  };
  assert.deepEqual(make(),make(1000));assert.notDeepEqual(make(),make(0,11));assert.notDeepEqual(make(),make(0,10,{value:'MILLI'}));
});

const modules=process.env.CONFENGE_BIM_NODE_MODULES;
test('actual IFC geometry finds changed dimensions, displacement and unchanged metadata-only edits',{skip:!modules},async()=>{
  const require=createRequire(import.meta.url),IFC=require(resolve(modules,'web-ifc/web-ifc-api-node.js'));
  const {extrairCena}=await import(url(readBimSource('web/visualizador-worker.mjs')));
  const api=new IFC.IfcAPI();await api.Init();const pilot=readBimSource('examples/modelo-piloto.ifc');
  const read=async text=>{const id=api.OpenModel(new TextEncoder().encode(text),{COORDINATE_TO_ORIGIN:false});try{return await describeScene(extrairCena(api,id),.001);}finally{api.CloseModel(id);}};
  try {
    const before=await read(pilot),changed=await read(pilot.replace('#18=IFCRECTANGLEPROFILEDEF(.AREA.,$,#17,4.000,0.200);','#18=IFCRECTANGLEPROFILEDEF(.AREA.,$,#17,5.000,0.200);'));
    const r=compareScenes(before,changed,.001);assert.deepEqual(r.counts,{added:0,removed:0,modified:1,same:2});assert.equal(r.rows.find(r=>r.status==='modified').change,'mesh');
    const moved=await read(pilot.replace('#24=IFCCARTESIANPOINT((2.000,0.000,0.200));','#24=IFCCARTESIANPOINT((2.020,0.000,0.200));'));
    const d=compareScenes(before,moved,.001);assert.equal(d.counts.modified,1);assert.equal(d.rows.find(r=>r.status==='modified').change,'transform');
    const renamed=await read(pilot.replace("'Parede norte'","'Parede revisada'").replace("'NetVolume',$,#7,2.400","'NetVolume',$,#7,99.000"));
    assert.equal(compareScenes(before,renamed,.001).counts.same,3);
    const sameMeshOtherIDs=pilot.replace(/#(\d+)/g,(_,n)=>'#'+(Number(n)+1000));
    assert.equal(compareScenes(before,await read(sameMeshOtherIDs),.001).counts.same,3);
  }finally{api.Dispose();}
});
