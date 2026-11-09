import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { lerCSV, lerItensCSV, importarXlsx, moeda } from '../../ferramentas/orcamento-de-obras/sinapi-base.js';

const contexto={base:'Tabela de teste',uf:'SC',competencia:'2026-09',regime:'Sem desoneração',formato:'br'};
const colunas={codigo:0,descricao:1,unidade:2,preco:3};
test('CSV textual com aspas, cabeçalho mapeável, vírgula e R$ zero distinto de ausência',()=>{
  const r=lerItensCSV(lerCSV('cod;desc;un;sc\n0001;"Peça; teste";m²;1.234,50\nA;Sem preço;un;-\nB;Cedido;un;0'),colunas,contexto);
  assert.deepEqual(r.itens.map(x=>[x.codigo,x.preco]),[['0001','1234.50'],['A',null],['B','0']]);
  assert.equal(r.itens[0].descricao,'Peça; teste');assert.match(r.fonte,/SC · 2026-09/);
});
test('CSV sem metadados, com colunas ambíguas, preço inválido ou código repetido é rejeitado',()=>{
  const t=lerCSV('cod;desc;un;sc\n01;Peça;un;4,50');
  assert.throws(()=>lerItensCSV(t,colunas,{...contexto,uf:''}));
  assert.throws(()=>lerItensCSV(t,{...colunas,preco:2},contexto));
  assert.throws(()=>lerItensCSV({...t,linhas:[...t.linhas,...t.linhas]},colunas,contexto));
  for(const v of ['=7+3','-4,2','1.5','7,12345','1e3'])assert.throws(()=>moeda(v,'br'));
  assert.equal(moeda('2.375','decimal'),'2.375');
});
test('Arquivo que não é workbook SINAPI falha sem apresentar um preço',()=>{
  assert.throws(()=>importarXlsx(new Uint8Array([1,2,3]),'SC','C','SD'));
  assert.throws(()=>importarXlsx(new Uint8Array([]),'BR','I','SD'));
});

// Optional replay of the actual September 2026 workbook (13,631,798 bytes).
// Public mirror: github.com/troito0503/sinapi-base/blob/e13e2b708cc147370aa80a509730f9db386a7073/sinapi.xlsx
// Official report structure: CAIXA, "Novos Relatórios do SINAPI", Transferegov X FNTU.
// Preserve the input hash: later monthly releases should use their own reference outputs.
test('Workbook nacional real: seis abas, SC, códigos em fórmula literal, preços indisponíveis e regimes',
  {skip:!process.env.SINAPI_TEST_XLSX},()=>{
  const bytes=fs.readFileSync(process.env.SINAPI_TEST_XLSX);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2');
  for(const [t,r,preco,ausentes] of [['I','SD','213.23',743],['I','CD','213.23',743],['I','SE','213.23',743],['C','SD','163.08',2157],['C','CD','159.26',2157],['C','SE','135.95',2157]]){
    const {itens,fonte}=importarXlsx(bytes,'SC',t,r);
    assert.match(fonte,/09\/2026/);assert.equal(itens.length,t==='C'?10599:4878);
    assert.equal(itens[0].codigo,t==='C'?'104658':'45333');assert.equal(itens[0].preco,preco);
    assert.equal(itens.filter(x=>x.preco===null).length,ausentes);
  }
});
test('recorte das linhas 1 a 12 das seis abas reais, incluindo %AS e hiperlink de código',()=>{
  const bytes=fs.readFileSync(new URL('./sinapi-recorte-2026-09.xlsx',import.meta.url));
  for(const [tipo,regime,preco] of [['I','SD','213.23'],['C','SD','163.08'],['I','CD','213.23'],['C','CD','159.26'],['I','SE','213.23'],['C','SE','135.95']]){
    const {itens,fonte}=importarXlsx(bytes,'SC',tipo,regime);
    assert.match(fonte,/09\/2026/);assert.equal(itens[0].preco,preco);assert.equal(itens.length,2);
  }
});
