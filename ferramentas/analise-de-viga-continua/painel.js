import { analisar } from './viga.js';

const el = id => document.getElementById(id);
const esquema = el('lista-vaos');
let caso;
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const fmt = n => numero.format(Math.abs(n) < 0.0005 ? 0 : n);
const ler = campo => {
  const valor = campo.value.trim().replace(',', '.');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(valor) ? Number(valor) : NaN;
};

function adicionar() {
  const n = esquema.children.length + 1;
  if (n > 6) return;
  const linha = document.createElement('fieldset');
  const legenda = document.createElement('legend');
  legenda.textContent = 'Vão ' + n;
  linha.append(legenda);
  for (const [chave, titulo, exemplo, min, max] of [
    ['L', 'Comprimento (m)', '5', 0.1, 100],
    ['q', 'Carga (kN/m)', '10', -10000, 10000],
    ['I', 'Inércia (cm^4)', '160000', 1, 1e9]
  ]) {
    const rotulo = document.createElement('label');
    rotulo.textContent = titulo;
    const campo = document.createElement('input');
    campo.inputMode = 'decimal';
    campo.value = exemplo;
    campo.dataset.chave = chave;
    campo.dataset.min = min;
    campo.dataset.max = max;
    rotulo.append(campo);
    linha.append(rotulo);
  }
  esquema.append(linha);
}

const campos = (cab, dados, tbody) => {
  tbody.replaceChildren(...dados.map((valores, i) => {
    const tr = document.createElement('tr');
    for (const [c, valor] of valores.entries()) {
      const td = document.createElement(c === 0 ? 'th' : 'td');
      if (c === 0) td.scope = 'row';
      td.textContent = c === 0 ? cab + (i + 1) : fmt(valor);
      tr.append(td);
    }
    return tr;
  }));
};
function diagrama() {
  if (!caso) return;
  const chave = el('grandeza').value;
  const svg = el('diagrama');
  const ns = 'http://www.w3.org/2000/svg';
  const criar = (tag, attrs, texto) => {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (texto) node.textContent = texto;
    svg.append(node);
  };
  const { trechos, apoios } = caso.resultado;
  const alcance = apoios.at(-1).x;
  const max = Math.max(1e-15, ...trechos.flatMap(t => t.criticos.map(p => Math.abs(p[chave]))));
  const X = x => 28 + 564 * x / alcance;
  const Y = y => 82 - 59 * y / max;
  svg.replaceChildren();
  criar('line', {x1: X(0), y1: 82, x2: X(alcance), y2: 82, stroke: '#63798a'});
  let ultimoRotulo = -Infinity;
  for (const [i, a] of apoios.entries()) {
    criar('line', {x1:X(a.x),y1:12,x2:X(a.x),y2:148,stroke:'#bed1d9','stroke-dasharray':'3 3'});
    if ((X(a.x) - ultimoRotulo >= 25 && X(alcance) - X(a.x) >= 25) || i === apoios.length - 1) {
      criar('text', {x:X(a.x),y:164,'text-anchor':'middle',fill:'#132d47'}, 'A' + (i + 1));
      ultimoRotulo = X(a.x);
    }
  }
  let inicio = 0;
  for (const t of trechos) {
    const xs = [...new Set([...Array.from({length:65}, (_, i) => t.L * i / 64), ...t.criticos.map(p => p.x)])].sort((a,b)=>a-b);
    criar('polyline', {points:xs.map(x=>X(inicio+x)+','+Y(t.avaliar(x)[chave])).join(' '),stroke:'#075376',fill:'none','stroke-width':3});
    inicio += t.L;
  }
  const valores = trechos.flatMap(t=>t.criticos.map(p=>p[chave]));
  const unidade = {M:'kN·m',V:'kN',flecha:'mm'}[chave];
  el('escala').textContent = 'Mínimo ' + fmt(Math.min(...valores)) + ' ' + unidade +
    ' · Máximo ' + fmt(Math.max(...valores)) + ' ' + unidade + '. Escala horizontal proporcional aos vãos.';
}

