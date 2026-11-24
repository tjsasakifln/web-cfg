import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calcular } from '../ferramentas/caminho-critico-obra/cronograma.js';
import { LIMITE_VISUAL_DIAS, diaRelativo, modoVisualGantt, prepararTarefasGantt } from '../ferramentas/caminho-critico-obra/gantt-data.js';

test('adapta a rede CPM sem recalcular datas, vínculos ou criticidade', () => {
  const rede = calcular('A;Mobilização;2\nB;Fundações;5;A\nC;Compra;3;A\nD;Estrutura;4;B,C\nE;Entrega;0;D');
  const tarefas = prepararTarefasGantt(rede);
  const fundacoes = tarefas.find(t => t.id === 'B');
  const compra = tarefas.find(t => t.id === 'C');
  const entrega = tarefas.find(t => t.id === 'E');
  assert.equal(diaRelativo(fundacoes.start), 2);
  assert.ok(Math.abs((fundacoes.end - fundacoes.start) / 86400000 - 5) < 0.000001);
  assert.deepEqual(fundacoes.dependencies, ['A']);
  assert.match(fundacoes.custom_class, /cpm-critical/);
  assert.equal(compra.cpmSlack, 2);
  assert.match(compra.custom_class, /cpm-flexible/);
  assert.equal(entrega.cpmMilestone, true);
  assert.equal(entrega.custom_class, 'cpm-milestone');
  assert.ok(entrega.end > entrega.start && entrega.end - entrega.start < 86400000);
});

test('neutraliza markup no rótulo SVG e preserva texto literal no detalhe', () => {
  const [tarefa] = prepararTarefasGantt(calcular('A;<img src=x onerror=alert(1)>;1'));
  assert.equal(tarefa.name, 'A · &lt;img src=x onerror=alert(1)&gt;');
  assert.equal(tarefa.cpmLabel, 'A · <img src=x onerror=alert(1)>');
});

test('escolhe escala relativa legível e recusa apenas a vista excessiva', () => {
  assert.equal(modoVisualGantt(90).cpmStepDays, 1);
  assert.equal(modoVisualGantt(365).cpmStepDays, 7);
  assert.equal(modoVisualGantt(1200).cpmStepDays, 30);
  const rede = calcular(`A;Obra longa;${LIMITE_VISUAL_DIAS + 1}`);
  assert.throws(() => prepararTarefasGantt(rede), /linha do tempo visual/);
});

test('integra pacote local fixado, leitura somente e aviso de licença', () => {
  const html = fs.readFileSync(new URL('../ferramentas/caminho-critico-obra/index.html', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../ferramentas/caminho-critico-obra/gantt-view.js', import.meta.url), 'utf8');
  const notice = fs.readFileSync(new URL('../ferramentas/caminho-critico-obra/vendor/NOTICE-frappe-gantt-1.2.2.txt', import.meta.url), 'utf8');
  assert.match(html, /\.\/vendor\/frappe-gantt-1\.2\.2\.css/);
  assert.match(html, /id="gantt-chart"/);
  assert.match(view, /frappe-gantt-1\.2\.2\.es\.js/);
  assert.match(view, /readonly: true/);
  assert.match(view, /readonly_dates: true/);
  assert.match(view, /readonly_progress: true/);
  assert.match(notice, /Integridade do pacote npm \(sha512\)/);
  assert.match(notice, /Licença: MIT/);
});
