import {compile,LIBRARY} from './vendor/sld.js';
export const tipos = new Map([['grid-source','Entrada da rede'],['breaker','Disjuntor'],['rcd','Proteção diferencial'],['disconnector','Seccionadora'],['fuse','Fusível'],['generator','Gerador'],['transformer-2w','Transformador'],['energy-meter','Medidor'],['bus','Barramento'],['luminaire','Luminária'],['load','Carga'],['earth','Terra']]);
export const vazio=()=>({formato:'CONFENGE-unifilar-1',titulo:'Diagrama unifilar',equipamentos:[],ligacoes:[]});
export function exemplo(){
  const e=vazio();e.titulo='QD-01 · Iluminação e tomadas';
  e.equipamentos=[
    ['E1','grid-source','Alimentação',0,-170],['E2','breaker','DG · Geral',0,-70],['E3','bus','QD-01',0,0],
    ['E4','breaker','QF1 · Iluminação',-130,75],['E5','breaker','QF2 · Tomadas',130,75],
    ['E6','luminaire','C1 · Luminárias',-130,175],['E7','load','C2 · Tomadas',130,175]
  ].map(([id,tipo,nome,x,y])=>({id,tipo,nome,x,y}));
  e.ligacoes=[['E1.t_bottom','E2.t1'],['E2.t2','E3'],['E3','E4.t1'],['E3','E5.t1'],['E4.t2','E6.t_top'],['E5.t2','E7.t_top']];
  return e;
}
export function portas(item){
  if(item.tipo==='bus')return [[item.id,'Barramento']];
  return LIBRARY.get(item.tipo).terminals.map(t=>[item.id+'.'+t.id,t.id+' · '+({n:'superior',s:'inferior',e:'direito',w:'esquerdo'}[t.orientation])]);
}
function texto(v,max){return typeof v==='string' && v.trim() && v.length<=max && !/[\x00-\x1f\x7f]/.test(v);}
function pos(n){return Number.isInteger(n)&&Math.abs(n)<=10000;}
export function normalizar(raw){
  if(!raw || raw.formato!=='CONFENGE-unifilar-1' || !texto(raw.titulo,100) || !Array.isArray(raw.equipamentos)||raw.equipamentos.length>150||!Array.isArray(raw.ligacoes)||raw.ligacoes.length>400)throw Error('Use um projeto JSON deste editor, com até 150 equipamentos e 400 ligações.');
  const ids=new Set(), ends=new Set(), pairs=new Set(), result=vazio();
  result.titulo=raw.titulo.trim();
  for(const item of raw.equipamentos){
    if(!item || !/^E[1-9]\d{0,6}$/.test(item.id) || ids.has(item.id) || !tipos.has(item.tipo) || !texto(item.nome,55)||!pos(item.x)||!pos(item.y))throw Error('Confira nome, tipo e posição de cada equipamento.');
    ids.add(item.id); for(const [ref] of portas(item))ends.add(ref);
    result.equipamentos.push({id:item.id,tipo:item.tipo,nome:item.nome.trim(),x:item.x,y:item.y});
  }
  for(const wire of raw.ligacoes){
    if(!Array.isArray(wire)||wire.length!==2||!wire.every(v=>ends.has(v))||wire[0].split('.')[0]===wire[1].split('.')[0])throw Error('Escolha terminais de dois equipamentos diferentes.');
    const key=[...wire].sort().join('|');if(pairs.has(key))throw Error('Esses terminais já estão ligados.');
    pairs.add(key);result.ligacoes.push([...wire]);
  }
  return result;
}
export function compilar(input){
  const d=normalizar(input);const elements=[],buses=[],layout={};
  for(const e of d.equipamentos){
    const at=[e.x,e.y];
    if(e.tipo==='bus')buses.push({id:e.id,name:e.nome,layout:{at,span:300}});
    else{elements.push({id:e.id,kind:e.tipo,name:e.nome});layout[e.id]={at};}
  }
  return compile({version:'1',meta:{title:d.titulo},elements,buses,layout,wires:d.ligacoes.map((ends,i)=>({id:'W'+(i+1),ends}))});
}
export function svgDiagrama(doc){
  const m=compilar(doc), tags=[],xs=[0],ys=[0];
  const esc=s=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
  const add=(x,y)=>{xs.push(x);ys.push(y);};
  for(const wire of m.wireRenders.values()){
    wire.path.forEach(([x,y])=>add(x,y));
    tags.push('<polyline data-ligacao="'+wire.wireId+'" points="'+wire.path.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#20394e" stroke-width="1.8"/>');
  }
  for(const e of doc.equipamentos){
    let labelX,labelY;
    if(e.tipo==='bus'){
      const g=m.buses.get(e.id).geometry, [x,y]=g.at, half=g.span/2;
      add(x-half,y);add(x+half,y); tags.push('<line x1="'+(x-half)+'" x2="'+(x+half)+'" y1="'+y+'" y2="'+y+'" stroke="#061a33" stroke-width="4"/>');
      labelX=x+half+6;labelY=y+4;
    }else{
      const d=m.elements.get(e.id).libraryDef;
      const [x,y,w,h]=d.viewBox.split(/\s+/).map(Number);
      add(e.x+x,e.y+y);add(e.x+x+w,e.y+y+h);
      // Only licensed, pinned symbol SVG from the local library enters the drawing.
      tags.push('<g transform="translate('+e.x+' '+e.y+')">'+d.svg+'</g>');
      labelX=e.x+x+w+7;labelY=e.y+y+h/2+4;
    }
    const label=e.nome;add(labelX+label.length*8.4,labelY+5);
    tags.push('<text x="'+labelX+'" y="'+labelY+'" fill="#061a33" font-size="12" font-family="Arial,sans-serif">'+esc(label)+'</text>');
  }
  const minX=Math.min(...xs)-18,minY=Math.min(...ys)-20,w=Math.max(250,Math.max(...xs)-minX+18),h=Math.max(200,Math.max(...ys)-minY+20);
  return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="'+esc(doc.titulo)+'" viewBox="'+[minX,minY,w,h].join(' ')+'" width="'+Math.ceil(w)+'" height="'+Math.ceil(h)+'"><title>'+esc(doc.titulo)+'</title><desc>Diagrama unifilar. Símbolos adaptados pelo sldeditor a partir de QElectroTech, CC BY 3.0.</desc>'+tags.join('')+'</svg>';
}
