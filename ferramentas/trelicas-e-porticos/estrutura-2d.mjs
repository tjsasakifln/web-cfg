// Análise elástica linear de barras Euler-Bernoulli. Unidades internas: kN, m, rad.
// Frame: [ux, uy, rz]. Grelha: [uz, rx, ry], rotações globais de mão direita.
// Referência de rigidez de barras: H. P. Gavin, Structural Elements, Duke CEE 541.
export const LIMITS = Object.freeze({ nodes: 100, members: 160, cases: 12, loads: 400, length: 1e-4 });
export const SECTION = Object.freeze({ E: 200, A: 100, I: 10000, G: 76.92, J: 5000, alpha: 12 });

const zeros = n => Array(n).fill(0);
const matrix = n => Array.from({length: n}, () => new Float64Array(n));
const product = (A, x) => A.map(row => row.reduce((sum, v, j) => sum + v * x[j], 0));
const transpose = A => A[0].map((_, j) => A.map(row => row[j]));
const require = (ok, message) => { if (!ok) throw new RangeError(message); };
const valid = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const vector = (v, n, max = 1e7) => Array.isArray(v) && v.length === n && v.every(x => valid(x, -max, max));
const named = id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(id);

function index(items, max, label) {
  require(Array.isArray(items) && items.length <= max, `Limite de ${max} ${label}.`);
  const map = new Map();
  items.forEach((v, i) => {
    require(v && named(v.id) && !map.has(v.id), `Verifique os identificadores de ${label}.`);
    map.set(v.id, i);
  });
  return map;
}

export function validateModel(m) {
  require(m?.version === 1 && ['frame','grillage'].includes(m.kind), 'Este arquivo não é um modelo compatível.');
  const gr = m.kind === 'grillage';
  const nodes = index(m.nodes, LIMITS.nodes, 'nós');
  const members = index(m.members, LIMITS.members, 'barras');
  const cases = index(m.cases, LIMITS.cases, 'casos');
  require(m.cases.length > 0 && m.cases.every(c => typeof c.name === 'string' && c.name.trim().length > 0 && c.name.length <= 64),
    'Informe um nome válido para cada caso de carga.');
  m.nodes.forEach((n, i) => {
    require(vector([n.x, n.y], 2, 1e4) && Array.isArray(n.fix) && n.fix.length === 3 && n.fix.every(x => typeof x === 'boolean'),
      `Confira as coordenadas e apoios de ${n.id}.`);
    require(!m.nodes.slice(0, i).some(o => Math.hypot(n.x-o.x, n.y-o.y) < LIMITS.length),
      `Há nós coincidentes junto a ${n.id}. Use o mesmo nó para emendar barras.`);
  });
  const pairs = new Set();
  for (const b of m.members) {
    require(!nodes.has(b.id), `O identificador ${b.id} já pertence a um nó.`);
    require(nodes.has(b.a) && nodes.has(b.b) && b.a !== b.b && (gr ? b.type === 'grillage' : ['frame','truss'].includes(b.type)),
      `Confira a ligação e o tipo de ${b.id}.`);
    const key = [b.a,b.b].sort().join(':');
    require(!pairs.has(key), `Há duas barras entre ${b.a} e ${b.b}.`);
    pairs.add(key);
    const p = b.section ?? {}, truss = b.type === 'truss';
    require(valid(p.E, 0.01, 1000) && (gr || valid(p.A, .001, 1e7)) && (truss || valid(p.I, .0001, 1e11)) &&
      (!gr || (valid(p.G, 0.01, 1000) && valid(p.J, .0001, 1e11))) &&
      (gr || valid(p.alpha, 0, 1000)), `Confira as propriedades de ${b.id}.`);
    require(Array.isArray(b.release) && b.release.length === 2 && b.release.every(r => typeof r === 'boolean') &&
      (b.type === 'frame' || !b.release.some(Boolean)), `Confira as rótulas de ${b.id}.`);
  }
  index(m.loads, LIMITS.loads, 'ações');
  for (const l of m.loads) {
    require(cases.has(l.case), `Caso de carga inexistente em ${l.id}.`);
    if (l.kind === 'nodal' || l.kind === 'settlement') {
      require(nodes.has(l.at) && vector(l.p, 3, l.kind === 'settlement' ? 10 : 1e7), `Confira os valores e o nó de ${l.id}.`);
      if (l.kind === 'settlement') require(l.p.every((x,i) => x === 0 || m.nodes[nodes.get(l.at)].fix[i]),
        `Restrinja o movimento correspondente ao recalque ou giro imposto em ${l.at}.`);
      continue;
    }
    const b = m.members[members.get(l.at)];
    require(b && ['line','point','thermal'].includes(l.kind), `Barra ou ação inválida em ${l.id}.`);
    if (l.kind === 'thermal') require(!gr && valid(l.delta, -1500, 1500), `Confira a variação uniforme de temperatura em ${l.id}.`);
    if (l.kind === 'point') require(b.type !== 'truss' && valid(l.station, .000001, .999999) && vector(l.p, 3),
      `Use cargas nodais em treliças e nas extremidades. Confira a posição e a intensidade de ${l.id}.`);
    if (l.kind === 'line') require(b.type !== 'truss' && vector(l.start, 2) && vector(l.end, 2),
      `Use cargas nodais em treliças. Confira a carga de linha ${l.id}.`);
  }
  return { nodes, members, cases, gr };
}

