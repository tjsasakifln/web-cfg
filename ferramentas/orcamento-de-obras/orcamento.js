// Motor Precifica Obra Core 0.1.0, commit 85a193dc844f4441542e057283772fc75a3dccc0.
// O núcleo calcula custos unitários e composições. A planilha fecha cada serviço em centavos.
import {calculateBudget, Decimal} from './vendor/precifica.js';

const tipos = {material: 'MATERIAL', 'mão de obra': 'LABOR', equipamento: 'EQUIPMENT', outro: 'OTHER'};
export const limiteJson = 4 * 1024 * 1024;
export const novaPlanilha = () => ({versao: 1, titulo: '', bdi: '0', itens: []});
export const exemplo = () => ({versao: 1, titulo: 'Exemplo de reforma', bdi: '20', itens: [
  {etapa:'Preparação',codigo:'P01',descricao:'Proteção do piso',unidade:'m²',quantidade:'40',preco:'8.5',fonte:'Exemplo didático'},
  {etapa:'Acabamento',codigo:'A01',descricao:'Pintura de paredes',unidade:'m²',quantidade:'72.5',fonte:'Composição didática',composicao:[
    {tipo:'material',descricao:'Tinta',unidade:'L',coef:'0.25',preco:'22'},
    {tipo:'mão de obra',descricao:'Pintor com encargos',unidade:'h',coef:'0.3',preco:'35'}]},
  {etapa:'Acabamento',codigo:'A02',descricao:'Instalação de rodapé',unidade:'m',quantidade:'18',preco:'27.4',fonte:'Exemplo didático'},
]});

function texto(v, nome, max, obrigatorio = true) {
  if (typeof v !== 'string' || v.trim().length > max || (obrigatorio && !v.trim()) || /[\x00-\x1F]/.test(v)) throw new Error('Confira o campo ' + nome + '.');
  return v.trim();
}
function decimal(v, nome, positivo = false) {
  if (typeof v !== 'string' || !/^\d{1,12}(?:\.\d{1,4})?$/.test(v) || (positivo && new Decimal(v).isZero())) throw new Error('Confira ' + nome + '. Use um valor ' + (positivo ? 'maior que zero' : 'não negativo') + ' com até quatro casas decimais.');
  return new Decimal(v).toFixed();
}
export function numeroBR(valor, nome, positivo = false) {
  const s = valor.trim();
  if (!/^(?:\d{1,12}|\d{1,3}(?:\.\d{3}){1,3})(?:,\d{1,4})?$/.test(s)) throw new Error('Confira ' + nome + '. Use vírgula nos decimais, como em 12,50.');
  return decimal(s.replaceAll('.', '').replace(',', '.'), nome, positivo);
}
export function formatar(valor, casas) {
  const [i,f] = (casas === undefined ? new Decimal(valor).toFixed() : new Decimal(valor).toFixed(casas)).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g,'.') + (f ? ',' + f : '');
}
export function lerComposicao(s) {
  return s.split(/\r?\n/).filter(l => l.trim()).map((l,i) => {
    const partes = l.split(l.includes('\t') ? '\t' : ';').map(x=>x.trim());
    if (partes.length !== 5) throw new Error('Composição, linha ' + (i+1) + '. Informe tipo, insumo, unidade, coeficiente e preço.');
    const [tipo,descricao,unidade,coef,preco] = partes;
    return {tipo:tipo.toLocaleLowerCase('pt-BR'),descricao,unidade,coef:numeroBR(coef,'o coeficiente',true),preco:numeroBR(preco,'o preço do insumo')};
  });
}
export function validarItem(v) {
  if (!v || typeof v !== 'object') throw new Error('Serviço inválido.');
  const item = {etapa:texto(v.etapa,'etapa',80),codigo:texto(v.codigo,'código',40,false),descricao:texto(v.descricao,'serviço',1000),unidade:texto(v.unidade,'unidade',24),quantidade:decimal(v.quantidade,'a quantidade',true),fonte:texto(v.fonte,'referência',300,false)};
  if (!('composicao' in v)) return {...item,preco:decimal(v.preco,'o preço unitário')};
  if ('preco' in v || !Array.isArray(v.composicao) || !v.composicao.length || v.composicao.length>100) throw new Error('Informe de 1 a 100 insumos para compor o serviço.');
  item.composicao = v.composicao.map(i => {
    if (!i || !Object.hasOwn(tipos,i.tipo)) throw new Error('Use material, mão de obra, equipamento ou outro no tipo de insumo.');
    return {tipo:i.tipo,descricao:texto(i.descricao,'insumo',200),unidade:texto(i.unidade,'unidade do insumo',24),coef:decimal(i.coef,'o coeficiente',true),preco:decimal(i.preco,'o preço do insumo')};
  });
  return item;
}
export function validarPlanilha(p) {
  if (!p || p.versao !== 1 || !Array.isArray(p.itens) || p.itens.length>1000) throw new Error('Selecione um projeto JSON desta ferramenta, com até 1.000 serviços.');
  const bdi=decimal(p.bdi,'o BDI');
  if (new Decimal(bdi).gt('999.9999')) throw new Error('O limite do BDI nesta planilha é 999,9999%.');
  const validado={versao:1,titulo:texto(p.titulo,'nome da obra',160,false),bdi,itens:p.itens.map(validarItem)};
  if (new TextEncoder().encode(JSON.stringify(validado)).length > limiteJson) throw new Error('A planilha alcançou 4 MB. Separe o orçamento em dois projetos.');
  return validado;
}

