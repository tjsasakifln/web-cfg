import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,buildModel,example} from '../ferramentas/radier-solo-elastico/engine.mjs';
const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} ≠ ${b}`);
test('uniform load settles q/ks with exact tributary areas and zero bending',()=>{
 const r=calculate(example);close(r.summary.applied,1600);close(r.summary.reaction,1600);close(r.nodes.reduce((s,n)=>s+n.area,0),80);
 for(const n of r.nodes){close(n.settlement,1);close(n.pressure,20);}
 assert.ok(r.summary.maxAbsMxMy<1e-6);assert.equal(r.warnings.length,0);
});
test('point load conserves force and both global moments away from grid nodes',()=>{
 const p={...example,pressure:0,pointLoad:300,pointX:3.17,pointY:2.23};const {model}=buildModel(p),r=calculate(p);
 const nodal=model.cases[0].loads.filter(x=>x.type==='node'),map=new Map(model.nodes.map(n=>[n.id,n]));
 close(nodal.reduce((s,l)=>s-l.F[2]/1000,0),300);close(nodal.reduce((s,l)=>s-l.F[2]*map.get(l.node).x/1e6,0),300*p.pointX);
 close(r.nodes.reduce((s,n)=>s+n.reaction*n.x,0),300*p.pointX);close(r.nodes.reduce((s,n)=>s+n.reaction*n.y,0),300*p.pointY);
 assert.ok(r.summary.maxAbsMxMy>0);assert.ok(r.summary.balance<1e-8);
});
test('symmetry, stiffness scaling and reproducibility use the actual shell solver',()=>{
 const p={...example,length:8,width:8,nx:10,ny:10,pointX:4,pointY:4,pointLoad:200};const a=calculate(p),b=calculate({...p,soil:p.soil*2,elasticity:p.elasticity*2});
 const map=new Map(a.nodes.map(n=>[[Math.round(n.x*1e6),Math.round(n.y*1e6)].join(','),n]));
 for(let i=0;i<a.nodes.length;i++){const n=a.nodes[i],mirror=map.get([Math.round((8-n.x)*1e6),Math.round(n.y*1e6)].join(','));close(n.settlement,mirror.settlement);close(b.nodes[i].settlement,n.settlement/2);}
 assert.deepEqual(calculate(p),a);
});
test('invalid or excessive meshes and loads are rejected',()=>{
 for(const patch of[{soil:0},{poisson:.5},{nx:25},{nx:2.2},{pressure:NaN},{pointX:11},{pointLoad:-1},{pressure:0,pointLoad:0}])assert.throws(()=>calculate({...example,...patch}));
});

test('linear soil traction is reported and never silently clamped',()=>{
 const r=calculate({...example,pressure:0,pointLoad:200,pointX:4,pointY:4,length:8,width:8,nx:12,ny:12});
 assert.ok(r.summary.minPressure<0);assert.ok(r.warnings.some(w=>w.includes('tração no solo')));close(r.summary.reaction,200);
});

test('point-load deflection converges to the independent infinite-plate solution',()=>{
 const p={...example,length:20,width:20,thickness:.08,elasticity:30,poisson:.2,soil:100,pressure:0,pointLoad:1,pointX:10,pointY:10};
 // D∇⁴w + kw = Pδ, w(0)=P/(8√(Dk)); all quantities below are N and mm.
 const D=p.elasticity*1000*(p.thickness*1000)**3/(12*(1-p.poisson**2));
 const expected=p.pointLoad*1000/(8*Math.sqrt(D*p.soil/1e6));
 let previous=Infinity;
 for(const n of[8,12,16,24]){const result=calculate({...p,nx:n,ny:n});const error=Math.abs(result.summary.maxSettlement/expected-1);assert.ok(error<previous);previous=error;}
 assert.ok(previous<.04,'finite free-edge domain and MITC4 mesh must approach the infinite-plate value');
});