function transform(c, s, gr) {
  if (gr) return [[0,c,s],[1,0,0],[0,s,-c]]; // local [giro torsor, w, dw/dx]
  return [[c,s,0],[-s,c,0],[0,0,1]];
}

function element(b, m, id, load) {
  const ni = id.nodes.get(b.a), nj = id.nodes.get(b.b);
  const a = m.nodes[ni], z = m.nodes[nj], L = Math.hypot(z.x-a.x,z.y-a.y);
  const c = (z.x-a.x)/L, s = (z.y-a.y)/L, gr = id.gr, truss = b.type === 'truss';
  const { E, A, I, G, J, alpha } = b.section;
  const axial = gr ? G * J * .01 : E * A * 100;
  const EI = truss ? 0 : E * I * .01;
  const k = matrix(6);
  k[0][0] = k[3][3] = axial/L;
  k[0][3] = k[3][0] = -axial/L;
  if (!truss) {
    const bx = [1,2,4,5];
    const coeff = [[12,6*L,-12,6*L],[6*L,4*L**2,-6*L,2*L**2],
      [-12,-6*L,12,-6*L],[6*L,2*L**2,-6*L,4*L**2]];
    bx.forEach((i,r) => bx.forEach((j,t) => { k[i][j] = coeff[r][t] * EI/L**3; }));
  }
  const { q0, q1, points, delta } = load;
  const [a0,v0] = q0, [a1,v1] = q1;
  const strain = gr ? 0 : delta * alpha * 1e-6;
  const f = [
    L*(2*a0+a1)/6 - axial*strain, L*(7*v0+3*v1)/20, L**2*(3*v0+2*v1)/60,
    L*(a0+2*a1)/6 + axial*strain, L*(3*v0+7*v1)/20, -(L**2)*(2*v0+3*v1)/60,
  ];
  for (const {x:t,p:[p0,pv,pm]} of points) {
    f[0] += (1-t)*p0; f[3] += t*p0;
    f[1] += (1-3*t*t+2*t**3)*pv + (6*t*t-6*t)*pm/L;
    f[2] += L*(t-2*t*t+t**3)*pv + (1-4*t+3*t*t)*pm;
    f[4] += (3*t*t-2*t**3)*pv + (6*t-6*t*t)*pm/L;
    f[5] += L*(t**3-t*t)*pv + (3*t*t-2*t)*pm;
  }
  const r = [b.release[0]?2:null,b.release[1]?5:null].filter(i => i !== null);
  const h = Array.from({length:6},(_,i)=>i).filter(i=>!r.includes(i));
  const rsolve = y => {
    if (r.length === 1) return [y[0]/k[r[0]][r[0]]];
    const diag = k[2][2], cross = k[2][5], ratio = cross/diag;
    return [(y[0]-ratio*y[1])/(diag*(1-ratio*ratio)),(y[1]-ratio*y[0])/(diag*(1-ratio*ratio))];
  };
  const kc = r.length ? matrix(6) : k, fc = r.length ? zeros(6) : f;
  if (r.length) {
    const rf = rsolve(r.map(i=>f[i]));
    for (const j of h) {
      const rk = rsolve(r.map(i=>k[i][j]));
      for (const i of h) kc[i][j] = k[i][j] - r.reduce((sum, d, n) => sum+k[i][d]*rk[n],0);
    }
    for (const i of h) fc[i] = f[i] - r.reduce((sum, d, n) => sum+k[i][d]*rf[n],0);
    // A barra birrotulada só oferece rigidez axial. Não deixar resíduos de
    // arredondamento se passarem por rigidez transversal em um mecanismo.
    if (r.length===2) for (const i of [1,2,4,5]) for (let j=0;j<6;j++) kc[i][j]=kc[j][i]=0;
  }
  const t = transform(c,s,gr), map = [ni*3,ni*3+1,ni*3+2,nj*3,nj*3+1,nj*3+2];
  const T = Array.from({length:6},(_,i)=>Array.from({length:6},(_,j)=>
    (i<3)===(j<3)?t[i%3][j%3]:0));
  const TT = transpose(T);
  const kT = kc.map(row=>TT.map(col=>row.reduce((sum,v,i)=>sum+v*col[i],0)));
  const K = TT.map(row=>Array.from({length:6},(_,j)=>row.reduce((sum,v,i)=>sum+v*kT[i][j],0)));
  const F = product(TT,fc);
  const released = local => {
    if (r.length) rsolve(r.map(i=>f[i]-h.reduce((sum,j)=>sum+k[i][j]*local[j],0)))
      .forEach((v,j)=>{ local[r[j]]=v; });
    return local;
  };
  return { L,c,s,gr,truss,axial,EI,strain,k,f,K,F,t:T, map,released,b,q0,q1,points };
}

