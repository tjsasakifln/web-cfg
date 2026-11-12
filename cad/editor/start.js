// CONFENGE hosts its compiled OpenCAD Studio edition in this frame.
// Drawing bytes stay local. All user exports await the parent wallet.
if (window.parent === window) {
  location.replace('/cad/');
} else {
  const origin = location.origin;
  const pending = new Map();
  const send = data => window.parent.postMessage(data, origin);
  const fail = error => {
    const message = error?.message || 'Não foi possível iniciar a área gráfica. Atualize o navegador e tente novamente.';
    const loading = document.getElementById('loading');
    if (loading) { loading.hidden = false; loading.querySelector('[role=status]').textContent = message; }
    send({ type: 'confenge-cad:failed', error: message });
  };

  // Rust awaits this Promise before cleaning or closing a drawing.
  window.openCadStudioSaveFile = (name, bytes) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('A exportação não foi concluída. Seu desenho continua aberto.'));
    }, 10 * 60 * 1000);
    pending.set(id, { resolve, reject, timer });
    try {
      const copy = new Uint8Array(bytes);
      window.parent.postMessage({ type: 'confenge-cad:export', id, name, bytes: copy }, origin, [copy.buffer]);
    } catch (error) {
      clearTimeout(timer); pending.delete(id); reject(error);
    }
  });
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== origin) return;
    const data = event.data;
    if (data?.type !== 'confenge-cad:export-result' || typeof data.ok !== 'boolean') return;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id); clearTimeout(request.timer);
    if (data.ok) request.resolve(true);
    else if (data.error) request.reject(new Error(String(data.error)));
    else request.resolve(false);
  });

  function bindCanvas(canvas) {
    canvas.id = 'confenge-cad-canvas';
    canvas.setAttribute('aria-label', 'Área de desenho CAD da CONFENGE');
    for (const type of ['pointerdown', 'mousedown', 'auxclick']) {
      canvas.addEventListener(type, event => {
        if (event.button !== 1) return;
        if (type === 'pointerdown' && event.isTrusted) canvas.setPointerCapture(event.pointerId);
        if (type !== 'pointerdown') event.preventDefault();
      }, true);
    }
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    document.getElementById('loading')?.remove();
  }

  try {
    const bindings = await import('./confenge-cad.js');
    await bindings.default({ module_or_path: './confenge-cad_bg.wasm' });
    window.wasmBindings = bindings;
    await import('./ocs-control.js');
    await window.ocsControl.ready;
    const state = await window.ocsControl.request({ op: 'state' }, { timeoutMs: 120000 });
    if (!state.ok) throw new Error('O editor não conseguiu iniciar o documento.');
    let canvas = document.querySelector('canvas');
    if (!canvas) {
      canvas = await new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
          const element = document.querySelector('canvas');
          if (element) { observer.disconnect(); clearTimeout(timer); resolve(element); }
        });
        const timer = setTimeout(() => { observer.disconnect(); reject(new Error('A área gráfica não ficou disponível.')); }, 30000);
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
    bindCanvas(canvas);
    send({ type: 'confenge-cad:ready' });
  } catch (error) { fail(error); }
}
