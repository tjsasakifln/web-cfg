import { Papa, SaxesParser, unzipSync } from './vendor/leitura-tabelas.js';

export const ufs = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
export const regimes = { SD: 'Sem desoneração', CD: 'Com desoneração', SE: 'Sem encargos sociais' };
export const tipos = { I: 'Insumos', C: 'Composições' };
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

function validText(value, label, max = 1000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > max || /[\x00-\x08\x0e-\x1f]/.test(text)) throw Error(label + ' ausente ou inválido.');
  return text;
}

export function moeda(raw, formato = 'decimal') {
  let value = String(raw ?? '').trim();
  if (['', '-', '–', '—'].includes(value)) return null;
  if (formato === 'br') {
    if (!/^\d+(?:,\d{1,4})?$/.test(value) && !/^\d{1,3}(?:\.\d{3})+(?:,\d{1,4})?$/.test(value)) {
      throw Error('Preço inválido. Use o formato selecionado e até quatro casas decimais.');
    }
    value = value.replace(/\./g, '').replace(',', '.');
  }
  if (!/^\d{1,10}(?:\.\d{1,4})?$/.test(value)) throw Error('Preço inválido ou acima do limite de dez dígitos e quatro casas decimais.');
  return value.replace(/^0+(?=\d)/, '');
}

export function lerCSV(text, separador) {
  if (text.length > 12_000_000) throw Error('O CSV excede 12 MB.');
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), { delimiter: separador || '', delimitersToGuess: [';', '\t', ','], skipEmptyLines: 'greedy' });
  if (parsed.errors.length) throw Error('O delimitador ou as aspas do CSV estão inconsistentes.');
  const [cabecalho, ...linhas] = parsed.data;
  if (!cabecalho || cabecalho.length < 4 || cabecalho.length > 200 || !linhas.length || linhas.length > 60000) {
    throw Error('Use um CSV com cabeçalho, pelo menos quatro colunas e até 60 mil itens.');
  }
  return { cabecalho, linhas };
}

export function lerItensCSV(tabela, colunas, contexto) {
  const {base, uf, competencia, regime, formato} = contexto;
  if (!ufs.includes(uf) || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(competencia) || !regime) throw Error('Informe UF, mês de referência e regime da tabela.');
  const fonte = [validText(base,'Base',55),uf,competencia,validText(regime,'Regime',36)].join(' · ');
  const indexes = ['codigo','descricao','unidade','preco'].map(key => colunas[key]);
  if (indexes.some(i => !Number.isInteger(i) || i < 0 || i >= tabela.cabecalho.length) || new Set(indexes).size !== 4) throw Error('Escolha quatro colunas diferentes.');
  const seen = new Set();
  const itens = tabela.linhas.map((row,i) => {
    try {
      if (row.length !== tabela.cabecalho.length) throw Error('Número de colunas diferente do cabeçalho.');
      const [c,d,u,p] = indexes.map(index => row[index]);
      const codigo = validText(c,'Código',40);
      if (seen.has(codigo)) throw Error('Código repetido na base: '+codigo);
      seen.add(codigo);
      return {codigo,descricao:validText(d,'Descrição'),unidade:validText(u,'Unidade',24),preco:moeda(p,formato),fonte};
    } catch (err) { throw Error('Linha '+(i+2)+'. '+err.message); }
  });
  return {itens, fonte};
}

function xml(bytes, open, close, text) {
  const sax = new SaxesParser();
  sax.on('doctype', () => { throw Error('Declaração DTD não aceita em XLSX.'); });
  sax.on('opentag', open);
  if (close) sax.on('closetag', close);
  if (text) sax.on('text', text);
  const decoder = new TextDecoder('utf-8',{fatal:true});
  for (let start=0; start<bytes.length; start+=65536) sax.write(decoder.decode(bytes.subarray(start,start+65536),{stream:true}));
  sax.write(decoder.decode()).close();
}

function extrair(bytes, nomes) {
  const wanted = new Set(nomes);
  let total = 0;
  const result = unzipSync(bytes, {filter: file => {
    if (!wanted.has(file.name)) return false;
    if (file.originalSize > 64_000_000 || (total += file.originalSize) > 96_000_000) throw Error('A planilha descompactada excede o limite de leitura.');
    return true;
  }});
  return result;
}

function strings(bytes) {
  const out = [];
  if (!bytes) return out;
  let current = '', texto = false;
  xml(bytes, tag => {
    if (tag.name === 'si') current = '';
    if (tag.name === 't') texto = true;
  }, tag => {
    if (tag.name === 't') texto = false;
    if (tag.name === 'si') out.push(current);
  }, chunk => { if (texto) current += chunk; });
  return out;
}

