const editor = document.getElementById('cad-editor');
const icons = {
  open: '<path d="M3 18.5V5.5h6l2 2h9v3"/><path d="M3 18.5 6 11h15l-3 7.5Z"/>',
  example: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M8 4v9h5m0-9v5m0 4v7M3 15h5"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  fit: '<path d="M3 8V3h5m8 0h5v5M3 16v5h5m13-5v5h-5M7 8h10v8H7Z"/>',
  save: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'
};
const icon = name => '<svg class="cad-ico" viewBox="0 0 24 24" aria-hidden="true">' + icons[name] + '</svg>';

if (editor) {
  // Only static, authored markup goes into the template. File and CAD data use textContent.
  editor.innerHTML = `
    <div class="cad-bar">
      <div class="cad-doc">
        <img class="cad-brand" src="/assets/logo-confenge-500-f8a83f6d.png" alt="CONFENGE" width="224" height="58">
        <span class="cad-file-tag" aria-hidden="true">DWG</span>
        <div class="cad-doc-text"><strong class="cad-name">Área de desenho</strong>
        <span class="cad-caption">Edição local no navegador</span></div>
      </div>
      <div class="cad-actions" role="group" aria-label="Arquivo e área de trabalho">
        <button type="button" class="cad-primary" data-open>${icon('open')}Abrir DWG</button>
        <button type="button" data-example>${icon('example')}Experimentar um exemplo</button>
        <button type="button" data-save hidden>${icon('save')}Baixar cópia</button>
        <button type="button" data-fit hidden>${icon('fit')}Enquadrar</button>
        <button type="button" data-expand hidden aria-pressed="false">${icon('expand')}<span>Ampliar editor</span></button>
        <input type="file" data-file accept=".dwg,.dxf" hidden>
      </div>
    </div>
    <div class="cad-stage">
      <div class="cad-welcome">
        <div><strong>Seu desenho começa aqui.</strong><p>Arraste o DWG para esta área ou abra o exemplo para conhecer as ferramentas de edição.</p></div>
        <svg class="cad-illustration" aria-hidden="true" viewBox="0 0 380 182">
          <g fill="none" stroke="var(--white)" stroke-width="1.6">
            <path d="M40 21h289v124H197m-33 0H40Z M46 27h277v112H198m-34 0H46Z"/>
            <path d="M147 27v33m0 30v49m6 0V89m0-29V27m0 56h62m33 0h75m-75 6h75m-170 0h62"/>
            <path d="M179 27v20h64V27m26 0v50h54M46 104h39v35m-39-29h33v29" opacity=".65"/>
          </g><g fill="none" stroke="var(--lime)" stroke-width="1.2">
            <path d="M164 145v-33a33 33 0 0 1 33 33m18-62V52a31 31 0 0 1 31 31m-99 7h-31a31 31 0 0 1 31-31"/>
            <path d="M39 154v20m290-20v20M35 165h299m-298 4 8-8m280 8 8-8M16 18v129m-6-121 12-9m-12 133 12-9"/>
          </g><g stroke="var(--white)" stroke-dasharray="5 5" opacity=".32">
            <path d="M27 12v145m113-145v145m199-145v145M23 8h324M23 155h324"/>
          </g>
        </svg>
      </div>
    </div>
    <div class="cad-issue" hidden><p></p><details><summary>Ver ocorrências do desenho</summary><ul></ul></details></div>
    <details class="cad-preview" hidden><summary>Ver prévia gravada no DWG</summary>
      <figure><img alt="Prévia gravada no arquivo DWG"><figcaption>Última vista salva pelo autor. Esta imagem serve de referência visual e não permite editar ou medir objetos.</figcaption></figure>
    </details>
    <div class="cad-foot">
      <p class="cad-status" role="status" aria-live="polite">Escolha um DWG ou DXF do seu dispositivo.</p>
      <label class="cad-format" hidden>Cópia em <select data-format><option value="dwg">DWG R2000</option><option value="dxf">DXF</option></select></label>
      <a class="cad-recover" hidden>Baixar a edição em DXF</a>
    </div>
    <details class="cad-help" hidden><summary>Controles do editor</summary>
      <p>Use a roda do mouse para aproximar ou afastar. Segure o botão do meio e arraste para percorrer a planta. Clique em um objeto para selecioná-lo. Pressione Esc para encerrar o comando atual.</p>
      <p>Para desenhar uma linha, digite L, pressione Enter e clique nos dois pontos. Para voltar uma alteração, use Ctrl+Z. Em “Cópia em”, escolha o formato e use “Baixar cópia”.</p>
    </details>`;
  const find = selector => editor.querySelector(selector);
  const fileInput = find('[data-file]');
  const openButton = find('[data-open]');
  const exampleButton = find('[data-example]');
  const saveButton = find('[data-save]');
  const fitButton = find('[data-fit]');
  const expandButton = find('[data-expand]');
  const stage = find('.cad-stage');
  const status = find('.cad-status');
  const issue = find('.cad-issue');
  const format = find('[data-format]');
  const recovery = find('.cad-recover');
  const preview = find('.cad-preview');
  let frame, ready, readyResolve, readyReject, titleObserver;
  let loading = false, saving = false, dirty = false, retained = false;
  let opened, baseline, dwgBlocked = false;
  let saveTimer, activeName = '', expectedName = '', sourceName = '';

  function say(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }
  function warn(messages = []) {
    const list = issue.querySelector('ul');
    list.replaceChildren(...messages.map(message => {
      const item = document.createElement('li');
      item.textContent = message;
      return item;
    }));
    const specialized = messages.some(message => /AEC_|UnknownEntity|proxy/i.test(message));
    issue.querySelector('p').textContent = dwgBlocked
      ? (specialized
        ? 'Alguns objetos especializados não aparecem. A planta pode parecer vazia. Apenas a geometria disponível pode ser editada e baixada em DXF.'
        : 'A conferência não confirmou a preservação do desenho. Confira a vista antes de baixar uma cópia em DXF. A saída em DWG está bloqueada.')
      : 'Há observações sobre a leitura deste desenho.';
    issue.hidden = !messages.length && !dwgBlocked;
    issue.querySelector('details').hidden = !messages.length;
  }
  function clearPreview() {
    const img = preview.querySelector('img');
    img.removeAttribute('src');
    preview.hidden = true;
    preview.open = false;
  }
  async function showPreview(bytes, name) {
    clearPreview();
    if (!bytes || !/\.dwg$/i.test(name)) return;
    try {
      const { extractDwgPreview } = await import('./preview.mjs');
      const blob = extractDwgPreview(bytes);
      if (!blob) return;
      const img = preview.querySelector('img');
      // The site's image policy accepts bounded data images, including saved CAD thumbnails.
      img.src = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      await img.decode();
      img.alt = 'Prévia gravada no arquivo ' + name;
      preview.hidden = false;
    } catch { clearPreview(); }
  }
  function clearRecovery() {
    if (recovery.href) URL.revokeObjectURL(recovery.href);
    recovery.removeAttribute('href');
    recovery.hidden = true;
    retained = false;
  }
  function leaveGuard(event) {
    if (!dirty && !retained && !saving) return;
    event.preventDefault();
    event.returnValue = '';
  }
  window.addEventListener('beforeunload', leaveGuard);
  function reflectTitle() {
    const title = frame?.contentDocument?.title || '';
    const match = title.match(/^(.+?)(?: •)? — CADCraft$/);
    if (!match) return;
    activeName = match[1];
    find('.cad-name').textContent = activeName === expectedName ? sourceName : activeName;
    if (!retained) find('.cad-caption').textContent = dwgBlocked ? 'Vista com restrições · saída em DXF' : dirty ? 'Alterações em edição' : 'Edição local no navegador';
    if (opened && activeName === expectedName) opened.resolve();
  }
  function pending(timeout, message) {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      const timer = setTimeout(() => no(new Error(message)), timeout);
      resolve = value => { clearTimeout(timer); yes(value); };
      reject = error => { clearTimeout(timer); no(error); };
    });
    return { promise, resolve, reject };
  }
  function canvasCommand(key, modifiers = {}) {
    const canvas = frame?.contentDocument?.getElementById('cadcraft_canvas');
    if (!canvas) return;
    const options = { key, code:'Key' + key.toUpperCase(), bubbles:true, cancelable:true, ...modifiers };
    canvas.focus();
    for (const type of ['keydown','keyup']) canvas.dispatchEvent(new frame.contentWindow.KeyboardEvent(type, options));
  }
  // CADCraft maps a double middle click in model space to zoom extents.
  async function fitDrawing() {
    const canvas = frame?.contentDocument?.getElementById('cadcraft_canvas');
    if (!canvas) return;
    const win = frame.contentWindow;
    const bounds = canvas.getBoundingClientRect();
    const center = { clientX:bounds.left + bounds.width * .50, clientY:bounds.top + bounds.height * .54 };
    for (let click = 0; click < 2; click++) {
      await new Promise(resolve => win.requestAnimationFrame(resolve));
      for (const type of ['pointerdown', 'pointerup']) {
        canvas.dispatchEvent(new win.PointerEvent(type, { ...center, bubbles:true, cancelable:true,
          pointerType:'mouse', pointerId:4, isPrimary:true, button:1, buttons:type === 'pointerdown' ? 4 : 0 }));
      }
    }
  }
  fitButton.addEventListener('click', () => { void fitDrawing(); });
  function requestSave() {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    canvasCommand('s', { ctrlKey:!mac, metaKey:mac });
  }

  function startFrame() {
    if (ready) return ready;
    // The drawing retains its CAD colours. Apply the site's light interface and language to a
    // first-time session, while preserving any desktop layout or language the visitor chose.
    try {
      if (!localStorage.getItem('cadcraft.prefs')) {
        localStorage.setItem('cadcraft.prefs', JSON.stringify({theme:'light', interfaceLanguage:'pt-BR'}));
      }
    } catch { /* Browser storage may be disabled. */ }
    frame = document.createElement('iframe');
    frame.title = 'Área de edição CAD da CONFENGE';
    frame.allow = 'fullscreen';
    frame.src = '/cad/editor/frame.htm?host=parent';
    ready = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('O editor demorou a responder. Confira a conexão e abra o desenho novamente.')), 90000);
      readyResolve = () => { clearTimeout(timer); resolve(); };
      readyReject = error => { clearTimeout(timer); reject(error); };
    });
    find('.cad-welcome').hidden = true;
    stage.append(frame);
    expandButton.hidden = false;
    find('.cad-help').hidden = false;
    return ready;
  }
  function removeFailedFrame() {
    titleObserver?.disconnect();
    frame?.remove();
    frame = ready = null;
    dirty = dwgBlocked = false;
    warn();
    activeName = expectedName = '';
    find('.cad-welcome').hidden = false;
    saveButton.hidden = fitButton.hidden = expandButton.hidden = find('.cad-format').hidden = true;
    find('.cad-help').hidden = true;
    find('.cad-name').textContent = 'Área de desenho';
  }
  function send(data, transfer = []) {
    frame.contentWindow.postMessage(data, location.origin, transfer);
  }
  function setBusy(value) {
    loading = value;
    openButton.disabled = exampleButton.disabled = value || saving;
    saveButton.disabled = value || saving;
    editor.setAttribute('aria-busy', String(value || saving));
    stage.dataset.busy = String(value);
  }
  function download(name, bytes) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([bytes], { type:'application/octet-stream' }));
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  }
  async function save(data) {
    clearTimeout(saveTimer);
    if (saving) return;
    saving = true;
    setBusy(loading);
    const name = String(data.name || 'desenho.dxf').split(/[\\/]/).pop();
    const isDrawing = /\.dxf$/i.test(name);
    const output = dwgBlocked ? 'dxf' : format.value;
    say('Preparando a cópia para baixar…');
    try {
      let file = { name, bytes:data.bytes };
      if (isDrawing && output === 'dwg') {
        const { encodeDrawing } = await import('./codec.js');
        file = await encodeDrawing(name, data.bytes);
      }
      const copy = file.name.replace(/\.(dwg|dxf)$/i, '-editado.$1');
      download(copy, file.bytes);
      clearRecovery();
      if (data.id != null) send({ type:'cadcraft:saved', id:data.id });
      if (!dwgBlocked && file.warnings?.length) warn(file.warnings);
      say('Download iniciado: ' + copy);
      reflectTitle();
    } catch (error) {
      if (isDrawing) {
        clearRecovery();
        recovery.href = URL.createObjectURL(new Blob([data.bytes]));
        recovery.download = name.replace(/\.dxf$/i, '-editado.dxf');
        recovery.hidden = false;
        retained = true;
        find('.cad-caption').textContent = 'Cópia DWG pendente';
      }
      say((error.message || 'Falha ao preparar a cópia.') + (isDrawing ? ' A edição em DXF está disponível para baixar.' : ''), true);
    } finally { saving = false; setBusy(loading); }
  }
  recovery.addEventListener('click', () => { retained = false; });
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const data = event.data;
    switch (data?.type) {
      case 'cadcraft:ready':
        titleObserver?.disconnect();
        titleObserver = new MutationObserver(reflectTitle);
        titleObserver.observe(frame.contentDocument.head, {subtree:true, childList:true, characterData:true});
        readyResolve();
        break;
      case 'confenge:open-file':
        if (data.file && typeof data.file.arrayBuffer === 'function') void openFile(data.file);
        break;
      case 'cadcraft:error':
      case 'cadcraft:failed': {
        const error = new Error(data.error || 'Não foi possível abrir o desenho na área gráfica.');
        readyReject(error);
        opened?.reject(error);
        baseline?.reject(error);
        say(error.message, true);
        break;
      }
      case 'cadcraft:dirty':
        dirty = data.dirty === true;
        reflectTitle();
        break;
      case 'cadcraft:save':
        if (data.bytes instanceof ArrayBuffer || ArrayBuffer.isView(data.bytes)) {
          if (baseline) baseline.resolve(data.bytes);
          else if (!loading) void save(data);
        }
        break;
    }
  });
  async function openFile(file, example = false) {
    if (loading || saving) return;
    if ((dirty || retained) && !window.confirm('Há alterações sem uma cópia baixada. Abrir outro desenho mesmo assim?')) return;
    setBusy(true);
    let started = false, input;
    try {
      if (example) {
        say('Abrindo o desenho de exemplo…');
        const response = await fetch('/cad/exemplo.dwg');
        if (!response.ok) throw new Error('O exemplo está indisponível. Você pode abrir um arquivo do seu dispositivo.');
        file = new File([await response.blob()], 'exemplo.dwg');
      }
      if (!/\.(dwg|dxf)$/i.test(file.name)) throw new Error('Escolha um arquivo com extensão DWG ou DXF.');
      const limit = /\.dwg$/i.test(file.name) ? 25 : 64;
      if (!file.size || file.size > limit * 1024 * 1024) throw new Error('Escolha um desenho de até ' + limit + ' MiB que contenha dados.');
      say('Lendo ' + file.name + '…');
      const { prepareDrawing, compareImportBaseline } = await import('./codec.js');
      input = await file.arrayBuffer();
      const doc = await prepareDrawing(file.name, input);
      clearPreview();
      // A single drawing per workbench also makes a second upload with the same name unambiguous.
      if (frame) removeFailedFrame();
      started = true;
      say('Carregando a área de edição…');
      await startFrame();
      clearRecovery();
      expectedName = doc.name;
      sourceName = file.name;
      format.value = /\.dwg$/i.test(file.name) ? 'dwg' : 'dxf';
      say('Abrindo ' + file.name + ' na área de edição…');
      opened = pending(30000, 'O editor não conseguiu abrir este desenho. Tente uma cópia simplificada ou uma folha isolada.');
      send({ type:'cadcraft:open', name:doc.name, bytes:doc.bytes });
      await opened.promise;
      opened = null;
      const warnings = new Set(doc.warnings);
      dwgBlocked = doc.lossy === true;
      say('Conferindo o desenho aberto…');
      try {
        baseline = pending(15000, 'O editor não confirmou a leitura de todos os elementos.');
        requestSave();
        const snapshot = await baseline.promise;
        const check = await compareImportBaseline(doc.bytes, snapshot);
        for (const warning of check.warnings) warnings.add(warning);
        dwgBlocked ||= check.lossy;
      } catch {
        dwgBlocked = true;
        warnings.add('Não foi possível conferir todos os elementos do desenho aberto.');
      } finally { baseline = null; }
      if (dwgBlocked) {
        format.value = 'dxf';
        warnings.add('A gravação em DWG foi desativada para este desenho. Confira a cópia em DXF antes de usá-la.');
      }
      format.querySelector('[value="dwg"]').disabled = dwgBlocked;
      warn([...warnings]);
      if (dwgBlocked) await showPreview(input, file.name);
      reflectTitle();
      await fitDrawing();
      saveButton.hidden = fitButton.hidden = find('.cad-format').hidden = false;
      say('Desenho aberto. Selecione um objeto ou escolha uma ferramenta.');
      frame.focus();
    } catch (error) {
      opened = baseline = null;
      if (started) removeFailedFrame();
      if (!frame && file) await showPreview(input, file.name);
      say(error.message || 'Não foi possível abrir o arquivo.', true);
    } finally { setBusy(false); }
  }
  openButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (file) void openFile(file);
  });
  exampleButton.addEventListener('click', () => { void openFile(null, true); });
  // The mouse and keyboard paths use the same native save command.
  saveButton.addEventListener('click', () => {
    if (saving || loading) return;
    say('Solicitando a cópia ao editor…');
    requestSave();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => say('Clique na área de desenho e use Arquivo > Salvar para baixar a cópia no formato escolhido.'), 4000);
  });
  function expanded() {
    return document.fullscreenElement === editor || editor.classList.contains('cad-expanded');
  }
  function reflectExpanded() {
    const active = expanded();
    expandButton.setAttribute('aria-pressed', String(active));
    expandButton.querySelector('span').textContent = active ? 'Reduzir editor' : 'Ampliar editor';
  }
  expandButton.addEventListener('click', async () => {
    if (document.fullscreenElement === editor) await document.exitFullscreen();
    else if (editor.classList.contains('cad-expanded')) editor.classList.remove('cad-expanded');
    else {
      try { await editor.requestFullscreen(); }
      catch { editor.classList.add('cad-expanded'); }
    }
    reflectExpanded();
  });
  document.addEventListener('fullscreenchange', reflectExpanded);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && editor.classList.contains('cad-expanded')) {
      editor.classList.remove('cad-expanded'); reflectExpanded(); expandButton.focus();
    }
  });
  const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  for (const eventName of ['dragenter', 'dragover']) {
    editor.addEventListener(eventName, event => {
      if (!hasFiles(event)) return;
      event.preventDefault(); stage.dataset.over = 'true';
    });
  }
  editor.addEventListener('dragleave', event => {
    if (!editor.contains(event.relatedTarget)) delete stage.dataset.over;
  });
  editor.addEventListener('drop', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    delete stage.dataset.over;
    const file = event.dataTransfer.files[0];
    if (file) void openFile(file);
  });
}
