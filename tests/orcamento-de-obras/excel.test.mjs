import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaExcel } from '../../ferramentas/orcamento-de-obras/excel.js';
import { exemplo } from '../../ferramentas/orcamento-de-obras/orcamento.js';
import { unzipSync } from '../../ferramentas/orcamento-de-obras/vendor/leitura-tabelas.js';

test('exporta as três abas e preserva fórmulas editáveis sem executar texto do projeto', async () => {
  const projeto = exemplo();
  projeto.titulo = '=WEBSERVICE("https://example.invalid")';
  projeto.itens[0].descricao = '+cmd';
  const zip = unzipSync(await planilhaExcel(projeto));
  const ler = name => new TextDecoder().decode(zip['xl/' + name + '.xml']);
  const livro = ler('workbook');
  for (const nome of ['Resumo', 'Orçamento', 'Composições']) assert.ok(livro.includes('name="' + nome + '"'));
  const resumo = ler('worksheets/sheet1');
  const detalhes = ler('worksheets/sheet2');
  assert.match(resumo, /t="inlineStr"><is><t[^>]*>=WEBSERVICE/);
  assert.match(detalhes, /t="inlineStr"><is><t[^>]*>\+cmd/);
  assert.match(resumo, /<f>SUM\(B3:B4\)<\/f><v>2391\.84<\/v>/);
  for (const i of [1, 2, 3]) {
    const formulas = [...ler('worksheets/sheet' + i).matchAll(/<f>([^<]*)<\/f>/g)];
    assert.ok(formulas.length > 0);
    assert.ok(formulas.every(([, f]) => /^(?:SUM|ROUND)\(/.test(f)));
  }
});