function lerLinhas(bytes, shared, processar) {
  let row, column, type, field, valor, formula;
  xml(bytes, tag => {
    if (tag.name === 'row') row = [];
    if (tag.name === 'c') {
      const letters = /^[A-Z]+/.exec(tag.attributes.r || '')?.[0];
      if (!letters || letters.length > 3) throw Error('Endereço de célula inválido.');
      column = 0;
      for (const ch of letters) column = column * 26 + ch.charCodeAt(0) - 64;
      type = tag.attributes.t; valor=''; formula=''; field='';
    }
    if (['v','f','t'].includes(tag.name)) field = tag.name;
  }, tag => {
    if (tag.name === 'c' && row) {
      if (formula && /^HYPERLINK\(/i.test(formula)) {
        // The CAIXA workbook caches 0 for these cells. Use only the verified
        // duplicated literal code in MATCH and display text. Never run formulas.
        const code = /,MATCH\((\d+),[^,]+,0\).*?,(\d+)\)$/i.exec(formula);
        if (code && code[1] === code[2]) valor = code[1];
      }
      row[column-1] = type === 's' ? shared[Number(valor)] : valor;
    }
    if (tag.name === 'row') { processar(row); row = null; }
    if (tag.name === field) field='';
  }, chunk => {
    if (field === 'f') formula += chunk;
    else if (field === 't' || field === 'v') valor += chunk;
  });
}

export function importarXlsx(buffer, uf, tipo, regime) {
  if (!ufs.includes(uf) || !tipos[tipo] || !Object.hasOwn(regimes,regime)) throw Error('Selecione UF, relatório e regime.');
  const bytes = new Uint8Array(buffer);
  if (bytes.length > 32_000_000) throw Error('O XLSX excede 32 MB.');
  const wb='xl/workbook.xml', rel='xl/_rels/workbook.xml.rels', shared='xl/sharedStrings.xml';
  const meta=extrair(bytes,[wb,rel]);
  if (!meta[wb] || !meta[rel]) throw Error('Abra o XLSX de referências extraído do ZIP.');
  let id='', sheet='';
  xml(meta[wb], t => {if (t.name==='sheet' && t.attributes.name===tipo+regime) id=t.attributes['r:id'];});
  if (!id) throw Error('O XLSX não contém a aba '+tipo+regime+'. Escolha o arquivo de referências do SINAPI.');
  xml(meta[rel], t => {if (t.name==='Relationship' && t.attributes.Id===id) sheet=String(t.attributes.Target).replace(/^\/xl\//,'');});
  if (!/^worksheets\/sheet\d+\.xml$/.test(sheet)) throw Error('Referência interna da aba inválida.');
  const path='xl/'+sheet;
  const parts=extrair(bytes,[path,shared]);
  if (!parts[path]) throw Error('A aba selecionada está ausente.');
  const itens=[], codes=new Set();
  let numero=0, competencia='', ufCols=[], indices, fonte='', regimeValidado=false;
  lerLinhas(parts[path],strings(parts[shared]), row => {
    numero++;
    if (!indices) {
      if (numero>40) throw Error('O cabeçalho não corresponde ao relatório de referências.');
      const h=row.map(norm);
      if (h[0]?.includes('RELATORIO DE')) {
        regimeValidado=h[0].includes(norm(regimes[regime])) && h[0].includes(tipo==='C'?'CUSTOS DE COMPOSICOES':'PRECOS DE INSUMOS');
      }
      if (h[0]?.startsWith('MES DE REFERENCIA')) competencia=/^(?:0[1-9]|1[0-2])\/\d{4}$/.test(row[1])?row[1]:'';
      if (h.includes(uf)) ufCols=h;
      const c=h.indexOf(tipo==='C'?'CODIGO DA COMPOSICAO':'CODIGO DO INSUMO');
      if (c < 0) return;
      const d=h.findIndex(v=>v==='DESCRICAO' || v==='DESCRICAO DO INSUMO'), u=h.indexOf('UNIDADE'), p=ufCols.indexOf(uf);
      if (d<0 || u<0 || p<0 || (tipo==='C' && h[p]!=='CUSTO (R$)') || !competencia || !regimeValidado) throw Error('Cabeçalho, competência ou regime do XLSX não reconhecidos.');
      indices={c,d,u,p};fonte=['SINAPI '+tipos[tipo],uf,competencia,regimes[regime]].join(' · ');return;
    }
    const {c,d,u,p}=indices;
    if (!row[c] && !row[d] && !row[u]) return;
    const codigo=String(row[c]??'').trim();
    if (!/^\d+$/.test(codigo) || !/[1-9]/.test(codigo) || codes.has(codigo)) throw Error('Código ausente, ambíguo ou repetido na linha '+numero+'. Confira o leiaute do arquivo.');
    codes.add(codigo);
    let raw = row[p];
    if (typeof raw === 'string' && /^\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(raw)) {
      const numeric = Number(raw), fixed = numeric.toFixed(4);
      if (!Number.isFinite(numeric) || Math.abs(numeric - Number(fixed)) > 1e-8) throw Error('Precisão de preço inesperada na linha '+numero+'.');
      raw = fixed.replace(/0+$/, '').replace(/\.$/, '');
    }
    const valor=moeda(raw);
    // SINAPI's synthetic reports use a zero cost when constituent prices are missing.
    const preco=valor===null || Number(valor)===0 ? null : valor;
    itens.push({codigo,descricao:validText(row[d],'Descrição'),unidade:validText(row[u],'Unidade',24),preco,fonte});
    if(itens.length>60000) throw Error('A aba excede 60 mil itens.');
  });
  if (!itens.length) throw Error('Nenhuma referência válida foi encontrada.');
  return {itens,fonte};
}
