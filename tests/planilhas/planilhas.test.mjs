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

// --- Auditoria normativa: hidráulica, drenagem e climatização ---------------
// Os testes normativos falham no catálogo anterior; o último é oráculo de regressão.
test('galeria-manning reproduz a Tabela 4 da NBR 10844:1989 (lâmina de 2/3 D, 5.7.2)',()=>{
  // Vazões em L/min publicadas na Tabela 4 (n; D em mm; declividades 0,5%, 1%, 2% e 4%).
  const table={0.011:[[50,32,45,64,90],[75,95,133,188,267],[100,204,287,405,575],[125,370,521,735,1040],[150,602,847,1190,1690],[200,1300,1820,2570,3650],[250,2350,3310,4660,6620],[300,3820,5380,7590,10800]],
    0.012:[[50,29,41,59,83],[75,87,122,172,245],[100,187,264,372,527],[125,339,478,674,956],[150,552,777,1100,1550],[200,1190,1670,2360,3350],[250,2150,3030,4280,6070],[300,3500,4930,6960,9870]],
    0.013:[[50,27,38,54,76],[75,80,113,159,226],[100,173,243,343,486],[125,313,441,622,882],[150,509,717,1010,1430],[200,1100,1540,2180,3040],[250,1990,2800,3950,5600],[300,3230,4550,6420,9110]]};
  const slopes=[0.005,0.01,0.02,0.04],m=getModel('galeria-manning');
  assert.equal(m.keyResult,'Q23');
  for(const [n,rows] of Object.entries(table))for(const [D,...flows] of rows)flows.forEach((reference,i)=>{
    const r=calculate(m,{D:D/1000,n:Number(n),S:slopes[i]});
    // Valores tabelados têm 3 algarismos significativos; uma célula (n = 0,013; 200 mm; 4%) é
    // inconsistente com as demais em 1,5%. A seção plena excede a tabela em 26% a 29%.
    const rel=Math.abs(r.primary*60000-reference)/reference;
    assert.ok(rel<=0.015,`n=${n} D=${D} S=${slopes[i]}: ${r.primary*60000} x ${reference}`);
    assert.ok(r.scope.Q*60000>reference*1.25,'a seção plena continua disponível como referência');
    assert.ok(Math.abs(r.scope.v23-r.scope.Q23/r.scope.A23)<1e-12);
  });
});
test('reservatorio-consumo exige no mínimo 24 h de reservação (NBR 5626:2020, 6.5.6.2)',()=>{
  const m=getModel('reservatorio-consumo');
  assert.throws(()=>calculate(m,{...values(m),d:0.5}),/Autonomia/);
  assert.throws(()=>calculate(m,{...values(m),d:0.99}),/Autonomia/);
  const r=calculate(m,{...values(m),d:1}).scope;
  assert.ok(Math.abs(r.V-80*150/1000)<1e-12);
  assert.match(m.method,/6\.5\.6\.2/);
});
test('pressão hidrostática é manométrica, não absoluta; conversões de unidade',()=>{
  const m=getModel('pressao-hidrostatica');
  assert.doesNotMatch(m.summary,/absoluta/i);
  assert.match(m.summary+m.steps[0].label,/manométrica/);
  // 40 mca de água a 1000 kg/m³ = 392,4 kPa (< 400 kPa da NBR 5626:2020, 6.9.4) = 3,924 bar.
  const r=calculate(m,{h:40,rho:1000,g:9.81}).scope;
  assert.ok(Math.abs(r.p-392.4)<1e-9&&Math.abs(r.bar-3.924)<1e-12&&Math.abs(r.mc-40)<1e-12);
});
test('carga térmica não conta pessoas e equipamentos duas vezes (NBR 16401-1:2024, 6.2.2)',()=>{
  const m=getModel('hvac-carga-estimativa');
  const q=m.fields.find(f=>f.key==='q');
  assert.match(q.label,/sem pessoas/);
  const r=calculate(m,{A:100,q:50,n:10,qp:115,equip:1000}).scope;
  assert.equal(r.Qtotal,5000+1150+1000);
  assert.ok(Math.abs(r.BTU-7.15*3412.142)<1e-9);
});
test('transmitância usa Rsi/Rse da NBR 15220-2 e cita os limites da NBR 15575-4:2025',()=>{
  const m=getModel('transmitancia-multicamadas');
  const r=calculate(m,values(m)).scope;
  assert.ok(Math.abs(r.U-1/(0.13+0.12/0.7+0.03/0.04+0.04))<1e-12);
  assert.match(m.method,/15220-2/);
  assert.match(m.method,/Tabela 13/);
});
test('hidráulica: oráculos independentes de Hazen-Williams, Darcy-Weisbach, singular e Manning',()=>{
  const hw=calculate(getModel('perda-hazen-williams'),{Q:5,L:120,D:100,C:130}).scope;
  assert.ok(Math.abs(hw.hf-10.67*120*0.005**1.852/(130**1.852*0.1**4.87))<1e-12);
  // Darcy em regime laminar, com f = 64/Re informado pelo usuário.
  const dw=getModel('perda-darcy-weisbach');
  const lam=calculate(dw,{Q:0.02,L:10,D:25,f:64/1000,K:0}).scope;
  const v=0.00002/(Math.PI*0.025**2/4);
  assert.ok(Math.abs(lam.hd-0.064*(10/0.025)*v*v/(2*9.81))<1e-12);
  const sing=calculate(getModel('perda-singular'),{Q:6,D:80,K:12}).scope;
  assert.ok(Math.abs(sing.hl-12*sing.v**2/(2*9.81))<1e-12);
  const ch=calculate(getModel('canal-retangular'),{b:1,y:0.5,n:0.015,S:0.001}).scope;
  assert.ok(Math.abs(ch.Q-0.5*0.25**(2/3)*Math.sqrt(0.001)/0.015)<1e-12);
  // Método racional: 1 ha, 100 mm/h, C = 1 equivale a I·A/60 da NBR 10844, 5.3.1 (L/min).
  const rq=calculate(getModel('drenagem-metodo-racional'),{C:1,i:100,A:1}).scope;
  assert.ok(Math.abs(rq.QL*60-100*10000/60)<1e-9);
});
test('catálogo e páginas exibem o resumo, o método e a referência vigentes do catálogo',()=>{
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const catalog=readFileSync(resolve(root,'ferramentas/planilhas/index.html'),'utf8');
  for(const m of MODELS){
    const page=readFileSync(resolve(root,'ferramentas/planilhas',m.slug,'index.html'),'utf8');
    assert.ok(catalog.includes(esc(m.summary)),m.slug+': resumo no catálogo');
    assert.ok(catalog.includes(esc(m.title)),m.slug+': título no catálogo');
    for(const text of [m.summary,m.method,m.reference])assert.ok(page.includes(esc(text)),m.slug+': '+text.slice(0,40));
  }
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
  const catalog=readFileSync(resolve(root,'ferramentas/planilhas/index.html'),'utf8');
  for(const m of MODELS)assert.ok(catalog.includes(esc(m.summary)+' '+esc(m.area)+' '+esc(m.reference)+'"'),m.slug+': catálogo');
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
  assert.throws(()=>calculate(mono,{...values(mono),lim:8}),/Limite adotado/);
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
