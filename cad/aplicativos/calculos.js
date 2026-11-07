// The vendor registry and individual numerical modules are loaded on demand.
const library = '/assets/cad-engines/engines.js';

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
  const names = {
    schedule: 'Cronograma e custos', network: 'Redes hidráulicas e sistemas elétricos',
    schematic: 'Esquemas e conexões', motion: 'Mecanismos e robôs', des: 'Filas e processos',
    trace: 'Requisitos e testes', risk: 'Risco e confiabilidade', live: 'Dados e protocolos industriais',
    em: 'Circuitos elétricos', pcb: 'Placas de circuito', sys: 'Sistemas térmicos e elétricos',
    plc: 'Controladores programáveis'
  };
  const examples = {
    starter: 'Partida e parada com lâmpada', faulty: 'Mesmo circuito com falhas de ligação',
    water: 'Tubulação ligada a um reservatório', power: 'Fluxo de carga e proteção em duas barras',
    planar2: 'Braço de dois elos', fourbar: 'Mecanismo de quatro barras', slidercrank: 'Biela e manivela', scara: 'Braço SCARA',
    mm1: 'Fila com um atendente', line: 'Entrada, percurso e saída', simple: 'Quatro atividades com duas sequências',
    crew: 'Uma equipe com custos e defasagens', pump: 'Requisitos e testes de um conjunto de bombeamento',
    plant: 'Árvore de falhas e reparos', life: 'Vida útil e análise de falhas',
    codecs: 'Mensagens Modbus e MQTT', rc: 'Filtro RC em frequência', step: 'Resposta do circuito RC a um degrau',
    led: 'Placa com LED', faults: 'Conexões com falhas de projeto', cool: 'Resfriamento de um corpo', divider: 'Divisor resistivo',
    ton: 'Temporizador de 100 ms', bound: 'Liberação em grupos de três', scene: 'Elevação de uma carga a 2 m', counter: 'Contador e lâmpada'
  };
  const open = element('button', 'Abrir calculadoras');
  open.type = 'button';
  open.className = 'button button-primary';
  open.setAttribute('aria-expanded', 'false');
  open.setAttribute('aria-controls', 'suite-painel-calculo');
  const panel = element('div');
  panel.id = 'suite-painel-calculo';
  panel.hidden = true;
  // Only authored markup enters the template. Models and results use value/textContent.
  panel.innerHTML = `
    <div class="calc-options"><label>Tipo de cálculo<select data-engine></select></label>
      <label>Exemplo<select data-example></select></label></div>
    <label for="suite-modelo"><strong>Dados do modelo</strong></label>
    <p data-input-help></p><textarea id="suite-modelo" rows="10" spellcheck="false" aria-describedby="suite-ajuda-modelo"></textarea>
    <div class="calc-actions"><button type="button" class="button button-primary" data-run>Calcular</button>
      <button type="button" class="button" data-reset>Restaurar exemplo</button>
      <button type="button" class="button" data-cancel hidden>Interromper</button></div>
    <p role="status" aria-live="polite" data-status></p>
    <div data-results></div>`;
  const status = panel.querySelector('[data-status]');
  const result = panel.querySelector('[data-results]');
  const engines = panel.querySelector('[data-engine]');
  const sample = panel.querySelector('[data-example]');
  const input = panel.querySelector('textarea');
  const hint = panel.querySelector('[data-input-help]');
  hint.id = 'suite-ajuda-modelo';
  const run = panel.querySelector('[data-run]');
  const cancel = panel.querySelector('[data-cancel]');
  root.append(open, panel);

  let api, limit, sequence = 0, worker, timer, selected = '';
  const drafts = new Map();
  const resetResult = () => { result.replaceChildren(); status.textContent = ''; };
  function stop(message) {
    if (worker) worker.terminate();
    worker = null;
    clearTimeout(timer);
    run.disabled = !input.value.trim();
    cancel.hidden = true;
    if (message) status.textContent = message;
  }
  async function loadSample() {
    const ticket = ++sequence;
    resetResult();
    stop();
    run.disabled = true;
    try {
      const data = await api.example(engines.value, sample.value);
      if (ticket !== sequence) return;
      input.value = drafts.get(engines.value + '/' + data.id) ?? data.text;
      run.disabled = !input.value.trim();
    } catch { if (ticket === sequence) status.textContent = 'O exemplo não carregou. Selecione-o novamente.'; }
  }
  async function selectEngine() {
    const ticket = ++sequence;
    resetResult();
    stop();
    run.disabled = true;
    input.value = '';
    sample.replaceChildren();
    try {
      const id = engines.value;
      const descriptor = await api.descriptor(id);
      if (ticket !== sequence) return;
      const engine = api.list().find(item => item.id === id);
      for (const ex of descriptor.examples) sample.add(new Option(examples[ex.id] || ex.name, ex.id));
      selected = id + '/' + sample.value;
      hint.textContent = 'Formato: ' + (engine.kind === 'JSON' ? 'JSON' : 'texto') +
        '. Altere os valores preservando os nomes dos campos e as unidades do exemplo. ' + descriptor.inputLabel;
      await loadSample();
    } catch { if (ticket === sequence) status.textContent = 'O modelo não carregou. Tente escolher outro cálculo.'; }
  }
  open.addEventListener('click', async () => {
    if (!panel.hidden) {
      panel.hidden = true;
      stop();
      open.textContent = 'Abrir calculadoras';
      open.setAttribute('aria-expanded', 'false');
      return;
    }
    panel.hidden = false;
    open.setAttribute('aria-expanded', 'true');
    open.textContent = 'Fechar calculadoras';
    if (api) return;
    open.disabled = true;
    run.disabled = true;
    status.textContent = 'Carregando calculadoras…';
    try {
      const { createEngines, LIMITS } = await import(library);
      api = createEngines();
      limit = LIMITS.text;
      for (const item of api.list()) engines.add(new Option(names[item.id] || item.name, item.id));
      engines.value = 'schedule';
      await selectEngine();
    } catch { status.textContent = 'Não foi possível abrir as calculadoras. Feche o painel e tente novamente.'; }
    finally { open.disabled = false; }
  });
  engines.addEventListener('change', selectEngine);
  sample.addEventListener('change', () => { selected = engines.value + '/' + sample.value; loadSample(); });
  input.addEventListener('input', () => {
    resetResult(); stop();
    if (input.value.length <= limit) drafts.set(selected, input.value);
    else status.textContent = 'O modelo ultrapassa o limite de ' + limit.toLocaleString('pt-BR') + ' caracteres.';
  });
  panel.querySelector('[data-reset]').addEventListener('click', () => {
    drafts.delete(selected);
    if (api) loadSample();
  });
  cancel.addEventListener('click', () => stop('Cálculo interrompido.'));
  run.addEventListener('click', () => {
    if (!api || worker || !input.value.trim()) return;
    if (input.value.length > limit) { status.textContent = 'Reduza o modelo para até ' + limit.toLocaleString('pt-BR') + ' caracteres.'; return; }
    resetResult();
    status.textContent = 'Calculando…';
    run.disabled = true;
    cancel.hidden = false;
    try {
      worker = new Worker(import.meta.url, {type:'module'});
      worker.onerror = () => stop('O cálculo não pôde ser executado. Confira os dados e tente novamente.');
      worker.onmessage = ({data}) => {
        stop();
        if (data.error) { status.textContent = data.error; return; }
        render(result, data.result);
        status.textContent = data.result.ok ? 'Cálculo concluído.' : 'Confira os problemas indicados pelo motor.';
      };
      timer = setTimeout(() => stop('O cálculo excedeu 20 segundos. Reduza o modelo e tente novamente.'), 20000);
      worker.postMessage({id:engines.value, text:input.value});
    } catch { stop('O navegador não conseguiu iniciar o cálculo.'); }
  });
}

function render(target, report) {
  target.replaceChildren();
  for (const [title, lines] of [
    ['Observações do cálculo', report.notes],
    ['Verificações do modelo', report.problems.map(p => (p.code ? p.code + ' · ' : '') + p.text)]
  ]) {
    if (!lines.length) continue;
    const list = element('ul');
    for (const line of lines) list.append(element('li', line));
    target.append(element('h3', title), list);
  }
  for (const data of report.tables) {
    const wrap = element('div');
    wrap.className = 'calc-scroll';
    wrap.tabIndex = 0;
    const table = element('table'), caption = element('caption', data.title);
    table.append(caption);
    const row = table.createTHead().insertRow();
    for (const label of data.head) { const cell = element('th', label); cell.scope = 'col'; row.append(cell); }
    const body = table.createTBody();
    for (const cells of data.rows) {
      const tr = body.insertRow();
      for (const value of cells) tr.insertCell().textContent = value;
    }
    wrap.append(table);
    target.append(wrap);
    if (data.more) target.append(element('p', data.more + ' linhas adicionais excedem o limite de exibição do motor.'));
  }
}
