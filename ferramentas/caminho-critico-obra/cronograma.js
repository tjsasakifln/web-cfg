import { plan } from './planner.js';

export function calcular(texto) {
  if (texto.length > 80000) throw new Error('Reduza o texto para até 80 mil caracteres.');
  const linhas = texto.split(/\r?\n/).filter(linha => linha.trim());
  if (linhas.length === 0 || linhas.length > 500) throw new Error('Informe de 1 a 500 atividades.');
  const nomes = new Map();
  const tarefas = linhas.map((linha, i) => {
    const campos = linha.split(linha.includes('\t') ? '\t' : ';').map(v => v.trim());
    const [id, nome, dias, anteriores = ''] = campos;
    const prefixo = 'Linha ' + (i + 1) + '. ';
    if (campos.length < 3 || campos.length > 4) throw new Error(prefixo + 'Use código, atividade, dias e predecessoras, em colunas.');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/.test(id)) throw new Error(prefixo + 'Use um código de até 30 letras e números, com hífen ou sublinhado entre eles.');
    if (nomes.has(id)) throw new Error(prefixo + 'O código ' + id + ' já está em uso.');
    if (!nome || nome.length > 160) throw new Error(prefixo + 'Informe uma atividade com até 160 caracteres.');
    if (!/^\d{1,5}$/.test(dias)) throw new Error(prefixo + 'Use dias inteiros, de 0 a 99.999.');
    nomes.set(id, nome);
    const dependsOn = anteriores ? anteriores.split(',').map(d => d.trim()) : [];
    if (new Set(dependsOn).size !== dependsOn.length) throw new Error(prefixo + 'Uma predecessora está repetida.');
    return {id, duration: Number(dias), dependsOn};
  });
  for (const t of tarefas) {
    for (const dep of t.dependsOn) {
      if (!nomes.has(dep)) throw new Error('A predecessora "' + dep + '" de ' + t.id + ' não aparece na lista.');
    }
  }
  let rede;
  try {
    rede = plan(tarefas);
  } catch (erro) {
    if (!erro.message.startsWith('Cycle detected')) throw erro;
    throw new Error('Há uma dependência circular. Confira as predecessoras das atividades bloqueadas: ' + erro.message.split(': ')[1]);
  }
  return {...rede, tasks: rede.tasks.map(t => ({...t, nome: nomes.get(t.id)}))};
}

export const colunas = ['Código', 'Atividade', 'Dias', 'Predecessoras', 'Início cedo', 'Fim cedo', 'Início tarde', 'Fim tarde', 'Folga total', 'Crítica'];
export function valores(t) {
  return [t.id, t.nome, t.duration, t.dependsOn.join(', '), t.start, t.finish, t.start+t.slack, t.finish+t.slack, t.slack, t.slack === 0 ? 'Sim' : 'Não'];
}

export function exportarCsv(rede) {
  function celula(valor) {
    let texto = String(valor);
    if (/^[=+\-@\t\r\n]/.test(texto)) texto = "'" + texto;
    return '"' + texto.replaceAll('"', '""') + '"';
  }
  return '\uFEFF' + [colunas, ...rede.tasks.map(valores)].map(linha => linha.map(celula).join(';')).join('\r\n');
}
