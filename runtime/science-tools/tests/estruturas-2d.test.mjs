import assert from 'node:assert/strict';
import test from 'node:test';
import { SECTION, solveStructure } from '../../../ferramentas/trelicas-e-porticos/estrutura-2d.mjs';
import { diagramKinds, resultCSV, resultSVG } from '../../../ferramentas/trelicas-e-porticos/diagramas-2d.mjs';
import { analisar } from '../../../ferramentas/analise-de-viga-continua/viga.js';

const free=[false,false,false], pin=[true,true,false], roller=[false,true,false], fixed=[true,true,true];
const node=(id,x,y,fix=free)=>({id,x,y,fix});
const member=(id,a,b,type='frame',release=[false,false],section={})=>({id,a,b,type,release,section:{...SECTION,...section}});
const setup=(kind,nodes,members,loads=[])=>({version:1,kind,nodes,members,cases:[{id:'G',name:'Permanente'},{id:'Q',name:'Variável'}],loads});
const force=(at,p,id='F1',cas='G')=>({id,case:cas,at,kind:'nodal',p});
const line=(at,start,end=start,id='F1',cas='G')=>({id,case:cas,at,kind:'line',start,end});
const close=(actual,expected,tol=1e-8)=>assert.ok(Math.abs(actual-expected)<=tol*Math.max(Math.abs(expected),1), `${actual} ≠ ${expected}`);
const pair=(actual,expected)=>actual.forEach((x,i)=>close(x,expected[i]));

test('viga contínua: paridade com a calculadora já existente, ao longo dos dois vãos',()=>{
  const m=setup('frame',[node('N1',0,0,pin),node('N2',4,0,roller),node('N3',10,0,roller)],
    [member('B1','N1','N2'),member('B2','N2','N3','frame',undefined,{I:12000})],
    [line('B1',[0,-8]),line('B2',[0,-12],[0,-12],'F2')]);
  const reference=analisar([{L:4,q:8,I:10000},{L:6,q:12,I:12000}],200); // Viga contínua define q para baixo.
  const r=solveStructure(m);
  r.nodes.forEach((n,i)=>close(n.r[1],reference.apoios[i].R));
  r.members.forEach((e,i)=>[0,.11,.45,.75,1].forEach(t=>{
    const x=e.length*t, actual=e.at(x), expected=reference.trechos[i].avaliar(x);
    close(actual.M,expected.M); close(actual.V,expected.V); close(actual.dy*1000,expected.flecha);
  }));
});

test('viga simplesmente apoiada: flecha exata sob carga uniforme sem subdivisão',()=>{
  const r=solveStructure(setup('frame',[node('A',0,0,pin),node('B',6,0,roller)],
    [member('B1','A','B','frame',undefined,{I:18000})],[line('B1',[0,-12])]));
  pair(r.nodes.map(n=>n.r[1]),[36,36]);
  const e=r.members[0];
  close(e.at(3).M,54); close(e.at(3).dy,-.005625); close(e.at(0).M,0); close(e.at(6).M,0);
  close(r.nodes[0].d[2],-.003);close(r.nodes[1].d[2],.003);
});

test('treliça triangular e rejeição de momento nodal sem rotação ativa',()=>{
  const m=setup('frame',[node('A',0,0,pin),node('B',4,0,roller),node('C',2,3)],
    [member('B1','A','B','truss'),member('B2','A','C','truss'),member('B3','B','C','truss')],[force('C',[0,-30,0])]);
  const r=solveStructure(m);
  pair(r.members.map(e=>e.at(1).N),[10,-5*Math.sqrt(13),-5*Math.sqrt(13)]);
  pair(r.nodes.slice(0,2).map(n=>n.r[1]),[15,15]);
  assert.deepEqual(diagramKinds(r),['N','D']);
  assert.equal(r.nodes[2].active[2],false);
  m.loads.push(force('C',[0,0,5],'F2'));
  assert.throws(()=>solveStructure(m),/grau de liberdade/);
});

test('Gerber com rótula interna e mecanismo de dupla rótula com uma ponta livre',()=>{
  const m=setup('frame',[node('A',0,0,fixed),node('B',4,0),node('C',8,0,roller)],
    [member('B1','A','B','frame',undefined,{I:18000}),member('B2','B','C','frame',[true,false],{I:18000})],
    [line('B2',[0,-10])]);
  const r=solveStructure(m);
  close(r.nodes[0].r[1],20);close(r.nodes[0].r[2],80);close(r.nodes[2].r[1],20);
  close(r.nodes[1].d[1],-.01185185185185185);
  close(r.members[0].at(4).M,0);close(r.members[1].at(0).M,0);
  const bad=setup('frame',[node('A',0,0,pin),node('B',1.2,0)],
    [member('B1','A','B','frame',[true,true],{I:18000})],[force('B',[0,-10,0])]);
  assert.throws(()=>solveStructure(bad),/instável/);
});

