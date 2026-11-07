import {plots} from './graficos.mjs';
const byId = id => document.getElementById(id);
const el = (tag, text) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; };
const formatter = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 5});
const reais = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});
const state = { dataset:null, example:false, fileName:'', revision:0, request:0, running:false, analysis:null, tested:null, engine:null };
const number = value => Number.isFinite(value) ? formatter.format(value) : 'Pendente';
const amount = value => Number.isFinite(value) ? reais.format(value)+(byId('unit').value==='BRL'?'':'/m²') : 'Pendente';
const grade = value => ({1:'I',2:'II',3:'III'}[value] ?? (value===0 ? 'Sem enquadramento' : 'Pendente'));
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const engine = async () => state.engine ??= await import('./engine/client.mjs');

function status(id,text,error=false) {
  const node=byId(id);node.textContent=text;node.classList.toggle('mp-error',error);
}
function invalidate() {
  state.revision++;state.analysis=null;state.tested=null;
  byId('resultado').hidden=true;byId('results').replaceChildren();
  if(state.running){state.engine?.cancel?.();state.running=false;byId('run').disabled=false;byId('cancel').hidden=true;}
  status('run-status','');
}
function detail(label,content) {
  const box=el('details');box.className='mp-data';box.append(el('summary',label),content);return box;
}
function table(label, headings, values) {
  const wrap=el('div'),t=el('table'),h=el('thead'),hr=el('tr'),b=el('tbody');
  wrap.className='mp-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',label);
  t.setAttribute('aria-label',label);
  for(const x of headings){const cell=el('th',x);cell.scope='col';hr.append(cell);}
  for(const row of values){const tr=el('tr');for(const v of row)tr.append(el('td',v??'Pendente'));b.append(tr);}
  h.append(hr);t.append(h,b);wrap.append(t);return wrap;
}
function numeric(candidate, rows) {
  const vals=rows.map(row=>row[candidate]).filter(v=>v!==null && v!==undefined && String(v).trim()!=='');
  return vals.length>0 && vals.every(v=>Number.isFinite(v) || /^[-+]?\d[\d.,]*([eE][-+]?\d+)?$/.test(String(v).trim()));
}
function renderSubjects() {
  const area=byId('subject'), entries=new Map([...area.querySelectorAll('input')].map(i=>[i.name,i.value]));
  const scales=new Map([...area.querySelectorAll('select')].map(i=>[i.name,i.value]));area.replaceChildren();
  for(const checkbox of byId('features').querySelectorAll('input:checked')){
    const field=el('label',checkbox.value);const input=el('input');
    input.name=checkbox.value;input.type='number';input.step='any';input.required=true;
    input.value=entries.get(input.name) ?? (state.example ? ({area_m2:'75',vagas:'1'}[input.name] ?? '') : '');
    field.append(input);area.append(field);
    const label=el('label','Escala de '+checkbox.value), select=el('select');
    select.name=checkbox.value;select.append(new Option('Original','identity'),new Option('Logaritmo natural (ln)','log'));
    select.value=scales.get(checkbox.value)??'identity';label.append(select);area.append(label);
  }
  if(!area.children.length) area.append(el('p','Selecione pelo menos uma variável explicativa acima.'));
}
function features(preselected=[]) {
  const list=byId('features');list.replaceChildren();
  for(const key of state.numeric.filter(k=>k!==byId('target').value)){
    const label=el('label'),input=el('input');input.type='checkbox';input.value=key;input.checked=preselected.includes(key);
    label.append(input,document.createTextNode(key));list.append(label);
  }
  renderSubjects();
}
function setSample(dataset,name,isExample) {
  if(!dataset?.rows?.length||dataset.columns.length<2)throw new Error('Use ao menos duas colunas com cabeçalhos e uma linha de dados.');
  state.dataset=dataset;state.example=isExample;state.fileName=name;state.numeric=dataset.columns.filter(column=>numeric(column,dataset.rows));
  const keys=state.numeric;
  if(keys.length<2)throw new Error('O cálculo precisa de ao menos duas colunas numéricas. Confira os cabeçalhos e os valores da planilha.');
  const target=byId('target');target.replaceChildren();
  keys.forEach(key=>target.append(new Option(key,key)));
  target.value=keys.find(k=>/valor|preco|price/.test(normalize(k))) ?? keys.at(-1);
  byId('target-scale').value='identity';byId('subject').replaceChildren();features(isExample?['area_m2','vagas']:[]);
  const preview=table('Primeiras linhas da amostra',dataset.columns,dataset.rows.slice(0,6).map(r=>dataset.columns.map(c=>r[c])));
  byId('preview').replaceChildren(detail('Conferir as primeiras linhas',preview));
  byId('model-form').hidden=false;byId('empty-model').hidden=true;
  byId('project-save').disabled=false;
  status('sample-status',name+' · '+dataset.rows.length+' imóveis · '+dataset.columns.length+' colunas.');
}
function resetSample() {
  byId('project-save').disabled=true;status('project-status','');
  invalidate();state.dataset=null;state.example=false;byId('model-form').hidden=true;byId('empty-model').hidden=false;byId('preview').replaceChildren();
}
async function upload(file) {
  if(!file)return;
  const request=++state.request;resetSample();status('sample-status','Lendo a planilha no seu dispositivo…');
  try {
    if(!/\.(csv|xlsx)$/i.test(file.name))throw new Error('Escolha um arquivo .csv ou .xlsx.');
    const data=await (await engine()).readFile(file);
    if(request===state.request)setSample(data,file.name,false);
  }catch(error){if(request===state.request){resetSample();status('sample-status',error.message,true);}}
}
byId('sample-file').onchange=e=>{const file=e.target.files[0];e.target.value='';upload(file);};
byId('example').onclick=async()=>{
  const request=++state.request;resetSample();status('sample-status','Abrindo amostra fictícia…');
  try{
    const response=await fetch('/assets/modela/amostra-exemplo.csv');if(!response.ok)throw new Error('O exemplo não pôde ser carregado. Tente novamente.');
    const [head,...lines]=(await response.text()).trim().split(/\r?\n/);
    const columns=head.split(';'),rows=lines.map(line=>Object.fromEntries(line.split(';').map((x,i)=>[columns[i],i?Number(x):x])));
    if(request===state.request){setSample({columns,rows},'Exemplo fictício',true);byId('unit').value='BRL';}
  }catch(error){if(request===state.request)status('sample-status',error.message,true);}
};
const projectFormat='br.com.confenge.modelapro.regressao.v1';
const maxProjectBytes=32*1024*1024;

