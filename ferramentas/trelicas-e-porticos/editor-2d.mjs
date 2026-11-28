import { LIMITS, SECTION, solveStructure, validateModel } from './estrutura-2d.mjs';
import { LABELS, diagramKinds, displaySVG, number, resultCSV, resultSVG } from './diagramas-2d.mjs';

const root = document.querySelector('[data-estrutura-2d]');
const empty = kind => ({ version:1, kind, nodes:[], members:[], cases:[{id:'C1',name:'Permanente'}], loads:[] });
const frameAxes=['ux (mm)','uy (mm)','rz (mrad)'];
const gridAxes=['uz (mm)','rx (mrad)','ry (mrad)'];
const reactionAxes={ frame:['Rx (kN)','Ry (kN)','Mz (kN·m)'],grillage:['Rz (kN)','Mx (kN·m)','My (kN·m)'] };
const node = (id,x,y,fix=[false,false,false]) => ({id,x,y,fix});
const member = (id,a,b,type) => ({id,a,b,type,section:{...SECTION},release:[false,false]});
const nextId = (list,prefix) => { let i=1; while(list.some(x=>x.id===prefix+i)) i++; return prefix+i; };

function example(type) {
  const m=empty(type==='grillage'?'grillage':'frame');
  if (type==='grillage') {
    m.nodes=[node('N1',0,0,[true,true,true]),node('N2',4,0),node('N3',4,3)];
    m.members=[member('B1','N1','N2','grillage'),member('B2','N2','N3','grillage')];
    m.loads=[{id:'A1',case:'C1',at:'N3',kind:'nodal',p:[-10,0,0]}];
  } else if (type==='truss') {
    m.nodes=[node('N1',0,0,[true,true,false]),node('N2',4,0,[false,true,false]),node('N3',2,3)];
    m.members=[member('B1','N1','N2','truss'),member('B2','N1','N3','truss'),member('B3','N2','N3','truss')];
    m.loads=[{id:'A1',case:'C1',at:'N3',kind:'nodal',p:[0,-30,0]}];
  } else {
    m.nodes=[node('N1',0,0,[true,true,true]),node('N2',0,3),node('N3',5,3),node('N4',5,0,[true,true,true])];
    m.members=[member('B1','N1','N2','frame'),member('B2','N2','N3','frame'),member('B3','N4','N3','frame')];
    m.loads=[{id:'A1',case:'C1',at:'B2',kind:'line',start:[0,-10],end:[0,-10]}];
  }
  return m;
}