test('grelha inclinada: transformações globais, torção e orientação invertida',()=>{
  const m=setup('grillage',[node('A',0,0,fixed),node('B',3,4)],
    [member('B1','A','B','grillage',undefined,{G:100,J:10000})],[force('B',[-12,6,8])]);
  let r=solveStructure(m);
  pair(r.nodes[0].r,[12,42,-44]);pair(r.nodes[1].d,[-.025,-.003,.0085]);
  close(r.members[0].at(5).twist,.005);close(r.members[0].at(2.5).T,10);
  [m.members[0].a,m.members[0].b]=['B','A'];
  r=solveStructure(m); pair(r.nodes[0].r,[12,42,-44]);pair(r.nodes[1].d,[-.025,-.003,.0085]);
});

test('grelha em L: a força vertical em um braço induz torção no outro; exportações coerentes',()=>{
  const m=setup('grillage',[node('A',0,0,fixed),node('B',4,0),node('C',4,3)],
    [member('B1','A','B','grillage',undefined,{G:100,J:10000}),member('B2','B','C','grillage',undefined,{G:100,J:10000})],[force('C',[-10,0,0])]);
  const r=solveStructure(m);
  pair(r.nodes[0].r,[10,30,-40]);close(r.nodes[2].d[0],-.0511666666666667);
  close(Math.abs(r.members[0].at(2).T),30);close(r.members[1].at(1.5).T,0);
  assert.deepEqual(diagramKinds(r),['V','M','T','Z']);
  assert.match(resultSVG(m,r),/Momento torsor T/);
  assert.doesNotMatch(resultSVG(m,r),/Normal N/);
  const csv=resultCSV(r);
  assert.match(csv,/Giro torsional local/);
  const support=csv.split('\r\n').find(row=>row.startsWith('"Nó";"Grelha";"1 x G";"A";')).split(';');
  pair([21,23,24].map(i=>Number(support[i].replace(',','.'))),[10,30,-40]);
  assert.ok(csv.split('\r\n').every(x=>x.split(';').length===25));
});

test('carga trapezoidal e concentrada: equilíbrio e saltos laterais de cortante e momento',()=>{
  const m=setup('frame',[node('A',0,0,fixed),node('B',4,0)],[member('B1','A','B')],
    [line('B1',[0,-2],[0,-8]),{id:'F2',case:'G',at:'B1',kind:'point',station:.5,p:[0,-6,5]}]);
  const r=solveStructure(m), b=r.members[0];
  close(r.nodes[0].r[1],26);close(r.nodes[0].r[2],55);
  const [left,right]=b.rows.filter(p=>p.x===2);
  assert.deepEqual([left.side,right.side],['esq','dir']);
  close(right.V-left.V,-6);close(right.M-left.M,-5);
  close(b.at(4).M,0);close(b.at(4).V,0);
});

test('temperatura e recalque combinados: ação imposta e reações com sinal',()=>{
  const m=setup('frame',[node('A',0,0,fixed),node('B',3,0,fixed)],[member('B1','A','B')],
    [{id:'F1',case:'G',at:'B1',kind:'thermal',delta:25},{id:'F2',case:'Q',at:'B',kind:'settlement',p:[.003,0,0]}]);
  const r=solveStructure(m,{G:2,Q:1});
  close(r.members[0].at(1).N,800);close(r.nodes[0].r[0],-800);close(r.nodes[1].d[0],.003);
  m.nodes[1].fix[0]=false;
  assert.throws(()=>solveStructure(m,{Q:1}),/Restrinja/);
});

test('rejeita geometria/importação ambígua e ações de barra não compatíveis',()=>{
  const m=setup('frame',[node('A',0,0,fixed),node('B',3,0)],[member('A','A','B')]);
  assert.throws(()=>solveStructure(m),/já pertence a um nó/);
  m.members[0].id='B1';m.nodes[1].x=1e-5;
  assert.throws(()=>solveStructure(m),/coincidentes/);
  m.nodes[1].x=3;m.members[0].type='truss';m.loads.push(line('B1',[0,-1]));
  assert.throws(()=>solveStructure(m),/cargas nodais/);
});