const logFeatures=()=>[...byId('subject').querySelectorAll('select')].filter(i=>i.value==='log').map(i=>i.name);
byId('project-save').onclick=()=>{
  if(!state.dataset)return;
  const {columns,rows}=state.dataset;
  const settings={
    target:byId('target').value,unit:byId('unit').value,targetScale:byId('target-scale').value,logFeatures:logFeatures(),
    features:[...byId('features').querySelectorAll('input:checked')].map(i=>i.value),
    subject:[...byId('subject').querySelectorAll('input')].map(i=>i.value===''?null:i.valueAsNumber),
  };
  const doc={format:projectFormat,name:state.fileName,example:state.example,columns,
    rows:rows.map(row=>columns.map(column=>row[column])),settings};
  const file=new Blob([JSON.stringify(doc)],{type:'application/json'});
  if(file.size>maxProjectBytes){status('project-status','O projeto excede 32 MB. Reduza a amostra para salvá-lo.',true);return;}
  const link=el('a');link.href=URL.createObjectURL(file);link.download='modela-pro-projeto.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  status('project-status','Projeto preparado para download.');
};

function validateProject(doc) {
  const invalid=()=>{throw new Error('Arquivo de projeto inválido. Escolha um projeto de regressão salvo pelo Modela Pro.');};
  if(doc?.format!==projectFormat||typeof doc.name!=='string'||doc.name.length>255||
     typeof doc.example!=='boolean'||!Array.isArray(doc.columns)||!Array.isArray(doc.rows)||!doc.settings)invalid();
  const {columns,rows,settings}=doc;
  if(columns.length<2||columns.length>100||!rows.length||rows.length>10000||
     rows.length*columns.length>250000||new Set(columns).size!==columns.length)invalid();
  if(columns.some(c=>typeof c!=='string'||!c.trim()||c.length>150||['row_id','constructor','prototype','__proto__'].includes(c)))invalid();
  const isCell=v=>v===null||typeof v==='string'||typeof v==='boolean'||Number.isFinite(v);
  const dataset={columns,rows:rows.map(row=>{
    if(!Array.isArray(row)||row.length!==columns.length||!row.every(isCell))invalid();
    return Object.fromEntries(columns.map((column,i)=>[column,row[i]]));
  })};
  const {target,features,unit,subject,targetScale='identity',logFeatures:logs=[]}=settings;
  if(!['BRL','BRL/m²'].includes(unit)||!Array.isArray(features)||features.length>columns.length||
     !Array.isArray(subject)||subject.length!==features.length||features.includes(target)||
     new Set(features).size!==features.length||features.some(f=>!columns.includes(f))||
     !columns.includes(target)||[target,...features].some(c=>!numeric(c,dataset.rows))||
     subject.some(v=>v!==null&&!Number.isFinite(v))||columns.filter(c=>numeric(c,dataset.rows)).length<2)invalid();
  if(!['identity','log'].includes(targetScale)||!Array.isArray(logs)||logs.some(f=>!features.includes(f))||
     new Set(logs).size!==logs.length)invalid();
  return {dataset,target,features,unit,subject,targetScale,logs,name:doc.name,example:doc.example};
}

