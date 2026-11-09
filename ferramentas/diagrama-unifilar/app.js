import {compilar,exemplo,normalizar,portas,proximoId,svgDiagrama,tipos,vazio} from './modelo.js';
const $=id=>document.getElementById(id);
const storage='confenge-unifilar-v1', history=[];
let doc=exemplo();
function avisar(msg){$('estado').textContent=msg;}
try{const s=localStorage.getItem(storage);if(s)doc=normalizar(JSON.parse(s));}
catch{avisar('Não foi possível recuperar o projeto local. O exemplo está aberto.');}
for(const [key,label] of tipos)$('tipo').add(new Option(label,key));
function zoom(){$('visor').dataset.zoom=$('zoom').value;}
$('zoom').addEventListener('change',zoom);
function fields(){
  const item=doc.equipamentos.find(e=>e.id===$('equip').value);
  $('nome').value=item?.nome||'';$('tipo').value=item?.tipo||'breaker';$('tipo').disabled=!!item;
  $('x').value=item?.x??(doc.equipamentos.length%3)*125;
  $('y').value=item?.y??(Math.floor(doc.equipamentos.length/3)*100);
  $('gravar').textContent=item?'Aplicar alterações':'Adicionar equipamento';$('apagar').disabled=!item;
}
function render(id){
  const m=compilar(doc);$('visor').innerHTML=svgDiagrama(doc);zoom();$('titulo').value=doc.titulo;
  const equip=$('equip');equip.replaceChildren(new Option('Novo equipamento',''));
  const choices=[];for(const e of doc.equipamentos){equip.add(new Option(e.id+' · '+e.nome,e.id));for(const [ref,p] of portas(e))choices.push([ref,e.id+' · '+e.nome+' · '+p]);}
  equip.value=id||'';fields();
  for(const select of [$('de'),$('para')])select.replaceChildren(...choices.map(([ref,label])=>new Option(label,ref)));
  if(choices.length>1)$('para').selectedIndex=Math.min(choices.length-1,choices.findIndex(x=>x[0].split('.')[0]!==choices[0][0].split('.')[0]));
  $('fios').replaceChildren(...doc.ligacoes.map((wire,i)=>new Option(wire.join(' ↔ '),String(i))));
  $('desligar').disabled=!doc.ligacoes.length;$('ligar').disabled=doc.equipamentos.length<2;$('desfazer').disabled=!history.length;
  const semLig=m.diagnostics.filter(d=>d.code==='W001').length;
  $('contagem').textContent=doc.equipamentos.length+' equipamentos · '+m.wireRenders.size+' ligações · '+semLig+' isolados';
}
function commit(next,id,msg){
  try{
    const clean=normalizar(next);history.push(doc);if(history.length>35)history.shift();doc=clean;
    render(id);persistir(msg);
  }catch(e){avisar(e.message);}
}
function persistir(msg){try{localStorage.setItem(storage,JSON.stringify(doc));avisar(msg);}catch{avisar(msg+' Salve o JSON para conservar seu projeto.');}}
$('equip').addEventListener('change',fields);
$('gravar').onclick=()=>{
  let id=$('equip').value;const novo=!id;
  const next=structuredClone(doc);
  if(!id)id=proximoId(doc.equipamentos);
  if(!$('x').value.trim()||!$('y').value.trim()){avisar('Informe a posição X e Y na folha.');return;}
  const item={id,tipo:$('tipo').value,nome:$('nome').value.trim(),x:Number($('x').value),y:Number($('y').value)};
  if(novo)next.equipamentos.push(item);else next.equipamentos[next.equipamentos.findIndex(e=>e.id===id)]=item;
  commit(next,id,novo?'Equipamento adicionado.':'Equipamento atualizado.');
};
$('apagar').onclick=()=>{const id=$('equip').value;if(!id)return;const next=structuredClone(doc);next.equipamentos=next.equipamentos.filter(e=>e.id!==id);next.ligacoes=next.ligacoes.filter(w=>w.every(end=>end.split('.')[0]!==id));commit(next,'','Equipamento e suas ligações removidos.');};
$('ligar').onclick=()=>{const next=structuredClone(doc);next.ligacoes.push([$('de').value,$('para').value]);commit(next,$('equip').value,'Ligação criada.');};
$('desligar').onclick=()=>{const next=structuredClone(doc);next.ligacoes.splice($('fios').selectedIndex,1);commit(next,$('equip').value,'Ligação removida.');};
$('desfazer').onclick=()=>{if(!history.length)return;doc=history.pop();render();persistir('Última ação desfeita.');};
$('titulo').onchange=()=>{const next=structuredClone(doc);next.titulo=$('titulo').value.trim();commit(next,$('equip').value,'Título atualizado.');};
$('novo').onclick=()=>commit(vazio(),'','Projeto vazio. Use Desfazer para voltar.');
$('exemplo').onclick=()=>commit(exemplo(),'','Exemplo carregado. Use Desfazer para voltar.');
$('abrir').onchange=async()=>{const input=$('abrir'),file=input.files[0];if(!file)return;try{if(file.size>500000)throw Error('O projeto excede 500 KB.');const next=JSON.parse(await file.text());commit(next,'','Projeto aberto.');}catch{avisar('Não foi possível abrir o JSON. Selecione um arquivo salvo neste editor.');}finally{input.value='';}};
function baixar(data,type,ext){
 const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download='diagrama-unifilar.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('salvar').onclick=()=>baixar(JSON.stringify(doc,null,2),'application/json','json');
$('exportar').onclick=()=>baixar(svgDiagrama(doc),'image/svg+xml;charset=utf-8','svg');
render();$('controle').disabled=false;
