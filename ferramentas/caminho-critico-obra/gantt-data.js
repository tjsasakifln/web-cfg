const DIA_MS = 24 * 60 * 60 * 1000;
const ORIGEM_UTC = Date.UTC(2000, 0, 1);

export const LIMITE_VISUAL_DIAS = 3650;

function dataDoDia(dia, deslocamentoMs = 0) {
  const data = new Date(2000, 0, 1);
  data.setDate(data.getDate() + dia);
  data.setTime(data.getTime() + deslocamentoMs);
  return data;
}

function escaparMarkup(valor) {
  return String(valor).replace(/[&<>"']/g, caractere => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[caractere]);
}

export function diaRelativo(data) {
  return Math.round((Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()) - ORIGEM_UTC) / DIA_MS);
}

export function prepararTarefasGantt(rede) {
  if (!rede || !Array.isArray(rede.tasks)) throw new TypeError('Rede CPM inválida para o Gantt.');
  if (rede.duration > LIMITE_VISUAL_DIAS) {
    throw new RangeError(`A linha do tempo visual aceita cronogramas de até ${LIMITE_VISUAL_DIAS.toLocaleString('pt-BR')} dias.`);
  }

  return rede.tasks.map(tarefa => {
    const marco = tarefa.duration === 0;
    const inicio = dataDoDia(tarefa.start);
    // O Frappe Gantt trata datas sem hora como dias inclusivos. Um instante antes
    // do fim CPM preserva a duração exata; marcos recebem uma hora apenas para
    // produzir um alvo visual, sem alterar os valores da rede.
    const fim = marco ? dataDoDia(tarefa.finish, 60 * 60 * 1000) : dataDoDia(tarefa.finish, -1);
    const rotulo = `${tarefa.id} · ${tarefa.nome}`;
    return {
      id: tarefa.id,
      // O motor escreve `name` como markup dentro do SVG; a cópia literal fica
      // separada para o popup, que usa textContent.
      name: escaparMarkup(rotulo),
      start: inicio,
      end: fim,
      dependencies: [...tarefa.dependsOn],
      progress: 0,
      custom_class: marco ? 'cpm-milestone' : tarefa.slack === 0 ? 'cpm-critical' : 'cpm-flexible',
      cpmStart: tarefa.start,
      cpmFinish: tarefa.finish,
      cpmDuration: tarefa.duration,
      cpmSlack: tarefa.slack,
      cpmMilestone: marco,
      cpmLabel: rotulo,
    };
  });
}

export function modoVisualGantt(duracao) {
  const passo = duracao <= 120 ? 1 : duracao <= 730 ? 7 : 30;
  return {
    name: 'Dias da obra',
    padding: '0d',
    step: `${passo}d`,
    column_width: passo === 1 ? 38 : passo === 7 ? 76 : 96,
    date_format: 'YYYY-MM-DD HH:mm',
    lower_text: data => String(diaRelativo(data)),
    upper_text: (data, anterior) => anterior ? '' : 'Dias desde o início',
    upper_text_frequency: Math.max(1, Math.ceil(duracao / passo)),
    thick_line: data => diaRelativo(data) % (passo === 1 ? 7 : passo) === 0,
    cpmStepDays: passo,
  };
}
