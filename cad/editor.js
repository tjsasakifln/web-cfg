const editor = document.getElementById('cad-editor');

if (editor) {
  const find = selector => editor.querySelector(selector);
  const brand = document.querySelector('.site-header .brand img').cloneNode();
  brand.className = 'cad-brand';
  find('.cad-doc').prepend(brand);
  const fileInput = find('[data-file]');
  const openButton = find('[data-open]');
  const exampleButton = find('[data-example]');
  const saveButton = find('[data-save]');
  const fitButton = find('[data-fit]');
  const expandButton = find('[data-expand]');
  const pageButton = find('[data-page]');
  const stage = find('.cad-stage');
  const status = find('.cad-status');
  const issue = find('.cad-issue');
  const format = find('[data-format]');
  const recovery = document.createElement('a');
  recovery.className = 'cad-recover';
  recovery.textContent = 'Baixar a edição em DXF';
  const preview = find('.cad-preview');
  const open2d = find('[data-open-2d]');
  const manual2d = find('[data-manual-2d]');
  let fileFor2d;
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
    recovery.remove();
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

  function reflectFormat() {
    saveButton.querySelector('span').textContent = 'Baixar ' + format.value.toUpperCase();
  }
  format.addEventListener('change', reflectFormat);

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
    frame.allow = "fullscreen 'none'";
    frame.src = '/cad/editor/frame.htm?host=parent';
    ready = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('O editor demorou a responder. Confira a conexão e abra o desenho novamente.')), 90000);
      readyResolve = () => { clearTimeout(timer); resolve(); };
      readyReject = error => { clearTimeout(timer); reject(error); };
    });
    find('.cad-welcome').hidden = true;
    stage.append(frame);
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
    saveButton.hidden = fitButton.hidden = expandButton.hidden = pageButton.hidden = find('.cad-format').hidden = true;
    find('.cad-help').hidden = true;
    find('.cad-name').textContent = 'Área de desenho';
  }
  function send(data, transfer = []) {
    frame.contentWindow.postMessage(data, location.origin, transfer);
  }
  function setBusy(value) {
    loading = value;
    openButton.disabled = exampleButton.disabled = value || saving;
    saveButton.disabled = format.disabled = value || saving;
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
        find('.cad-foot').append(recovery);
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
        bindCanvasResume();
        readyResolve();
        break;
      case 'confenge:open-file':
        if (data.file && typeof data.file.arrayBuffer === 'function') void openFile(data.file);
        break;
      case 'cadcraft:error':
      case 'cadcraft:failed': {
        const graphicsFailed = data.type === 'cadcraft:failed' && /webgl2 not available|failed to create wgpu surface/i.test(data.error);
        const error = new Error(graphicsFailed
          ? 'Este navegador não conseguiu iniciar a área gráfica do editor.'
          : data.error || 'Não foi possível abrir o desenho na área gráfica.');
        if (graphicsFailed) error.name = 'GraphicsUnavailable';
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
    fileFor2d = null;
    open2d.hidden = manual2d.hidden = true;
    if (!frame) warn();
    let started = false, input, doc;
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
      doc = await prepareDrawing(file.name, input);
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
      reflectFormat();
      warn([...warnings]);
      if (dwgBlocked) await showPreview(input, file.name);
      reflectTitle();
      await fitDrawing();
      saveButton.hidden = fitButton.hidden = expandButton.hidden = pageButton.hidden = find('.cad-format').hidden = false;
      say('Desenho aberto. Selecione um objeto ou escolha uma ferramenta.');
      setWorkspace(editor.classList.contains('cad-expanded') ? 'expanded' : 'inline');
    } catch (error) {
      opened = baseline = null;
      if (started) {
        setWorkspace('page');
        removeFailedFrame();
      }
      if (!frame && file) await showPreview(input, file.name);
      if (error.name === 'GraphicsUnavailable' && doc) {
        if (doc.lossy) {
          warn(doc.warnings);
          issue.querySelector('p').textContent = 'O desenho contém objetos que a leitura não conseguiu preservar. Confira o arquivo original.';
        } else {
          fileFor2d = file;
          open2d.hidden = false;
        }
      }
      say(error.message || 'Não foi possível abrir o arquivo.', true);
    } finally { setBusy(false); }
  }
  open2d.addEventListener('click', async () => {
    if (loading || !fileFor2d) return;
    setBusy(true);
    open2d.disabled = true;
    try {
      const { newHandoffId, putHandoff } = await import('./aplicativos/studio/handoff.mjs');
      const id = newHandoffId();
      await putHandoff(id, fileFor2d, 'confenge');
      location.assign('/cad/aplicativos/#cadcraft/' + id);
    } catch {
      open2d.hidden = true;
      manual2d.hidden = false;
      say('O navegador não permitiu transferir o desenho localmente. Abra o CadCraft 2D e selecione o arquivo novamente.', true);
    } finally { open2d.disabled = false; setBusy(false); }
  });
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
  const inertSiblings = new Set();
  function setBackgroundInert(inert) {
    if (!inert) {
      for (const node of inertSiblings) node.inert = false;
      inertSiblings.clear();
      return;
    }
    for (let node = editor; node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node || sibling.inert || !(sibling instanceof HTMLElement)) continue;
        sibling.inert = true;
        inertSiblings.add(sibling);
      }
    }
  }
  function alignInline() {
    const header = document.querySelector('.site-header').getBoundingClientRect().height;
    editor.style.setProperty('--cad-header-height', header + 'px');
    window.scrollBy({ top:editor.getBoundingClientRect().top - header, behavior:'instant' });
  }
  function setWorkspace(mode) {
    const working = mode !== 'page';
    const expanded = mode === 'expanded';
    editor.classList.toggle('cad-working', working);
    editor.classList.toggle('cad-expanded', expanded);
    document.documentElement.classList.toggle('cad-page-locked', working);
    setBackgroundInert(expanded);
    editor.setAttribute('role', expanded ? 'dialog' : 'region');
    if (expanded) editor.setAttribute('aria-modal', 'true');
    else editor.removeAttribute('aria-modal');
    expandButton.setAttribute('aria-pressed', String(expanded));
    expandButton.querySelector('span').textContent = expanded ? 'Reduzir editor' : 'Ampliar editor';
    pageButton.textContent = working ? 'Voltar à página' : 'Retomar edição';
    if (mode === 'inline') alignInline();
    if (working) frame?.contentDocument?.getElementById('cadcraft_canvas')?.focus({preventScroll:true});
  }
  function bindCanvasResume() {
    const canvas = frame.contentDocument.getElementById('cadcraft_canvas');
    const reading = () => !pageButton.hidden && !editor.classList.contains('cad-working');
    canvas.addEventListener('pointerdown', event => {
      if (!event.isTrusted || !reading()) return;
      // Keep the pan/pick coordinates stable until this gesture ends.
      document.documentElement.classList.add('cad-page-locked');
      canvas.setPointerCapture(event.pointerId);
    }, true);
    canvas.addEventListener('lostpointercapture', () => {
      requestAnimationFrame(() => {
        if (frame?.contentDocument === canvas.ownerDocument && reading() && document.documentElement.classList.contains('cad-page-locked')) {
          setWorkspace('inline');
        }
      });
    });
    canvas.addEventListener('keydown', event => {
      if (event.isTrusted && reading() && !['Tab','Shift','Control','Alt','Meta'].includes(event.key)) {
        setWorkspace('inline');
      }
    }, true);
  }
  // Escape belongs to the drawing, including partially typed commands. Only the
  // workspace controls change size or release the page for reading.
  expandButton.addEventListener('click', () => {
    setWorkspace(editor.classList.contains('cad-expanded') ? 'inline' : 'expanded');
  });
  pageButton.addEventListener('click', () => {
    const leaving = editor.classList.contains('cad-working');
    setWorkspace(leaving ? 'page' : 'inline');
    if (leaving) pageButton.focus();
  });
  document.addEventListener('focusin', event => {
    if (editor.classList.contains('cad-working') && !editor.classList.contains('cad-expanded') && !editor.contains(event.target)) {
      setWorkspace('page');
    }
  });
  window.addEventListener('resize', () => {
    if (editor.classList.contains('cad-working') && !editor.classList.contains('cad-expanded')) alignInline();
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
