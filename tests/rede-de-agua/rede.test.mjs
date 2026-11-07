import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readNetwork,toInp} from '../../ferramentas/rede-de-agua/rede.js';
import {compare} from '../../ferramentas/rede-de-agua/motor.js';

const entrada={head:'55',min:'0',required:'10',factor:'2',nodes:'A;20;2,5;0;100',pipes:'T;R;A;100;80;130;0'};
const perto=(v,alvo,tol)=>assert.ok(Math.abs(v-alvo)<=tol,`${v} ≠ ${alvo} ± ${tol}`);
// Independent SI formulas: flows in m³/s, inside diameter in m, length and head in m.
function perdas(qLps,k=0) {
  const q=qLps/1000,d=0.08,v=q/(Math.PI*d*d/4);
  return 10.67*100*q**1.852/(130**1.852*d**4.871)+k*v*v/(2*9.80665);
}

test('tubo único em H-W: vazão, velocidade, perda distribuída, K e pressão',async()=>{
  const m=readNetwork({...entrada,pipes:'T;R;A;100;80;130;2'});
  const r=await compare(m);
  for (const [i,s] of [r.base,r.variant].entries()) {
    const q=(i+1)*2.5,loss=perdas(q,2);
    perto(s.pipes[0].flow,q,.0001);
    perto(s.pipes[0].velocity,q/1000/(Math.PI*.08**2/4),.00002);
    perto(s.pipes[0].loss,loss,.006);
    perto(s.nodes[0].pressure,55-20-loss,.006);
    assert.equal(s.nodes[0].delivered,q);
  }
});

test('PDA responde à pressão disponível e conserva vazão no ramal',async()=>{
  const r=await compare(readNetwork({...entrada,head:'25'}));
  for(const [solicitado,s] of [[2.5,r.base],[5,r.variant]]) {
    const n=s.nodes[0],q=s.pipes[0].flow;
    assert.ok(n.delivered>0 && n.delivered<solicitado);
    perto(n.delivered,solicitado*Math.sqrt(n.pressure/10),.0001);
    perto(q,n.delivered,1e-7);
    perto(25-20-perdas(q),n.pressure,.003);
  }
  const sem=await compare(readNetwork({...entrada,head:'19'}));
  assert.ok(sem.base.nodes[0].pressure<0);
  assert.equal(sem.base.nodes[0].delivered,0);
});

test('inverter um tubo inverte sua vazão assinada e preserva a pressão e o módulo da velocidade',async()=>{
  const m=readNetwork({...entrada,pipes:'T;A;R;100;80;130;0'});
  const {base}=await compare(m);
  perto(base.pipes[0].flow,-2.5,.0001);
  perto(base.pipes[0].velocity,.49736,.00003);
  perto(base.nodes[0].pressure,35-perdas(2.5),.002);
});
test('validar duplicatas, isolamento, identificadores, números, limite PDA e unidades exportadas',async()=>{
  const rede=readNetwork({...entrada,min:'0,2',required:'0,3'});
  assert.equal((await compare(rede)).base.nodes.length,1);
  for(const d of [{min:'1',required:'1,01'}, {nodes:'A;20;0,5;1;2\nA;20;0,1;3;4'}, {nodes:'R;20;1;0;100'}, {nodes:'=1;20;1;3;3'}, {nodes:'A;20;1;1;5\nB;19;1;4;7'}, {pipes:'T;R;A;10;0;130;0'}, {pipes:'T;R;A;100;80;130;-1'}, {pipes:'T;A;A;100;80;130;0'}, {nodes:'A;20;0;0;100'}, {factor:'1e5'}]) {
    assert.throws(()=>readNetwork({...entrada,...d}));
  }
  const m=readNetwork({...entrada,nodes:'a\t20\t0,000000001\t0\t100'});
  const inp=toInp(m,2);
  assert.match(inp,/UNITS LPS/);assert.match(inp,/HEADLOSS H-W/);assert.match(inp,/DEMAND MODEL PDA/);
  const linha=inp.match(/^A 20 (\S+)$/m);
  assert.equal(Number(linha[1]),2e-9);
});
test('INP exportado roda no CLI nativo OWA 2.2 e reproduz a versão WebAssembly', {skip:!process.env.EPANET_CLI},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rede-epanet-'));
  try {
    const m=readNetwork({...entrada,head:'25'}),r=(await compare(m)).variant;
    const inp=join(dir,'rede.inp'),rpt=join(dir,'rede.rpt');
    writeFileSync(inp,toInp(m,m.factor));
    const stdout=execFileSync(process.env.EPANET_CLI,[inp,rpt,join(dir,'rede.bin')],{encoding:'utf8'});
    assert.match(stdout,/2\.2\.0/);assert.match(stdout,/ran successfully/);
    const report=readFileSync(rpt,'utf8');
    const n=report.match(/^\s*A\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*$/m);
    const t=report.match(/^\s*T\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*$/m);
    perto(Number(n[1]),r.nodes[0].solverDemand,1e-6);perto(Number(n[3]),r.nodes[0].pressure,1e-6);
    perto(Number(t[1]),r.pipes[0].flow,1e-6);perto(Number(t[2]),r.pipes[0].velocity,1e-6);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
