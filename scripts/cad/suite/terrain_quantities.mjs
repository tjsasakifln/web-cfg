// SPDX-License-Identifier: Apache-2.0
// CONFENGE: midpoint integration in millimetres, reported in cubic metres.
// Individual pads are published only when their independently graded surfaces
// have disjoint sampled influence and reproduce the combined surface's volumes.
export function sampleTerrainVolumes(existing,finished,independent=null,{cell=250,maxCells=250000}={}) {
  const b=existing.stats().bounds,w=b.maxX-b.minX,h=b.maxY-b.minY;
  if(![b.minX,b.minY,w,h,cell].every(Number.isFinite)||[b.minX,b.minY,b.maxX,b.maxY].some(v=>Math.abs(v)>1e12)||w<=0||h<=0||w>1e9||h>1e9||cell<=0||cell>1e9)throw Error('Limites do terreno ou célula de amostragem inválidos.');
  if(!Number.isInteger(maxCells)||maxCells<1||maxCells>250000)throw Error('Limite de amostragem inválido.');
  const gridCount=()=>Math.ceil(w/cell)*Math.ceil(h/cell);
  while(gridCount()>maxCells)cell*=Math.max(1.01,Math.sqrt(gridCount()/maxCells));
  const parts=Array.isArray(independent)?independent.map(()=>({cut:0,fill:0})):null;
  let cut=0,fill=0,cells=0,reason=parts?'':'aggregate-only',separate=Boolean(parts);
  const add=(r,d)=>{if(d>0)r.fill+=d;else r.cut-=d;};
  for(let x0=b.minX;x0<b.maxX;x0+=cell)for(let y0=b.minY;y0<b.maxY;y0+=cell) {
    const dx=Math.min(cell,b.maxX-x0),dy=Math.min(cell,b.maxY-y0),x=x0+dx/2,y=y0+dy/2;
    const e=existing.elevationAt(x,y),f=finished.elevationAt(x,y);
    if(e===null||f===null)continue;
    if(!Number.isFinite(e)||!Number.isFinite(f))throw Error('O terreno contém elevações inválidas.');
    cells++;const d=(f-e)*dx*dy/1e9;if(d>0)fill+=d;else cut-=d;
    if(!parts)continue;
    let influences=0,sumDelta=0;
    for(let i=0;i<independent.length;i++) {
      const z=independent[i].elevationAt(x,y);
      if(z===null||!Number.isFinite(z)){separate=false;reason='different-domains';continue;}
      const delta=z-e;sumDelta+=delta;add(parts[i],delta*dx*dy/1e9);
      if(Math.abs(delta)>1e-7)influences++;
    }
    if(influences>1){separate=false;reason='overlapping-influence';}
    const heightTolerance=Math.max(1e-7,128*Number.EPSILON*Math.max(Math.abs(e),Math.abs(f),Math.abs(sumDelta)));
    if(Math.abs((f-e)-sumDelta)>heightTolerance){separate=false;reason='combined-surface-difference';}
  }
  if(!cells)throw Error('As superfícies não possuem área amostrada em comum.');
  if(parts) {
    const sum=parts.reduce((a,p)=>({cut:a.cut+p.cut,fill:a.fill+p.fill}),{cut:0,fill:0});
    // This is a floating-point reconciliation, not a construction tolerance.
    const tolerance=Math.max(1e-8,(cut+fill)*1e-9);
    if(Math.abs(sum.cut-cut)>tolerance||Math.abs(sum.fill-fill)>tolerance){separate=false;reason='combined-surface-difference';}
  }
  return {cut,fill,byPad:separate?parts:null,reason:separate?'independent-sampled-surfaces':reason,cellMm:cell,cells};
}