byId('project-file').onchange=async event=>{
  const input=event.target,file=input.files[0];input.value='';
  if(!file)return;
  const request=++state.request;
  try {
    if(file.size>maxProjectBytes)throw new Error('Escolha um projeto de até 32 MB.');
    const project=validateProject(JSON.parse(await file.text()));
    if(request!==state.request)return;
    resetSample();setSample(project.dataset,project.name,project.example);
    byId('target').value=project.target;byId('unit').value=project.unit;
    byId('target-scale').value=project.targetScale;features(project.features);
    byId('subject').querySelectorAll('select').forEach(i=>{i.value=project.logs.includes(i.name)?'log':'identity';});
    const values=new Map(project.features.map((key,i)=>[key,project.subject[i]]));
    byId('subject').querySelectorAll('input').forEach(i=>{i.value=values.get(i.name)??'';});
    status('project-status','Projeto reaberto. Confira os dados e calcule a avaliação.');
  }catch(error){
    if(request===state.request)status('project-status',error instanceof SyntaxError?'O arquivo não contém um projeto JSON válido.':error.message,true);
  }
};
byId('target').onchange=()=>{invalidate();features();};
byId('features').onchange=()=>{invalidate();renderSubjects();};
byId('subject').oninput=invalidate;byId('subject').onchange=invalidate;byId('unit').onchange=invalidate;byId('target-scale').onchange=invalidate;
byId('cancel').onclick=()=>{invalidate();status('run-status','Cálculo cancelado. A amostra continua disponível.');};
byId('model-form').onsubmit=async event=>{
  event.preventDefault();if(!state.dataset||state.running)return;
  invalidate();const rev=state.revision;
  const selected=[...byId('features').querySelectorAll('input:checked')].map(input=>input.value);
  if(!selected.length){status('run-status','Marque pelo menos uma variável explicativa.',true);return;}
  const subject=Object.fromEntries([...byId('subject').querySelectorAll('input')].map(x=>[x.name,x.valueAsNumber]));
  const params={rows:state.dataset.rows,target:byId('target').value,features:selected,subject,unit:byId('unit').value,targetScale:byId('target-scale').value,logFeatures:logFeatures()};
  state.running=true;byId('run').disabled=true;byId('cancel').hidden=false;
  status('run-status','Calculando no dispositivo. No primeiro uso, aguarde o carregamento das bibliotecas estatísticas.');
  try {
    const worker=await engine();if(rev!==state.revision)return;
    const result=await worker.calculate(params);if(rev!==state.revision)return;
    if(!Number.isFinite(result.point))throw new Error((result.issues||[]).join(' ')||'O modelo não produziu estimativa. Revise a amostra e as variáveis.');
    state.analysis=result;state.tested=params;renderResult(result);status('run-status','Cálculo concluído.');
    byId('resultado').hidden=false;byId('resultado').querySelector('h2').focus({preventScroll:true});byId('resultado').scrollIntoView({block:'start'});
  } catch(error) {if(rev===state.revision)status('run-status',error.message||'Falha no cálculo. Revise a amostra e tente novamente.',true);}
  finally{if(rev===state.revision){state.running=false;byId('run').disabled=false;byId('cancel').hidden=true;}}
};

