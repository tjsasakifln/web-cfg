import test from 'node:test';import assert from 'node:assert/strict';import {readBimSource} from '../../scripts/bim/read-source.mjs';
const source=readBimSource('web/cortes-core.mjs');
const {cortarCena,gerarSvg,limitesCena}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
// A 2 x 3 x 4 metre rectangular prism, expressed in local IFC coordinates.
const vertices=new Float32Array([[0,0,0],[2,0,0],[2,3,0],[0,3,0],[0,0,4],[2,0,4],[2,3,4],[0,3,4]].flatMap(p=>[...p,0,0,1]));
const indices=new Uint32Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
const matrix=[1,0,0,0,0,0,-1,0,0,1,0,0,0,0,0,1];
const make=(m=matrix)=>({buffers:[{key:1,vertices,indices}],elements:[{id:7,guid:'abc',name:'Prisma <teste>',ifcClass:'IfcBuildingElementProxy',parts:[{key:1,matrix:m}]}]});
const total=cut=>cut.segments.reduce((n,s)=>n+Math.hypot(s.to[0]-s.from[0],s.to[1]-s.from[1]),0);
test('horizontal/vertical sections preserve analytical rectangle dimensions and perimeter',()=>{
  const scene=make();assert.deepEqual(limitesCena(scene),{min:[0,-0,0],max:[2,3,4]});
  const horizontal=cortarCena(scene,'z',1.5);assert.deepEqual(horizontal.max,[2,3]);assert.equal(total(horizontal),10);
  const vertical=cortarCena(scene,'x',1);assert.deepEqual(vertical.max,[3,4]);assert.equal(total(vertical),14);
});
test('coplanar face does not expose triangulation diagonal',()=>{
  const cut=cortarCena(make(),'z',0);assert.equal(cut.segments.length,4);assert.equal(total(cut),10);
});
test('absolute placements and print scale are conserved',()=>{
  const placed=matrix.slice();placed[12]=1000;placed[13]=20;placed[14]=-2000;
  const cut=cortarCena(make(placed),'z',21);assert.deepEqual(cut.min,[1000,2000]);assert.deepEqual(cut.max,[1002,2003]);
  const svg=gerarSvg(cut,{scale:100,title:'A < B & C'});assert.match(svg,/A &lt; B &amp; C/);assert.match(svg,/2\.000 m/);assert.match(svg,/3\.000 m/);assert.match(svg,/width="29\.6mm"/);assert.ok(!svg.includes('<teste>'));
});
test('out-of-range planes and invalid scales do not emit a misleading drawing',()=>{
  assert.throws(()=>cortarCena(make(),'z',10),/Nenhum sólido/);assert.throws(()=>cortarCena(make(),'q',1));assert.throws(()=>cortarCena(make(),'x',NaN));
  assert.throws(()=>gerarSvg(cortarCena(make(),'z',1),{scale:0}));
});
test('names from untrusted IFCs cannot make the SVG invalid XML',()=>{
  const scene=make();scene.elements[0].name='Parede\u0001\uFFFF\uD800 🧱';
  const svg=gerarSvg(cortarCena(scene,'z',1),{title:'Projeto\u0000 <teste> 🧱'});
  assert.ok(!/[\u0000\u0001\uFFFF\uD800]/.test(svg));assert.ok(svg.includes('🧱'));assert.ok(svg.includes('&lt;teste&gt;'));
});
