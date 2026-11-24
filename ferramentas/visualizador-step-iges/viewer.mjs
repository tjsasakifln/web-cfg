import { createToolMetrics } from '/assets/js/aec-tool-metrics.mjs';

const MAX_BYTES = 64 * 1024 * 1024;
const formats = new Map([['step', 'step'], ['stp', 'step'], ['iges', 'iges'], ['igs', 'iges'], ['3dm', '3dm']]);
const input = document.querySelector('#model-file');
const openFile = document.querySelector('#open-file');
const openExample = document.querySelector('#open-example');
const openExample3dm = document.querySelector('#open-example-3dm');
const status = document.querySelector('#status');
const target = document.querySelector('#viewer');
const metrics = createToolMetrics('visualizador-step-iges');
const LOAD_TIMEOUT_MS = 30000;
let activeViewer = null;
let engineLoad = null;
let attemptGeneration = 0;
let loading = false;
let renderTimeout = null;

function loadEngine() {
  if (window.OV) return Promise.resolve();
  if (engineLoad) return engineLoad;
  let script;
  const pending = new Promise((resolve, reject) => {
    script = document.createElement('script');
    script.src = 'vendor/o3dv.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('engine unavailable'));
    document.head.append(script);
  });
  engineLoad = pending.catch(error => {
    engineLoad = null;
    script?.remove();
    throw error;
  });
  return engineLoad;
}

function extensionOf(fileName) {
  return fileName.split('.').pop().toLowerCase();
}

function setStatus(message) {
  status.textContent = message;
}

function clearViewer() {
  clearTimeout(renderTimeout);
  renderTimeout = null;
  activeViewer?.Destroy();
  activeViewer = null;
  target.replaceChildren();
}

function setLoading(next) {
  loading = next;
  openFile.disabled = next;
  openExample.disabled = next;
  openExample3dm.disabled = next;
}

function current(generation) {
  return generation === attemptGeneration;
}

function beginAttempt() {
  const generation = ++attemptGeneration;
  setLoading(true);
  clearViewer();
  return generation;
}

function rejectConcurrentIntent() {
  if (loading) setStatus('Aguarde a abertura do arquivo atual terminar antes de escolher outro.');
}

async function load(files, source, generation = null) {
  const file = files[0];
  const extension = extensionOf(file.name);
  const format = formats.get(extension);
  if (!format) {
    setStatus('Escolha um arquivo STEP (.step, .stp), IGES (.iges, .igs) ou Rhino 3DM (.3dm).');
    return;
  }
  if (file.size > MAX_BYTES) {
    setStatus('Este piloto abre arquivos de até 64 MiB. Use o modelador 3D para arquivos maiores.');
    return;
  }
  if (generation === null) {
    if (loading) {
      rejectConcurrentIntent();
      return;
    }
    generation = beginAttempt();
  }
  if (!current(generation)) return;
  metrics.start(format, source, file.size);
  setStatus(`Preparando ${file.name}. Carregando o visualizador e processando a geometria neste navegador.`);
  try {
    await loadEngine();
  } catch {
    if (!current(generation)) return;
    setStatus('Não foi possível iniciar o visualizador agora. Tente novamente.');
    metrics.finish('failed');
    setLoading(false);
    return;
  }
  if (!current(generation)) return;
  const viewer = new window.OV.EmbeddedViewer(target, {
    backgroundColor: new window.OV.RGBAColor(6, 26, 51, 255),
    defaultColor: new window.OV.RGBColor(164, 205, 194),
    onModelLoaded: () => {
      if (!current(generation) || activeViewer !== viewer) return;
      clearTimeout(renderTimeout);
      renderTimeout = null;
      setStatus(`${file.name} está pronto para inspeção visual. Arraste para girar e use a roda para aproximar.`);
      metrics.finish('ready');
      setLoading(false);
    },
    onModelLoadFailed: () => {
      if (!current(generation) || activeViewer !== viewer) return;
      clearTimeout(renderTimeout);
      renderTimeout = null;
      setStatus(`Não foi possível abrir ${file.name}. Confira a extensão e tente uma cópia válida do arquivo.`);
      metrics.finish('failed');
      setLoading(false);
    }
  });
  activeViewer = viewer;
  renderTimeout = setTimeout(() => {
    if (!current(generation) || activeViewer !== viewer) return;
    viewer.Destroy();
    activeViewer = null;
    target.replaceChildren();
    setStatus('A abertura demorou mais que o limite deste piloto. Tente uma cópia menor ou use o modelador 3D.');
    metrics.finish('failed');
    setLoading(false);
  }, LOAD_TIMEOUT_MS);
  viewer.LoadModelFromFileList(files);
}

openFile.addEventListener('click', () => {
  if (!loading) input.click();
});
input.addEventListener('change', () => {
  if (input.files.length) load(Array.from(input.files), 'file');
  input.value = '';
});
async function openLocalExample(path, name, mimeType, label) {
  if (loading) {
    rejectConcurrentIntent();
    return;
  }
  const generation = beginAttempt();
  try {
    setStatus(`Baixando o exemplo ${label} para abrir localmente.`);
    const response = await fetch(path);
    if (!response.ok) throw new Error('example unavailable');
    const blob = await response.blob();
    await load([new File([blob], name, { type: mimeType })], 'example', generation);
  } catch {
    if (!current(generation)) return;
    setStatus('O exemplo não está disponível agora. Escolha um arquivo compatível do seu dispositivo.');
    setLoading(false);
  }
}

openExample.addEventListener('click', () => {
  openLocalExample('exemplo/suporte.stp', 'suporte-exemplo.stp', 'application/step', 'STEP');
});

openExample3dm.addEventListener('click', () => {
  openLocalExample('exemplo/teacup.3dm', 'teacup-exemplo.3dm', 'application/octet-stream', '3DM');
});
