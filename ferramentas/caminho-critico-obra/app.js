import { calcular, exportarCsv, valores } from './cronograma.js';
import { exportToolResult } from '/assets/js/tool-credits.mjs';

const q = id => document.getElementById(id);
const entrada = q('atividades');
const painel = q('resultado');
const exemplo = entrada.defaultValue;
let rede;

function limparResultado() {
  rede = null;
  painel.hidden = true;
  q('erro').textContent = '';
  entrada.removeAttribute('aria-invalid');
}

q('planejar').addEventListener('submit', event => {
  event.preventDefault();
  limparResultado();
  try {
    rede = calcular(entrada.value);
  } catch (erro) {
    q('erro').textContent = erro.message;
    entrada.setAttribute('aria-invalid', 'true');
    entrada.focus();
    return;
  }
  q('prazo').textContent = rede.duration.toLocaleString('pt-BR') + (rede.duration === 1 ? ' dia' : ' dias');
  q('caminho').textContent = rede.criticalPath.join(' → ');
  const linhas = document.createDocumentFragment();
  for (const t of rede.tasks) {
    const tr = document.createElement('tr');
    for (const valor of valores(t)) {
      const td = document.createElement('td');
      td.textContent = valor;
      tr.append(td);
    }
    linhas.append(tr);
  }
  q('linhas').replaceChildren(linhas);
  painel.hidden = false;
  painel.focus();
  window.ConfengeTools?.emit('tool_complete', {tool: 'caminho-critico-obra'});
});

entrada.addEventListener('input', limparResultado);
q('exemplo').addEventListener('click', () => {
  if (entrada.value.trim() && entrada.value !== exemplo && !window.confirm('Substituir as atividades atuais pelo exemplo?')) return;
  limparResultado();
  entrada.value = exemplo;
  entrada.focus();
});
q('csv').addEventListener('click', async () => {
  if (!rede) return;
  const content = exportarCsv(rede);
  await exportToolResult({ toolId: 'caminho-critico-obra', format: 'csv', content, deliver() {
    const url = URL.createObjectURL(new Blob([content], {type: 'text/csv;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'confenge-caminho-critico.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }});
});
window.ConfengeTools?.bindToolLifecycle({tool: 'caminho-critico-obra'});
q('campos').disabled = false;
q('executar').disabled = false;
q('estado').hidden = true;