function cholesky(A, b, free, nodes) {
  if (!free.length) return [];
  const D = free.map(i=>Math.sqrt(A[i][i]));
  const fail = j => {
    const n = nodes[Math.floor(free[j]/3)].id;
    throw new RangeError(`Estrutura instável ou rigidez mal condicionada perto de ${n}. Confira apoios, ligações, rótulas e seções.`);
  };
  D.forEach((x,i)=>{ if (!(x>0) || !Number.isFinite(x)) fail(i); });
  const T = matrix(free.length);
  for (let i=0;i<free.length;i++) {
    for (let j=0;j<=i;j++) {
      let v = A[free[i]][free[j]]/(D[i]*D[j]);
      for (let k=0;k<j;k++) v -= T[i][k]*T[j][k];
      if (i===j && !(v>2e-11)) fail(i);
      T[i][j] = i===j ? Math.sqrt(v) : v/T[j][j];
    }
  }
  const y = free.map((_,i)=>b[i]/D[i]);
  for (let i=0;i<y.length;i++) {
    for (let j=0;j<i;j++) y[i]-=T[i][j]*y[j];
    y[i]/=T[i][i];
  }
  for (let i=y.length-1;i>=0;i--) {
    for (let j=i+1;j<y.length;j++) y[i]-=T[j][i]*y[j];
    y[i]/=T[i][i];
  }
  return y.map((v,i)=>v/D[i]);
}

function roots(a,b,c) {
  const scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c));
  if (!(scale>0)) return [];
  a/=scale; b/=scale; c/=scale;
  if (Math.abs(a)<1e-13) return Math.abs(b)>1e-13 ? [-c/b] : [];
  const discr=b*b-4*a*c;
  if (discr<0) return [];
  const q=-.5*(b+(b<0?-1:1)*Math.sqrt(discr));
  return q===0?[0]:[q/a,c/q];
}

function stations(el, d) {
  const { L,c,s,gr,truss,EI,axial,strain,k,f,q0,q1 } = el;
  const u = el.released(product(el.t,el.map.map(i=>d[i])));
  const end = product(k,u).map((v,i)=>v-f[i]);
  const points = el.points.map(p=>({ ...p,x:p.x*L })).sort((a,b)=>a.x-b.x);
  const dq = q1.map((q,i)=>(q-q0[i])/L);
  const at = (x, right = true) => {
    let force=-end[0]-q0[0]*x-dq[0]*x*x/2;
    let V=end[1]+q0[1]*x+dq[1]*x*x/2, M=-end[2]+end[1]*x+q0[1]*x*x/2+dq[1]*x**3/6;
    let stretch=-end[0]*x-q0[0]*x*x/2-dq[0]*x**3/6;
    let deflect=-end[2]*x*x/2+end[1]*x**3/6+q0[1]*x**4/24+dq[1]*x**5/120;
    for (const {x:p,p:[p0,pv,pm]} of points) {
      if (x<p || (x===p && !right)) break;
      const h=x-p;
      force-=p0; V+=pv; M+=pv*h-pm;
      stretch-=p0*h; deflect+=pv*h**3/6-pm*h*h/2;
    }
    const axialD=u[0]+strain*x+stretch/axial;
    const v=truss ? u[1]+(u[4]-u[1])*x/L : u[1]+u[2]*x+deflect/EI;
    return { x, side: right?'dir':'esq', N:gr?null:force, V:truss?null:V, M:truss?null:M, T:gr?force:null,
      dx:gr?null:c*axialD-s*v, dy:gr?null:s*axialD+c*v, dz:gr?v:null, twist:gr?axialD:null };
  };
  const boundaries = [...new Set([0,...points.map(p=>p.x),L])];
  const critical = new Set(Array.from({length:41},(_,i)=>L*(i/40)));
  boundaries.forEach(x=>critical.add(x));
  for (let j=1;j<boundaries.length;j++) {
    const lo=boundaries[j-1], hi=boundaries[j];
    const intercept=end[1]+points.reduce((sum,p)=>sum+(p.x<=lo?p.p[1]:0),0);
    for (const x of [...roots(dq[1]/2,q0[1],intercept),...roots(0,dq[0],q0[0]),...roots(0,dq[1],q0[1])])
      if (x>lo && x<hi) critical.add(x);
  }
  const hasPoint = new Set(points.map(p=>p.x));
  const rows = [...critical].sort((x,y)=>x-y).flatMap(x=>hasPoint.has(x)?[at(x,false),at(x)]:[at(x)]);
  require(rows.every(row => Object.values(row).every(x => typeof x!=='number' || Number.isFinite(x))),
    `Resultado fora da faixa numérica em ${el.b.id}.`);
  return { id:el.b.id, a:el.b.a, b:el.b.b, type:el.b.type, length:L, c,s, end, at, rows };
}

