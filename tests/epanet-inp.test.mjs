import test from 'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{simulate,compareInp}from'../ferramentas/epanet-inp/engine.mjs';import{readNetwork,toInp}from'../ferramentas/rede-de-agua/rede.js';
const near=(a,b,t=.0001)=>assert.ok(Math.abs(a-b)<t,a+' != '+b);
const raw={head:'55',min:'0',required:'10',factor:'1',nodes:'A;20;2,5;0;100',pipes:'T;R;A;100;80;130;0'};
const inp=()=>toInp(readNetwork(raw)).replace('DEMAND MODEL PDA','DEMAND MODEL DDA');
test('additional fire demand uses actual EPANET and independent Hazen-Williams pressure',async()=>{
 const r=await compareInp(inp(),{mode:'fire',id:'A',flow:2.5});const expectedLoss=q=>10.67*100*(q/1000)**1.852/(130**1.852*.08**4.871);
 for(const [s,q]of[[r.base,2.5],[r.variant,5]]){near(s.series[0].nodes[0].demand,q);near(s.series[0].nodes[0].pressure,35-expectedLoss(q),.004);near(s.series[0].links[0].flow,q);}
 assert.match(r.variant.inp,/CONFENGE_FIRE/);assert.equal(r.base.unit.pressure,'mca');
});
test('extended period keeps all hydraulic events and constant additional demand independent of default pattern',async()=>{
 const text=inp().replace('DURATION 0','DURATION 2:00\nHYDRAULIC TIMESTEP 1:00\nPATTERN TIMESTEP 1:00').replace('[OPTIONS]','[PATTERNS]\nP 1 2 1\n[OPTIONS]\nPATTERN P');
 const r=await compareInp(text,{mode:'fire',id:'A',flow:1});assert.deepEqual(r.variant.series.map(s=>s.seconds),[0,3600,7200]);
 for(const [i,q]of [2.5,5,2.5].entries()){near(r.base.series[i].nodes[0].demand,q);near(r.variant.series[i].nodes[0].demand,q+1);}
});
test('shutdown on loop reroutes flow and closes the saved scenario',async()=>{
 const text=readFileSync(new URL('../ferramentas/epanet-inp/exemplo.inp',import.meta.url),'utf8');const r=await compareInp(text,{mode:'shutdown',id:'T2'});
 for(const s of r.variant.series){const p=s.links.find(l=>l.id==='T2');assert.equal(p.status,0);near(p.flow,0,1e-6);}
 assert.ok(r.variant.series[0].nodes.every(n=>Number.isFinite(n.pressure)));assert.ok(r.variant.inp.includes('[STATUS]'));
});
test('malformed models, excess duration and unknown nodes fail rather than fabricate data',async()=>{
 await assert.rejects(()=>simulate('broken'),/JUNCTIONS/);
 await assert.rejects(()=>simulate(inp().replace('DURATION 0','DURATION 100')),/48 horas/);
 await assert.rejects(()=>simulate(inp(),{mode:'fire',id:'MISSING',flow:1}),/junção existente/);
 await assert.rejects(()=>simulate(inp(),{mode:'shutdown',id:'T'}),/problema hidráulico/);
 await assert.rejects(()=>simulate(inp().replace('[OPTIONS]','[OPTIONS]\nHYDRAULICS USE external.bin')),/HYDRAULICS/);
});