export function calcular(p) {
  const projeto = validarPlanilha(p);
  const entradas = projeto.itens.map((i,n) => {
    const base={code:i.codigo || String(n+1),description:i.descricao,unit:i.unidade,quantity:i.quantidade};
    if (!i.composicao) return {...base,unitPrice:i.preco};
    return {...base,composition:{code:base.code,description:i.descricao,unit:i.unidade,items:i.composicao.map((k,j)=>({code:String(j+1),category:tipos[k.tipo],description:k.descricao,unit:k.unidade,coefficient:k.coef,unitPrice:k.preco}))}};
  });
  const calculados = entradas.length ? calculateBudget({items:entradas}).items : [];
  const etapas = new Map();
  let direto=new Decimal(0);
  const linhas = calculados.map((c,n)=>{
    const i=projeto.itens[n];
    // Multiplique os fatores da própria linha antes do arredondamento ao centavo.
    // Arredondar o produto a quatro casas e depois a duas cria um segundo arredondamento.
    const total=new Decimal(c.quantity).times(c.unitPrice).toDecimalPlaces(2);
    direto=direto.plus(total);
    etapas.set(i.etapa,(etapas.get(i.etapa) || new Decimal(0)).plus(total));
    return {...i,unitario:c.unitPrice,total:total.toFixed(2),indice:n};
  });
  const acrescimo=direto.times(projeto.bdi).div(100).toDecimalPlaces(2);
  return {linhas,etapas:[...etapas].map(([nome,total])=>({nome,total:total.toFixed(2)})),direto:direto.toFixed(2),acrescimo:acrescimo.toFixed(2),total:direto.plus(acrescimo).toFixed(2)};
}

export function csv(p, r) {
  const rows=[['Tipo','Etapa','Código','Serviço','Unidade','Quantidade','Preço unitário (R$)','Total (R$)','Referência','BDI (%)']];
  for (const e of r.etapas) {
    for (const l of r.linhas.filter(l=>l.etapa===e.nome)) rows.push(['Serviço',e.nome,l.codigo,l.descricao,l.unidade,formatar(l.quantidade),formatar(l.unitario,4),formatar(l.total,2),l.fonte,'']);
    rows.push(['Subtotal',e.nome,'','','','','',formatar(e.total,2),'','']);
  }
  for (const [tipo,v] of [['Custo direto',r.direto],['BDI',r.acrescimo],['Total do orçamento',r.total]]) rows.push([tipo,'','','','','','',formatar(v,2),'',tipo==='BDI'?formatar(p.bdi):'']);
  const cell=s=>'"'+(/^[=+\-@\t\r\n]/.test(s)?"'":"")+String(s).replaceAll('"','""')+'"';
  return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
