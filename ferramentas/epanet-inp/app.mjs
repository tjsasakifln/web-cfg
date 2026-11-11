import{byId,number,table,format,csv,exportResult,message,catchAction}from'/assets/js/engineering-ui.mjs';
let result=null,revision=0,worker=null,timer;
function invalidate(){revision++;result=null;byId('resultado').hidden=true;worker?.terminate();worker=null;clearTimeout(timer);byId('executar').disabled=false;}
for(const id of ['arquivo','modo','identificador','vazao'])byId(id).addEventListener('change',invalidate);
for(const id of ['identificador','vazao'])byId(id).addEventListener('input',invalidate);
byId('modo').addEventListener('change',()=>{byId('vazao-campo').hidden=byId('modo').value!=='fire';byId('id-campo').hidden=byId('modo').value==='base';});
function show(){
 const b=result.base,v=result.variant,s=v||b,t=Number(byId('instante').value);
 const snap=s.series[t];const baseline=b.series.find(x=>x.seconds===snap.seconds);
 table('nos',['Nó','Pressão ('+s.unit.pressure+')','Variação de pressão','Demanda atendida ('+s.unit.flow+')'],snap.nodes.map(n=>{const old=baseline?.nodes.find(x=>x.id===n.id);return[n.id,format(n.pressure),v&&old?format(n.pressure-old.pressure):'Não comparável',format(n.demand)];}));
 table('trechos',['Trecho','Vazão ('+s.unit.flow+')','Velocidade ('+s.unit.velocity+')','Estado'],snap.links.map(n=>[n.id,format(n.flow),format(n.velocity),n.status===0?'Fechado':'Aberto/ativo']));
 table('minimos',['Nó','Menor pressão ('+s.unit.pressure+')','Hora'],s.minPressure.map(n=>[n.id,format(n.pressure),format(n.seconds/3600,3)]));
}
async function run(text){
 invalidate();const token=revision;const mode=byId('modo').value,scenario={mode};if(mode!=='base')scenario.id=byId('identificador').value.trim();if(mode==='fire')scenario.flow=number(byId('vazao').value,'Vazão adicional',.000001,1e6);
 worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});byId('executar').disabled=true;message('Executando EPANET no seu navegador…');
 const done=()=>{worker?.terminate();worker=null;clearTimeout(timer);byId('executar').disabled=false;};
 worker.onmessage=({data})=>{if(token!==revision)return;done();if(!data.ok){message(data.message,true);return;}result=data.result;const s=result.variant||result.base;
  byId('resumo').textContent=s.counts.nodes+' nós, '+s.counts.links+' trechos, '+s.steps+' instantes até '+format(s.duration/3600,2)+' h. Vazão em '+s.unit.flow+' e pressão em '+s.unit.pressure+'.';
  byId('instante').replaceChildren(...s.series.map((x,i)=>{const o=document.createElement('option');o.value=i;o.textContent=format(x.seconds/3600,3)+' h';return o;}));
  show();byId('resultado').hidden=false;message('Simulação concluída. Confira demanda atendida, pressões e premissas antes de usar o resultado.');
 };
 worker.onerror=()=>{done();message('O motor não concluiu. Verifique a sintaxe e os limites do INP.',true);};timer=setTimeout(()=>{done();message('O cálculo ultrapassou 60 segundos. Reduza o modelo ou a duração.',true);},60000);worker.postMessage({text,scenario});
}
byId('executar').addEventListener('click',catchAction(async()=>{const f=byId('arquivo').files[0];if(!f)throw Error('Escolha um arquivo INP ou teste o exemplo.');if(f.size>1024*1024)throw Error('O limite é 1 MiB.');const token=revision,text=await f.text();if(token===revision)await run(text);}));
byId('exemplo').addEventListener('click',catchAction(async()=>{const token=revision,r=await fetch('./exemplo.inp');if(!r.ok)throw Error('Exemplo indisponível.');const text=await r.text();if(token!==revision)return;byId('modo').value='fire';byId('id-campo').hidden=false;byId('vazao-campo').hidden=false;byId('identificador').value='A';byId('vazao').value='2,5';await run(text);}));
byId('instante').addEventListener('change',()=>{if(result)show();});
byId('csv').addEventListener('click',catchAction(async()=>{if(!result)return;const rows=[['CONFENGE','EPANET INP'],['Motor',result.base.engine],['Cenário','Tempo (s)','Nó','Pressão ('+result.base.unit.pressure+')','Carga ('+result.base.unit.head+')','Demanda ('+result.base.unit.flow+')']];for(const [name,s]of[['Base',result.base],['Alterado',result.variant]])if(s)for(const x of s.series)for(const n of x.nodes)rows.push([name,x.seconds,n.id,n.pressure,n.head,n.demand]);rows.push([],['Cenário','Tempo (s)','Trecho','Vazão ('+result.base.unit.flow+')','Velocidade ('+result.base.unit.velocity+')','Estado']);for(const[name,s]of[['Base',result.base],['Alterado',result.variant]])if(s)for(const x of s.series)for(const l of x.links)rows.push([name,x.seconds,l.id,l.flow,l.velocity,l.status]);await exportResult('epanet-inp','csv','CONFENGE-EPANET.csv',csv(rows),'text/csv;charset=utf-8');}));
byId('inp').addEventListener('click',catchAction(async()=>{if(!result)return;await exportResult('epanet-inp','inp','CONFENGE-cenario.inp',(result.variant||result.base).inp,'text/plain;charset=utf-8');}));
byId('json').addEventListener('click',catchAction(async()=>{if(!result)return;await exportResult('epanet-inp','json','CONFENGE-EPANET.json',JSON.stringify({schema:'confenge.epanet/v1',...result},null,2),'application/json');}));
