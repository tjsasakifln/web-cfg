import { exportToolResult } from './tool-credits.mjs';

const el = (tag,text) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; return n; };
const format = value => typeof value==='number' ? new Intl.NumberFormat('pt-BR',{maximumSignificantDigits:8}).format(value) : String(value??'');
const numeric = (value,label) => { const text=String(value).trim().replace(',','.'); if(!text||!Number.isFinite(Number(text)))throw new Error(`${label}: informe um número válido, sem separador de milhar.`);return Number(text); };
const save = (content,name,type) => { const url=URL.createObjectURL(new Blob([content],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
const csvCell = value => { let text=String(value??'');if(typeof value==='string'&&/^[\s\u0000-\u001f]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'; };

export function parseCsv(text) {
  const delimiter=text.split(/\r?\n/,1)[0].includes(';')?';':',';
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<text.length;i++) {const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===delimiter&&!quoted){row.push(value.trim());value='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value.trim());if(row.some(Boolean))rows.push(row);row=[];value='';}
    else value+=c;}
  if(quoted)throw new Error('CSV com aspas não fechadas.');row.push(value.trim());if(row.some(Boolean))rows.push(row);return rows;
}

function chartView(chart) {
  const figure=el('figure');figure.className='science-chart';
  const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 700 320');svg.setAttribute('role','img');svg.setAttribute('aria-label',chart.title);
  const all=chart.series.flatMap(s=>s.points).filter(p=>p.length===2&&p.every(Number.isFinite));if(!all.length)return figure;
  let xmin=Math.min(...all.map(p=>p[0])),xmax=Math.max(...all.map(p=>p[0])),ymin=Math.min(...all.map(p=>p[1])),ymax=Math.max(...all.map(p=>p[1]));
  if(xmin===xmax){xmin-=1;xmax+=1;}if(ymin===ymax){ymin-=1;ymax+=1;}
  if(chart.equalScale){const dx=xmax-xmin,dy=ymax-ymin;if(dx/dy<600/220){const pad=(dy*600/220-dx)/2;xmin-=pad;xmax+=pad;}else{const pad=(dx*220/600-dy)/2;ymin-=pad;ymax+=pad;}}
  const x=v=>75+(v-xmin)/(xmax-xmin)*600,y=v=>265-(v-ymin)/(ymax-ymin)*220;
  const add=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=text;svg.append(n);return n;};
  add('path',{d:'M75 35V265H675',fill:'none',stroke:'#456'});
  for(let i=0;i<=4;i++){const xv=xmin+(xmax-xmin)*i/4,yv=ymin+(ymax-ymin)*i/4;add('text',{x:x(xv),y:285,'text-anchor':'middle','font-size':11},format(xv));add('text',{x:68,y:y(yv)+4,'text-anchor':'end','font-size':11},format(yv));}
  chart.series.forEach((s,i)=>add('polyline',{points:s.points.filter(p=>p.every(Number.isFinite)).map(p=>`${x(p[0])},${y(p[1])}`).join(' '),fill:'none',stroke:['#126f77','#a14a12','#5349a1'][i%3],'stroke-width':2.5}));
  add('text',{x:375,y:313,'text-anchor':'middle','font-size':12},chart.xLabel);add('text',{x:75,y:20,'font-size':12},chart.yLabel);
  figure.append(svg,el('figcaption',chart.title+'. '+chart.series.map(s=>s.name).join('; ')+'. Valores na tabela de resultados.'));return figure;
}

function geometryView(result) {
  if(result.geometry) {
    const rings=result.geometry.rings;
    return chartView({title:'Geometria da seção em milímetros',xLabel:'x (mm)',yLabel:'y (mm)',equalScale:true,series:rings.map((r,i)=>({name:i?'Furo '+i:'Contorno',points:[...r,r[0]]})).concat((result.geometry.bars||[]).map((bar,i)=>({name:'Barra '+(i+1),points:[[bar.x-1,bar.y],[bar.x+1,bar.y]]})))});
  }
  if(result.frame) {
    const nodes=new Map(result.frame.nodes.map(n=>[n.id,n]));return chartView({title:'Geometria do modelo',xLabel:'x (m)',yLabel:'y (m)',equalScale:true,series:result.frame.members.map(m=>({name:m.id,points:[nodes.get(m.start),nodes.get(m.end)].map(n=>[n.x,n.y])}))});
  }
  return null;
}

function resultView(result,full=false) {
  const root=el('div');root.className='science-result';root.append(el('h2',result.title),el('p',result.method));
  const metrics=el('div');metrics.className='science-metrics';for(const item of result.summary){const card=el('div');card.className='science-metric';card.append(el('span',item.label),el('strong',`${format(item.value)} ${item.unit}`));metrics.append(card);}root.append(metrics);
  const geometry=geometryView(result);if(geometry)root.append(geometry);
  for(const chart of result.charts||[])root.append(chartView(chart));
  for(const table of result.tables||[]) {const detail=el('details');detail.open=true;detail.append(el('summary',table.title));const scroll=el('div');scroll.className='science-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label',table.title);const t=el('table');t.className='science-grid';const header=el('tr');table.columns.forEach(c=>header.append(el('th',c)));const head=el('thead');head.append(header);t.append(head);const body=el('tbody');const render=rows=>{body.replaceChildren();rows.forEach(row=>{const tr=el('tr');row.forEach(c=>tr.append(el('td',format(c))));body.append(tr);});};render(full?table.rows:table.rows.slice(0,150));t.append(body);scroll.append(t);detail.append(scroll);
    if(!full&&table.rows.length>150){const more=el('button',`Mostrar todos os ${table.rows.length} registros`);more.type='button';more.className='button button-secondary';more.onclick=()=>{render(table.rows);more.remove();};detail.append(more);}root.append(detail);}
  if(result.latex){const details=el('details');details.append(el('summary','Equações em LaTeX geradas pelo handcalcs'),el('pre',result.latex));root.append(details);}
  root.append(el('h3','Hipóteses e leitura do resultado'));const ul=el('ul');result.assumptions.forEach(a=>ul.append(el('li',a)));root.append(ul,el('p','Motor de cálculo: '+result.engine));return root;
}

export function mountScienceTool(config) {
  const mount=document.querySelector('[data-science-tool]');if(!mount)return;
  const form=el('form');form.noValidate=true;const fields=el('div');fields.className='science-fields';const controls=new Map();const sections=[];let revision=0,pendingImport=null;
  const status=el('p');status.className='science-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const output=el('section');output.hidden=true;output.id='resultado';output.setAttribute('aria-label','Resultados do cálculo');
  const makeControl=(field,value)=>{let input;if(field.options){input=el('select');for(const [v,label] of field.options){const option=el('option',label);option.value=v;input.append(option);}}else{input=el('input');input.type='text';if(field.type!=='text')input.inputMode='decimal';}input.value=value??'';return input;};
  for(const field of config.fields) {
    const wrap=el('div');wrap.className='science-field';if(field.type==='table'||field.type==='csv'||field.type==='holes')wrap.classList.add('science-field--wide');
    const id='science-'+field.key;const label=el('label',field.label);label.htmlFor=id;wrap.append(label);let read;
    if(field.type==='table') {
      const scroll=el('div');scroll.className='science-scroll';scroll.tabIndex=0;const table=el('table');table.className='science-grid science-input-grid';table.id=id;table.setAttribute('role','table');table.setAttribute('aria-label',field.label);const head=el('thead'),tr=el('tr');field.columns.forEach(c=>tr.append(el('th',c.label)));tr.append(el('th','Ação'));head.append(tr);const body=el('tbody');table.append(head,body);scroll.append(table);wrap.append(scroll);
      let rowSequence=0;
      const addRow=(record={})=>{if(body.children.length>=(field.max||100))return;const row=el('tr'),rowId=id+'-row-'+(++rowSequence);for(const col of field.columns){const td=el('td'),input=makeControl(col,record[col.key]??col.default??''),cellLabel=el('label',col.label);input.id=rowId+'-'+col.key;cellLabel.htmlFor=input.id;input.dataset.key=col.key;input.setAttribute('aria-label',col.label);td.append(cellLabel,input);row.append(td);}const td=el('td'),remove=el('button','Remover');remove.type='button';remove.onclick=()=>{row.remove();form.dispatchEvent(new Event('input'));};td.append(remove);row.append(td);body.append(row);};
      field.value.forEach(addRow);const add=el('button','Adicionar linha');add.type='button';add.className='button button-secondary';add.onclick=()=>{addRow(field.blank||{});form.dispatchEvent(new Event('input'));};wrap.append(add);
      read=()=>Array.from(body.children).map((row,index)=>Object.fromEntries(field.columns.map(col=>{const value=row.querySelector(`[data-key="${col.key}"]`).value;return[col.key,col.type==='text'||col.options?value:numeric(value,`${field.label}, linha ${index+1}, ${col.label}`)];})));
    } else if(field.type==='csv'||field.type==='holes') {
      const input=el('textarea');input.id=id;input.value=field.value||'';input.spellcheck=false;wrap.append(input);
      if(field.type==='csv'){
        const upload=el('input');upload.type='file';upload.accept='.csv,.txt,text/csv,text/plain';upload.setAttribute('aria-label','Carregar '+field.label);
        upload.onchange=async()=>{
          // Invalidate at selection time, before a slow read can finish or a
          // previous calculation can publish results for the old textarea.
          form.dispatchEvent(new Event('input'));pendingImport=null;
          const file=upload.files?.[0];if(!file)return;
          if(file.size>470*1024){status.dataset.error='true';status.textContent='O arquivo deve ter no máximo 470 KiB.';return;}
          const selectedRevision=revision;pendingImport=selectedRevision;status.textContent='Lendo o arquivo…';
          try {
            const text=await file.text();
            if(revision!==selectedRevision)return;
            pendingImport=null;input.value=text;form.dispatchEvent(new Event('input'));
            status.textContent='Arquivo carregado. Calcule novamente para atualizar o resultado.';
          } catch {
            if(revision!==selectedRevision)return;
            pendingImport=null;status.dataset.error='true';status.textContent='Não foi possível ler o arquivo. Escolha-o novamente.';
          }
        };wrap.append(upload);
      }
      read=()=>field.type==='holes'?input.value.trim().split(/\n\s*\n/).filter(Boolean).map(block=>parseCsv(block).map(row=>{if(row.length!==2)throw new Error('Cada vértice de furo precisa de x e y.');return row.map(v=>numeric(v,'Vértice do furo'));})):parseCsv(input.value).filter((row,i)=>!(i===0&&/data|time/i.test(row[0]))).map(row=>{if(row.length!==6)throw new Error('Cada leitura meteorológica deve ter 6 colunas.');return[row[0],...row.slice(1).map(v=>numeric(v,'Leitura meteorológica'))];});
    } else {const input=makeControl(field,field.value);input.id=id;wrap.append(input);read=()=>field.options?input.value:numeric(input.value,field.label);controls.set(field.key,input);}
    if(field.help)wrap.append(el('small',field.help));sections.push({field,wrap,read});fields.append(wrap);
  }
  const refresh=()=>{for(const {field,wrap} of sections){const visible=!field.when||field.when.values.includes(controls.get(field.when.key)?.value);wrap.hidden=!visible;wrap.querySelectorAll('input,select,textarea,button').forEach(input=>input.disabled=!visible);}};
  controls.forEach(c=>c.addEventListener('change',refresh));refresh();
  const actions=el('div');actions.className='science-actions';const calculate=el('button','Calcular');calculate.type='submit';calculate.className='button button-primary';actions.append(calculate);form.append(fields,actions,status);mount.replaceChildren(form,output);
  let retryUntil=0,retryTimer,retryNotice='';
  const updateRetry=()=>{
    clearTimeout(retryTimer);const remaining=Math.max(0,Math.ceil((retryUntil-Date.now())/1000));
    calculate.disabled=remaining>0;
    if(remaining){calculate.textContent=`Tentar novamente em ${remaining} s`;retryTimer=setTimeout(updateRetry,Math.min(1000,retryUntil-Date.now()));}
    else if(retryUntil){retryUntil=0;calculate.textContent='Tentar novamente';if(status.textContent===retryNotice){status.dataset.error='false';status.textContent='Você já pode tentar novamente. Seus dados foram mantidos.';}}
  };
  form.addEventListener('input',()=>{revision++;output.hidden=true;status.dataset.error='false';status.textContent='Dados alterados. Calcule novamente para atualizar o resultado.';});
  form.onsubmit=async event=>{event.preventDefault();if(calculate.disabled)return;if(pendingImport===revision){status.textContent='Aguarde a leitura do arquivo antes de calcular.';return;}const submittedRevision=revision;output.hidden=true;status.dataset.error='false';calculate.disabled=true;calculate.textContent='Calcular';status.textContent='Calculando. O processamento pode levar até 21 segundos…';
    try {let data=Object.fromEntries(sections.filter(s=>!s.wrap.hidden).map(s=>[s.field.key,s.read()]));if(config.transform)data=config.transform(data);const payload=JSON.stringify({operation:config.operation,data});if(new TextEncoder().encode(payload).length>480*1024)throw new Error('Os dados excedem 480 KiB. Reduza a série ou o modelo.');
      const response=await fetch('/api/web/science-tools',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,signal:AbortSignal.timeout(26000)});const body=await response.json();
      if(response.status===429){const advertised=Number(response.headers.get('Retry-After'));const seconds=Number.isInteger(advertised)&&advertised>0?Math.min(advertised,300):body.error==='RATE_LIMIT'?300:5;retryUntil=Date.now()+seconds*1000;const reason=body.error==='RATE_LIMIT'?'Você atingiu o limite de cálculos deste intervalo.':'Há um cálculo em andamento.';retryNotice=`${reason} Seus dados foram mantidos. Aguarde ${seconds} ${seconds===1?'segundo':'segundos'} para tentar novamente.`;status.dataset.error='true';status.textContent=retryNotice;return;}
      if(!response.ok||!body.ok)throw new Error(body.message||'Não foi possível concluir o cálculo agora. Tente novamente em instantes.');
      if(revision!==submittedRevision){status.textContent='Os dados foram alterados durante o cálculo. Calcule novamente.';return;}const result=body.result;output.replaceChildren(resultView(result));const exports=el('div');exports.className='science-actions';
      for(const kind of ['html','csv','json',...(result.latex?['tex']:[])]){const button=el('button',{html:'Baixar relatório para impressão',csv:'Baixar tabelas CSV',json:'Baixar modelo e resultados',tex:'Baixar equações LaTeX'}[kind]);button.type='button';button.className='button button-secondary';
        button.onclick=async()=>{button.disabled=true;try {let content,type;const name=config.slug+'.'+kind;
          if(kind==='json'){content=JSON.stringify(result,null,2);type='application/json';}
          else if(kind==='tex'){content=result.latex+'\n';type='application/x-tex';}
          else if(kind==='csv'){content='\ufeff'+[[result.title],[result.engine],...result.tables.flatMap(t=>[[t.title],t.columns,...t.rows,[]])].map(row=>row.map(csvCell).join(';')).join('\r\n');type='text/csv;charset=utf-8';}
          else {const doc=document.implementation.createHTMLDocument(result.title);doc.documentElement.lang='pt-BR';const meta=doc.createElement('meta');meta.setAttribute('charset','utf-8');doc.head.append(meta);const style=doc.createElement('style');style.textContent='body{font:14px system-ui;color:#102740;max-width:1000px;margin:30px auto;padding:20px}table{border-collapse:collapse;font-size:11px}td,th{border:1px solid #ccc;padding:5px}svg{width:100%;max-width:700px}.science-metrics{display:flex;gap:20px;flex-wrap:wrap}.science-metric span,.science-metric strong{display:block}pre{white-space:pre-wrap}details{margin:20px 0}@media print{body{margin:0}tr{break-inside:avoid}svg{max-height:220px}}';doc.head.append(style);doc.body.append(el('p','CONFENGE · '+new Date().toLocaleString('pt-BR')),resultView(result,true));const inputs=el('details');inputs.open=true;inputs.append(el('summary','Dados utilizados'),el('pre',JSON.stringify(result.inputs,null,2)));doc.body.append(inputs);content='<!doctype html>\n'+doc.documentElement.outerHTML;type='text/html;charset=utf-8';}
          await exportToolResult({toolId:config.slug,format:kind,content,deliver:()=>save(content,name,type)});
        }catch(error){status.dataset.error='true';status.textContent=error.message||'Exportação não concluída.';}finally{button.disabled=false;}};exports.append(button);}
      output.append(exports);output.hidden=false;status.textContent='Cálculo concluído. Confira os resultados e as hipóteses abaixo.';
    }catch(error){status.dataset.error='true';status.textContent=error.name==='TimeoutError'?'O cálculo excedeu o tempo disponível. Reduza o modelo.':error.message;}finally{updateRetry();}
  };
}
