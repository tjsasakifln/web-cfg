import {gerarCsv} from './csv-seguro.mjs';
import {extrairQuantitativos} from './quantitativos.mjs';
import {compararQuantitativos} from './comparar-core.mjs';
import {exportToolResult} from '/assets/js/tool-credits.mjs';

const $ = id => document.getElementById(id);
const estados = {
  alterado:'Valor alterado', igual:'Mesmo valor', elemento_so_a:'Elemento só em A', elemento_so_b:'Elemento só em B',
  quantidade_so_a:'Quantidade só em A', quantidade_so_b:'Quantidade só em B', sem_quantidades:'Sem quantidades diretas',
  id_ausente:'GlobalId ausente', id_duplicado:'GlobalId duplicado', quantidade_ambigua:'Quantidades ambíguas',
  unidade_inconclusiva:'Unidade inconclusiva', unidades_diferentes:'Unidades diferentes', dado_inconclusivo:'Dado inconclusivo',
};
const formato = new Intl.NumberFormat('pt-BR',{maximumSignificantDigits:15});
const porPagina = 40;
let comparacao, pagina = 0, ocupado = false;
function habilitar() {
  for (const id of ['arquivo-a','arquivo-b','exemplo']) $(id).disabled = ocupado;
  $('comparar').disabled = ocupado || !$('arquivo-a').files.length || !$('arquivo-b').files.length;
}
function limpar() {
  comparacao = null;
  $('resultado').hidden = true;
  $('mensagem').textContent = '';
}
function referencia(celula, linhas, lado) {
  if (!linhas.length) return;
  const el = document.createElement('small');
  el.textContent = lado + ' ' + linhas.map(l => '#' + l.id).join(', ');
  celula.append(el);
}
function exibir() {
  const lista = $('filtro').value === 'todas' ? comparacao.linhas : comparacao.linhas.filter(l=>l.estado !== 'igual');
  const inicio = pagina * porPagina;
  const fatia = lista.slice(inicio, inicio + porPagina);
  $('lista').replaceChildren();
  for (const l of fatia) {
    const tr = $('lista').insertRow();
    const elem = tr.insertCell();
    elem.textContent = l.objetoB || l.objetoA || 'Sem nome';
    const gid = document.createElement('small'); gid.textContent = l.globalId || 'GlobalId ausente'; elem.append(gid);
    referencia(elem,l.refA,'A'); referencia(elem,l.refB,'B');
    const q = tr.insertCell(); q.textContent = l.quantidade || '·';
    const fonte = document.createElement('small'); fonte.textContent = [l.conjunto, l.tipo].filter(Boolean).join(' · '); q.append(fonte);
    for(const [v,u] of [[l.a,l.unidadeA],[l.b,l.unidadeB],[l.diferenca,l.unidadeB]]) {
      const td=tr.insertCell(); td.className='numero';
      td.textContent = v == null ? '·' : formato.format(v) + (u ? ' '+u : '');
    }
    tr.insertCell().textContent = estados[l.estado];
  }
  $('legenda').textContent = lista.length ? 'Linhas ' + (inicio+1) + ' a ' + (inicio+fatia.length) + ' de ' + lista.length : 'Nenhuma linha neste filtro';
  $('pagina').textContent = lista.length ? 'Página '+(pagina+1)+' de '+Math.ceil(lista.length/porPagina) : '';
  $('anterior').disabled = !pagina;
  $('proxima').disabled = inicio + porPagina >= lista.length;
}
async function ler(lado, amostra, comModelo) {
  const nomeExemplo = lado === 'a' ? 'modelo-piloto.ifc' : 'modelo-piloto-r02.ifc';
  const arquivo = $('arquivo-'+lado).files[0];
  let bytes;
  if(amostra) {
    const resp=await fetch('../examples/'+nomeExemplo);
    if(!resp.ok) throw new Error('Uma revisão de exemplo não está disponível.');
    bytes=await resp.arrayBuffer();
  } else {
    if(!arquivo || !/\.ifc$/i.test(arquivo.name) || !arquivo.size || arquivo.size > 25*1024*1024) throw new Error('Escolha dois arquivos .ifc com conteúdo, de até 25 MiB cada.');
    bytes=await arquivo.arrayBuffer();
  }
  const rel = await comModelo(new Uint8Array(bytes),extrairQuantitativos);
  return {nome:amostra ? nomeExemplo : arquivo.name, rel};
}
async function processar(amostra) {
  if(ocupado) return;
  limpar(); ocupado=true; habilitar();
  try {
    $('mensagem').textContent='Lendo a revisão A…';
    const {comModelo}=await import('./ifc-runtime.mjs');
    const a=await ler('a',amostra,comModelo);
    $('mensagem').textContent='Lendo a revisão B…';
    const b=await ler('b',amostra,comModelo);
    comparacao=compararQuantitativos(a.rel,b.rel);
    $('arquivos').textContent='A · '+a.nome+' | B · '+b.nome;
    const c=comparacao.resumo.contagem;
    $('resumo').textContent = comparacao.linhas.length ? Object.entries(c).map(([k,n])=>estados[k]+': '+n).join(' · ') : 'Nenhuma ocorrência de IfcElement encontrada nas duas revisões.';
    $('filtro').value='destaques'; pagina=0; exibir(); $('resultado').hidden=false;
    $('mensagem').textContent='Comparação concluída.';
  } catch(err) {
    $('mensagem').textContent='A comparação não foi concluída. '+(err?.message || 'Confira os dois arquivos.');
  } finally {ocupado=false;habilitar();}
}
$('filtro').addEventListener('change',()=>{pagina=0;exibir();});
$('anterior').addEventListener('click',()=>{pagina--;exibir();});
$('proxima').addEventListener('click',()=>{pagina++;exibir();});
for(const id of ['arquivo-a','arquivo-b']) $(id).addEventListener('change',()=>{limpar();habilitar();});
$('comparar').addEventListener('click',()=>processar(false));
$('exemplo').addEventListener('click',()=>processar(true));
$('exportar').addEventListener('click',async()=>{if(!comparacao)return;const rows=[['elemento','global_id','quantidade','revisao_a','unidade_a','revisao_b','unidade_b','diferenca','situacao'],...comparacao.linhas.map(l=>[l.objetoB||l.objetoA,l.globalId,l.quantidade,l.a,l.unidadeA,l.b,l.unidadeB,l.diferenca,estados[l.estado]])];const content=gerarCsv(rows);await exportToolResult({toolId:'bim-comparar',format:'csv',content,deliver:()=>{const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='comparacao-ifc.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}});});
habilitar();
