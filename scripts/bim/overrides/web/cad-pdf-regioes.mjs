import ClipperLib from './vendor-cad/clipper.mjs';

const {Clipper, PolyTree, PolyType, ClipType, PolyFillType}=ClipperLib;
const PREC=10000, EPS=1e-8;
export const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const cruz=(a,b)=>a[0]*b[1]-a[1]*b[0];
export const igual=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=EPS;
export const retangulo=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
export function caixa(pontos){
  const b=[Infinity,Infinity,-Infinity,-Infinity];
  for(const [x,y] of pontos){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}
  return b;
}
export const sobrepoe=(a,b)=>a[0]<=b[2]+EPS&&a[2]+EPS>=b[0]&&a[1]<=b[3]+EPS&&a[3]+EPS>=b[1];
const contem=(b,[x,y])=>x>=b[0]-EPS&&x<=b[2]+EPS&&y>=b[1]-EPS&&y<=b[3]+EPS;
export function regiao(grupos){
  const ciclos=grupos.flat(),limites=caixa(ciclos.flat());
  const ret=ciclos.length===1&&ciclos[0].length===4&&ciclos[0].every((p,i,a)=>p[0]===a[(i+1)%4][0]||p[1]===a[(i+1)%4][1]);
  return {grupos,ciclos,limites,ret,caixas:ciclos.map(caixa)};
}
export function poligonos(aneis,recorte,paridade,debitar){
  if(!aneis.length||recorte&&!recorte.ciclos.length)return regiao([]);
  const vertices=aneis.reduce((s,a)=>s+a.length,0)+(recorte?.ciclos.reduce((s,a)=>s+a.length,0)||0);
  if(vertices>6000)throw new Error('Uma região tem contornos complexos demais para converter inteira. Divida a folha em vistas menores.');
  debitar(vertices);
  const c=new Clipper(), arvore=new PolyTree();
  const int=paths=>paths.map(c=>c.map(([x,y])=>({X:Math.round(x*PREC),Y:Math.round(y*PREC)})));
  if(!c.AddPaths(int(aneis),PolyType.ptSubject,true))return regiao([]);
  if(recorte)c.AddPaths(int(recorte.ciclos),PolyType.ptClip,true);
  if(!c.Execute(recorte?ClipType.ctIntersection:ClipType.ctUnion,arvore,
    paridade?PolyFillType.pftEvenOdd:PolyFillType.pftNonZero,PolyFillType.pftNonZero)){
    throw new Error('Não foi possível calcular os limites de uma região do PDF.');
  }
  const grupos=[];
  function visitar(p,pai){
    const anel=p.Contour().map(({X,Y})=>[X/PREC,Y/PREC]);
    debitar(anel.length);
    if(p.IsHole())pai.push(anel);
    else {pai=[anel];grupos.push(pai);}
    for(const filho of p.Childs())visitar(filho,pai);
  }
  for(const filho of arvore.Childs())visitar(filho,null);
  return regiao(grupos);
}
export function dentro(p,r,debitar){
  if(!contem(r.limites,p))return false;
  if(r.ret)return true;
  let dentro=false;
  for(let k=0;k<r.ciclos.length;k++){
    if(!contem(r.caixas[k],p))continue;
    const c=r.ciclos[k];debitar(c.length);
    for(let i=0,j=c.length-1;i<c.length;j=i++){
      const a=c[j],b=c[i],v=sub(b,a),d=sub(p,a);
      if(Math.abs(cruz(v,d))<=EPS*Math.max(1,Math.hypot(...v))&&contem(caixa([a,b]),p))return true;
      if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])dentro=!dentro;
    }
  }
  return dentro;
}
export function cortar(a,b,r,debitar){
  const bb=caixa([a,b]);
  if(!sobrepoe(bb,r.limites)||igual(a,b))return [];
  const d=sub(b,a), ponto=t=>[a[0]+d[0]*t,a[1]+d[1]*t];
  if(r.ret){
    let ini=0,fim=1;
    for(let k=0;k<2;k++){
      if(Math.abs(d[k])<=EPS){if(a[k]<r.limites[k]-EPS||a[k]>r.limites[k+2]+EPS)return [];continue;}
      const p=(r.limites[k]-a[k])/d[k],q=(r.limites[k+2]-a[k])/d[k];
      ini=Math.max(ini,Math.min(p,q));fim=Math.min(fim,Math.max(p,q));
    }
    return fim-ini>EPS?[[ponto(ini),ponto(fim)]]:[];
  }
  const ts=[0,1],dd=d[0]*d[0]+d[1]*d[1];
  for(let k=0;k<r.ciclos.length;k++){
    if(!sobrepoe(bb,r.caixas[k]))continue;
    const c=r.ciclos[k];debitar(c.length);
    for(let i=0,j=c.length-1;i<c.length;j=i++){
      const p=c[j],q=c[i],v=sub(q,p),u=sub(p,a),det=cruz(d,v);
      if(Math.abs(det)<=EPS){
        if(Math.abs(cruz(u,d))<=EPS)for(const e of [p,q]){
          const t=((e[0]-a[0])*d[0]+(e[1]-a[1])*d[1])/dd;
          if(t>EPS&&t<1-EPS)ts.push(t);
        }
        continue;
      }
      const t=cruz(u,v)/det,s=cruz(u,d)/det;
      if(t>EPS&&t<1-EPS&&s>=-EPS&&s<=1+EPS)ts.push(t);
    }
  }
  ts.sort((x,y)=>x-y);
  const out=[];let ini=null;
  for(let i=1;i<ts.length;i++){
    const p=ts[i-1],q=ts[i];if(q-p<=EPS)continue;
    if(dentro(ponto((p+q)/2),r,debitar)){if(ini===null)ini=p;}
    else if(ini!==null){out.push([ponto(ini),ponto(p)]);ini=null;}
  }
  if(ini!==null)out.push([ponto(ini),b]);
  return out;
}
