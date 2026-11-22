import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {MODELS,AREAS,getModel,parseExpression,calculate,scenario,excelExpression} from '../../ferramentas/planilhas/data.mjs';
import {buildWorkbook} from '../../ferramentas/planilhas/xlsx.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const values=model=>Object.fromEntries(model.fields.map(f=>[f.key,f.initial]));
function unzipStored(buffer){
  const bytes=Buffer.from(buffer),files=new Map();
  let off=0;
  while(off+30<=bytes.length&&bytes.readUInt32LE(off)===0x04034b50){
    const type=bytes.readUInt16LE(off+8);
    assert.equal(type,0,'test mode stores uncompressed zip entries');
    const compressed=bytes.readUInt32LE(off+18), n=bytes.readUInt16LE(off+26),e=bytes.readUInt16LE(off+28);
    const name=bytes.subarray(off+30,off+30+n).toString('utf8');
    const begin=off+30+n+e,after=begin+compressed;
    assert.ok(after<=bytes.length);
    files.set(name,bytes.subarray(begin,after).toString('utf8'));off=after;
  }
  return files;
}
test('45 modelos únicos, especializados e com rastreabilidade',()=>{
  assert.equal(MODELS.length,45);
  assert.equal(new Set(MODELS.map(m=>m.slug)).size,45);
  assert.ok(AREAS.length>=7);
  for(const m of MODELS){
    assert.ok(m.method.length>30);
    assert.ok(m.limits.length>30);
    assert.ok(m.reference.length>4);
    assert.ok(m.fields.length>=2);
    assert.ok(m.steps.length>=1);
    assert.ok(m.fields.some(f=>f.key===m.driver));
    assert.ok(existsSync(resolve(root,'ferramentas/planilhas',m.slug,'index.html')));
    const html=readFileSync(resolve(root,'ferramentas/planilhas',m.slug,'index.html'),'utf8');
    assert.match(html,/<link rel="canonical"/);
    assert.match(html,/<script type="application\/ld\+json">/);
    assert.ok(html.includes(m.title),m.slug);
    assert.ok(html.includes('data-slug="'+m.slug+'"'),m.slug);
    const escapedLimits=m.limits.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    assert.ok(html.includes(escapedLimits),m.slug);
  }
});
test('expressões matemáticas independentes de eval e entradas externas',()=>{
  assert.equal(parseExpression('2*(4+3)^2',{}),98);
  assert.equal(parseExpression('CEILING(3.3,1)',{}),4);
  assert.equal(parseExpression('SQRT(9)+PI()',{ }),3+Math.PI);
  assert.throws(()=>parseExpression('constructor(2)',{}));
  assert.throws(()=>parseExpression('Math.random()',{}));
  assert.throws(()=>parseExpression('1/0',{}));
  assert.equal(excelExpression('PI()*D^2/4',{D:"'Entradas'!$B$7"}),"PI()*'Entradas'!$B$7^2/4");
});
test('45 memórias calculadas e 45 curvas coerentes com os exemplos',()=>{
  for(const m of MODELS){
    const input=values(m),calc=calculate(m,input);
    assert.equal(calc.steps.length,m.steps.length,m.slug);
    assert.ok(Number.isFinite(calc.primary),m.slug);
    for(const step of calc.steps){assert.ok(Number.isFinite(step.value),m.slug+': '+step.key);}
    const curve=scenario(m,input);
    assert.ok(curve.length>=5,m.slug+' curve='+curve.length);
    assert.ok(curve.every(x=>Number.isFinite(x.value)&&Number.isFinite(x.result)),m.slug);
  }
});
test('confronta resultados com referências analíticas independentes',()=>{
  const beam=getModel('viga-bi-apoiada');
  const a=calculate(beam,values(beam)).scope;
  assert.equal(a.M,54);
  assert.equal(a.V,36);
  assert.ok(a.delta>0&&a.delta<a.lim);
  const rational=getModel('drenagem-metodo-racional');
  const r=calculate(rational,values(rational)).scope;
  assert.ok(Math.abs(r.Q-(0.7*130*3.5/360))<1e-10);
  const section=getModel('secao-retangular');
  const s=calculate(section,values(section)).scope;
  assert.equal(s.A,1250);
  assert.ok(Math.abs(s.Ix-(25*50**3/12))<1e-8);
  const pd=getModel('potencia-bombeamento');
  const p=calculate(pd,values(pd)).scope;
  assert.ok(Math.abs(p.Ph-(9.81*.014*38))<1e-10);
});
test('erros geométricos e impossibilidades não geram planilhas',()=>{
  const t=getModel('viga-carga-pontual');
  assert.throws(()=>calculate(t,{...values(t),a:100}));
  const pf=getModel('eletrica-correcao-fator-potencia');
  assert.throws(()=>calculate(pf,{...values(pf),fpf:.4}));
  const pay=getModel('energia-payback-simples');
  assert.throws(()=>calculate(pay,{...values(pay),E:0}));
  const invalid=getModel('sapata-pressao');
  assert.throws(()=>calculate(invalid,{...values(invalid),B:-1}));
});
test('gera XLSX Office Open XML completo, 5 abas, fórmulas, gráfico e autoria CONFENGE',async()=>{
  for(const m of MODELS){
    const buffer=await buildWorkbook(m,values(m),{compress:false});
    assert.ok(buffer instanceof Uint8Array,m.slug);
    assert.ok(buffer.byteLength>6000,m.slug);
    const zip=unzipStored(buffer);
    for(const name of [
      '[Content_Types].xml','xl/workbook.xml','xl/styles.xml',
      'xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml',
      'xl/worksheets/sheet3.xml','xl/worksheets/sheet4.xml','xl/worksheets/sheet5.xml',
      'xl/drawings/drawing1.xml','xl/charts/chart1.xml'
    ])assert.ok(zip.has(name),m.slug+': '+name);
    const book=zip.get('xl/workbook.xml'),inputs=zip.get('xl/worksheets/sheet2.xml');
    const memory=zip.get('xl/worksheets/sheet3.xml'), scen=zip.get('xl/worksheets/sheet4.xml');
    assert.match(book,/fullCalcOnLoad="1"/);
    assert.match(inputs,/CONFENGE/);
    assert.match(memory,/<f>/);
    assert.match(memory,/Entradas/);
    assert.match(scen,/<drawing r:id="rId1"/);
    assert.match(zip.get('xl/charts/chart1.xml'),/<c:lineChart>/);
    assert.match(zip.get('docProps/core.xml'),/CONFENGE/);
    assert.doesNotMatch(JSON.stringify([...zip.values()]),/drive\.google\.com|firebaseapp\.com/i);
  }
});
test('política da carteira cobra apenas XLSX, sem bypass de exportação',()=>{
  const {LOCAL_FORMATS}=createRequire(import.meta.url)('../../runtime/tools-commerce/exports.cjs');
  assert.deepEqual(LOCAL_FORMATS['planilhas-engenharia'],['xlsx']);
  const source=readFileSync(resolve(root,'ferramentas/planilhas/app.mjs'),'utf8');
  assert.match(source,/exportToolResult\(/);
  assert.match(source,/toolId:'planilhas-engenharia'/);
  assert.doesNotMatch(source,/localStorage|sessionStorage/);
});
test('páginas estáticas exibem as mesmas entradas e expressões do motor',()=>{
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  for(const m of MODELS){
    const html=readFileSync(resolve(root,'ferramentas/planilhas',m.slug,'index.html'),'utf8');
    for(const f of m.fields)assert.ok(html.includes('<th scope="row">'+esc(f.label)+'</th><td>'+(f.unit==='R$'?'reais (BRL)':esc(f.unit))+'</td><td>'+f.initial+'</td><td>'+f.min+' a '+f.max+'</td>'),m.slug+': '+f.key);
    m.steps.forEach((s,i)=>assert.ok(html.includes(String(i+1).padStart(2,'0')+'. '+esc(s.label)+'</th><td><code>'+esc(s.expr)+'</code>'),m.slug+': '+s.key));
    assert.ok(html.includes(esc(m.method)),m.slug+': method');
    assert.ok(html.includes(esc(m.reference)),m.slug+': reference');
  }
});
// Oráculo independente: ΔU = k·I·L·(ρ/S·cos φ + x·sen φ), k=2 (monofásico) ou √3 (trifásico); ABNT NBR 5410 6.2.7.
const dropOracle=(k,I,L,rho,S,xOhmKm,fp)=>k*I*L*(rho/S*fp+xOhmKm/1000*Math.sqrt(1-fp*fp));
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),a+' ≠ '+b);
test('queda de tensão inclui a reatância e compara com o limite da NBR 5410 6.2.7',()=>{
  const mono=getModel('eletrica-queda-tensao-monofasica'),tri=getModel('eletrica-queda-tensao-trifasica');
  const m=calculate(mono,{...values(mono),I:24,L:60,rho:0.0225,S:6,X:0.1,V:220,fp:0.92,lim:4}).scope;
  near(m.dV,dropOracle(2,24,60,0.0225,6,0.1,0.92));
  near(m.dV,10.048873,1e-6);
  near(m.pct,100*m.dV/220);
  near(m.uso,m.pct/4);
  assert.ok(m.uso>1,'4,57% excede os 4% de 6.2.7.2');
  const t=calculate(tri,{...values(tri),I:63,L:90,rho:0.0225,S:25,X:0.1,V:380,fp:0.9,lim:4}).scope;
  near(t.dV,dropOracle(Math.sqrt(3),63,90,0.0225,25,0.1,0.9));
  near(t.dV,8.3828654,1e-6);
  near(t.pct,100*t.dV/380);
  // Cabo de grande seção: X·sen φ domina; ignorar a reatância subestima a queda em mais de 30%.
  const big=calculate(tri,{...values(tri),I:400,L:120,S:240,X:0.08,fp:0.85}).scope;
  near(big.dV,dropOracle(Math.sqrt(3),400,120,0.0225,240,0.08,0.85));
  assert.ok(big.dV>1.3*Math.sqrt(3)*400*(0.0225*120/240)*0.85);
  // Fronteira cos φ = 1: queda puramente resistiva 2·ρ·L·I/S.
  const unit=calculate(mono,{...values(mono),fp:1}).scope;
  near(unit.dV,2*0.0225*60*24/6);
  assert.throws(()=>calculate(mono,{...values(mono),lim:8}),/Queda admissível/);
});
test('demais planilhas elétricas e energéticas conferem com oráculos independentes',()=>{
  const ct=getModel('eletrica-corrente-trifasica');
  near(calculate(ct,{P:95,fd:0.72,fp:0.9,V:380}).scope.I,95*0.72/0.9*1000/(Math.sqrt(3)*380));
  const pf=getModel('eletrica-correcao-fator-potencia');
  const q=calculate(pf,{P:125,fpi:0.78,fpf:0.95}).scope;
  near(q.Qc,125*(Math.sqrt(1-0.78**2)/0.78-Math.sqrt(1-0.95**2)/0.95));
  const q1=calculate(pf,{P:100,fpi:0.8,fpf:1}).scope;
  near(q1.Qc,75);
  assert.throws(()=>calculate(pf,{P:100,fpi:0.9,fpf:0.9}));
  const cc=getModel('eletrica-curto-teorico');
  near(calculate(cc,{V:380,Z:0.025,fator:1.05}).scope.Ik,1.05*380/(Math.sqrt(3)*0.025)/1000);
  const lm=getModel('iluminacao-metodo-lumens');
  const l=calculate(lm,{A:100,E:500,F:5000,FU:0.5,FM:0.8}).scope;
  near(l.Ft,125000);assert.equal(l.N,25);near(l.Ereal,500);
  const l2=calculate(lm,{A:100,E:500,F:5000,FU:0.5,FM:0.79}).scope;
  assert.equal(l2.N,26);assert.ok(l2.Ereal>=500);
  const fvd=getModel('fotovoltaico-dimensionamento');
  const d=calculate(fvd,{E:1050,HSP:4.6,PR:0.8,dias:30,Wp:550}).scope;
  near(d.kWp,1050/(4.6*0.8*30));assert.equal(d.Nm,18);near(d.Pot,9.9);near(d.Eger,9.9*4.6*0.8*30);assert.ok(d.Eger>=1050);
  const fvg=getModel('fotovoltaico-geracao');
  const g=calculate(fvg,{kWp:10,HSP:5,PR:0.8,dias:30}).scope;
  near(g.Ed,40);near(g.Em,1200);near(g.Es,120);near(g.Ea,14600);
  const pb=getModel('energia-payback-simples');
  near(calculate(pb,{I:60000,E:1000,T:1,op:0}).scope.Tret,5);
  assert.throws(()=>calculate(pb,{I:60000,E:100,T:1,op:100}));
});
