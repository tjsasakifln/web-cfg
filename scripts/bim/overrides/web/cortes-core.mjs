// web-ifc returns metres in Y-up: x=X_ifc, y=Z_ifc, z=-Y_ifc.
// Convert placed vertices back to IFC X/Y/Z before intersecting a plane.
export function pontoIfc(vertices,index,m) {
  const o=index*6,x=vertices[o],y=vertices[o+1],z=vertices[o+2];
  const world=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
  const p=[world[0],-world[2],world[1]];
  if(p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))throw Error('A geometria contém coordenadas inválidas ou maiores que 10⁹ m.');
  return p;
}
export function limitesCena(scene) {
  const buffers=new Map(scene.buffers.map(b=>[b.key,b]));
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const el of scene.elements)for(const part of el.parts){const b=buffers.get(part.key);for(let i=0;i<b.vertices.length/6;i++){
    const p=pontoIfc(b.vertices,i,part.matrix);p.forEach((v,a)=>{min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);});
  }}
  if(min.some(v=>!Number.isFinite(v)))throw Error('O modelo não contém geometria mensurável.');
  return {min,max};
}
const eps=1e-6;
const keyPoint=p=>p.map(v=>v.toFixed(6)).join(',');
const keyEdge=(a,b)=>[keyPoint(a),keyPoint(b)].sort().join('|');
export function cortarCena(scene,axis,coordinate) {
  const a=['x','y','z'].indexOf(axis);
  if(a<0||!Number.isFinite(coordinate))throw Error('Informe um plano X, Y ou Z e uma coordenada em metros.');
  const projection=axis==='x'?[1,2]:axis==='y'?[0,2]:[0,1];
  const buffers=new Map(scene.buffers.map(b=>[b.key,b])),segments=[];
  for(const el of scene.elements) {
    const ordinary=new Map(),coplanar=new Map();
    const add=(p,q,map,count=false)=>{
      const from=projection.map(i=>p[i]),to=projection.map(i=>q[i]);
      if(Math.hypot(from[0]-to[0],from[1]-to[1])<=eps)return;
      const key=keyEdge(from,to),old=map.get(key);map.set(key,{from,to,count:count?(old?.count||0)+1:1});
    };
    for(const part of el.parts){const b=buffers.get(part.key),cache=new Map();
      const vertex=i=>{if(!cache.has(i))cache.set(i,pontoIfc(b.vertices,i,part.matrix));return cache.get(i);};
      for(let i=0;i<b.indices.length;i+=3){
        const p=[vertex(b.indices[i]),vertex(b.indices[i+1]),vertex(b.indices[i+2])];
        const d=p.map(v=>v[a]-coordinate),on=d.map(v=>Math.abs(v)<=eps);
        if(on.every(Boolean)){for(let j=0;j<3;j++)add(p[j],p[(j+1)%3],coplanar,true);continue;}
        if(d.every(v=>v>eps)||d.every(v=>v< -eps))continue;
        const points=[];const push=v=>{if(!points.some(q=>Math.hypot(...q.map((n,k)=>n-v[k]))<=eps))points.push(v);};
        for(let j=0;j<3;j++){
          const k=(j+1)%3;if(on[j])push(p[j]);
          if(!on[j]&&!on[k]&&d[j]*d[k]<0){const t=d[j]/(d[j]-d[k]);push(p[j].map((v,n)=>v+t*(p[k][n]-v)));}
        }
        if(points.length===2)add(points[0],points[1],ordinary);
      }
    }
    for(const [key,edge] of coplanar)if(edge.count===1)ordinary.set(key,edge);
    for(const {from,to} of ordinary.values())segments.push({from,to,id:el.id,guid:el.guid,name:el.name,class:el.ifcClass});
    if(segments.length>150000)throw Error('O corte ultrapassa 150.000 segmentos. Exporte um recorte do IFC.');
  }
  if(!segments.length)throw Error('Nenhum sólido intercepta esse plano. Ajuste a coordenada do corte.');
  const min=[Infinity,Infinity],max=[-Infinity,-Infinity];
  for(const s of segments)for(const p of [s.from,s.to])p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});
  return {axis,coordinate,projection:projection.map(i=>['X','Y','Z'][i]),segments,min,max};
}
const xml=s=>String(s??'').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function gerarSvg(cut,{scale=100,title='Corte IFC'}={}) {
  if(!Number.isFinite(scale)||scale<1||scale>1000)throw Error('Use uma escala entre 1:1 e 1:1000.');
  const width=cut.max[0]-cut.min[0],height=cut.max[1]-cut.min[1];
  const margin=Math.max(width,height,0.1)*.16,stroke=Math.max(width,height,0.1)/900;
  const w=width+2*margin,h=height+2.3*margin,font=margin*.14;
  const x=v=>v-cut.min[0]+margin,y=v=>cut.max[1]-v+margin;
  const text=(px,py,t,extra='')=>`<text x="${px}" y="${py}" ${extra}>${xml(t)}</text>`;
  const dimension=(x1,y1,x2,y2,label)=>`<path d="M${x1} ${y1} L${x2} ${y2}"/>`+text((x1+x2)/2,(y1+y2)/2-font*.4,label,'text-anchor="middle"');
  const meta={axis:cut.axis,coordinateMetres:cut.coordinate,axes:cut.projection,scale,segments:cut.segments.length};
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${w*1000/scale}mm" height="${h*1000/scale}mm" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="svg-title"><title id="svg-title">${xml(title)}</title><metadata>${xml(JSON.stringify(meta))}</metadata><rect width="${w}" height="${h}" fill="white"/><g fill="none" stroke="#132c25" stroke-width="${stroke}">${cut.segments.map(s=>`<path d="M${x(s.from[0])} ${y(s.from[1])} L${x(s.to[0])} ${y(s.to[1])}"><title>${xml(s.name||s.class)} · #${s.id}</title></path>`).join('')}</g><g stroke="#58776a" fill="#173e31" stroke-width="${stroke/2}" font-size="${font}" font-family="sans-serif">${dimension(margin,margin*.55,margin+width,margin*.55,width.toFixed(3)+' m')}${text(margin*.14,margin+height/2,height.toFixed(3)+' m',`transform="rotate(-90 ${margin*.14} ${margin+height/2})" text-anchor="middle"`)}<path fill="none" d="M${margin*.45} ${margin} L${margin*.45} ${margin+height}"/>${text(margin,h-margin*.6,title)}${text(margin,h-margin*.28,`Plano ${cut.axis.toUpperCase()} = ${cut.coordinate.toFixed(3)} m · 1:${scale} · Eixos ${cut.projection.join('/')} · CONFENGE`)}</g></svg>`;
}
