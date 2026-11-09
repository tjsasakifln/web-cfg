import test from 'node:test';
import assert from 'node:assert/strict';
import { calcular, exportarCsv, valores } from '../ferramentas/caminho-critico-obra/cronograma.js';

test('rede de obra, ordem livre, marco final e folga da compra', () => {
  const rede = calcular('D;Estrutura;4;B,C\nC;Compra;3;A\nB;Fundações;5;A\nE;Entrega;0;D\nA;Mobilização;2');
  assert.equal(rede.duration, 11);
  assert.deepEqual(rede.criticalPath, ['A','B','D','E']);
  assert.deepEqual(valores(rede.tasks.find(t => t.id === 'C')), ['C','Compra',3,'A',2,5,4,7,2,'Não']);
});
test('todas as frentes empatadas são críticas; trabalho independente tem folga', () => {
  const rede = calcular('X;Ramo X;8\nY;Ramo Y;8\nZ;Fechamento;1;X,Y\nW;Paralela;4');
  assert.deepEqual(rede.tasks.filter(t => !t.slack).map(t => t.id).sort(), ['X','Y','Z']);
  assert.equal(rede.tasks.find(t => t.id === 'W').slack, 5);
});
test('copiar planilha, descarregar com UTF-8 e neutralizar fórmula', () => {
  const rede = calcular('A\t=1+1\t1\nB\tNome; "entre aspas"\t1\tA');
  const csv = exportarCsv(rede);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"Nome; ""entre aspas"""'));
});
test('recusa dados ambíguos e redes inválidas em português', () => {
  for (const [text, msg] of [
    ['', /1 a 500/], ['A;X;2\nA;Y;3', /em uso/],
    ['A;X;;', /dias inteiros/], ['A;X;1,5;', /dias inteiros/],
    ['A;X;1;B', /não aparece/], ['B;X;1;A\nA;Y;1;B', /circular/],
    ['B;X;1;A,A\nA;Y;1', /repetida/],
    ['A;X;1;;', /colunas/], ['1;A;3\n'.repeat(510), /500/],
  ]) assert.throws(() => calcular(text), msg);
});
