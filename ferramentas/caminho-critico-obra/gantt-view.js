import Gantt from './vendor/frappe-gantt-1.2.2.es.js';
import { modoVisualGantt, prepararTarefasGantt } from './gantt-data.js';

const painel = document.getElementById('gantt-painel');
const raiz = document.getElementById('gantt-chart');
const estado = document.getElementById('gantt-estado');
let grafico;

function textoDias(valor) {
  return `${valor.toLocaleString('pt-BR')} ${valor === 1 ? 'dia' : 'dias'}`;
}

export function limparGantt() {
  grafico = null;
  raiz.replaceChildren();
  painel.hidden = true;
  estado.textContent = '';
}

export function renderizarGantt(rede) {
  painel.hidden = false;
  raiz.replaceChildren();
  try {
    const tarefas = prepararTarefasGantt(rede);
    const modo = modoVisualGantt(rede.duration);
    grafico = new Gantt(raiz, tarefas, {
      view_modes: [modo],
      readonly: true,
      readonly_dates: true,
      readonly_progress: true,
      move_dependencies: false,
      infinite_padding: false,
      today_button: false,
      view_mode_select: false,
      scroll_to: 'start',
      holidays: {},
      lines: 'both',
      language: 'pt-BR',
      container_height: Math.min(520, Math.max(220, 92 + tarefas.length * 48)),
      popup(ctx) {
        ctx.get_title().textContent = ctx.task.cpmLabel;
        ctx.get_subtitle().textContent = ctx.task.cpmMilestone
          ? `Marco no dia ${ctx.task.cpmStart}`
          : `Do dia ${ctx.task.cpmStart} ao dia ${ctx.task.cpmFinish}`;
        ctx.get_details().textContent = `${textoDias(ctx.task.cpmDuration)} · folga total: ${textoDias(ctx.task.cpmSlack)}`;
      },
    });
    grafico.$container.tabIndex = 0;
    grafico.$container.setAttribute('role', 'region');
    grafico.$container.setAttribute('aria-labelledby', 'gantt-titulo');
    grafico.$container.setAttribute('aria-describedby', 'gantt-ajuda gantt-estado');
    grafico.$svg.setAttribute('aria-hidden', 'true');
    grafico.$svg.setAttribute('focusable', 'false');
    grafico.$popup_wrapper.setAttribute('aria-hidden', 'true');
    estado.textContent = `Visualização somente leitura de ${tarefas.length.toLocaleString('pt-BR')} atividades. Cada coluna representa ${textoDias(modo.cpmStepDays)}.`;
    return true;
  } catch (erro) {
    grafico = null;
    raiz.replaceChildren();
    estado.textContent = `${erro.message} Consulte a tabela acima, que permanece completa.`;
    console.error('Não foi possível montar o Gantt complementar.', erro);
    return false;
  }
}