function calcular() {
  const quantidade = esquema.children.length;
  el('adicionar').disabled = quantidade >= 6;
  el('remover').disabled = quantidade <= 1;
  caso = null;
  const invalidos = [];
  for (const input of el('entrada').querySelectorAll('input')) {
    const valor = ler(input);
    const valido = Number.isFinite(valor) && valor >= Number(input.dataset.min) && valor <= Number(input.dataset.max);
    input.setAttribute('aria-invalid', String(!valido));
    if (!valido) invalidos.push(input);
  }
  el('saida').hidden = invalidos.length > 0;
  el('ir-resultado').hidden = invalidos.length > 0;
  el('status').textContent = invalidos.length ? 'Confira os campos indicados. Use os intervalos informados abaixo.' : '';
  if (invalidos.length) return;
  const vaos = [...esquema.children].map(linha => Object.fromEntries([...linha.querySelectorAll('input')].map(c=>[c.dataset.chave,ler(c)])));
  const E = ler(el('modulo')), fixoE = el('esquerda').value === 'fixo', fixoD = el('direita').value === 'fixo';
  const resultado = analisar(vaos, E, fixoE, fixoD);
  caso = { resultado, vaos, E, fixoE, fixoD };
  campos('A',resultado.apoios.map(a=>[null,a.x,a.R,a.M]),el('apoios'));
  campos('V',resultado.trechos.map(t=>[null,t.Mmin,t.Mmax,t.flechaMax.flecha,t.flechaMax.x]),el('extremos'));
  const avisos = [];
  if (resultado.apoios.some(a=>a.R < -0.0005)) avisos.push('Há reação para baixo. Confira o vínculo capaz de resistir ao levantamento.');
  if (resultado.trechos.some(t=>Math.abs(t.flechaMax.flecha) > t.L * 10))
    avisos.push('A flecha supera 1% de um dos vãos. Reavalie a hipótese de pequenos deslocamentos.');
  el('leitura').textContent = avisos.join(' ');
  diagrama();
}

el('adicionar').addEventListener('click',()=>{adicionar();calcular();});
el('remover').addEventListener('click',()=>{if(esquema.children.length>1) esquema.lastElementChild.remove();calcular();});
el('entrada').addEventListener('input',calcular);
el('grandeza').addEventListener('change',diagrama);
el('csv').addEventListener('click',()=>{
  if (!caso) return;
  const { vaos, E, fixoE, fixoD, resultado } = caso;
  const linhas = [['Estudo de viga contínua CONFENGE'],['E (GPa)',E],
    ['Apoio inicial',fixoE?'Engaste':'Apoio simples'],['Apoio final',fixoD?'Engaste':'Apoio simples'],
    ['Vão','L (m)','q (kN/m)','I (cm4)'],...vaos.map((v,i)=>[i+1,v.L,v.q,v.I]),[],
    ['Apoio','X (m)','Reação (kN)','Momento de reação (kN.m)'],...resultado.apoios.map((a,i)=>[i+1,a.x,a.R,a.M]),[],
    ['Vão','x local (m)','X global (m)','Cortante (kN)','Momento (kN.m)','Deslocamento (mm)']];
  for(const [i,t] of resultado.trechos.entries()){
    const xs=[...new Set([...Array.from({length:21},(_,j)=>t.L*j/20),...t.criticos.map(p=>p.x)])].sort((a,b)=>a-b);
    for(const x of xs){const p=t.avaliar(x);linhas.push([i+1,x,resultado.apoios[i].x+x,p.V,p.M,p.flecha]);}
  }
  const dados=linhas.map(l=>l.map(v=>typeof v==='number'?Number(v.toFixed(8)).toString().replace('.',','):v).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF',dados],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='viga-continua-confenge.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
adicionar();adicionar();el('controles').disabled=false;el('sem-js').hidden=true;calcular();
