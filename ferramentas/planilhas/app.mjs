import {MODELS,AREAS,getModel,calculate,scenario} from './data.mjs';
import {exportToolResult} from '/assets/js/tool-credits.mjs';

const root=document.getElementById('planilhas-app');
const model=getModel(root?.dataset.slug);
const add=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const num=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:5});
const format=value=>Math.abs(value)>=1e9?num.format(value):num.format(Math.abs(value)<0.00001&&value!==0?Number(value.toPrecision(4)):value);
const label=(node,id,text)=>{const l=add('label','ps-label',text);l.htmlFor=id;node.append(l);};
const link=(href,text,cls)=>{const a=add('a',cls,text);a.href=href;return a;};
function chart(svgHost,points,model){
  svgHost.replaceChildren();
  if(points.length<3){svgHost.append(add('p','ps-warning','Não há cenários suficientes para o gráfico.'));return;}
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 740 310');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Gráfico de sensibilidade de '+model.steps.at(-1).label+' conforme '+model.fields.find(f=>f.key===model.driver).label);
  const mk=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;svg.append(n);return n;};
  const margin={left:94,right:29,top:22,bottom:64},x0=margin.left,y0=310-margin.bottom,w=740-margin.left-margin.right,h=y0-margin.top;
  const xs=points.map(p=>p.value),ys=points.map(p=>p.result);
  let xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  if(ymin===ymax){const d=Math.max(Math.abs(ymin)*0.1,1);ymin-=d;ymax+=d;}
  if(xmin===xmax)xmax=xmin+1;
  const xx=x=>x0+(x-xmin)/(xmax-xmin)*w,yy=y=>y0-(y-ymin)/(ymax-ymin)*h;
  for(let i=0;i<=4;i++){
    const v=ymin+(ymax-ymin)*i/4,y=yy(v);
    mk('line',{x1:x0,y1:y,x2:x0+w,y2:y,stroke:'#dce3e8','stroke-dasharray':i===0?'0':'4 5'});
    mk('text',{x:x0-14,y:y+4,'text-anchor':'end',fill:'#5d6a7a','font-size':'13'},format(v));
  }
  mk('line',{x1:x0,y1:y0,x2:x0+w,y2:y0,stroke:'#9baaba'});
  for(let i=0;i<=4;i++){
    const v=xmin+(xmax-xmin)*i/4,x=xx(v);
    mk('text',{x,y:y0+25,'text-anchor':'middle',fill:'#5d6a7a','font-size':'13'},format(v));
  }
  const poly=points.map(p=>xx(p.value).toFixed(2)+','+yy(p.result).toFixed(2)).join(' ');
  mk('polyline',{points:poly,stroke:'#2d6f2d','stroke-width':'3',fill:'none','stroke-linejoin':'round','stroke-linecap':'round'});
  points.forEach((p,i)=>{if(i%5===0||i===points.length-1)mk('circle',{cx:xx(p.value),cy:yy(p.result),r:4,fill:'#2d6f2d',stroke:'#fff','stroke-width':2});});
  mk('text',{x:x0+w/2,y:304,'text-anchor':'middle','font-size':'14',fill:'#26374a'},model.fields.find(f=>f.key===model.driver).label);
  svgHost.append(svg);
}
function summaryRows(out,calc){
  const tbody=out.querySelector('tbody');tbody.replaceChildren();
  for(let i=0;i<calc.steps.length;i++){
    const step=calc.steps[i],tr=add('tr');if(i===calc.steps.length-1)tr.className='ps-table-total';
    tr.append(add('th','',step.label),add('td','ps-cell-number',format(step.value)),add('td','',step.unit),add('td','ps-formula',step.expr));
    tbody.append(tr);
  }
}
function startModel(model){
  if(!root)return;
  const workspace=add('div','ps-workspace');
  const form=add('form','ps-form');form.noValidate=true;
  form.append(add('h2','','Dados de entrada'),add('p','ps-helper','Altere os dados do seu caso. Os cálculos e o gráfico são atualizados nesta página, sem cadastro.'));
  const fieldset=add('div','ps-fields'), controls=new Map();
  for(const field of model.fields){
    const wrap=add('div','ps-field'),id='ps-'+field.key;
    label(wrap,id,field.label);
    const fieldrow=add('div','ps-fieldrow');
    const input=add('input','ps-input');
    input.id=id;input.type='number';input.inputMode='decimal';input.step='any';input.required=true;
    input.min=String(field.min);input.max=String(field.max);input.value=String(field.initial);
    input.setAttribute('aria-describedby',id+'-unit');
    controls.set(field.key,input);
    fieldrow.append(input,add('span','ps-unit',field.unit));
    fieldrow.lastElementChild.id=id+'-unit';
    wrap.append(fieldrow);fieldset.append(wrap);
  }
  form.append(fieldset);
  const actions=add('div','ps-actions');
  const calcBtn=add('button','ps-button','Calcular e atualizar planilha');calcBtn.type='submit';
  const reset=add('button','ps-secondary','Restaurar exemplo');reset.type='button';
  actions.append(calcBtn,reset);form.append(actions);
  const note=add('p','ps-security','Os números ficam nesta aba. O Excel só é gerado quando você solicita a exportação.');
  form.append(note);
  const output=add('section','ps-output');
  output.setAttribute('aria-labelledby','ps-result-title');
  const head=add('div','ps-output-head');
  const h2=add('h2','','Planilha preenchida');h2.id='ps-result-title';
  const state=add('span','ps-pill','Cálculo disponível');
  head.append(h2,state);output.append(head);
  const description=add('p','ps-helper','Memória por etapas com valores, unidades e expressões de cálculo.');
  const result=add('div','ps-main-result');result.setAttribute('aria-live','polite');
  const feedback=add('p','ps-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const tableWrap=add('div','ps-table-wrap'),table=add('table','ps-table');
  const caption=add('caption','','Memória de cálculo do modelo');
  const thead=add('thead'),tr=add('tr');
  ['Etapa','Valor','Unidade','Expressão'].forEach(x=>tr.append(add('th','',x)));
  thead.append(tr);table.append(caption,thead,add('tbody'));tableWrap.append(table);
  const graphic=add('section','ps-graphic');
  graphic.append(add('h3','','Sensibilidade do resultado'));
  const graphicCaption=add('p','ps-helper','Variação de 50% a 150% de uma entrada, mantendo as demais constantes.');
  const graphHost=add('div','ps-graph');graphic.append(graphicCaption,graphHost);
  const exportArea=add('div','ps-export');
  const exportBtn=add('button','ps-button ps-export-button','Exportar Excel editável · 1 crédito');exportBtn.type='button';
  exportBtn.setAttribute('aria-label','Exportar planilha Excel editável por um crédito, após o eventual crédito de cortesia');
  const exportInfo=add('p','ps-helper','Sua primeira exportação elegível pode usar o crédito de cortesia da carteira. Depois, cada arquivo consome 1 crédito.');
  exportArea.append(exportBtn,exportInfo);
  const scope=add('details','ps-details');scope.append(add('summary','','Método, referência e limitações'));
  const method=add('p');method.append(add('strong','','Método. '),document.createTextNode(model.method));
  const limit=add('p');limit.append(add('strong','','Limites. '),document.createTextNode(model.limits));
  const refs=add('p');refs.append(add('strong','','Referências de escopo. '),document.createTextNode(model.reference));
  scope.append(method,limit,refs);
  output.append(description,result,feedback,tableWrap,graphic,exportArea,scope);
  workspace.append(form,output);root.append(workspace);
  let lastInput=null,lastCalculation=null,busy=false,renderId=0;
  const collect=()=>{
    const obj={};for(const field of model.fields){
      const raw=controls.get(field.key).value;
      if(raw==='')throw Error('Informe '+field.label+'.');
      obj[field.key]=Number(raw);
    }return obj;
  };
  const update=()=>{
    renderId++;
    const inputs=collect(),calculated=calculate(model,inputs);
    lastInput=inputs;lastCalculation=calculated;
    state.textContent='Atualizado';state.classList.remove('ps-error');
    feedback.textContent='';feedback.hidden=true;
    result.replaceChildren();
    result.append(add('span','','Indicador principal'),add('strong','',format(calculated.primary)),add('small','',model.steps.at(-1).unit));
    summaryRows(table,calculated);
    chart(graphHost,scenario(model,inputs),model);
    exportBtn.disabled=false;
    try{window.confengeTrack?.('tool_calculation',{tool_id:'planilhas-engenharia',model_id:model.slug});}catch{}
  };
  const guarded=()=>{try{update();}catch(e){lastInput=lastCalculation=null;exportBtn.disabled=true;
    state.textContent='Revisar dados';state.classList.add('ps-error');
    feedback.textContent=e?.message||'Confira as entradas.';feedback.hidden=false;
    result.replaceChildren();table.querySelector('tbody').replaceChildren();graphHost.replaceChildren();}};
  form.addEventListener('submit',event=>{event.preventDefault();guarded();});
  form.addEventListener('input',()=>{state.textContent='Dados alterados';exportBtn.disabled=true;lastCalculation=null;});
  reset.addEventListener('click',()=>{for(const f of model.fields)controls.get(f.key).value=String(f.initial);guarded();});
  exportBtn.addEventListener('click',async()=>{
    if(busy||!lastCalculation||!lastInput)return;
    busy=true;exportBtn.disabled=true;
    const input=structuredClone(lastInput);
    try{
      const {buildWorkbook}=await import('./xlsx.mjs');
      const bytes=await buildWorkbook(model,input);
      await exportToolResult({
        toolId:'planilhas-engenharia',format:'xlsx',content:bytes,
        deliver(){
          const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
          const a=link(url,'','');a.download='CONFENGE-'+model.slug+'.xlsx';
          document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }
      });
      try{window.confengeTrack?.('tool_export_intent',{tool_id:'planilhas-engenharia',format:'xlsx',model_id:model.slug});}catch{}
    }catch(e){feedback.hidden=false;feedback.textContent='Não foi possível exportar: '+(e?.message||'tente novamente.');}
    finally{busy=false;exportBtn.disabled=!lastCalculation;}
  });
  guarded();
}
function filterCatalog(){
  const search=document.querySelector('#ps-search'),category=document.querySelector('#ps-category');
  const items=[...document.querySelectorAll('.ps-catalog-item')];
  const counter=document.querySelector('#ps-catalog-count');
  const run=()=>{
    const text=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    let count=0;for(const entry of items){
      const searchable=(entry.dataset.search||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const visible=(category.value==='todos'||entry.dataset.area===category.value)&&searchable.includes(text);
      entry.hidden=!visible;if(visible)count++;
    }
    counter.textContent=count+' modelo'+(count===1?'':'s')+' encontrado'+(count===1?'':'s');
  };
  if(search&&category){search.addEventListener('input',run);category.addEventListener('change',run);run();}
}
if(model)startModel(model);
else filterCatalog();
