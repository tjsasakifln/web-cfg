import { createToolMetrics } from '/assets/js/aec-tool-metrics.mjs';

const metrics = createToolMetrics('visualizador-nuvem-pontos');
const button = document.querySelector('#abrir-nuvem');
const stage = document.querySelector('#cloud-stage');
const status = document.querySelector('#viewer-status');
const libraries = [
  './vendor/potree-1.8.2/jquery-3.7.1.min.js',
  './vendor/potree-1.8.2/tween.min.js',
  './vendor/potree-1.8.2/proj4.js',
  './vendor/potree-1.8.2/BinaryHeap.js',
  './vendor/potree-1.8.2/potree.min.js',
  './viewer.js',
];
const loaded = new Set();

function loadScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = path;
    script.onload = () => { loaded.add(path); resolve(); };
    script.onerror = () => { script.remove(); reject(new Error('Visualizador indisponível')); };
    document.head.append(script);
  });
}

button.addEventListener('click', async () => {
  const attempt = metrics.start('octree', 'example');
  stage.addEventListener('nuvem-pronta', () => attempt.finish('ready'), { once: true });
  button.disabled = true;
  stage.hidden = false;
  status.textContent = 'Carregando a nuvem de demonstração.';
  try {
    for (const path of libraries) if (!loaded.has(path)) await loadScript(path);
  } catch {
    attempt.finish('failed');
    button.disabled = false;
    stage.hidden = true;
    status.textContent = 'Não foi possível abrir a demonstração. Tente novamente.';
  }
});
