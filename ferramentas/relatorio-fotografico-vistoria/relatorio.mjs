import { createToolMetrics } from '/assets/js/aec-tool-metrics.mjs';

const maximumPhotos = 6;
const maximumBytes = 10 * 1024 * 1024;
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
const metrics = createToolMetrics('relatorio-fotografico-vistoria');
const form = document.querySelector('[data-report-form]');
const input = document.querySelector('[data-photo-input]');
const editors = document.querySelector('[data-photo-list]');
const previewPhotos = document.querySelector('[data-output-photos]');
const status = document.querySelector('.report-status');
const printButton = document.querySelector('[data-print]');
const resetButton = document.querySelector('[data-reset]');
const exampleButton = document.querySelector('[data-example]');
const pages = document.querySelector('[data-page-count]');
const entries = [];
let attempt;

function setStatus(message, error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

function value(name, fallback = 'A preencher') {
  const field = form.elements.namedItem(name);
  return String(field?.value || '').trim() || fallback;
}

function updateContext() {
  for (const name of ['place', 'author', 'purpose']) {
    document.querySelector(`[data-output="${name}"]`).textContent = value(name);
  }
  const rawDate = String(form.elements.namedItem('date')?.value || '');
  document.querySelector('[data-output="date"]').textContent = rawDate
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(rawDate + 'T12:00:00'))
    : 'A preencher';
}

function updatePreview() {
  updateContext();
  previewPhotos.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'report-empty';
    empty.textContent = 'A prévia aparecerá aqui quando você incluir fotos ou carregar o exemplo.';
    previewPhotos.append(empty);
  }
  entries.forEach((entry, index) => {
    const figure = document.createElement('figure');
    figure.className = 'report-photo';
    const image = document.createElement('img');
    image.src = entry.url;
    image.alt = entry.caption || `Foto ${index + 1} da vistoria`;
    const caption = document.createElement('figcaption');
    caption.textContent = `Foto ${index + 1} · ${entry.caption || 'Legenda a preencher'}`;
    figure.append(image, caption);
    previewPhotos.append(figure);
  });
  const usable = entries.length > 0 && ['place', 'purpose'].every(name => value(name, '') !== '');
  printButton.disabled = !usable;
  resetButton.hidden = !entries.length && !form.querySelector('input,textarea')?.value;
  pages.textContent = entries.length ? `${entries.length + 1} páginas previstas` : '';
  if (usable) attempt?.finish('ready');
}

function renderEditors() {
  editors.replaceChildren();
  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'report-photo-editor';
    const image = document.createElement('img');
    image.src = entry.url;
    image.alt = '';
    const label = document.createElement('label');
    label.textContent = `Legenda da foto ${index + 1}`;
    const caption = document.createElement('textarea');
    caption.rows = 3;
    caption.maxLength = 500;
    caption.value = entry.caption;
    caption.addEventListener('input', () => { entry.caption = caption.value; updatePreview(); });
    label.append(caption);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button';
    remove.textContent = 'Remover';
    remove.addEventListener('click', () => {
      URL.revokeObjectURL(entry.url);
      entries.splice(index, 1);
      renderEditors();
      updatePreview();
    });
    row.append(image, label, remove);
    editors.append(row);
  });
}

function addImages(files, source) {
  if (!files.length) return;
  attempt = metrics.start('pdf', source, files.reduce((sum, file) => sum + file.size, 0));
  const valid = [];
  for (const file of files) {
    if (!allowed.has(file.type) || !file.size || file.size > maximumBytes) {
      attempt.finish('failed');
      setStatus('Escolha imagens JPEG, PNG ou WebP de até 10 MiB cada.', true);
      continue;
    }
    if (entries.length + valid.length >= maximumPhotos) {
      setStatus('O relatório aceita até seis fotos.', true);
      break;
    }
    valid.push({ url: URL.createObjectURL(file), caption: '' });
  }
  entries.push(...valid);
  renderEditors();
  updatePreview();
  if (valid.length) setStatus(`${valid.length} foto(s) incluída(s). Complete local e objetivo para liberar a impressão.`);
}

form.addEventListener('input', updatePreview);
input.addEventListener('change', () => {
  addImages([...input.files], 'file');
  input.value = '';
});
printButton.addEventListener('click', () => window.print());
resetButton.addEventListener('click', () => {
  entries.splice(0).forEach(entry => URL.revokeObjectURL(entry.url));
  form.reset();
  renderEditors();
  updatePreview();
  setStatus('Comece outro registro quando estiver pronto.');
});
exampleButton.addEventListener('click', async () => {
  form.elements.namedItem('place').value = 'Edifício Horizonte · bloco B';
  form.elements.namedItem('date').value = '2026-11-23';
  form.elements.namedItem('author').value = 'Registro de exemplo';
  form.elements.namedItem('purpose').value = 'Demonstrar a organização de registros visuais antes da análise técnica.';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="#d9e4e2"/><path d="M80 680 430 260l175 190 150-130 365 360H80Z" fill="#477a70"/><rect x="150" y="170" width="360" height="255" fill="#f3f7f6"/><path d="M150 425h360M330 170v255" stroke="#477a70" stroke-width="18"/><text x="80" y="745" font-family="Arial" font-size="42" fill="#183a40">Imagem demonstrativa · localize a observação na legenda</text></svg>`;
  const file = new File([svg], 'foto-exemplo.svg', { type: 'image/svg+xml' });
  const raster = await new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob); }, 'image/jpeg', .9);
    };
    image.src = url;
  });
  if (!raster) { setStatus('Não foi possível preparar o exemplo.', true); return; }
  addImages([new File([raster], 'foto-exemplo.jpg', { type: 'image/jpeg' })], 'example');
  entries.at(-1).caption = 'Imagem demonstrativa: registrar o local, o elemento observado e a condição aparente.';
  renderEditors();
  updatePreview();
});
updatePreview();