const el = (tag,text,attrs={}) => {
  const n=document.createElement(tag);
  if (text!==null) n.textContent=text;
  Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));
  return n;
};
const opt = (v,t) => el('option',t,{value:v});
const label = (text,input) => { const l=el('label',text); l.append(input); return l; };
const num = (name,t,value,min,max) => {
  const n=el('input',null,{type:'number',name,step:'any',required:'',value});
  if (min!==undefined) n.min=min;
  if (max!==undefined) n.max=max;
  return label(t,n);
};
const choice = (name,t,items,value) => {
  const q=el('select',null,{name}); q.append(...items.map(([v,l])=>opt(v,l)));
  if (value!==undefined) q.value=value;
  return label(t,q);
};
const check = (name,text,value) => {
  const n=el('input',null,{type:'checkbox',name}); n.checked=value;
  const l=label(text,n); l.className='s2d-check'; return l;
};
const button = (name,click,attrs={}) => {
  const n=el('button',name,{type:'button',...attrs}); n.addEventListener('click',click); return n;
};
const axisTitle = gr => gr?'Z vertical; X e Y no plano da grelha.':'X para a direita, Y para cima e Mz anti-horário positivo.';
const saveFile = (file,name) => {
  const a=el('a',null,{href:URL.createObjectURL(file),download:name}); document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
const find = (list,id) => list.find(x=>x.id===id);

if (root) mount();

function mount() {
  root.innerHTML=`
    <div class="s2d-heading"><div><h2>Editor gráfico</h2><p>Desenhe as barras, escolha apoios e cargas e confira os diagramas.</p></div>
      <label>Exemplos <select data-s2d-example><option value="">Escolha um exemplo</option><option value="frame">Pórtico</option><option value="truss">Treliça</option><option value="grillage">Grelha com torção</option></select></label>
    </div>
    <div class="s2d-toolbar" aria-label="Ferramentas de desenho">
      <button type="button" data-mode="select" aria-pressed="true">Selecionar / mover nó</button>
      <button type="button" data-mode="draw" aria-pressed="false">Desenhar barra</button>
      <button type="button" data-mode="pan" aria-pressed="false">Mover vista</button>
      <button type="button" data-do="undo" disabled>Desfazer</button>
      <button type="button" data-do="redo" disabled>Refazer</button>
      <button type="button" data-do="fit">Enquadrar</button>
      <button type="button" data-do="zoom-in" aria-label="Ampliar vista">+</button>
      <button type="button" data-do="zoom-out" aria-label="Reduzir vista">−</button>
      <label>Passo <select data-s2d-grid><option value="0.25">0,25 m</option><option value="0.5" selected>0,5 m</option><option value="1">1 m</option><option value="0">Livre</option></select></label>
      <label data-s2d-draw-type-wrap>Próxima barra <select data-s2d-draw-type><option value="frame">Pórtico</option><option value="truss">Treliça</option></select></label>
    </div>
    <div class="s2d-workspace">
      <div class="s2d-drawing">
        <svg data-s2d-canvas tabindex="0" role="img" aria-label="Desenho da estrutura no plano XY" aria-describedby="s2d-canvas-help"></svg>
        <p class="s2d-hint" data-s2d-hint></p>
        <p id="s2d-canvas-help">Barras tracejadas pertencem à treliça. O desenho mostra as ações do caso ativo. Use também a lista de elementos ou as coordenadas.</p>
        <p data-s2d-count></p>
      </div>
      <section class="s2d-inspector" aria-labelledby="s2d-inspector-title">
        <h3 id="s2d-inspector-title">Editar estrutura</h3>
        <label>Nó ou barra <select data-s2d-selection></select></label>
        <div data-s2d-inspector></div>
      </section>
    </div>
    <details class="s2d-details"><summary>Coordenadas, arquivos e novo modelo</summary><div data-s2d-project></div></details>
    <div class="s2d-compute">
      <div data-s2d-cases></div>
      <button class="button button-primary" type="button" data-do="solve">Calcular estrutura</button>
    </div>
    <p class="s2d-status" data-s2d-status role="status" aria-live="polite"></p>
    <section data-s2d-results aria-label="Resultados e diagramas" hidden></section>`;
  const $=s=>root.querySelector(s);
  const canvas=$('[data-s2d-canvas]'), pick=$('[data-s2d-selection]'), inspector=$('[data-s2d-inspector]');
  const project=$('[data-s2d-project]'), casePanel=$('[data-s2d-cases]'), results=$('[data-s2d-results]');
  const status=$('[data-s2d-status]'), hint=$('[data-s2d-hint]'), grid=$('[data-s2d-grid]'), drawType=$('[data-s2d-draw-type]');
  let model=example('frame'), sel=null, mode='select', cas='C1', combination=false, factors={}, diagram='M';
  let solved=null, exportRequest=null, exportBusy=false, dirty=false, editedLoad=null, readSequence=0, importing=false;
  let view={x:-1,y:-1,w:8,h:6}, anchor=null, preview=null, gesture=null, raf=0;
  const past=[],future=[];
  const gr=()=>model.kind==='grillage';
  const newBarType=()=>gr()?'grillage':drawType.value;
  const setBarType=()=>{ drawType.value=model.members.length&&model.members.every(b=>b.type==='truss')?'truss':'frame'; };
  const factor = id => Object.hasOwn(factors,id)?factors[id]:(id===cas?1:0);
  const snapshotState = () => ({model,cas,combination,factors:{...factors}});
  const unit = () => 1/(canvas.getScreenCTM()?.a||50);
  const current = () => !dirty && solved;
  const report = (s,error=false) => { status.textContent=s; status.toggleAttribute('data-error',error); };
  const cancelPending = () => { anchor=null; preview=null; gesture=null; };
  const invalidate = () => { solved=null; exportRequest=null; results.hidden=true; results.replaceChildren(); };
  const edited = () => {
    readSequence++; importing=false;
    if (!dirty) { dirty=true; results.hidden=true; report('Aplique a edição antes de calcular ou exportar.'); }
  };
  const form = (fields,name,commit) => {
    const f=el('form',null,{class:'s2d-form'});
    const controls=el('div',null,{class:'s2d-fields'});
    controls.append(...fields); f.append(controls,el('button',name,{type:'submit'}));
    f.addEventListener('input',edited);
    f.addEventListener('submit',event=>{
      event.preventDefault();
      try { commit(f.elements, new FormData(f)); } catch(e) { report(e.message,true); }
    });
    return f;
  };
  const quantity = (es,n) => {
    const value=es.namedItem(n).valueAsNumber;
    if (!Number.isFinite(value)) throw new RangeError('Preencha os valores numéricos indicados.');
    return value;
  };
  function change(updater,message,after) {
    if (exportBusy) { report('Aguarde a confirmação da exportação.'); return false; }
    try {
      const draft=structuredClone(model); updater(draft); validateModel(draft);
      past.push(snapshotState()); if (past.length>50) past.shift();
      model=draft; future.length=0; invalidate(); dirty=false; editedLoad=null; readSequence++; importing=false;
      after?.(); render();
      report(message); return true;
    } catch(e) { report(e.message,true); return false; }
  }
  function restore(from,to) {
    if (!from.length || exportBusy) return;
    to.push(snapshotState());
    ({model,cas,combination,factors}=from.pop());
    sel=null; dirty=false; editedLoad=null; readSequence++; importing=false; cancel(); invalidate(); fit(); setBarType(); render();
    report('Alteração desfeita ou refeita. Calcule novamente.');
  }
  function fit() {
    const xs=model.nodes.map(n=>n.x),ys=model.nodes.map(n=>n.y);
    const x=xs.length?Math.min(...xs):-1, y=ys.length?Math.min(...ys):-1;
    const gx=xs.length?Math.max(...xs)-x:6,gy=ys.length?Math.max(...ys)-y:4;
    const w=Math.max(gx,3),h=Math.max(gy,2.5),pad=Math.max(.85, .17*Math.max(w,h));
    view={x:x+(gx-w)/2-pad,y:y+(gy-h)/2-pad,w:w+2*pad,h:h+2*pad};
    setView();
  }
  function setView() { canvas.setAttribute('viewBox',`${view.x} ${-view.y-view.h} ${view.w} ${view.h}`); paint(); }
  function zoom(r) {
    const w=view.w*r,h=view.h*r;
    if (w<.025 || h<.025 || Math.max(w,h)>30000) return;
    view={x:view.x+(view.w-w)/2,y:view.y+(view.h-h)/2,w,h}; setView();
  }
  function modeSet(v) {
    mode=v; cancelPending(); canvas.dataset.anchored='false';
    root.querySelectorAll('button[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    canvas.dataset.mode=v; paint(); renderHint();
  }
  function renderHint() {
    hint.textContent=mode==='draw' ? (anchor?'Toque no destino para terminar a barra. Esc cancela.':'Arraste entre dois pontos ou toque no início e no fim. Encoste num nó ou numa barra para emendar.') :
      mode==='pan'?'Arraste para mover a vista. Use Enquadrar para voltar ao modelo.':'Clique num nó ou numa barra para editar. Arraste um nó para mudar sua posição.';
  }
  function coords(evt) {
    const m=canvas.getScreenCTM();
    if (!m) return [0,0];
    const p=new DOMPoint(evt.clientX,evt.clientY).matrixTransform(m.inverse());
    return [p.x,-p.y];
  }
  function nearest(p,d=model,{nodes=true,bars=true}={}) {
    const u=unit();
    let best=null, dist=15*u;
    if (nodes) for (const n of d.nodes) {
      const g=Math.hypot(n.x-p[0],n.y-p[1]);
      if(g<dist) { dist=g; best={key:n.id,x:n.x,y:n.y}; }
    }
    if (best || !bars) return best;
    for(const b of d.members) {
      const a=find(d.nodes,b.a), z=find(d.nodes,b.b), x=z.x-a.x,y=z.y-a.y;
      const t=((p[0]-a.x)*x+(p[1]-a.y)*y)/(x*x+y*y);
      if (!(t>1e-5&&t<1-1e-5)) continue;
      const px=a.x+t*x,py=a.y+t*y,g=Math.hypot(px-p[0],py-p[1]);
      if (g<dist) { dist=g; best={bar:b.id,t,x:px,y:py}; }
    }
    return best;
  }
  function snap(p,nodes=true) {
    const found=nearest(p,model,{nodes,bars:nodes});
    if (found) return found;
    const step=Number(grid.value);
    return {x:step?Math.round(p[0]/step)*step:p[0],y:step?Math.round(p[1]/step)*step:p[1]};
  }
  function split(d,b,t,at) {
    const a=find(d.nodes,b.a), z=find(d.nodes,b.b);
    const id=nextId([...d.nodes,...d.members],'B'), oldEnd=b.b, oldRelease=b.release[1];
    b.b=at; b.release[1]=false;
    d.members.push({ ...structuredClone(b),id,a:at,b:oldEnd,release:[false,oldRelease] });
    const L=Math.hypot(z.x-a.x,z.y-a.y), c=(z.x-a.x)/L,s=(z.y-a.y)/L;
    for (const l of d.loads.filter(v=>v.at===b.id && !['nodal','settlement'].includes(v.kind))) {
      if(l.kind==='line') {
        const mid=l.start.map((v,i)=>v+t*(l.end[i]-v));
        d.loads.push({...structuredClone(l),id:nextId(d.loads,'A'),at:id,start:mid}); l.end=mid;
      } else if(l.kind==='thermal') d.loads.push({...l,id:nextId(d.loads,'A'),at:id});
      else if(l.kind==='point') {
        const left=l.station<t, atEnd=left?l.station/t:(l.station-t)/(1-t);
        if (Math.abs(l.station-t)<=1e-8 || (left?atEnd>.999999:atEnd<.000001)) {
          const [p0,p1,p2]=l.p;
          l.at=at; l.kind='nodal'; delete l.station;
          l.p=d.kind==='grillage'?[p1,c*p0+s*p2,s*p0-c*p2]:[c*p0-s*p1,s*p0+c*p1,p2];
        } else { l.station=atEnd; if(!left) l.at=id; }
      }
    }
  }
  function endpoint(d,p) {
    const existing=d.nodes.find(n=>Math.hypot(n.x-p.x,n.y-p.y)<LIMITS.length);
    if (existing) return existing.id;
    const at=nextId([...d.nodes,...d.members],'N');
    d.nodes.push(node(at,p.x,p.y));
    // The first endpoint can have divided the member of the second endpoint.
    if (p.bar) {
      const candidates = d.members.map(b=>{
        const a=find(d.nodes,b.a), z=find(d.nodes,b.b), x=z.x-a.x,y=z.y-a.y;
        const t=((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y);
        return { b,t,gap:Math.hypot(a.x+t*x-p.x,a.y+t*y-p.y) };
      }).filter(h=>h.t>0 && h.t<1 && h.gap<1e-7);
      const hit=candidates.find(h=>h.b.id===p.bar)??candidates[0];
      if (hit) split(d,hit.b,hit.t,at);
    }
    return at;
  }
  function addBar(p,z) {
    if(Math.hypot(p.x-z.x,p.y-z.y)<LIMITS.length) { report('Escolha um destino diferente para a barra.',true); return; }
    let chosen;
    change(d=>{
      const i=endpoint(d,p),j=endpoint(d,z); chosen=nextId([...d.nodes,...d.members],'B');
      d.members.push(member(chosen,i,j,newBarType()));
    },'Barra adicionada. Emendas no mesmo nó compartilham os deslocamentos.',()=>{ sel=chosen; });
  }
  function paint() {
    const u=unit(), g=Number(grid.value), base=g||.5;
    const stride=base*Math.max(1,2**Math.ceil(Math.log2(12*u/base)));
    const x0=view.x,y0=view.y,x1=x0+view.w,y1=y0+view.h;
    const parts=[];
    for (let x=Math.ceil(x0/stride)*stride,i=0;x<=x1&&i<160;x+=stride,i++) parts.push(`M ${x} ${-y0} V ${-y1}`);
    for (let y=Math.ceil(y0/stride)*stride,i=0;y<=y1&&i<160;y+=stride,i++) parts.push(`M ${x0} ${-y} H ${x1}`);
    const layer=[`<path class="s2d-grid" d="${parts.join(' ')}"/>`,
      `<path class="s2d-axes" d="M ${x0} 0 H ${x1} M 0 ${-y0} V ${-y1}"/>`];
    const nodes=new Map(model.nodes.map(n=>[n.id,preview?.move===n.id?{...n,x:preview.x,y:preview.y}:n]));
    const line=(a,b,style)=>`<line class="${style}" x1="${a.x}" y1="${-a.y}" x2="${b.x}" y2="${-b.y}"/>`;
    const txt=(x,y,t,css='')=>`<text x="${x}" y="${-y}" font-size="${u*12}" class="${css}">${t}</text>`;
    for (const b of model.members) {
      const a=nodes.get(b.a),z=nodes.get(b.b), L=Math.hypot(z.x-a.x,z.y-a.y)||1;
      layer.push(line(a,z,'s2d-member'+(b.type==='truss'?' s2d-truss':'')+(sel===b.id?' s2d-active':'')));
      layer.push(txt((a.x+z.x)/2+6*u,(a.y+z.y)/2+10*u,b.id,'s2d-id'));
      for(let i=0;i<2;i++) if(b.release[i]) {
        const t=(i?1:-1)*Math.min(.1,10*u/L);
        const x=(i?z.x:a.x)-t*(z.x-a.x), y=(i?z.y:a.y)-t*(z.y-a.y);
        layer.push(`<circle class="s2d-hinge" cx="${x}" cy="${-y}" r="${u*4}"/>`);
      }
    }
    for (const n of nodes.values()) {
      if (n.fix.some(Boolean)) {
        const {x,y}=n, k=8*u;
        const glyph=n.fix.every(Boolean)?`M ${x-k} ${-y+k} H ${x+k} M ${x} ${-y} V ${-y+k}`:
          `M ${x} ${-y} l ${-k} ${k} h ${2*k} z`;
        layer.push(`<path class="s2d-support" d="${glyph}"/>`);
      }
      layer.push(`<circle class="s2d-node${n.id===sel?' s2d-active':''}" cx="${n.x}" cy="${-n.y}" r="${4*u}"/>`);
      layer.push(txt(n.x+9*u,n.y-11*u,n.id,'s2d-id'));
    }
    const arrow=(x,y,fx,fy)=>{
      const h=Math.hypot(fx,fy); if (!h) return '';
      const a=fx/h,b=fy/h,k=21*u,l=7*u;
      return `<path class="s2d-force" d="M ${x-a*k} ${-y+b*k} L ${x} ${-y}
        m ${-l*a-l*b*.55} ${l*b-l*a*.55} L ${x} ${-y}
        l ${-l*a+l*b*.55} ${l*b+l*a*.55}"/>`;
    };
    for (const l of model.loads.filter(v=>v.case===cas)) {
      if (l.kind==='nodal'||l.kind==='settlement') {
        const n=nodes.get(l.at);
        if (l.kind==='nodal'&&!gr()) layer.push(arrow(n.x,n.y,l.p[0],l.p[1]));
        const t=l.kind==='settlement'?'Δ':gr()?(l.p[0]<0?'⊗':l.p[0]>0?'⊙':'M'):l.p[2]?'M':'F';
        layer.push(txt(n.x-14*u,n.y+10*u,t,'s2d-load-label'));
      } else {
        const b=find(model.members,l.at),a=nodes.get(b.a),z=nodes.get(b.b);
        const t=l.kind==='point'?l.station:.5;
        layer.push(txt(a.x+t*(z.x-a.x),a.y+t*(z.y-a.y)+25*u,
          l.kind==='line'?'q':l.kind==='point'?'P':'ΔT','s2d-load-label'));
        if (l.kind==='line'&&!gr()) {
          const dx=z.x-a.x,dy=z.y-a.y;
          for(const t of [.2,.5,.8]) {
            const q=l.start.map((v,i)=>v+t*(l.end[i]-v));
            layer.push(arrow(a.x+t*dx,a.y+t*dy,dx*q[0]-dy*q[1],dy*q[0]+dx*q[1]));
          }
        }
      }
    }
    if (anchor&&preview&&!preview.move) layer.push(line(anchor,preview,'s2d-ghost'));
    if(anchor) layer.push(`<circle class="s2d-anchor" cx="${anchor.x}" cy="${-anchor.y}" r="${7*u}"/>`);
    if(preview&&!preview.move) layer.push(`<circle class="s2d-aim" cx="${preview.x}" cy="${-preview.y}" r="${6*u}"/>`);
    canvas.innerHTML=layer.join('');
  }
  function redraw() { if (!raf) raf=requestAnimationFrame(()=>{ raf=0; paint(); }); }
  canvas.addEventListener('pointerdown',e=>{
    if (e.button!==0 || gesture || exportBusy) return;
    canvas.focus({preventScroll:true});
    const p=coords(e), px=[e.clientX,e.clientY];
    const target=nearest(p);
    if (mode==='draw'&&!anchor) anchor=snap(p);
    preview=mode==='draw'?snap(p):null;
    gesture={id:e.pointerId,px,p,target,moved:false,wasAnchored:mode==='draw'&&canvas.dataset.anchored==='true',view:{...view}};
    canvas.setPointerCapture(e.pointerId); redraw();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!gesture&&mode!=='draw')return;
    if(gesture&&gesture.id!==e.pointerId)return;
    const p=coords(e);
    if(gesture) {
      gesture.moved ||= Math.hypot(e.clientX-gesture.px[0],e.clientY-gesture.px[1])>5;
      if (mode==='pan'&&gesture.moved) {
        const x=(e.clientX-gesture.px[0])*unit(),y=(e.clientY-gesture.px[1])*unit();
        view={...gesture.view,x:gesture.view.x-x,y:gesture.view.y+y}; setView(); return;
      }
      if(mode==='select'&&gesture.moved&&gesture.target?.key) preview={...snap(p,false),move:gesture.target.key};
    }
    if(mode==='draw') preview=snap(p);
    redraw();
  });
  canvas.addEventListener('pointerup',e=>{
    if (gesture?.id!==e.pointerId) return;
    const g=gesture; gesture=null; const p=coords(e);
    g.moved ||= Math.hypot(e.clientX-g.px[0],e.clientY-g.px[1])>5;
    if(mode==='draw') {
      if (g.moved||g.wasAnchored) {
        const origin=anchor; anchor=null; preview=null; canvas.dataset.anchored='false'; addBar(origin,snap(p));
      } else { canvas.dataset.anchored='true'; renderHint(); }
    } else if (mode==='select') {
      if (g.moved&&g.target?.key) {
        const pt=snap(p,false);
        preview=null;
        change(d=>Object.assign(find(d.nodes,g.target.key),pt),'Nó movido.',()=>{ sel=g.target.key; });
      } else { const t=nearest(p); select(t?.key??t?.bar??null); }
    }
    redraw(); renderHint();
  });
  const cancel = () => { cancelPending(); canvas.dataset.anchored='false'; paint(); renderHint(); };
  canvas.addEventListener('pointercancel',cancel);
  canvas.addEventListener('lostpointercapture',()=>{ if(gesture) cancel(); });
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape')cancel();
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.target.matches('input,select,textarea')) {
      e.preventDefault(); e.shiftKey?restore(future,past):restore(past,future);
    }
  });

  function select(value) {
    sel=value; editedLoad=null;
    if(dirty) { dirty=false; if(solved) renderResults(); }
    renderInspector(); paint();
  }
  pick.addEventListener('change',()=>select(pick.value||null));
  const title = (str) => el('h4',str);
  const tip = (str) => el('p',str,{class:'s2d-hint'});
  const components = (axis,p,kind) => {
    const scale=kind==='settlement'?1000:1;
    return axis.map((n,i)=>num('v'+i,n,(p?.[i]??0)*scale));
  };
  function shortAction(l) {
    const fmt=list=>list.map(v=>number(v)).join(' / ');
    if(l.kind==='line')return `Linha ${fmt(l.start)} → ${fmt(l.end)}`;
    if(l.kind==='point')return `Pontual em ${number(l.station*100)}% · ${fmt(l.p)}`;
    if(l.kind==='thermal')return `ΔT ${number(l.delta)} °C`;
    if(l.kind==='settlement')return `Imposto ${fmt(l.p.map(v=>1000*v))} mm / mrad`;
    return `Nodal ${fmt(l.p)}`;
  }
  function actionPanel(entity,b) {
    const wrapper=el('div',null,{class:'s2d-actions'});
    wrapper.append(title(`Ações de ${entity.id}`),tip('Caso ativo: '+find(model.cases,cas)?.name+'.'));
    for(const l of model.loads.filter(v=>v.at===entity.id&&v.case===cas)) {
      const row=el('div',null,{class:'s2d-action-row'});
      row.append(el('span',shortAction(l)),button('Editar',()=>{editedLoad=l;renderInspector();},{'aria-label':`Editar ação ${l.id}`}),
        button('Excluir',()=>change(d=>{d.loads=d.loads.filter(v=>v.id!==l.id);},'Ação excluída.'),{'aria-label':`Excluir ação ${l.id}`}));
      wrapper.append(row);
    }
    const types=b?(b.type==='truss'?[['thermal','Temperatura uniforme']]:
      [['line','Distribuída linear'],['point','Pontual na barra'],...(!gr()?[['thermal','Temperatura uniforme']]:[])]) :
      [['nodal','Forças e momentos'],['settlement','Recalques e giros impostos']];
    const add=el('div',null), kindChoice=choice('action','Tipo de ação',types,editedLoad?.kind);
    wrapper.append(kindChoice,add);
    const renderAction=()=>{
      const kind=kindChoice.lastElementChild.value, l=editedLoad?.kind===kind?editedLoad:null, f=gr();
      const nodal=f?['Fz (kN)','Mx (kN·m)','My (kN·m)']:['Fx (kN)','Fy (kN)','Mz (kN·m)'];
      const local=f?['T local (kN·m)','Fz (kN)','Mf local (kN·m)']:['Fx local (kN)','Fy local (kN)','Mz (kN·m)'];
      const line=f?['t (kN·m/m)','qz (kN/m)']:['qx local (kN/m)','qy local (kN/m)'];
      let inputs=kind==='line'?line.flatMap((nm,i)=>[num('a'+i,nm+' em i',l?.start[i]??0),num('b'+i,nm+' em j',l?.end[i]??0)]) :
        kind==='thermal'?[num('delta','Variação uniforme ΔT (°C)',l?.delta??0,-1500,1500)] :
        kind==='point'?[num('station','Posição desde i (% do vão)',(l?.station??.5)*100,.0001,99.9999),...components(local,l?.p,kind)] :
        components(kind==='nodal'?nodal:f?gridAxes:frameAxes,l?.p,kind);
      const note=kind==='line'||kind==='point' ? (f?'Em i → j, t ou T gira em torno da barra. Mf positivo atua no sentido da inclinação dz/dx.':
        'Eixo x local aponta de i para j. Eixo y local fica à esquerda desse percurso.') :
        kind==='settlement'?'Os movimentos impostos exigem o grau de liberdade restringido no apoio.':'';
      const addAction=form(inputs,l?'Aplicar ação':'Adicionar ação',(es)=>{
        const n=k=>quantity(es,k);
        change(d=>{
          const v={id:l?.id??nextId(d.loads,'A'),case:cas,at:entity.id,kind};
          if(kind==='line') {v.start=[n('a0'),n('a1')];v.end=[n('b0'),n('b1')];}
          else if(kind==='thermal') v.delta=n('delta');
          else {
            v.p=[n('v0'),n('v1'),n('v2')].map(x=>kind==='settlement'?x/1000:x);
            if(kind==='point') v.station=n('station')/100;
          }
          if(l) d.loads[d.loads.findIndex(row=>row.id===l.id)]=v; else d.loads.push(v);
        },l?'Ação atualizada.':'Ação adicionada.');
      });
      add.replaceChildren(...(note?[tip(note),addAction]:[addAction]));
    };
    kindChoice.addEventListener('change',renderAction); renderAction(); return wrapper;
  }
  function renderInspector() {
    const n=find(model.nodes,sel),b=find(model.members,sel);
    if(sel&&!n&&!b)sel=null;
    pick.replaceChildren(opt('','Selecione no desenho ou na lista'),...model.nodes.map(p=>opt(p.id,`${p.id} · nó`)),
      ...model.members.map(p=>opt(p.id,`${p.id} · ${p.a} → ${p.b}`)));
    pick.value=sel??'';
    if(!n&&!b){ inspector.replaceChildren(tip('Escolha um nó para definir seus apoios e cargas ou uma barra para editar suas propriedades e ações.'),tip(axisTitle(gr()))); return; }
    if (n) {
      const fields=[num('x','X (m)',n.x),num('y','Y (m)',n.y)];
      const f=gr(), axes=f?gridAxes:frameAxes;
      const preset=choice('s','Pré-ajuste de apoio',[[0,'Personalizado'],[1,'Livre'],[2,'Engaste'],[3,'Articulado'],...(f?[]:[[4,'Rolete em Y'],[5,'Rolete em X']])],0);
      const fixed=axes.map((v,i)=>check('fix'+i,'Restringir '+v.split(' ')[0],n.fix[i]));
      const patterns={1:[false,false,false],2:[true,true,true],3:f?[true,false,false]:[true,true,false],4:[false,true,false],5:[true,false,false]};
      preset.addEventListener('change',()=>{
        const values=patterns[preset.lastElementChild.value]; if (!values) return;
        fixed.forEach((l,i)=>{ l.lastElementChild.checked=values[i]; });
      });
      inspector.replaceChildren(title(n.id+' · nó e apoio'),form([...fields,preset,...fixed],'Aplicar nó e apoio',(es)=>{
        change(d=>{
          const p=find(d.nodes,n.id); p.x=quantity(es,'x');p.y=quantity(es,'y');p.fix=fixed.map(l=>l.lastElementChild.checked);
        },'Nó e apoio atualizados.');
      }),actionPanel(n,false));
    } else {
      const entries=[['E','E (GPa)'],...(gr()?[['I','I à flexão (cm⁴)'],['G','G (GPa)'],['J','J de torção (cm⁴)']]:
        [['A','Área (cm²)'],['I','I à flexão (cm⁴)'],['alpha','α (µm/m·°C)']])];
      const fields=[...(!gr()?[choice('type','Tipo de barra',[['frame','Pórtico / viga / pilar'],['truss','Treliça: somente axial']],b.type)]:[]),
        ...entries.map(([key,label])=>num(key,label,b.section[key]??SECTION[key],key==='alpha'?0:.0001)),
        ...(!gr()?[check('ri','Rótula em i',b.release[0]),check('rj','Rótula em j',b.release[1])]:[])];
      inspector.replaceChildren(title(`${b.id} · ${b.a} → ${b.b}`),form(fields,'Aplicar barra',(es,data)=>{
        change(d=>{
          const m=find(d.members,b.id); m.type=gr()?'grillage':data.get('type');
          entries.forEach(([n])=>{m.section[n]=quantity(es,n);}); m.release=m.type==='frame'?[data.has('ri'),data.has('rj')]:[false,false];
        },'Barra atualizada.');
      }),actionPanel(b,true));
    }
    inspector.append(button(n?'Remover nó e barras ligadas':'Remover barra',()=>{
      change(d=>{
        const removed=new Set(n?[n.id,...d.members.filter(m=>m.a===n.id||m.b===n.id).map(m=>m.id)]:[b.id]);
        d.nodes=d.nodes.filter(v=>!removed.has(v.id)); d.members=d.members.filter(v=>!removed.has(v.id));
        d.loads=d.loads.filter(v=>!removed.has(v.at));
      },'Elemento removido. Use Desfazer para recuperar.',()=>{sel=null;});
    },{class:'s2d-remove'}));
  }
  function renderProject() {
    const file=el('input',null,{type:'file',accept:'.json,application/json'});
    file.addEventListener('change',async()=>{
      const seq=++readSequence; importing=true; invalidate();
      try {
        const source=file.files[0]; if(!source)return;
        if(source.size>512*1024)throw new Error('O arquivo de modelo excede 512 KB.');
        const raw=await source.text();
        if(seq!==readSequence)return;
        const incoming=JSON.parse(raw); validateModel(incoming);
        const {version,kind,nodes,members,cases,loads,analysis}=incoming;
        if(analysis!==undefined && (!analysis || !find(cases,analysis.case) || typeof analysis.combination!=='boolean' ||
          !analysis.factors || Object.entries(analysis.factors).some(([id,v])=>!find(cases,id)||!Number.isFinite(v)||Math.abs(v)>100))) {
          throw new Error('Confira o caso ativo e os fatores da combinação no arquivo.');
        }
        change(d=>Object.assign(d,{version,kind,nodes,members,cases,loads}),'Modelo carregado.',()=>{
          sel=null;cas=analysis?.case??model.cases[0].id;combination=analysis?.combination??false;factors=analysis?.factors??{};cancel();fit();setBarType();
        });
      } catch(e) { if(seq===readSequence)report('Não foi possível abrir o modelo. '+e.message,true); }
      finally { if(seq===readSequence)importing=false; }
    });
    const opts=model.nodes.map(n=>[n.id,`${n.id} (${number(n.x)}, ${number(n.y)})`]);
    const tools=el('div',null,{class:'s2d-toolbar'});
    tools.append(button('Salvar modelo JSON',()=>{
      const coefficients=model.cases.map(c=>[c.id,factor(c.id)]);
      if (combination&&coefficients.some(([,v])=>!Number.isFinite(v)||Math.abs(v)>100)) {
        report('Confira os fatores de combinação antes de salvar o modelo.',true); return;
      }
      const analysis={case:cas,combination,factors:combination?Object.fromEntries(coefficients):{}};
      saveFile(new Blob([JSON.stringify({...model,analysis},null,2)],{type:'application/json'}),'estrutura-2d.confenge.json');
    }),
      label('Abrir modelo JSON',file),button('Novo pórtico ou treliça',()=>reset(empty('frame'),'Novo modelo plano.')),
      button('Nova grelha',()=>reset(empty('grillage'),'Nova grelha.')));
    project.replaceChildren(tools,form([num('x','X (m)',0),num('y','Y (m)',0)],'Adicionar nó',(es)=>{
      let id;
      change(d=>{id=nextId([...d.nodes,...d.members],'N');d.nodes.push(node(id,quantity(es,'x'),quantity(es,'y')));},'Nó criado.',()=>{sel=id;fit();});
    }));
    if(opts.length>1) project.append(form([choice('i','Nó inicial',opts),choice('j','Nó final',opts,opts[1][0])],'Conectar nós',(_,data)=>{
      let id;
      change(d=>{id=nextId([...d.nodes,...d.members],'B');d.members.push(member(id,data.get('i'),data.get('j'),newBarType()));},'Barra conectada.',()=>{sel=id;});
    }));
  }
  function reset(value,s) {
    change(d=>Object.assign(d,value),s,()=>{sel=null;cas=model.cases[0].id;combination=false;factors={};cancel();fit();setBarType();});
  }
  function renderCases() {
    if(!find(model.cases,cas))cas=model.cases[0].id;
    const c=choice('c','Caso de carga ativo',model.cases.map(c=>[c.id,`${c.id} · ${c.name}`]),cas);
    c.addEventListener('change',()=>{cas=c.lastElementChild.value;dirty=false;readSequence++;importing=false;invalidate();render();report('Caso ativo: '+find(model.cases,cas).name+'.');});
    const set=check('combine','Combinar casos',combination);
    set.addEventListener('change',()=>{combination=set.lastElementChild.checked;invalidate();renderCases();});
    const newCase=el('details',null,{class:'s2d-case-edit'});
    newCase.append(el('summary','Adicionar caso de carga'),
      form([label('Nome do caso',el('input',null,{name:'caseName',type:'text',maxlength:'64',required:''}))],'Criar caso',(_,data)=>{
        let id;
        change(d=>{id=nextId(d.cases,'C');d.cases.push({id,name:String(data.get('caseName')).trim()});},'Caso criado.',()=>{cas=id;});
      }));
    casePanel.replaceChildren(c,set,newCase);
    if(combination) {
      const checkFactors=el('div',null,{class:'s2d-factors'});
      model.cases.forEach(c=>{
        const field=num(c.id,'Fator '+c.id,factor(c.id),-100,100);
        field.addEventListener('input',()=>{
          factors={...factors,[c.id]:field.lastElementChild.valueAsNumber};
          invalidate(); report('Combinação atualizada. Calcule para conferir os resultados.');
        });
        checkFactors.append(field);
      });
      casePanel.append(checkFactors);
    }
  }
  function table(header,rows,caption) {
    const wrap=el('div',null,{class:'s2d-table',tabindex:'0',role:'region','aria-label':caption});
    const t=el('table',null), head=el('thead',null), tr=el('tr',null);
    tr.append(...header.map(c=>el('th',c,{scope:'col'}))); head.append(tr); t.append(head);
    const body=el('tbody',null);
    rows.forEach(row=>{const tr=el('tr',null);tr.append(el('th',row[0],{scope:'row'}),...row.slice(1).map(s=>el('td',s)));body.append(tr);});
    t.append(body); wrap.append(t); return wrap;
  }
  function renderResults() {
    if(!current())return;
    const keys=diagramKinds(solved); if(!keys.includes(diagram)) diagram=keys[0];
    const picker=choice('diagram','Diagrama',keys.map(k=>[k,LABELS[k][0]]),diagram);
    picker.addEventListener('change',()=>{diagram=picker.lastElementChild.value;renderResults();results.querySelector('select')?.focus();});
    const figure=el('div',null,{class:'s2d-diagram',role:'region',tabindex:'0','aria-label':'Gráfico rolável'}); figure.innerHTML=displaySVG(model,solved,diagram);
    const controls=el('div',null,{class:'s2d-toolbar'});
    controls.append(picker,button('Baixar todos os diagramas em SVG',()=>exportFile('svg')),
      button('Baixar resultados em CSV',()=>exportFile('csv')));
    const ctrl=Object.entries(solved.weights).filter(([,v])=>v!==0).map(([id,v])=>number(v,4)+' × '+id).join(' + ');
    results.hidden=false;
    const supports=solved.nodes.filter(r=>find(model.nodes,r.id).fix.some(Boolean));
    const key=diagram, [name,u,note]=LABELS[key];
    const memberRows=solved.members.map(m=>{
      const values=m.rows.map(r=>key==='D'?1000*Math.hypot(r.dx,r.dy):key==='Z'?1000*r.dz:r[key]).filter(v=>v!==null);
      return [`${m.id} (${m.a} → ${m.b})`,values.length?number(Math.min(...values)):'·',values.length?number(Math.max(...values)):'·'];
    });
    results.replaceChildren(el('h3','Resultados'),tip('Análise elástica linear · combinação '+ctrl),controls,figure,tip(note),
      table(['Barra',`Mín. (${u})`,`Máx. (${u})`],memberRows,`${name} por barra`),title('Reações nos apoios'),
      table(['Nó',...reactionAxes[model.kind]],supports.map(n=>[n.id,...n.r.map((v,i)=>n.active[i]?number(v):'·')]),'Tabela de reações'),
      title('Deslocamentos e giros dos nós'),
      table(['Nó',...(gr()?gridAxes:frameAxes)],solved.nodes.map(n=>[n.id,...n.d.map((v,i)=>n.active[i]?number(v*1000):'·')]),'Tabela de deslocamentos e giros'));
  }
  function solve() {
    if(importing) { report('Aguarde a leitura do modelo.'); return; }
    if(dirty) { report('Aplique a edição em andamento antes de calcular.',true); return; }
    if(exportBusy)return;
    invalidate();
    try {
      const weights=combination?Object.fromEntries(model.cases.map(c=>[c.id,factor(c.id)])):{[cas]:1};
      solved=solveStructure(model,weights); renderResults(); report('Cálculo concluído. Diagramas e tabelas atualizados.');
    } catch(e) { report(e.message,true); }
  }
  async function exportFile(format) {
    if(!current()||exportBusy)return;
    try {
      const snapshot=solved; exportBusy=true;
      if(!exportRequest || exportRequest.format!==format) {
        const file=new Blob([format==='svg'?resultSVG(model,solved):resultCSV(solved)],
          {type:format==='svg'?'image/svg+xml':'text/csv;charset=utf-8'});
        exportRequest={toolId:'trelicas-e-porticos',format,content:file,requireEntitlement:true,
          isCurrent:()=>snapshot===solved&&!dirty,
          deliver(_receipt,assertCurrent){
            assertCurrent();
            const suffix=snapshot!==solved||dirty?'calculo-anterior':'resultados';
            saveFile(file,`estrutura-2d-${suffix}.${format}`);
          }};
      }
      const request=exportRequest;
      const {exportToolResult}=await import('/assets/js/tool-credits.mjs');
      if(await exportToolResult(request) && exportRequest===request) exportRequest=null;
    } catch(e) { report(e.message,true); }
    finally { exportBusy=false; }
  }
  function render() {
    $('[data-s2d-draw-type-wrap]').hidden=gr();
    renderInspector(); renderProject(); renderCases(); paint(); renderHint();
    $('[data-s2d-count]').textContent=`${gr()?'Grelha':'Pórtico e treliça'} · ${model.nodes.length} nós · ${model.members.length} barras · ${axisTitle(gr())}`;
    $('[data-do="undo"]').disabled=!past.length; $('[data-do="redo"]').disabled=!future.length;
  }
  $('[data-s2d-example]').addEventListener('change',e=>{
    if(e.target.value)reset(example(e.target.value),'Exemplo carregado. Você pode editar e calcular.'); e.target.value='';
  });
  root.querySelectorAll('button[data-mode]').forEach(b=>b.addEventListener('click',()=>{cancel();modeSet(b.dataset.mode);}));
  const events={undo:()=>restore(past,future),redo:()=>restore(future,past),fit,'zoom-in':()=>zoom(.8),'zoom-out':()=>zoom(1.25),solve};
  Object.entries(events).forEach(([k,f])=>$('[data-do="'+k+'"]').addEventListener('click',f));
  grid.addEventListener('change',paint);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(redraw).observe(canvas);
  modeSet('select');fit();render();
}
