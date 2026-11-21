// The vendor registry and individual numerical modules are loaded on demand.
import {tabDraft} from '/assets/js/tab-draft.mjs';
import {exportToolResult} from '/assets/js/tool-credits.mjs';
import {atPath, guidedFields, guidedModel, localizedExample, ptNumber, resultHighlights, resultLabel, scenarios} from './modelos.mjs?v=1';

const library = '/assets/cad-engines/engines.js';
const draftStorageKey = 'br.com.confenge.cad-calculos.drafts.v1';

if (typeof document === 'undefined') {
  self.onmessage = async ({ data }) => {
    try {
      const { createEngines } = await import(library);
      self.postMessage({ result: await createEngines().run(data.id, data.text) });
    } catch {
      self.postMessage({ error: 'Não foi possível carregar o motor de cálculo. Tente novamente.' });
    }
  };
} else {
  const root = document.getElementById('suite-calculos');
  if (root) mount(root);
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function mount(root) {
  // Tool cards may name a specific engine. Keep the suite URL canonical while
  // opening that real model directly, without creating separate calculators.
  const requestedEngine = () => /^calculo-([a-z0-9]+)$/.exec(location.hash.slice(1))?.[1] || '';
  const names = {
    schedule: 'Cronograma e custos', network: 'Redes hidráulicas e sistemas elétricos',
    schematic: 'Esquemas e conexões', motion: 'Mecanismos e robôs', des: 'Filas e processos',
    trace: 'Requisitos e testes', risk: 'Risco e confiabilidade', live: 'Dados e protocolos industriais',
    em: 'Circuitos elétricos', pcb: 'Placas de circuito', sys: 'Sistemas térmicos e elétricos',
    plc: 'Controladores programáveis'
  };
  const open = element('button', 'Experimentar um cálculo');
  open.type = 'button';
  open.className = 'button button-primary';
  open.setAttribute('aria-expanded', 'false');
  open.setAttribute('aria-controls', 'suite-painel-calculo');
  const panel = element('div');
  panel.id = 'suite-painel-calculo';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="calc-options"><label>Tipo de cálculo<select data-engine disabled></select></label>
      <label>Cenário de exemplo<select data-example disabled></select></label></div>
    <p class="calc-scenario" data-scenario></p>
    <form data-calc-form>
      <div class="calc-fields" data-guided></div>
      <div class="calc-actions"><button type="submit" class="button button-primary" data-run disabled>Calcular exemplo</button>
      <button type="button" class="button" data-reset disabled>Restaurar exemplo</button>
      <button type="button" class="button" data-cancel hidden>Interromper</button></div>
    </form>
    <p role="status" aria-live="polite" data-status></p>
    <div data-results></div>
    <button type="button" class="button" data-export hidden>Exportar resultado em TXT</button>
    <details class="calc-editor">
      <summary>Editar modelo avançado</summary>
      <label for="suite-modelo" id="suite-ajuda-modelo" data-input-help></label>
      <textarea id="suite-modelo" rows="9" spellcheck="false" disabled></textarea>
      <p role="status" aria-live="polite" data-draft-status></p>
      <button type="button" class="button" data-draft-clear hidden>Limpar rascunhos desta aba</button>
    </details>`;
  const status = panel.querySelector('[data-status]');
  const result = panel.querySelector('[data-results]');
  const engines = panel.querySelector('[data-engine]');
  const sample = panel.querySelector('[data-example]');
  const input = panel.querySelector('textarea');
  const hint = panel.querySelector('[data-input-help]');
  const scenario = panel.querySelector('[data-scenario]');
  const fields = panel.querySelector('[data-guided]');
  const form = panel.querySelector('[data-calc-form]');
  const editor = panel.querySelector('.calc-editor');
  const reset = panel.querySelector('[data-reset]');
  const run = panel.querySelector('[data-run]');
  const exportResult = panel.querySelector('[data-export]');
  const cancel = panel.querySelector('[data-cancel]');
  const clearDrafts = panel.querySelector('[data-draft-clear]');
  const draftStatus = panel.querySelector('[data-draft-status]');
  root.append(open, panel);

  let api, limit, sequence = 0, worker, timer, selected = '', original = '', fieldControls = [];
  const drafts = new Map();
  function reportDraft(text) {
    if (draftStatus.textContent !== text) draftStatus.textContent = text;
  }
  const draft = tabDraft(draftStorageKey, () => ({selected, models:Object.fromEntries(drafts)}), () => Boolean(worker), reportDraft);
  try {
    const saved = draft.read();
    if (saved?.models && typeof saved.selected === 'string') {
      for (const [key, text] of Object.entries(saved.models)) {
        if (typeof text === 'string') drafts.set(key, text);
      }
      selected = saved.selected;
    }
  } catch {
    reportDraft('O rascunho de cálculo não pôde ser lido.');
  }
  let completedReport = null;
  const resetResult = () => {
    completedReport = null;
    exportResult.hidden = true;
    result.replaceChildren();
    status.textContent = '';
  };
  function stop(message) {
    if (worker) worker.terminate();
    worker = null;
    draft.refreshGuard();
    clearTimeout(timer);
    run.disabled = input.disabled || !input.value.trim();
    cancel.hidden = true;
    if (message) status.textContent = message;
  }
  function renderFields() {
    fields.replaceChildren();
    fieldControls = [];
    const specs = guidedFields[sample.value];
    const model = guidedModel(input.value, original, specs);
    run.textContent = model || input.value !== original ? 'Calcular' : 'Calcular exemplo';
    if (!model) return;
    for (const spec of specs) {
      const [owner, key] = atPath(model, spec.path);
      const label = element('label', spec.label);
      const control = element('input');
      control.type = spec.type || 'text';
      if (!spec.type) control.inputMode = spec.integer ? 'numeric' : 'decimal';
      control.required = true;
      control.value = spec.type ? owner[key] : ptNumber.format(owner[key] * (spec.scale || 1));
      control.addEventListener('input', () => {
        resetResult();
        stop();
        updateModel(model);
      });
      label.append(control);
      fields.append(label);
      fieldControls.push({ control, spec });
    }
  }
  function updateModel(model) {
    let valid = true;
    for (const { control, spec } of fieldControls) {
      const text = control.value.trim();
      const number = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text) ? Number(text.replace(',', '.')) : NaN;
      let message = '';
      if (!spec.type) {
        if (!Number.isFinite(number)) message = 'Informe um número válido.';
        else if (spec.positive && number <= 0) message = 'Informe um valor maior que zero.';
        else if (spec.min !== undefined && number < spec.min) message = 'Informe um valor de pelo menos ' + spec.min + '.';
        else if (spec.integer && !Number.isSafeInteger(number)) message = 'Informe um número inteiro de dias.';
      }
      control.setCustomValidity(message);
      if (!control.validity.valid) valid = false;
      const [owner, key] = atPath(model, spec.path);
      owner[key] = spec.type ? text : number / (spec.scale || 1);
    }
    if (!valid) return;
    input.value = JSON.stringify(model, null, 2);
    run.textContent = 'Calcular';
    saveDraft();
  }
  function saveDraft() {
    drafts.set(selected, input.value);
    clearDrafts.hidden = false;
    reset.disabled = false;
    draft.schedule();
    if (input.value.length > limit) status.textContent = 'O modelo ultrapassa o limite de ' + limit.toLocaleString('pt-BR') + ' caracteres.';
  }
  async function loadSample() {
    const ticket = ++sequence;
    resetResult();
    stop();
    reset.disabled = run.disabled = input.disabled = true;
    fields.replaceChildren();
    fieldControls = [];
    scenario.textContent = '';
    try {
      const data = await api.example(engines.value, sample.value);
      if (ticket !== sequence) return;
      original = localizedExample(data.id, data.text);
      input.value = drafts.get(engines.value + '/' + data.id) ?? original;
      scenario.textContent = scenarios[data.id][1];
      input.disabled = false;
      run.disabled = !input.value.trim();
      reset.disabled = input.value === original && !drafts.has(selected);
      renderFields();
      if (input.value !== original && !fieldControls.length) editor.open = true;
    } catch { if (ticket === sequence) status.textContent = 'O exemplo não carregou. Selecione-o novamente.'; }
  }
  async function selectEngine(preferredExample) {
    const ticket = ++sequence;
    resetResult();
    stop();
    reset.disabled = run.disabled = input.disabled = sample.disabled = true;
    input.value = '';
    fields.replaceChildren();
    fieldControls = [];
    scenario.textContent = '';
    sample.replaceChildren();
    try {
      const id = engines.value;
      const descriptor = await api.descriptor(id);
      if (ticket !== sequence) return;
      const engine = api.list().find(item => item.id === id);
      for (const ex of descriptor.examples) {
        if (Object.hasOwn(scenarios, ex.id)) sample.add(new Option(scenarios[ex.id][0], ex.id));
      }
      if ([...sample.options].some(ex => ex.value === preferredExample)) sample.value = preferredExample;
      sample.disabled = false;
      selected = id + '/' + sample.value;
      hint.textContent = engine.kind === 'JSON'
        ? 'Modelo em JSON. Use ponto decimal e preserve os nomes dos campos.'
        : 'Modelo em texto técnico. Preserve a sintaxe e as unidades do exemplo.';
      await loadSample();
    } catch { if (ticket === sequence) status.textContent = 'O modelo não carregou. Tente escolher outro cálculo.'; }
  }
  open.addEventListener('click', async () => {
    if (!panel.hidden) {
      panel.hidden = true;
      stop();
      open.textContent = 'Experimentar um cálculo';
      open.setAttribute('aria-expanded', 'false');
      return;
    }
    panel.hidden = false;
    open.setAttribute('aria-expanded', 'true');
    open.textContent = 'Fechar painel de cálculo';
    if (api) return;
    open.disabled = true;
    run.disabled = true;
    status.textContent = 'Carregando calculadoras…';
    try {
      const { createEngines, LIMITS } = await import(library);
      api = createEngines();
      limit = LIMITS.text;
      for (const [id, name] of Object.entries(names)) engines.add(new Option(name, id));
      engines.disabled = false;
      const [savedEngine, savedExample] = selected.split('/');
      const desiredEngine = requestedEngine() || savedEngine;
      engines.value = api.list().some(item => item.id === desiredEngine) ? desiredEngine : 'schedule';
      await selectEngine(savedExample);
    } catch { status.textContent = 'Não foi possível abrir as calculadoras. Feche o painel e tente novamente.'; }
    finally { open.disabled = false; }
  });
  async function chooseRequestedEngine() {
    const wanted = requestedEngine();
    if (!wanted) return;
    if (panel.hidden) open.click();
    if (!api) {
      return;
    }
    if (!api.list().some(item => item.id === wanted) || engines.value === wanted) return;
    engines.value = wanted;
    await selectEngine();
  }
  window.addEventListener('hashchange', () => { void chooseRequestedEngine(); });
  window.addEventListener('popstate', () => { void chooseRequestedEngine(); });
  root.querySelector('.suite-calculo-modos').addEventListener('click', event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.target.closest('a[href^="#calculo-"]')) {
      // The shared navigation uses pushState for in-page links and does not emit hashchange.
      setTimeout(chooseRequestedEngine, 0);
    }
  });
  engines.addEventListener('change', () => selectEngine());
  sample.addEventListener('change', () => { selected = engines.value + '/' + sample.value; loadSample(); });
  input.addEventListener('input', () => {
    resetResult(); stop();
    renderFields();
    saveDraft();
  });
  reset.addEventListener('click', () => {
    if (drafts.has(selected)) {
      if (!window.confirm('Substituir os dados deste modelo pelo exemplo original?')) return;
      if (drafts.size === 1 && !draft.clear()) return;
      drafts.delete(selected);
      if (drafts.size) draft.schedule();
      clearDrafts.hidden = drafts.size === 0;
    }
    if (api) loadSample();
  });
  clearDrafts.addEventListener('click', () => {
    if (!window.confirm('Limpar os rascunhos de cálculo desta aba?') || !draft.clear()) return;
    stop();
    drafts.clear();
    clearDrafts.hidden = true;
    resetResult();
    if (api) loadSample();
  });
  cancel.addEventListener('click', () => stop('Cálculo interrompido.'));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!api || worker || !input.value.trim()) return;
    if (input.value.length > limit) { status.textContent = 'Reduza o modelo para até ' + limit.toLocaleString('pt-BR') + ' caracteres.'; return; }
    resetResult();
    status.textContent = 'Calculando…';
    run.disabled = true;
    cancel.hidden = false;
    try {
      worker = new Worker(import.meta.url, {type:'module'});
      draft.refreshGuard();
      worker.onerror = () => stop('O cálculo não pôde ser executado. Confira os dados e tente novamente.');
      worker.onmessage = ({data}) => {
        stop();
        if (data.error) { status.textContent = data.error; return; }
        const highlights = fieldControls.length && data.result.ok ? resultHighlights(sample.value, data.result.tables) : [];
        render(result, data.result, highlights);
        status.textContent = data.result.ok ? 'Cálculo concluído.' : 'Modelo com pendências. Consulte a verificação abaixo.';
        if (data.result.ok) {
          completedReport = {
            engineId: engines.value,
            engineName: engines.options[engines.selectedIndex]?.text || engines.value,
            exampleName: sample.options[sample.selectedIndex].text,
            report: data.result,
          };
          exportResult.hidden = false;
        }
        if (panel.contains(document.activeElement) || document.activeElement === document.body) {
          result.querySelector('h3').focus();
        }
      };
      timer = setTimeout(() => stop('O cálculo excedeu 20 segundos. Reduza o modelo e tente novamente.'), 20000);
      worker.postMessage({id:engines.value, text:input.value});
    } catch { stop('O navegador não conseguiu iniciar o cálculo.'); }
  });
  exportResult.addEventListener('click', async () => {
    const completed = completedReport;
    if (!completed) return;
    const content = serializeResult(completed);
    const filename = `confenge-calculo-${completed.engineId}.txt`;
    await exportToolResult({
      toolId: 'cad-suite-calculos',
      format: 'txt',
      content,
      deliver: () => downloadText(content, filename),
    });
  });
  if (drafts.size) clearDrafts.hidden = false;
  if (requestedEngine()) open.click();
  else if (drafts.size) {
    reportDraft('Rascunho recuperado nesta aba.');
    open.click();
  }
}

function serializeResult({engineId, engineName, exampleName, report}) {
  const lines = [
    'CONFENGE — Resultado de cálculo',
    `Motor: ${engineName} (${engineId})`,
    `Cenário de referência: ${exampleName}`,
    `Situação: ${report.ok ? 'OK' : 'COM PENDÊNCIAS'}`,
  ];
  if (report.notes.length) lines.push('', 'Observações do cálculo', ...report.notes.map(item => '- ' + item));
  if (report.problems.length) lines.push('', 'Verificações do modelo', ...report.problems.map(item => '- ' + (item.code ? item.code + ' · ' : '') + item.text));
  for (const table of report.tables) {
    lines.push('', resultLabel(table.title), table.head.map(label => resultLabel(label, table.title)).join('\t'), ...table.rows.map(row => row.join('\t')));
    if (table.more) lines.push(`[${table.more} linhas adicionais não exibidas]`);
  }
  return lines.join('\r\n') + '\r\n';
}

function downloadText(content, name) {
  const url = URL.createObjectURL(new Blob([content], {type:'text/plain;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function render(target, report, highlights) {
  target.replaceChildren();
  const heading = element('h3', 'Resultado do cálculo');
  heading.tabIndex = -1;
  target.append(heading);
  if (highlights.length) {
    const cards = element('dl');
    cards.className = 'calc-highlights';
    for (const [label, value, unit] of highlights) {
      const card = element('div');
      const number = new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 5 }).format(Number(value));
      card.append(element('dt', label), element('dd', number + ' ' + unit));
      cards.append(card);
    }
    target.append(cards);
  }
  if (report.problems.length) {
    const count = report.problems.length;
    target.append(element('p', count === 1
      ? 'O modelo tem 1 ocorrência. Veja o diagnóstico técnico.'
      : 'O modelo tem ' + count + ' ocorrências. Veja o diagnóstico técnico.'));
  }
  const tables = highlights.length ? element('details') : target;
  if (highlights.length) tables.append(element('summary', 'Ver tabelas do cálculo'));
  for (const data of report.tables) {
    const wrap = element('div');
    wrap.className = 'calc-scroll';
    wrap.tabIndex = 0;
    const table = element('table'), caption = element('caption', resultLabel(data.title));
    table.append(caption);
    const row = table.createTHead().insertRow();
    for (const label of data.head) { const cell = element('th', resultLabel(label, data.title)); cell.scope = 'col'; row.append(cell); }
    const body = table.createTBody();
    for (const cells of data.rows) {
      const tr = body.insertRow();
      for (const value of cells) tr.insertCell().textContent = value;
    }
    wrap.append(table);
    tables.append(wrap);
    if (data.more) tables.append(element('p', data.more + ' linhas adicionais excedem o limite de exibição do motor.'));
  }
  if (highlights.length) target.append(tables);
  if (report.notes.length || report.problems.length) {
    const details = element('details');
    details.append(element('summary', 'Diagnóstico técnico original (em inglês)'));
    const list = element('ul');
    for (const line of [...report.problems.map(p => p.text), ...report.notes]) list.append(element('li', line));
    list.lang = 'en';
    details.append(list);
    target.append(details);
  }
}
