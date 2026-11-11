import test from 'node:test';
import assert from 'node:assert/strict';
import {quantify} from '../ferramentas/quantitativos-dxf/takeoff.mjs';
import {parseDrawing} from '../ferramentas/quantitativos-dxf/parser.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),a+' != '+b);
const model=entities=>({header:{$INSUNITS:6},entities});
const ascii=body=>'0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+body+'0\nENDSEC\n0\nEOF\n';
test('actual parser exposes excluded hatches, attributes and tilted OCS polylines',()=>{
 const d=parseDrawing(ascii('0\nHATCH\n8\nParedes\n0\nATTRIB\n1\nAtributo\n0\nLWPOLYLINE\n90\n2\n70\n0\n10\n0\n20\n0\n10\n1\n20\n0\n210\n0\n220\n1\n230\n0\n'));
 const q=quantify(d);assert.equal(q.layers.length,0);assert.deepEqual(q.warnings.map(r=>r.type),['HATCH','ATTRIB','LWPOLYLINE com plano OCS diferente do XY']);
});
test('line, circle and closed polyline use actual units and curved area',()=>{
 const q=quantify({header:{$INSUNITS:4},entities:[{type:'LINE',vertices:[{x:0,y:0},{x:3000,y:4000}]},{type:'CIRCLE',center:{x:0,y:0},radius:1000}]});
 near(q.layers[0].length,5+2*Math.PI);near(q.layers[0].area,Math.PI);
});
test('semicircle bulge includes curve length and enclosed area',()=>{
 const q=quantify(model([{type:'LWPOLYLINE',shape:true,vertices:[{x:0,y:0,bulge:1},{x:2,y:0}]}]));
 near(q.layers[0].length,Math.PI+2);near(q.layers[0].area,Math.PI/2);
});
test('nested scaled INSERT with layer zero inheritance',()=>{
 const d=model([{type:'INSERT',name:'A',layer:'Tubos',position:{x:10,y:8},rotation:90,xScale:2,yScale:2}]);
 d.blocks={A:{position:{x:4,y:2},entities:[{type:'INSERT',name:'B',layer:'0',position:{x:4,y:2},rotation:0,xScale:3,yScale:3}]},B:{position:{x:0,y:0},entities:[{type:'LINE',layer:'0',vertices:[{x:0,y:0},{x:1,y:0}]}]}};
 const q=quantify(d);near(q.layers[0].length,6);assert.equal(q.layers[0].layer,'Tubos');near(q.preview[0][0][0],10);near(q.preview[0][0][1],8);
});
test('nonuniform scales integrate ellipse rather than average radius',()=>{
 const d=model([{type:'INSERT',name:'A',position:{x:0,y:0},xScale:2,yScale:1}]);
 d.blocks={A:{entities:[{type:'CIRCLE',center:{x:0,y:0},radius:1}]}};
 const q=quantify(d);near(q.layers[0].length,9.688448220547675);near(q.layers[0].area,2*Math.PI);
});
test('unknown units, cycles, unsupported entities and spatial lines are explicit',()=>{
 assert.throws(()=>quantify({entities:[]}),/unidade/);
 const q=quantify(model([{type:'SPLINE'},{type:'LINE',vertices:[{x:0,y:0,z:0},{x:1,y:0,z:2}]}]));
 assert.equal(q.layers.length,0);assert.equal(q.warnings.length,2);
 const d=model([{type:'INSERT',name:'A',position:{x:0,y:0}}]);d.blocks={A:{entities:d.entities}};
 assert.throws(()=>quantify(d),/circular/);
});
