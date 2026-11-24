import { createToolMetrics } from '/assets/js/aec-tool-metrics.mjs';

const metrics = createToolMetrics('croqui-de-obra');
const area = document.querySelector('#croqui-editor');
const status = document.querySelector('#croqui-status');
const start = document.querySelector('#croqui-iniciar');
const example = document.querySelector('#croqui-exemplo');
const template = document.querySelector('#croqui-modelo');
const chooseFile = document.querySelector('#croqui-escolher-arquivo');
const picker = document.querySelector('#croqui-arquivo');
const save = document.querySelector('#croqui-salvar');
const exportSvg = document.querySelector('#croqui-exportar');
const ENGINE_STYLE = '/ferramentas/croqui-de-obra/vendor/engine.css';
const MAX_SCENE_BYTES = 4 * 1024 * 1024;
let editorPromise;
let pendingAction = false;

function setStatus(message) {
  status.textContent = message;
}

function setExportAvailability(elements) {
  const empty = !elements.some(element => !element.isDeleted);
  save.disabled = empty;
  exportSvg.disabled = empty;
}

function editor() {
  if (editorPromise) return editorPromise;
  setStatus('Carregando o editor de croquis.');
  const assets = new URL('./vendor/', import.meta.url);
  window.EXCALIDRAW_ASSET_PATH = assets.href;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = ENGINE_STYLE;
  const style = new Promise((resolve, reject) => {
    link.onload = resolve;
    link.onerror = () => reject(new Error('O estilo do editor não carregou. Tente abrir o croqui novamente.'));
    document.head.append(link);
  });
  editorPromise = Promise.all([style, import('./vendor/engine.js')]).then(([, { startEditor }]) => {
    area.hidden = false;
    return startEditor(area, setExportAvailability);
  }).catch(error => {
    link.remove();
    editorPromise = null;
    area.hidden = true;
    throw error;
  });
  return editorPromise;
}

async function open(inputType, action, size) {
  if (pendingAction) return;
  pendingAction = true;
  const attempt = metrics.start('croqui', inputType, size);
  for (const control of [start, example, chooseFile]) control.disabled = true;
  try {
    if (await action() !== false) attempt.finish('ready');
  } catch (error) {
    attempt.finish('failed');
    setStatus(error instanceof Error ? error.message : 'Não foi possível abrir o croqui.');
  } finally {
    pendingAction = false;
    for (const control of [start, example, chooseFile]) control.disabled = false;
  }
}

function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

start.addEventListener('click', () => open('new', async () => {
  await editor();
  setStatus('Editor aberto. Use as ferramentas de desenho para montar seu croqui.');
  area.focus();
}));

example.addEventListener('click', () => open('example', async () => {
  if (editorPromise && !save.disabled && !window.confirm('Substituir o croqui aberto pelo modelo selecionado?')) return false;
  const board = await editor();
  board.loadTemplate(template.value);
  setStatus('Modelo aberto. Você pode editar os elementos e baixar o croqui.');
  area.focus();
}));

chooseFile.addEventListener('click', () => picker.click());
picker.addEventListener('change', () => {
  const file = picker.files[0];
  picker.value = '';
  if (!file) return;
  open('import', async () => {
    if (file.size > MAX_SCENE_BYTES) throw new Error('Escolha um arquivo de croqui de até 4 MiB.');
    let document;
    try {
      document = JSON.parse(await file.text());
    } catch {
      throw new Error('O arquivo não tem o formato editável do croqui.');
    }
    if (editorPromise && !save.disabled && !window.confirm('Substituir o croqui aberto pelo arquivo selecionado?')) return false;
    const board = await editor();
    board.openFile(document);
    setStatus('Croqui aberto para edição neste navegador.');
    area.focus();
  }, file.size);
});

save.addEventListener('click', async () => {
  const board = await editor();
  download(board.nativeFile(), 'application/json', 'croqui-confenge.excalidraw');
  metrics.finish('exported');
  setStatus('Croqui editável preparado para download.');
});

exportSvg.addEventListener('click', async () => {
  exportSvg.disabled = true;
  try {
    const board = await editor();
    download(await board.svgFile(), 'image/svg+xml', 'croqui-confenge.svg');
    metrics.finish('exported');
    setStatus('Croqui em SVG preparado para download.');
  } catch {
    setStatus('Não foi possível exportar este croqui em SVG.');
  } finally {
    exportSvg.disabled = save.disabled;
  }
});
