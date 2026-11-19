import {byId,table,format,csv,exportResult,message,catchAction} from '/assets/js/engineering-ui.mjs';
let result=null,revision=0,worker=null,timer;
function invalidate(){revision++;result=null;byId('resultado').hidden=true;if(worker)worker.terminate();clearTimeout(timer);worker=null;byId('analisar').disabled=false;}
function draw(lines){
 const svg=byId('desenho');svg.replaceChildren();if(!lines.length)return;
 let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
 for(const line of lines)for(const [x,y] of line){xmin=Math.min(xmin,x);ymin=Math.min(ymin,y);xmax=Math.max(xmax,x);ymax=Math.max(ymax,y);}
 const w=xmax-xmin||1,h=ymax-ymin||1,pad=Math.max(w,h)*.04;
 svg.setAttribute('viewBox',[xmin-pad,-ymax-pad,w+2*pad,h+2*pad].join(' '));
 const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('fill','none');group.setAttribute('stroke','#245d47');group.setAttribute('stroke-width',String(Math.max(w,h)/600));
 for(const [a,b] of lines){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',a[0]);line.setAttribute('y1',-a[1]);line.setAttribute('x2',b[0]);line.setAttribute('y2',-b[1]);group.append(line);}svg.append(group);
}
async function analyze(text){
 invalidate();const token=revision;byId('analisar').disabled=true;message('Lendo geometrias, blocos e unidades…');
 worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
 const done=()=>{worker?.terminate();worker=null;clearTimeout(timer);byId('analisar').disabled=false;};
 worker.onmessage=({data})=>{
  if(token!==revision)return;done();if(!data.ok){message(data.message,true);return;}
  result=data.result;
  table('camadas',['Camada','Entidades medidas','Comprimento (m)','Área de contornos (m²)'],result.layers.map(r=>[r.layer,r.count,format(r.length),format(r.area)]));
  table('blocos',['Camada','Bloco','Instâncias'],result.blocks.map(r=>[r.layer,r.name,r.count]));
  table('textos',['Camada','Tipo','Texto'],result.texts.slice(0,500).map(r=>[r.layer,r.type,r.text]));
  table('avisos',['Não incluído no quantitativo','Quantidade'],result.warnings.map(r=>[r.type,r.count]));
  byId('avisos-card').hidden=!result.warnings.length;
  byId('resumo').textContent=result.layers.length+' camadas medidas, '+result.blocks.reduce((s,r)=>s+r.count,0)+' instâncias de blocos e '+result.texts.length+' textos. Unidade: '+format(result.metresPerUnit,9)+' m por unidade do desenho.';
  draw(result.preview);byId('resultado').hidden=false;message('Levantamento concluído. Confira as unidades e os itens não incluídos antes de exportar.');
 };
 worker.onerror=()=>{if(token!==revision)return;done();message('Não foi possível interpretar o arquivo. Confira se é um DXF ASCII íntegro.',true);};
 timer=setTimeout(()=>{if(token!==revision)return;done();message('A leitura ultrapassou 30 segundos. Divida o desenho em arquivos menores.',true);},30000);
 worker.postMessage({text,unit:byId('unidade').value});
}
byId('arquivo').addEventListener('change',invalidate);byId('unidade').addEventListener('change',invalidate);
byId('analisar').addEventListener('click',catchAction(async()=>{
 const file=byId('arquivo').files[0];if(!file)throw Error('Selecione um DXF ou use o exemplo.');if(file.size>20*1024*1024)throw Error('Escolha um arquivo de até 20 MiB.');
 const token=revision;const text=await file.text();if(token!==revision)return;await analyze(text);
}));
byId('exemplo').addEventListener('click',catchAction(async()=>{
 invalidate();const token=revision;byId('analisar').disabled=true;message('Carregando o exemplo DXF…');
 let text;
 try{
  const response=await fetch('./exemplo.dxf');
  if(token!==revision)return;
  if(!response.ok)throw Error('Não foi possível abrir o exemplo.');
  text=await response.text();
 }catch(error){
  if(token!==revision)return;
  byId('analisar').disabled=false;throw error;
 }
 if(token!==revision)return;byId('unidade').value='';await analyze(text);
}));
byId('csv').addEventListener('click',catchAction(async()=>{
 if(!result)return;
 const rows=[['CONFENGE','Quantitativos DXF'],['Metros por unidade',result.metresPerUnit],['Camada','Entidades','Comprimento (m)','Área algébrica dos contornos (m²)'],...result.layers.map(r=>[r.layer,r.count,r.length,r.area]),[],['Camada','Bloco','Instâncias'],...result.blocks.map(r=>[r.layer,r.name,r.count]),[],['Camada','Tipo','Texto'],...result.texts.map(r=>[r.layer,r.type,r.text]),[],['Item não medido','Quantidade'],...result.warnings.map(r=>[r.type,r.count])];
 await exportResult('quantitativos-dxf','csv','CONFENGE-quantitativos-dxf.csv',csv(rows),'text/csv;charset=utf-8');
}));
byId('json').addEventListener('click',catchAction(async()=>{
 if(!result)return;const {preview,...output}=result;
 await exportResult('quantitativos-dxf','json','CONFENGE-quantitativos-dxf.json',JSON.stringify({schema:'confenge.dxf-takeoff/v1',...output},null,2),'application/json');
}));
