const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const number = (v, digits = 3) => v == null ? '·' : new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits,useGrouping:false}).format(Math.abs(v)<10**(-digits)/2?0:v);
export const LABELS = Object.freeze({
  N:['Normal N','kN','Tração positiva no eixo local da barra.'],
  V:['Cortante V','kN','No sentido i → j, V = dM/dx entre ações concentradas.'],
  M:['Momento fletor M','kN·m','Positivo para curvatura positiva do deslocamento transversal local.'],
  T:['Momento torsor T','kN·m','Positivo em torno do eixo local i → j, pela regra da mão direita.'],
  D:['Deformada','mm','Deslocamentos ampliados no desenho. A posição no gráfico não representa a escala real.'],
  Z:['Deslocamento vertical','mm','Afastamento gráfico dos eixos das barras proporcional a uz. Z positivo para cima.'],
});

export function diagramKinds(result) {
  return result.kind === 'grillage' ? ['V','M','T','Z'] :
    result.members.some(m=>m.type==='frame') ? ['N','V','M','D'] : ['N','D'];
}

export function diagram(model,result,key,offset=0) {
  const [title,unit,description]=LABELS[key], nodes=new Map(model.nodes.map(n=>[n.id,n]));
  const xs=model.nodes.map(n=>n.x),ys=model.nodes.map(n=>n.y);
  const dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys);
  const scale=Math.min(800/(dx||1),150/(dy||1)), cx=(Math.max(...xs)+Math.min(...xs))/2, cy=(Math.max(...ys)+Math.min(...ys))/2;
  const project=(x,y)=>[480+scale*(x-cx),171-scale*(y-cy)];
  const magnitude=r=>key==='D'?Math.hypot(r.dx,r.dy)*1000:key==='Z'?r.dz*1000:r[key];
  const absMax=Math.max(...result.members.map(m=>m.rows.reduce((v,r)=>Math.max(v,Math.abs(magnitude(r)??0)),0)));
  const amp=absMax>1e-12?42/absMax:0;
  const panels=[];
  for (const m of result.members) {
    const a=nodes.get(m.a), b=nodes.get(m.b);
    const [x0,y0]=project(a.x,a.y),[x1,y1]=project(b.x,b.y);
    panels.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#657481" stroke-width="1.4" ${m.type==='truss'?'stroke-dasharray="5 4"':''}/>`);
    panels.push(`<text x="${(x0+x1)/2+5}" y="${(y0+y1)/2+14}" font-size="11" paint-order="stroke" stroke="#fff" stroke-width="2">${esc(m.id)}</text>`);
    if (magnitude(m.rows[0])===null) continue;
    const path=m.rows.map(r=>{
      const [x,y]=project(a.x+r.x*m.c,a.y+r.x*m.s);
      return key==='D'?[x+amp*r.dx*1000,y-amp*r.dy*1000]:[x-m.s*amp*magnitude(r),y-m.c*amp*magnitude(r)];
    });
    const pts=path.map(p=>p.map(v=>v.toFixed(3)).join(',')).join(' ');
    if (key!=='D') panels.push(`<polygon points="${x0},${y0} ${pts} ${x1},${y1}" fill="#ddecea"/>`);
    panels.push(`<polyline points="${pts}" fill="none" stroke="#005c55" stroke-width="2"/>`);
  }
  for (const n of model.nodes) {
    const [x,y]=project(n.x,n.y);
    panels.push(`<circle cx="${x}" cy="${y}" r="3" fill="#203341"/>`);
  }
  const label=['D','Z'].includes(key)?'Maior módulo amostrado':'Maior valor absoluto';
  return `<g transform="translate(0 ${offset})"><rect width="960" height="326" fill="#fff" stroke="#d2dce0"/>
  <g font-family="system-ui, sans-serif" fill="#203341">
  <text x="20" y="30" font-size="20" font-weight="700">${esc(title)} (${esc(unit)})</text>
  <text x="20" y="52" font-size="13">${esc(label)} ${esc(number(absMax))} ${esc(unit)}</text>
  ${panels.join('')}
  <text x="20" y="306" font-size="13">${esc(description)}</text></g></g>`;
}

export function displaySVG(model,result,key) {
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(LABELS[key][0])}" viewBox="0 0 960 326">${diagram(model,result,key)}</svg>`;
}

export function resultSVG(model,result,keys=diagramKinds(result)) {
  const h=68+keys.length*326;
  const comb=Object.entries(result.weights).filter(([,f])=>f!==0).map(([id,f])=>`${number(f,6)} × ${id}`).join(' + ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${h}" viewBox="0 0 960 ${h}">
  <title>CONFENGE | Diagramas de análise estrutural 2D</title><desc>Análise elástica linear de barras.</desc>
  <rect width="960" height="68" fill="#203341"/>
  <g font-family="system-ui, sans-serif" fill="#fff"><text x="20" y="27" font-size="19" font-weight="700">CONFENGE | Análise estrutural 2D</text>
  <text x="20" y="50" font-size="13">${esc((result.kind==='grillage'?'Grelha':'Pórtico e treliça')+' · '+comb)}</text></g>
  ${keys.map((key,i)=>diagram(model,result,key,68+i*326)).join('')}</svg>`;
}

const cell = value => {
  if (value===null || value===undefined) return '';
  if (typeof value==='number') return String(value).replace('.',',');
  const safe=/^[=+\-@\t\r]/.test(value)?"'"+value:value;
  return '"'+safe.replaceAll('"','""')+'"';
};
export function resultCSV(result) {
  const gr=result.kind==='grillage', comb=Object.entries(result.weights).filter(([,f])=>f!==0).map(([id,f])=>`${f} x ${id}`).join(' + ');
  const lines=[['Tipo','Modelo','Combinação','ID','Nó i','Nó j','x local (m)','Lado','N (kN) tração positiva','V (kN)','M (kN·m)','T (kN·m)',
    'ux (mm)','uy (mm)','uz (mm)','rz (mrad)','rx (mrad)','ry (mrad)','Giro torsional local (mrad)','Rx (kN)','Ry (kN)','Rz (kN)','RMz (kN·m)','RMx (kN·m)','RMy (kN·m)']];
  const kind=gr?'Grelha':'Pórtico e treliça';
  for (const n of result.nodes) {
    const d=n.d.map((x,i)=>n.active[i]?x*1000:null),r=n.r.map((x,i)=>n.active[i]?x:null);
    lines.push(['Nó',kind,comb,n.id,null,null,null,null,null,null,null,null,...(gr?[null,null,d[0],null,d[1],d[2],null,null,null,r[0],null,r[1],r[2]]:[d[0],d[1],null,d[2],null,null,null,r[0],r[1],null,r[2],null,null])]);
  }
  for (const m of result.members) for (const p of m.rows) {
    lines.push(['Barra',kind,comb,m.id,m.a,m.b,p.x,p.side,p.N,p.V,p.M,p.T,p.dx===null?null:p.dx*1000,p.dy===null?null:p.dy*1000,p.dz===null?null:p.dz*1000,null,null,null,p.twist===null?null:p.twist*1000]);
  }
  return '\uFEFF'+lines.map(line=>Array.from({length:lines[0].length},(_,i)=>cell(line[i])).join(';')).join('\r\n');
}