function renderResult(r) {
  const isLog=r.targetScale==='log';const diagValue=isLog?number:amount;
  const box=byId('results');box.replaceChildren();const values=el('dl');values.className='mp-values';
  const metric=(label,v)=>{const card=el('div');card.className='mp-value';card.append(el('dt',label),el('dd',v));values.append(card);};
  const interval=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)?p.map(amount).join(' a '):'Pendente';
  metric(isLog?'Estimativa retransposta para reais':'Estimativa central',amount(r.point));metric('Intervalo de confiança de 80%',interval(r.meanCI));metric('Intervalo de predição individual de 80%',interval(r.predictionInterval));
  box.append(values);byId('result-context').textContent=(state.example?'Exemplo fictício':'Amostra importada')+' · '+r.n+' observações utilizadas · '+r.k+' variáveis explicativas.';
  if(isLog) box.append(el('p','O preço estimado é a exponencial do valor ajustado em log. Com erros simétricos na escala logarítmica, corresponde à mediana condicional. A média em reais requer correção adicional. O método de retransposição usado deixa os intervalos monetários e o grau de precisão sem classificação.'));
  const fittedName=(key,log)=>log?'ln('+key+')':key;
  const eq=el('p');eq.className='mp-equation';
  eq.textContent=fittedName(state.tested.target,isLog)+' = '+(r.coefficients||[]).map((c,i)=>{const v=c.value;if(!Number.isFinite(v))return 'indefinido';const name=String(c.name??'');const intercept=/^(const(ant)?|intercept(o)?|\(intercept\))$/i.test(name);return(i?(v<0?' − ':' + '):(v<0?'−':''))+number(Math.abs(v))+(intercept?'':' × '+fittedName(name,r.logFeatures?.includes(name)));}).join('');
  if(r.coefficients?.length)box.append(eq);
  const gradeText=el('p','Precisão da estimativa: '+grade(r.precision)+'. Amplitude relativa do intervalo de confiança: '+(Number.isFinite(r.amplitude)?number(r.amplitude)+'%':'pendente')+'.');
  box.append(gradeText);
  box.append(detail('Conferir os atributos do avaliando',table('Atributos do imóvel avaliando',['Variável','Valor informado'],Object.entries(state.tested.subject).map(([key,val])=>[key,number(val)]))));
  if(r.items?.length)box.append(detail('Conferir o enquadramento por item',table('Enquadramento por item',['Item','Grau','Verificação'],r.items.map(x=>[x.item,grade(x.grade),x.description]))));
  box.append(el('p','A fundamentação também depende da caracterização do imóvel e da identificação dos comparáveis. O avaliador registra essas evidências para concluir o enquadramento do trabalho.'));
  const stats=[['R²',number(r.r2)],['R² ajustado',number(r.adjustedR2)],['Valor-p do teste F',pValue(r.fPValue)],['Extrapolação',r.extrapolation||'Pendente']];
  for(const d of r.diagnostics||[])stats.push([d.label,typeof d.value==='number'?number(d.value):d.value]);
  box.append(detail('Ver os diagnósticos estatísticos',table('Diagnósticos estatísticos',['Indicador','Resultado'],stats)));
  if(r.coefficients?.length)box.append(detail('Ver os coeficientes e testes t',table('Coeficientes',['Variável','Coeficiente','Valor-p'],r.coefficients.map(c=>[c.name,number(c.value),pValue(c.p)]))));
  if(r.residuals?.length){
    box.append(plots(r.residuals,state.tested.unit,isLog));
    const top=[...r.residuals].sort((a,b)=>(b.cook??-1)-(a.cook??-1)).slice(0,50);
    const info=el('div');info.append(el('p','Observações em ordem de influência pela distância de Cook. A memória de cálculo inclui todas as linhas.'),table('Resíduos e influência',['Observação',isLog?'Observado (ln)':'Observado',isLog?'Estimado (ln)':'Estimado',isLog?'Resíduo (ln)':'Resíduo','Distância de Cook','Alavancagem'],top.map(d=>[d.id,diagValue(d.observed),diagValue(d.predicted),diagValue(d.residual),number(d.cook),number(d.leverage)])));
    box.append(detail('Investigar resíduos e influência',info));
  }
  if(r.excludedRows?.length)box.append(el('p','Observações excluídas: '+r.excludedRows.join(', ')+'.'));
  if(r.issues?.length){const list=el('ul');r.issues.forEach(x=>list.append(el('li',x)));box.append(detail('Observações do cálculo',list));}
}
function pValue(v){return Number.isFinite(v)?(v>0&&v<0.00001?v.toExponential(3).replace('.',','):number(v)):'Pendente';}
byId('export-json').onclick=()=>{
  if(!state.analysis)return;
  const doc={programa:'Modela Pro',gerado_em:new Date().toISOString(),amostra:state.fileName,exemplo_ficticio:state.example,parametros:state.tested,resultado:state.analysis};
  const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='modela-pro-memoria.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
let closed=[];
window.addEventListener('beforeprint',()=>{closed=[...byId('results').querySelectorAll('details:not([open])')];closed.forEach(d=>d.open=true);});
window.addEventListener('afterprint',()=>{closed.forEach(d=>d.open=false);closed=[];});
byId('print').onclick=()=>window.print();
