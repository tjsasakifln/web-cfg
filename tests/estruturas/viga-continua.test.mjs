import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisar } from '../../ferramentas/analise-de-viga-continua/viga.js';

const t = {L:5, q:10, I:160000}, E=30, EI=48000;
const perto=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`);
test('biapoiada: reações, momento, deformada e posição do extremo',()=>{
  const r=analisar([t],E), m=r.trechos[0].avaliar(2.5);
  perto(r.apoios[0].R,25);perto(r.apoios[1].R,25);perto(m.V,0);
  perto(m.M,31.25);perto(m.flecha,-1000*5*t.q*t.L**4/(384*EI));
  perto(r.trechos[0].flechaMax.x,2.5);
});
test('biengastada e engastada-apoiada',()=>{
  const r=analisar([t],E,true,true);
  perto(r.trechos[0].Mmin,-t.q*t.L**2/12);perto(r.trechos[0].Mmax,t.q*t.L**2/24);
  perto(r.apoios[0].M,t.q*t.L**2/12);perto(r.apoios[1].M,-t.q*t.L**2/12);
  perto(r.trechos[0].flechaMax.flecha,-1000*t.q*t.L**4/(384*EI));
  const propped=analisar([t],E,true,false);
  perto(propped.apoios[1].R,3*t.q*t.L/8);perto(propped.apoios[0].M,t.q*t.L**2/8);
});
test('dois vãos iguais e dois desiguais pela equação dos três momentos',()=>{
  const r=analisar([t,t],E);
  [18.75,62.5,18.75].forEach((v,i)=>perto(r.apoios[i].R,v));
  perto(r.trechos[0].Mmin,-31.25);perto(r.trechos[0].Mmax,17.578125);
  const outro={L:3.4,q:6.5,I:80000};
  const R=analisar([t,outro],E);
  const m=-(t.q*t.L**3/t.I + outro.q*outro.L**3/outro.I)/(8*(t.L/t.I+outro.L/outro.I));
  perto(R.trechos[0].avaliar(t.L).M,m);perto(R.trechos[1].avaliar(0).M,m);
  perto(R.apoios[0].R,t.q*t.L/2+m/t.L);
  perto(R.apoios[2].R,outro.q*outro.L/2+m/outro.L);
});
test('equilíbrio global, continuidade e flecha nula em todos os apoios',()=>{
  const vaos=[t,{...t,L:3.2,q:0},{...t,I:43000,q:-2}];
  for(const a of [true,false])for(const b of [true,false]){
    const r=analisar(vaos,E,a,b);let carga=0,momento=0,x=0;
    for(const [i,s] of vaos.entries()){
      carga+=s.q*s.L;momento+=s.q*s.L*(x+s.L/2);x+=s.L;
      perto(r.trechos[i].avaliar(0).flecha,0);perto(r.trechos[i].avaliar(s.L).flecha,0);
      if(i)perto(r.trechos[i-1].avaliar(vaos[i-1].L).M,r.trechos[i].avaliar(0).M);
    }
    perto(r.apoios.reduce((s,p)=>s+p.R,0),carga);perto(r.apoios.reduce((s,p)=>s+p.R*p.x+p.M,0),momento);
  }
});
test('carga ascendente, carga nula e entrada inválida',()=>{
  const invertido=analisar([{...t,q:-10}],E);
  perto(invertido.apoios[0].R,-25);perto(invertido.trechos[0].flechaMax.flecha,1.6954210069444);
  for(const p of analisar([{...t,q:0}, {...t,q:0}],E).apoios) perto(p.R,0);
  for(const problema of [[],[{...t,L:0}],[{...t,q:NaN}],Array(7).fill(t)])assert.throws(()=>analisar(problema,E),RangeError);
});
