if (window.parent === window) {
  location.replace('/cad/');
} else {
  // Direct file drops and the native File > Open picker also go through the DWG codec.
  function routeFiles(event) {
    const files = event.type === 'drop' ? event.dataTransfer?.files : event.target?.files;
    const file = Array.from(files || []).find(f => /\.(dwg|dxf)$/i.test(f.name));
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent.postMessage({ type: 'confenge:open-file', file }, location.origin);
    if (event.target?.type === 'file') event.target.remove();
  }
  window.addEventListener('drop', routeFiles, true);
  window.addEventListener('change', routeFiles, true);
  // Windows starts browser autoscroll on middle mouse down. Leave event propagation
  // intact for the CAD engine and keep dragging when the cursor crosses the frame.
  const canvas = document.getElementById('cadcraft_canvas');
  for (const type of ['pointerdown', 'mousedown', 'auxclick']) {
    canvas.addEventListener(type, event => {
      if (event.button !== 1) return;
      if (type === 'pointerdown') {
        if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
      } else {
        event.preventDefault();
      }
    }, true);
  }
  try {
    const { default: init } = await import('./cadcraft-web-d875c3c223026021.js');
    await init({ module_or_path: './cadcraft-web-d875c3c223026021_bg.wasm' });
  } catch {
    const error = 'O navegador não conseguiu iniciar a área de desenho. Atualize a página e tente novamente.';
    document.getElementById('cadcraft_loading').textContent = error;
    window.parent.postMessage({ type: 'cadcraft:failed', error }, location.origin);
  }
}
