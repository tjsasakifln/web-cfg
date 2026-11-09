import {calcular, csv, exemplo, formatar, lerComposicao, limiteJson, novaPlanilha, numeroBR, validarPlanilha} from './orcamento.js';
import {tabDraft} from '/assets/js/tab-draft.mjs';

const q = id => document.getElementById(id);
const tool = 'orcamento-de-obras';
let projeto = novaPlanilha();
let resultado;
let editando = null;
let bdiValido = true;
let rascunho = false;
const moeda = valor => 'R$ ' + formatar(valor,2);
const avisar = texto => { q('avisos').textContent=texto; };
const draft = tabDraft('confenge.orcamento-de-obras.v2', () => projeto, () => false, avisar);

function guardar() {
  draft.schedule();
}
function elemento(tag, valor) {
  const el=document.createElement(tag);
  el.textContent=valor;
  return el;
}
function atualizar() {
  resultado=calcular(projeto);
  q('custo-direto').textContent=moeda(resultado.direto);
  q('valor-bdi').textContent=bdiValido ? moeda(resultado.acrescimo) : 'Confira o BDI';
  q('total-obra').textContent=bdiValido ? moeda(resultado.total) : 'Confira o BDI';
  const temItens=resultado.linhas.length>0;
  q('contagem').textContent=resultado.linhas.length+(resultado.linhas.length===1?' serviço':' serviços');
  q('sem-itens').hidden=temItens;
  q('rolagem').hidden=!temItens;
  q('excel').disabled=q('csv').disabled=q('json').disabled=!temItens || !bdiValido;
  const out=document.createDocumentFragment();
  q('lista-etapas').replaceChildren(...resultado.etapas.map(e=>new Option(e.nome,e.nome)));
  for (const e of resultado.etapas) {
    const grupo=document.createElement('tr');grupo.className='etapa';
    const nome=elemento('th',e.nome);nome.scope='row';nome.colSpan=4;
    const total=elemento('th',moeda(e.total));total.colSpan=2;
    grupo.append(nome,total);out.append(grupo);
    for (const l of resultado.linhas.filter(l=>l.etapa===e.nome)) {
      const tr=document.createElement('tr');
      const descricao=elemento('td',l.descricao);
      if (l.codigo || l.fonte) descricao.append(elemento('small',[l.codigo,l.fonte].filter(Boolean).join(' · ')));
      tr.append(descricao);
      for (const [rotulo,valor] of [['Unidade',l.unidade],['Quantidade',formatar(l.quantidade)],['Unitário (R$)',formatar(l.unitario,4)],['Total (R$)',formatar(l.total,2)]]) {
        const td=elemento('td',valor);td.dataset.rotulo=rotulo;tr.append(td);
      }
      const acoes=document.createElement('td');
      for (const [acao,rotulo] of [['editar','Editar'],['excluir','Excluir']]) {
        const btn=elemento('button',rotulo);
        btn.type='button';btn.className='linha-acao';btn.dataset.acao=acao;btn.dataset.indice=l.indice;
        btn.setAttribute('aria-label',rotulo+' '+l.descricao);
        acoes.append(btn);
      }
      tr.append(acoes);out.append(tr);
    }
  }
  q('linhas').replaceChildren(out);
}
function tipoPreco() {
  const analitico=q('tipo-preco').value==='composicao';
  q('campo-composicao').hidden=!analitico;
  q('campo-preco').hidden=analitico;
  q('preco').required=!analitico;
  q('preco').disabled=analitico;
  q('insumos').required=analitico;
  q('insumos').disabled=!analitico;
}
function limparEditor(etapa='') {
  q('editor-servico').reset();
  q('etapa').value=etapa;
  editando=null;rascunho=false;
  q('cancelar').hidden=true;
  q('titulo-editor').textContent='Adicionar serviço';
  q('gravar-item').textContent='Adicionar à planilha';
  q('erro-servico').textContent='';tipoPreco();
}
function preencher(i) {
  for (const k of ['etapa','codigo','descricao','unidade','fonte']) q(k).value=i[k];
  q('quantidade').value=formatar(i.quantidade);
  q('tipo-preco').value=i.composicao?'composicao':'preco';
  q('preco').value=i.composicao?'':formatar(i.preco);
  q('insumos').value=i.composicao?.map(k=>[k.tipo,k.descricao,k.unidade,formatar(k.coef),formatar(k.preco)].join('\t')).join('\n') || '';
  tipoPreco();
}
function trocarPlanilha(p) {
  projeto=validarPlanilha(p);bdiValido=true;
  q('nome-obra').value=projeto.titulo;q('bdi-obra').value=formatar(projeto.bdi);
  q('erro-bdi').textContent='';q('bdi-obra').removeAttribute('aria-invalid');
  limparEditor();atualizar();
}
function confirmarTroca() {
  return (!projeto.itens.length && !rascunho && !projeto.titulo) || confirm('Substituir o orçamento aberto? Salve uma cópia JSON para conservar a versão atual.');
}
function baixar(texto,nome,tipo) {
  const url=URL.createObjectURL(new Blob([texto],{type:tipo}));
  const a=document.createElement('a');a.href=url;a.download=nome;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

q('editor-servico').addEventListener('input',()=>{rascunho=true;q('erro-servico').textContent='';});
q('tipo-preco').addEventListener('change',tipoPreco);
q('editor-servico').addEventListener('submit',e=>{
  e.preventDefault();
  try {
    if(!bdiValido) throw new Error('Confira o BDI antes de adicionar o serviço.');
    const i={};
    for (const k of ['etapa','codigo','descricao','unidade','fonte']) i[k]=q(k).value.trim();
    i.quantidade=numeroBR(q('quantidade').value,'a quantidade',true);
    if (q('tipo-preco').value==='composicao') i.composicao=lerComposicao(q('insumos').value);
    else i.preco=numeroBR(q('preco').value,'o preço unitário');
    const itens=projeto.itens.slice();itens[editando??itens.length]=i;
    projeto=validarPlanilha({...projeto,itens});
    guardar();atualizar();limparEditor(i.etapa);
    avisar('Serviço salvo na etapa '+i.etapa+'.');q('titulo-planilha').focus();
    window.ConfengeTools?.emit('tool_complete',{tool});
  } catch(erro) {q('erro-servico').textContent=erro.message;}
});
q('linhas').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-acao]');if(!btn)return;
  const n=Number(btn.dataset.indice);const i=projeto.itens[n];
  if (btn.dataset.acao==='editar') {
    if(rascunho && !confirm('Descartar os dados ainda não adicionados ao orçamento?'))return;
    limparEditor();editando=n;preencher(i);
    q('titulo-editor').textContent='Editar serviço';q('gravar-item').textContent='Salvar alterações';q('cancelar').hidden=false;q('descricao').focus();
  } else {
    if(!confirm('Excluir o serviço “'+i.descricao+'”?'))return;
    if(editando===n)limparEditor();
    else if(editando!==null && editando>n)editando--;
    projeto.itens.splice(n,1);guardar();atualizar();avisar('Serviço excluído.');
  }
});
q('cancelar').onclick=()=>limparEditor();
q('bdi-obra').addEventListener('input',()=>{
  try {
    const bdi=numeroBR(q('bdi-obra').value,'o BDI');
    projeto=validarPlanilha({...projeto,bdi});bdiValido=true;
    q('erro-bdi').textContent='';q('bdi-obra').removeAttribute('aria-invalid');guardar();
  } catch(erro) {
    bdiValido=false;q('erro-bdi').textContent=erro.message;q('bdi-obra').setAttribute('aria-invalid','true');
  }
  atualizar();
});
q('nome-obra').addEventListener('input',()=>{projeto.titulo=q('nome-obra').value.trim();guardar();});
q('demonstrar').onclick=()=>{if(confirmarTroca()){trocarPlanilha(exemplo());guardar();avisar('Exemplo de reforma carregado.');}};
q('novo').onclick=()=>{if(confirmarTroca()){trocarPlanilha(novaPlanilha());guardar();avisar('Orçamento vazio aberto.');}};
q('excel').onclick=async()=>{
  if(!bdiValido||!resultado.linhas.length)return;
  try {
    const {planilhaExcel}=await import('./excel.js');
    baixar(await planilhaExcel(projeto),'CONFENGE-orcamento.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch(e) { avisar('Exportação Excel: '+e.message); }
};
q('csv').onclick=()=>{if(bdiValido)baixar(csv(projeto,resultado),'CONFENGE-orcamento.csv','text/csv;charset=utf-8');};
q('json').onclick=()=>{if(bdiValido)baixar(JSON.stringify(projeto),'CONFENGE-orcamento.json','application/json');};
q('abrir').onchange=async e=>{
  const arquivo=e.target.files[0];e.target.value='';if(!arquivo)return;
  try {
    if(arquivo.size>limiteJson)throw new Error('O arquivo excede 4 MB.');
    let lido;try{lido=JSON.parse(await arquivo.text());}catch{throw new Error('O arquivo não é um projeto JSON válido.');}
    const p=validarPlanilha(lido);
    if(confirmarTroca()){trocarPlanilha(p);guardar();avisar('Projeto aberto.');}
  } catch(erro){avisar(erro.message);}
};
let carregado=novaPlanilha();
try {
  const raw=draft.read();
  if(raw)carregado=validarPlanilha(raw);
} catch {avisar('O rascunho desta aba não pôde ser lido. Você pode abrir sua cópia JSON.');}
trocarPlanilha(carregado);
for (const id of ['demonstrar','nome-obra','bdi-obra','campos-servico','gravar-item','abrir','novo']) q(id).disabled=false;
window.ConfengeTools?.bindToolLifecycle({tool});
q('opcoes-importar').addEventListener('toggle',async function iniciarImportador(){
  if(!this.open || this.dataset.pronto)return;
  this.dataset.pronto='carregando';
  try {
    const {montarImportador}=await import('./sinapi-ui.js');
    montarImportador(q('importar-base'),i=>{
      if((rascunho||editando!==null) && !confirm('Preencher o editor com o preço selecionado?'))return;
      const etapa=q('etapa').value;
      limparEditor(etapa);
      for(const k of ['codigo','descricao','unidade','fonte'])q(k).value=i[k];
      q('preco').value=formatar(i.preco);rascunho=true;
      q('opcoes-importar').open=false;
      if(etapa)q('quantidade').focus();else q('etapa').focus();
    });
    this.dataset.pronto='sim';
  } catch {delete this.dataset.pronto;q('importar-base').textContent='A base não abriu. Feche esta seção e abra novamente para tentar de novo.';}
});
