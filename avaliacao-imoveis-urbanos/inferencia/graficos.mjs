// Deterministic display sampling keeps large projects responsive. The exported memory retains all rows.
const svgNS = 'http://www.w3.org/2000/svg';
function svgElement(tag, attrs, text) {
  const node=document.createElementNS(svgNS, tag);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  if(text!==undefined)node.textContent=text;
  return node;
}
function html(tag, text) {
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  return node;
}
function sample(rows,limit=180) {
  if(rows.length<=limit)return rows;
  // Always retain the most influential observations plus regularly spaced fitted values.
  const set=new Set([...rows].sort((a,b)=>(b.cook??-1)-(a.cook??-1)).slice(0,12));
  const ordered=[...rows].sort((a,b)=>a.predicted-b.predicted);
  for(let idx=0;idx<limit-12;idx++)set.add(ordered[Math.round(idx*(ordered.length-1)/(limit-13))]);
  return ordered.filter(r=>set.has(r));
}
function extent(values){
  let lo=Infinity,hi=-Infinity;
  for(const value of values){lo=Math.min(lo,value);hi=Math.max(hi,value);}
  const pad=hi===lo?Math.max(1,Math.abs(lo)*.05):(hi-lo)*.055;
  return [lo-pad,hi+pad];
}
const ticks=new Intl.NumberFormat('pt-BR',{maximumSignificantDigits:3});
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

export function plots(all,unit,log=false) {
  const usable=all.filter(r=>[r.observed,r.predicted,r.residual].every(Number.isFinite));
  const container=html('section');container.className='mp-charts';container.setAttribute('aria-label','Gráficos de diagnóstico');
  if(!usable.length)return container;
  const rows=sample(usable);
  const max=Math.max(...usable.slice(0,10000).map(r=>Math.max(Math.abs(r.observed),Math.abs(r.predicted),Math.abs(r.residual))));
  const scale=max>=1e6?1e6:max>=1e3?1e3:1;
  const label=log?'ln(preço)':'R$'+(scale===1e6?' mi':scale===1e3?' mil':'')+(unit==='BRL'?'':'/m²');
  const grid=html('div');grid.className='mp-plot-grid';container.append(grid);
  const points=[];
  for(const isResidual of [false,true]){
    const yKey=isResidual?'residual':'observed';
    const title=isResidual?'Resíduos por estimativa':'Valores observados e estimados';
    const instruction=isResidual?'A linha de referência corresponde a resíduo zero.':'A diagonal indica igualdade entre preço observado e estimado.';
    const figure=html('figure');const cap=html('figcaption',title);figure.append(cap);
    const id='diag-'+yKey,s=svgElement('svg',{viewBox:'0 0 400 255',role:'img','aria-labelledby':id+'-title '+id+'-desc'});
    s.append(svgElement('title',{id:id+'-title'},title),svgElement('desc',{id:id+'-desc'},instruction+' Eixos em '+label+'. Selecione uma observação abaixo para consultar os valores.'));
    const left=62,right=388,top=13,bottom=203;
    const xData=usable.map(r=>r.predicted),yData=usable.map(r=>r[yKey]);
    const xBounds=isResidual?extent(xData):extent([...xData,...yData]);
    const yBounds=isResidual?extent([...yData,0]):xBounds;
    const px=(value)=>left+(value-xBounds[0])/(xBounds[1]-xBounds[0])*(right-left);
    const py=(value)=>bottom-(value-yBounds[0])/(yBounds[1]-yBounds[0])*(bottom-top);
    for(let i=0;i<4;i++){
      const f=i/3;const x=left+(right-left)*f,y=bottom-(bottom-top)*f;
      s.append(svgElement('line',{x1:x,y1:top,x2:x,y2:bottom,class:'mp-gridline'}),svgElement('line',{x1:left,y1:y,x2:right,y2:y,class:'mp-gridline'}),
        svgElement('text',{x:i===3?x-3:x,y:bottom+18,'text-anchor':i===3?'end':'middle'},ticks.format((xBounds[0]+f*(xBounds[1]-xBounds[0]))/scale)),
        svgElement('text',{x:left-6,y:y+4,'text-anchor':'end'},ticks.format((yBounds[0]+f*(yBounds[1]-yBounds[0]))/scale)));
    }
    s.append(svgElement('line',{x1:left,y1:isResidual?py(0):bottom,x2:right,y2:isResidual?py(0):top,class:'mp-reference'}),
      svgElement('text',{x:(left+right)/2,y:bottom+40,'text-anchor':'middle'},'Estimado ('+label+')'),
      svgElement('text',{x:0,y:0,transform:'translate(15 '+((top+bottom)/2)+') rotate(-90)','text-anchor':'middle'},(isResidual?'Resíduo':'Observado')+' ('+label+')'));
    const markers=rows.map((row,i)=>{
      const dot=svgElement('circle',{cx:px(row.predicted),cy:py(row[yKey]),r:3.6,class:'mp-dot'});
      dot.append(svgElement('title',{},'Observação '+row.id+' · '+(log?ticks.format(row[yKey]):money.format(row[yKey]))));
      dot.addEventListener('click',()=>{select.value=String(i);highlight(i);});s.append(dot);return dot;
    });
    const highlightDot=svgElement('circle',{r:6,class:'mp-dot-selected'});s.append(highlightDot);
    points.push([markers,highlightDot]);figure.append(s,html('p',instruction));grid.append(figure);
  }
  const ctl=html('div');ctl.className='mp-probe';const lb=html('label','Investigar observação');const select=html('select');
  rows.forEach((r,i)=>select.append(new Option(String(r.id),String(i))));lb.append(select);
  const out=html('output');out.setAttribute('aria-live','polite');ctl.append(lb,out);container.append(ctl);
  function highlight(i){
    const r=rows[i];if(!r)return;
    for(const [marks,mark] of points){
      mark.setAttribute('cx',marks[i].getAttribute('cx'));mark.setAttribute('cy',marks[i].getAttribute('cy'));
    }
    const amt=v=>log?ticks.format(v)+' (ln)':money.format(v)+(unit==='BRL'?'':'/m²');
    out.textContent='Observação '+r.id+' · observado '+amt(r.observed)+' · estimado '+amt(r.predicted)+' · resíduo '+amt(r.residual)+'.';
  }
  select.onchange=()=>highlight(Number(select.value));highlight(0);
  if(usable.length>rows.length)container.append(html('p','Os gráficos exibem '+rows.length+' das '+usable.length+' observações, incluindo as mais influentes. A memória exportada contém todos os pontos.'));
  return container;
}