export function solveStructure(model, weights) {
  const id = validateModel(model), n = model.nodes.length*3;
  require(model.members.length>0,'Desenhe pelo menos uma barra antes de calcular.');
  const factors = new Map(Object.entries(weights ?? {[model.cases[0].id]:1}));
  require(factors.size>0 && [...factors].every(([key,v])=>id.cases.has(key) && valid(v,-100,100)) &&
    [...factors.values()].some(v=>v!==0), 'Informe fatores de combinação entre −100 e 100 e pelo menos um fator diferente de zero.');
  const A=matrix(n), F=zeros(n), U=zeros(n), applied=zeros(n), active=Array(n).fill(false);
  const linked = new Set();
  const loadsByMember = model.members.map(()=>({q0:[0,0],q1:[0,0],points:[],delta:0}));
  for (const l of model.loads) {
    const w=factors.get(l.case)??0;
    if (!w) continue;
    if (l.kind==='nodal' || l.kind==='settlement') {
      const i=id.nodes.get(l.at)*3, dst=l.kind==='nodal'?applied:U;
      l.p.forEach((v,j)=>{ dst[i+j]+=w*v; });
      continue;
    }
    const load=loadsByMember[id.members.get(l.at)];
    if (l.kind==='line') l.start.forEach((v,j)=>{ load.q0[j]+=w*v; load.q1[j]+=w*l.end[j]; });
    if (l.kind==='thermal') load.delta+=w*l.delta;
    if (l.kind==='point') load.points.push({x:l.station,p:l.p.map(v=>v*w)});
  }
  const elems=model.members.map((b,i)=>element(b,model,id,loadsByMember[i]));
  for (const e of elems) {
    const {b,map,K,F:f} = e;
    linked.add(b.a); linked.add(b.b);
    map.forEach((d,i)=>{
      if (id.gr || i%3!==2 || (b.type==='frame' && !b.release[Math.floor(i/3)])) active[d]=true;
      F[d]+=f[i];
      map.forEach((t,j)=>{ A[d][t]+=K[i][j]; });
    });
  }
  const free=[];
  for (let i=0;i<n;i++) {
    const node=model.nodes[Math.floor(i/3)], fixed=node.fix[i%3];
    require(linked.has(node.id), `O nó ${node.id} está isolado. Conecte uma barra ou remova o nó.`);
    require(active[i] || (applied[i]===0 && U[i]===0), `A ação em ${node.id} exige um grau de liberdade que não existe nas suas barras.`);
    F[i]+=applied[i];
    if (active[i] && !fixed) free.push(i);
  }
  const b=free.map(i=>F[i]-A[i].reduce((sum,v,j)=>sum+v*U[j],0));
  cholesky(A,b,free,model.nodes).forEach((v,i)=>{ U[free[i]]=v; });
  const r=product(A,U).map((v,i)=>v-F[i]);
  require(U.every(Number.isFinite) && r.every(Number.isFinite), 'Resultado fora da faixa numérica.');
  for (const i of free) {
    const scale=Math.max(1, Math.abs(F[i]), A[i].reduce((sum,v,j)=>sum+Math.abs(v*U[j]),0));
    require(Math.abs(r[i])<=1e-8*scale, 'O equilíbrio numérico não foi confirmado. Confira propriedades e apoios.');
    r[i]=0;
  }
  return {
    kind:model.kind, weights:Object.fromEntries(factors),
    nodes:model.nodes.map((p,i)=>({id:p.id,d:U.slice(3*i,3*i+3),r:r.slice(3*i,3*i+3),active:active.slice(3*i,3*i+3)})),
    members:elems.map(el=>stations(el,U)),
  };
}
