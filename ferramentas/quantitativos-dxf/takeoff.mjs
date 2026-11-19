const UNIT = {1:.0254,2:.3048,3:1609.344,4:.001,5:.01,6:1,7:1000,8:2.54e-8,9:2.54e-5,10:.9144,11:1e-10,12:1e-9,13:1e-6,14:.1,15:10,16:100,17:1e9,21:1200/3937};
const IDENTITY = [1,0,0,1,0,0];
const point = (p,t) => [t[0]*p.x+t[2]*p.y+t[4],t[1]*p.x+t[3]*p.y+t[5]];
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const compose = (a,b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function integral(f,a,b) {
  let previous=0;
  for(let n=32;n<=4096;n*=2) {
    const h=(b-a)/n;let total=f(a)+f(b);
    for(let i=1;i<n;i++)total+=(i%2?4:2)*f(a+i*h);
    total=Math.abs(total*h/3);
    if(n>32&&Math.abs(total-previous)<1e-9*Math.max(1,total))return total;
    previous=total;
  }
  return previous;
}
function arc(center,r,start,sweep,t,preview) {
  const f=angle=>{const x=-r*Math.sin(angle),y=r*Math.cos(angle);return Math.hypot(t[0]*x+t[2]*y,t[1]*x+t[3]*y);};
  const segments=Math.max(4,Math.ceil(Math.abs(sweep)*12));
  if(preview.length<12000)for(let i=0;i<segments;i++) {
    const at=q=>point({x:center.x+r*Math.cos(q),y:center.y+r*Math.sin(q)},t);
    preview.push([at(start+sweep*i/segments),at(start+sweep*(i+1)/segments)]);
  }
  return integral(f,start,start+sweep);
}
export function quantify(drawing, unitOverride = null) {
  if(!drawing||!Array.isArray(drawing.entities))throw Error('O DXF não contém uma lista de entidades válida.');
  const code=drawing.header?.$INSUNITS;
  const factor=unitOverride==null?UNIT[code]:Number(unitOverride);
  if(!Number.isFinite(factor)||factor<=0||factor>1e9)throw Error('A unidade do desenho não foi definida. Selecione a unidade usada no arquivo.');
  const layers=new Map(),blocks=new Map(),texts=[],warnings=new Map(),preview=[];
  let visited=0;
  const warn=type=>warnings.set(type,(warnings.get(type)||0)+1);
  function visit(e,t,parentLayer,stack) {
    if(++visited>100000)throw Error('O desenho expandido ultrapassa 100 mil entidades. Divida o arquivo por pavimento ou disciplina.');
    if(e.inPaperSpace||e.paperSpace)return;
    const layer=!e.layer||e.layer==='0'?parentLayer||'0':String(e.layer);
    const normal=e.extrusionDirection||{x:e.extrusionDirectionX??0,y:e.extrusionDirectionY??0,z:e.extrusionDirectionZ??1};
    if(![normal.x??0,normal.y??0,normal.z??1].every(Number.isFinite)||Math.abs(normal.x||0)>1e-10||Math.abs(normal.y||0)>1e-10||(normal.z??1)<=0) {warn(e.type+' com plano OCS diferente do XY');return;}
    if(e.type==='INSERT') {
      const name=String(e.name||''),block=drawing.blocks?.[name];
      if(!block||!Array.isArray(block.entities)){warn('INSERT sem definição: '+name);return;}
      if(stack.includes(name)||stack.length>=24)throw Error('O bloco '+name+' tem referência circular ou profundidade excessiva.');
      const countX=e.columnCount??1,countY=e.rowCount??1;
      if(!Number.isInteger(countX)||!Number.isInteger(countY)||countX<1||countY<1||countX*countY>10000)throw Error('Matriz de blocos inválida.');
      const sx=e.xScale??1,sy=e.yScale??1,angle=(e.rotation||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
      if(![sx,sy,angle,e.position?.x,e.position?.y].every(Number.isFinite)||!sx||!sy)throw Error('Transformação inválida no bloco '+name+'.');
      const base=block.position||{x:0,y:0};
      for(let iy=0;iy<countY;iy++)for(let ix=0;ix<countX;ix++) {
        const dx=ix*(e.columnSpacing||0),dy=iy*(e.rowSpacing||0);
        // Array spacing is in the insertion coordinate system, before rotation,
        // but is not scaled with the geometry of each instance.
        const next=compose(t,[c*sx,s*sx,-s*sy,c*sy,e.position.x+c*dx-s*dy-c*sx*base.x+s*sy*base.y,e.position.y+s*dx+c*dy-s*sx*base.x-c*sy*base.y]);
        const key=layer+'\0'+name;blocks.set(key,{layer,name,count:(blocks.get(key)?.count||0)+1});
        for(const child of block.entities)visit(child,next,layer,[...stack,name]);
      }
      return;
    }
    if(['TEXT','MTEXT','ATTDEF'].includes(e.type)) {
      texts.push({layer,type:e.type,text:String(e.text??e.string??''),handle:e.handle||''});return;
    }
    let length=0,area=0;
    const det=Math.abs(t[0]*t[3]-t[1]*t[2]);
    if(e.type==='LINE') {
      const v=e.vertices||[e.startPoint,e.endPoint];
      if(v.length!==2||!v.every(p=>p&&[p.x,p.y].every(Number.isFinite))){warn('LINE inválida');return;}
      if(Math.abs((v[0].z||0)-(v[1].z||0))>1e-9){warn('LINE fora do plano XY');return;}
      const a=point(v[0],t),b=point(v[1],t);length=distance(a,b);if(preview.length<12000)preview.push([a,b]);
    } else if(['CIRCLE','ARC'].includes(e.type)) {
      if(!e.center||![e.center.x,e.center.y,e.radius].every(Number.isFinite)||e.radius<=0){warn(e.type+' inválida');return;}
      let start=e.startAngle||0,sweep=e.type==='CIRCLE'?2*Math.PI:((e.endAngle-start)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
      if(!Number.isFinite(sweep)){warn('ARC inválido');return;}
      length=arc(e.center,e.radius,start,sweep,t,preview);
      if(e.type==='CIRCLE')area=Math.PI*e.radius**2*det;
    } else if(['LWPOLYLINE','POLYLINE'].includes(e.type)) {
      const v=e.vertices;
      if(!Array.isArray(v)||v.length<2||v.some(p=>![p.x,p.y].every(Number.isFinite))){warn(e.type+' inválida');return;}
      if(e.is3dPolyline||e.is3dPolygonMesh||e.isPolyfaceMesh||v.some(p=>Math.abs((p.z||0)-(v[0].z||0))>1e-9)){warn(e.type+' fora do plano XY');return;}
      const closed=Boolean(e.shape),n=closed?v.length:v.length-1;
      let signed=0;
      for(let i=0;i<n;i++) {
        const a=v[i],b=v[(i+1)%v.length],bulge=a.bulge||0;
        if(!Number.isFinite(bulge)){warn('bulge inválido');return;}
        signed+=(a.x*b.y-b.x*a.y)/2;
        const chord=Math.hypot(b.x-a.x,b.y-a.y);
        if(Math.abs(bulge)>1e-12&&chord>1e-12) {
          const r=chord*(1+bulge*bulge)/(4*Math.abs(bulge)),theta=4*Math.atan(bulge);
          const h=chord*(1-bulge*bulge)/(4*bulge);
          const center={x:(a.x+b.x)/2-(b.y-a.y)*h/chord,y:(a.y+b.y)/2+(b.x-a.x)*h/chord};
          length+=arc(center,r,Math.atan2(a.y-center.y,a.x-center.x),theta,t,preview);
          signed+=r*r*(theta-Math.sin(theta))/2;
        } else {const x=point(a,t),y=point(b,t);length+=distance(x,y);if(preview.length<12000)preview.push([x,y]);}
      }
      if(closed)area=Math.abs(signed)*det;
    } else {warn(e.type||'tipo desconhecido');return;}
    if(!Number.isFinite(length)||!Number.isFinite(area))throw Error('Geometria produz número inválido. Confira coordenadas e escalas.');
    const row=layers.get(layer)||{layer,count:0,length:0,area:0};
    row.count++;row.length+=length*factor;row.area+=area*factor*factor;layers.set(layer,row);
  }
  for(const e of drawing.entities)visit(e,IDENTITY,'0',[]);
  return {unitCode:code??0,metresPerUnit:factor,visited,layers:[...layers.values()].sort((a,b)=>a.layer.localeCompare(b.layer)),
    blocks:[...blocks.values()].sort((a,b)=>a.layer.localeCompare(b.layer)||a.name.localeCompare(b.name)),texts,
    warnings:[...warnings].map(([type,count])=>({type,count})),preview};
}
