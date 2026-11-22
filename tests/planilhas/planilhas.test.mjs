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
test('sapata: fora do núcleo central não publica pressão linear (NBR 6122:2022, 7.6.2)',()=>{
  const m=getModel('sapata-pressao');
  // N=850 kN, B=2,5 m, L=3 m, My=400 kN·m → ex=0,47 m > B/6; contato parcial.
  const outside={...values(m),Mx:0,My:400};
  assert.throws(()=>calculate(m,outside),/núcleo central/);
  // A fórmula exportada também falha fechada (divisão por FALSO no Excel; não finito aqui).
  const k=m.steps.find(s=>s.key==='k'),qmax=m.steps.find(s=>s.key==='qmax');
  assert.ok(k&&qmax);
  assert.throws(()=>parseExpression(qmax.expr,{q0:113.3,k:1.2}));
  // Dentro do núcleo: q = N/A·(1 ± 6ex/B ± 6ey/L), oráculo manual.
  const r=calculate(m,values(m)).scope,q0=850/7.5,kk=6*(65/850)/2.5+6*(45/850)/3;
  assert.ok(Math.abs(r.k-kk)<1e-12);
  assert.ok(Math.abs(r.qmax-q0*(1+kk))<1e-9&&Math.abs(r.qmin-q0*(1-kk))<1e-9);
  // Fronteira exata do núcleo (k = 1): qmin = 0, ainda válido.
  const edge=calculate(m,{...values(m),Mx:0,My:850*2.5/6}).scope;
  assert.ok(Math.abs(edge.qmin)<1e-9&&Math.abs(edge.qmax-2*q0)<1e-9);
});
test('laje-faixa entrega a reação por apoio prometida (w·L/2)',()=>{
  const m=getModel('laje-faixa');
  const r=calculate(m,values(m));
  assert.equal(r.scope.R,6*1*4.2/2);
  assert.equal(m.keyResult,'delta');
});
test('muro-empuxo-ativo não atribui o empuxo de terra à NBR 6122',()=>{
  const m=getModel('muro-empuxo-ativo');
  assert.match(m.reference,/Rankine/);
  assert.match(m.reference,/não define empuxo/);
});
test('sapata: guarda e passo k usam a mesma aritmética na fronteira do núcleo',()=>{
  const m=getModel('sapata-pressao');
  // Reprodutor do revisor: k = 1 em aritmética exata, arredondamento divergente na versão anterior.
  const inp={...values(m),N:4940.257060255203,B:0.7983844986425519,L:2.149228380872277,Mx:1702.5047184079779,My:24.932926182812494};
  let ok=false,msg='';
  try{calculate(m,inp);ok=true;}catch(e){msg=e.message;}
  assert.ok(ok||/núcleo central/.test(msg),msg);
  // Excel/JS: qmin também falha fechada fora do núcleo.
  assert.throws(()=>parseExpression(m.steps.find(s=>s.key==='qmin').expr,{q0:100,k:1.2}));
  const idx=readFileSync(resolve(root,'ferramentas/planilhas/index.html'),'utf8');
  assert.ok(!/Rankine[^"]*parcela de sobrecarga e posição resultante\. Fundações ABNT NBR 6122:2022"/.test(idx));
});
