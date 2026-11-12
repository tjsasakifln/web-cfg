import { currentDocument, documentName, drawingWarnings, exportRequest } from './host-protocol.mjs';

const editor = document.getElementById('cad-editor');

if (editor) {
  const find = selector => editor.querySelector(selector);
  const brand = document.querySelector('.site-header .brand img').cloneNode();
  brand.className = 'cad-brand';
  find('.cad-doc').prepend(brand);
  const fileInput = find('[data-file]');
  const openButton = find('[data-open]');
  const newButton = find('[data-new]');
  const exampleButton = find('[data-example]');
  const saveButton = find('[data-save]');
  const fitButton = find('[data-fit]');
  const expandButton = find('[data-expand]');
  const pageButton = find('[data-page]');
  const stage = find('.cad-stage');
  const status = find('.cad-status');
  const issue = find('.cad-issue');
  let frame, ready, readyResolve, readyReject, pollTimer;
  let loading = false, saving = false, saveCommand = false, statePending = false;
  let state, destroyed = false, booted = false;
  const seenExports = new Set();
  const inertSiblings = new Set();

  function say(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }
  function setBusy(value = loading) {
    loading = value;
    openButton.disabled = newButton.disabled = exampleButton.disabled = loading || saving;
    saveButton.disabled = loading || saving || saveCommand;
    fitButton.disabled = loading;
    editor.setAttribute('aria-busy', String(loading || saving));
    stage.dataset.busy = String(loading);
  }
  function canvas() { return frame?.contentDocument?.querySelector('canvas'); }
  function focusDrawing() { canvas()?.focus({ preventScroll: true }); }
  async function control(payload, timeoutMs = 120000) {
    const api = frame?.contentWindow?.ocsControl;
    if (!api) throw new Error('Aguarde o carregamento do editor.');
    if (['new', 'open', 'run', 'action'].includes(payload.op)) {
      const current = await api.request({ op: 'state' }, { timeoutMs: 15000 });
      if (!current.ok) throw new Error('Não foi possível consultar o desenho atual.');
      payload = { ...payload, request_id: crypto.randomUUID(), document_id: current.document_id, revision: current.revision };
    }
    const reply = await api.request(payload, { timeoutMs });
    if (!reply?.ok) {
      const detail = reply?.error;
      const error = new Error(reply?.message || detail?.message || (typeof detail === 'string' ? detail : 'O editor não concluiu o comando.'));
      error.code = typeof detail === 'object' ? detail?.code : detail;
      throw error;
    }
    return reply;
  }
  function reflectState(next) {
    state = next;
    const document = currentDocument(next);
    const available = !!document;
    find('.cad-name').textContent = documentName(document);
    find('.cad-caption').textContent = document?.dirty ? 'Alterações em edição' : 'Edição local no navegador';
    saveButton.hidden = fitButton.hidden = !available;
    expandButton.hidden = pageButton.hidden = false;
    const warnings = drawingWarnings(next);
    const list = issue.querySelector('ul');
    list.replaceChildren(...warnings.map(text => {
      const item = window.document.createElement('li'); item.textContent = text; return item;
    }));
    issue.querySelector('p').textContent = 'Confira estes elementos do desenho.';
    issue.hidden = !warnings.length;
  }
  async function refreshState() {
    if (statePending || !frame?.contentWindow?.ocsControl || destroyed) return;
    statePending = true;
    try { reflectState(await control({ op: 'state' }, 15000)); }
    catch { /* Opening a large drawing can temporarily occupy the engine. */ }
    finally { statePending = false; }
  }

  function startFrame() {
    if (ready) return ready;
    frame = document.createElement('iframe');
    frame.title = 'Área de edição CAD da CONFENGE';
    frame.allow = "fullscreen 'none'";
    frame.src = '/cad/editor/frame.htm';
    ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O editor demorou a responder. Confira a conexão e tente novamente.')), 180000);
      readyResolve = () => { clearTimeout(timer); resolve(); };
      readyReject = error => { clearTimeout(timer); reject(error); };
    });
    find('.cad-welcome').hidden = true;
    stage.append(frame);
    find('.cad-help').hidden = false;
    return ready;
  }
  function removeFailedFrame() {
    clearInterval(pollTimer);
    frame?.remove(); frame = ready = state = undefined; booted = false;
    find('.cad-welcome').hidden = false;
    find('.cad-help').hidden = true;
    saveButton.hidden = fitButton.hidden = expandButton.hidden = pageButton.hidden = true;
    setWorkspace('page');
  }
  function leaveGuard(event) {
    if (!saving && !state?.documents?.some(document => document.dirty)) return;
    event.preventDefault(); event.returnValue = '';
  }
  window.addEventListener('beforeunload', leaveGuard);
  window.addEventListener('pagehide', () => { destroyed = true; clearInterval(pollTimer); });
  window.addEventListener('pageshow', () => {
    destroyed = false;
    if (frame?.contentWindow?.ocsControl) { clearInterval(pollTimer); pollTimer = setInterval(refreshState, 700); }
  });

  function downloadLocal(name, bytes) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function deliverExport(data, source) {
    let request;
    const respond = result => source.postMessage({ type: 'confenge-cad:export-result', id: data.id, ...result }, location.origin);
    try { request = exportRequest(data); }
    catch (error) { respond({ ok: false, error: error.message }); return; }
    if (seenExports.has(request.id)) return;
    if (saving) { respond({ ok: false, error: 'Conclua a exportação em andamento antes de salvar outro arquivo.' }); return; }
    seenExports.add(request.id);
    if (seenExports.size > 256) seenExports.delete(seenExports.values().next().value);
    saving = true; setBusy();
    say('Preparando ' + request.name + ' para baixar…');
    // Keep the wallet and its recovery notice usable in the enlarged workspace.
    setBackgroundInert(false);
    try {
      const { exportToolResult } = await import('/assets/js/tool-credits.mjs');
      const delivered = await exportToolResult({
        toolId: 'cad-editor', format: request.format,
        content: new Blob([request.bytes], { type: 'application/octet-stream' }),
        deliver: () => downloadLocal(request.name, request.bytes),
      });
      respond({ ok: delivered === true });
      say(delivered ? 'Download iniciado: ' + request.name : 'Exportação cancelada. O desenho continua aberto.');
    } catch (error) {
      const message = error.message || 'Não foi possível concluir a exportação. Seu desenho continua aberto.';
      respond({ ok: false, error: message }); say(message, true);
    } finally {
      saving = false; setBusy();
      if (editor.classList.contains('cad-expanded')) setBackgroundInert(true);
      void refreshState();
    }
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.type === 'confenge-cad:ready') {
      booted = true;
      bindCanvasResume(); readyResolve();
      clearInterval(pollTimer); pollTimer = setInterval(refreshState, 700);
      void refreshState();
    } else if (data?.type === 'confenge-cad:failed') {
      readyReject(new Error(data.error || 'O editor não conseguiu iniciar.'));
      say(data.error || 'O editor não conseguiu iniciar.', true);
    } else if (data?.type === 'confenge-cad:export') {
      void deliverExport(data, event.source);
    }
  });

  async function openFile(file, example = false) {
    if (loading || saving) return;
    setBusy(true);
    try {
      if (example) {
        say('Abrindo o desenho de exemplo…');
        const response = await fetch('/cad/exemplo.dwg');
        if (!response.ok) throw new Error('O exemplo está indisponível. Abra um arquivo do seu dispositivo.');
        file = new File([await response.blob()], 'exemplo.dwg');
      }
      if (!file || !/\.(dwg|dxf)$/i.test(file.name)) throw new Error('Escolha um arquivo DWG ou DXF.');
      if (!file.size || file.size > 64 * 1024 * 1024) throw new Error('Escolha um desenho com dados e até 64 MiB.');
      if (/\.dwg$/i.test(file.name)) {
        const signature = new TextDecoder().decode(await file.slice(0, 6).arrayBuffer());
        if (!/^AC10\d{2}$/.test(signature)) throw new Error('O arquivo não contém uma assinatura DWG válida.');
      }
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo escolhido.'));
        reader.readAsDataURL(file);
      });
      say('Carregando a área de edição…');
      await startFrame();
      say('Abrindo ' + file.name + '…');
      await control({ op: 'open', name: file.name, data_base64: encoded });
      await control({ op: 'action', name: 'zoom_extents' });
      await refreshState();
      say('Desenho aberto. Selecione um objeto ou escolha uma ferramenta.');
      setWorkspace(editor.classList.contains('cad-expanded') ? 'expanded' : 'inline');
    } catch (error) {
      // An invalid second file never destroys a drawing already being edited.
      if (!booted) removeFailedFrame();
      say(error.message || 'Não foi possível abrir o arquivo.', true);
    } finally { setBusy(false); }
  }
  openButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0]; fileInput.value = '';
    if (file) void openFile(file);
  });
  exampleButton.addEventListener('click', () => { void openFile(null, true); });
  newButton.addEventListener('click', async () => {
    if (loading || saving) return;
    setBusy(true); say('Carregando um novo desenho…');
    try {
      await startFrame(); await control({ op: 'new' }); await refreshState();
      setWorkspace('inline'); say('Novo desenho aberto. Escolha uma ferramenta para começar.');
    } catch (error) { if (!booted) removeFailedFrame(); say(error.message, true); }
    finally { setBusy(false); }
  });
  fitButton.addEventListener('click', async () => {
    try { await control({ op: 'action', name: 'zoom_extents' }); focusDrawing(); }
    catch (error) { say(error.message, true); }
  });
  saveButton.addEventListener('click', async () => {
    if (loading || saving || saveCommand) return;
    saveCommand = true; setBusy();
    say('Escolha o nome, o formato e a versão em Salvar como.');
    focusDrawing();
    try { await control({ op: 'run', cmd: 'SAVEAS' }, 10 * 60 * 1000); }
    catch (error) { if (!/cancel/i.test(error.code || error.message)) say(error.message, true); }
    finally { saveCommand = false; setBusy(); void refreshState(); }
  });

  function setBackgroundInert(inert) {
    if (!inert) {
      for (const node of inertSiblings) node.inert = false;
      inertSiblings.clear(); return;
    }
    for (let node = editor; node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node || sibling.inert || !(sibling instanceof HTMLElement) ||
            sibling.matches('.tool-credits__export-notice, .tool-credits')) continue;
        sibling.inert = true; inertSiblings.add(sibling);
      }
    }
  }
  function alignInline() {
    const header = document.querySelector('.site-header').getBoundingClientRect().height;
    editor.style.setProperty('--cad-header-height', header + 'px');
    window.scrollBy({ top: editor.getBoundingClientRect().top - header, behavior: 'instant' });
  }
  function setWorkspace(mode) {
    const working = mode !== 'page', expanded = mode === 'expanded';
    editor.classList.toggle('cad-working', working);
    editor.classList.toggle('cad-expanded', expanded);
    document.documentElement.classList.toggle('cad-page-locked', working);
    setBackgroundInert(expanded && !saving);
    editor.setAttribute('role', expanded ? 'dialog' : 'region');
    if (expanded) editor.setAttribute('aria-modal', 'true');
    else editor.removeAttribute('aria-modal');
    expandButton.setAttribute('aria-pressed', String(expanded));
    expandButton.querySelector('span').textContent = expanded ? 'Reduzir editor' : 'Ampliar editor';
    pageButton.textContent = working ? 'Voltar à página' : 'Retomar edição';
    if (mode === 'inline') alignInline();
    if (working) focusDrawing();
  }
  function bindCanvasResume() {
    const drawing = canvas();
    if (!drawing) return;
    const reading = () => !pageButton.hidden && !editor.classList.contains('cad-working');
    drawing.addEventListener('pointerdown', event => {
      if (!event.isTrusted || !reading()) return;
      document.documentElement.classList.add('cad-page-locked');
      drawing.setPointerCapture(event.pointerId);
    }, true);
    drawing.addEventListener('lostpointercapture', () => {
      requestAnimationFrame(() => {
        if (frame?.contentDocument === drawing.ownerDocument && reading() &&
            document.documentElement.classList.contains('cad-page-locked')) setWorkspace('inline');
      });
    });
    drawing.addEventListener('keydown', event => {
      if (event.isTrusted && reading() && !['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) setWorkspace('inline');
    }, true);
  }
  // Escape belongs to the CAD command, including in the enlarged workspace.
  expandButton.addEventListener('click', () => setWorkspace(editor.classList.contains('cad-expanded') ? 'inline' : 'expanded'));
  pageButton.addEventListener('click', () => {
    const leaving = editor.classList.contains('cad-working');
    setWorkspace(leaving ? 'page' : 'inline');
    if (leaving) pageButton.focus();
  });
  document.addEventListener('focusin', event => {
    if (!saving && editor.classList.contains('cad-working') && !editor.classList.contains('cad-expanded') && !editor.contains(event.target)) setWorkspace('page');
  });
  window.addEventListener('resize', () => {
    if (editor.classList.contains('cad-working') && !editor.classList.contains('cad-expanded')) alignInline();
  });
  const hasFiles = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  for (const name of ['dragenter', 'dragover']) editor.addEventListener(name, event => {
    if (!hasFiles(event)) return;
    event.preventDefault(); stage.dataset.over = 'true';
  });
  editor.addEventListener('dragleave', event => { if (!editor.contains(event.relatedTarget)) delete stage.dataset.over; });
  editor.addEventListener('drop', event => {
    if (!hasFiles(event)) return;
    event.preventDefault(); delete stage.dataset.over;
    const file = event.dataTransfer.files[0]; if (file) void openFile(file);
  });
}
