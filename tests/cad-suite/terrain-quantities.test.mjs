import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTerrainVolumes} from '../../scripts/cad/suite/terrain_quantities.mjs';
const surface=(f,bounds={minX:0,minY:0,maxX:10000,maxY:2000})=>({stats:()=>({bounds}),elevationAt:f});
test('two unequal pads retain their independently measured volumes and reconcile to the total',()=>{
  // Units mm: 2 m x 2 m pad cuts 1 m, 3 m x 2 m pad fills 2 m.
  const existing=surface(()=>0),padA=surface((x)=>x<2000?-1000:0),padB=surface(x=>x>=6000&&x<9000?2000:0);
  const finished=surface(x=>x<2000?-1000:x>=6000&&x<9000?2000:0);
  const result=sampleTerrainVolumes(existing,finished,[padA,padB]);
  assert.deepEqual(result.byPad,[{cut:4,fill:0},{cut:0,fill:12}]);assert.equal(result.cut,4);assert.equal(result.fill,12);assert.equal(result.cellMm,250);
  assert.deepEqual(result.byPad.reduce((s,p)=>({cut:s.cut+p.cut,fill:s.fill+p.fill}),{cut:0,fill:0}),{cut:result.cut,fill:result.fill});
});
test('overlapping influence publishes only combined volumes instead of double counting or equal shares',()=>{
  const existing=surface(()=>0),a=surface(x=>x<2000?-1000:0),b=surface(x=>x<2000?-2000:0);
  const result=sampleTerrainVolumes(existing,b,[a,b]);assert.equal(result.cut,8);assert.equal(result.fill,0);assert.equal(result.byPad,null);assert.equal(result.reason,'combined-surface-difference');
});
test('interpolation residuals and mismatched domains cannot create an invented per-pad quantity',()=>{
  const existing=surface(()=>0),single=surface(()=>-1),combined=surface(()=>-2);
  const mismatch=sampleTerrainVolumes(existing,combined,[single]);assert.equal(mismatch.byPad,null);assert.ok(mismatch.cut>0);
  assert.equal(sampleTerrainVolumes(existing,single,[surface(()=>null)]).byPad,null);
});
test('equal aggregate volumes cannot hide a different spatial distribution between pads',()=>{
  const bounds={minX:0,minY:0,maxX:2000,maxY:1000};
  const existing=surface(()=>0,bounds),a=surface(x=>x<1000?-1000:0,bounds),b=surface(x=>x>=1000?-3000:0,bounds);
  const reversed=surface(x=>x<1000?-3000:-1000,bounds);
  const r=sampleTerrainVolumes(existing,reversed,[a,b]);assert.equal(r.cut,4);assert.equal(r.byPad,null);assert.equal(r.reason,'combined-surface-difference');
});
test('edge cells use their actual area, and large terrain gets a bounded disclosed grid',()=>{
  const bounds={minX:0,minY:0,maxX:1100,maxY:1100};
  const r=sampleTerrainVolumes(surface(()=>0,bounds),surface(()=>1000,bounds));assert.ok(Math.abs(r.fill-1.21)<1e-12);
  const b={minX:0,minY:0,maxX:1e6,maxY:1e6};const large=sampleTerrainVolumes(surface(()=>0,b),surface(()=>1000,b));
  assert.ok(large.cells<=250000);assert.ok(large.cellMm>250);assert.ok(Math.abs(large.fill-1e6)<1e-4);
  assert.throws(()=>sampleTerrainVolumes(surface(()=>0),surface(()=>NaN)),/inválidas/);
});
