import { createToolMetrics } from '/assets/js/aec-tool-metrics.mjs';

const metrics = createToolMetrics('organizar-pranchas-pdf');
const MAX_FILES = 20;
const MAX_BYTES = 80 * 1024 * 1024;
const files = [];
const sampleFiles = new WeakSet();
const input = document.querySelector('#files');
const addButton = document.querySelector('#montar-pdf-adicionar');
const example = document.querySelector('#exemplo');
const list = document.querySelector('#list');
const status = document.querySelector('#status');
const download = document.querySelector('#download');
let busy = false;

function action(text, label, key, index, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset[key] = String(index);
  button.textContent = text;
  button.disabled = busy || disabled;
  if (label) button.setAttribute('aria-label', label);
  return button;
}

function render() {
  addButton.disabled = input.disabled = example.disabled = busy;
  download.disabled = busy || !files.length;
  list.replaceChildren(...files.map((file, index) => {
    const row = document.createElement('li');
    const details = document.createElement('span');
    const name = document.createElement('strong');
    const size = document.createElement('small');
    name.textContent = `${index + 1}. ${file.name}`;
    size.textContent = `${(file.size / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MiB`;
    details.append(name, document.createElement('br'), size);
    const controls = document.createElement('span');
    controls.className = 'move';
    controls.append(
      action('↑', `Mover ${file.name} para cima`, 'up', index, index === 0),
      action('↓', `Mover ${file.name} para baixo`, 'down', index, index === files.length - 1),
      action('Excluir', `Excluir ${file.name}`, 'remove', index),
    );
    row.append(details, controls);
    return row;
  }));
}

async function add(next) {
  const combined = [...files, ...next];
  const total = combined.reduce((sum, file) => sum + file.size, 0);
  if (!next.length) return;
  if (combined.length > MAX_FILES || total > MAX_BYTES) {
    throw new Error('Use até 20 PDFs, com um total de até 80 MiB.');
  }
  const headers = await Promise.all(next.map(file => file.slice(0, 5).text()));
  if (headers.some(header => header !== '%PDF-')) throw new Error('Escolha documentos em formato PDF.');
  files.push(...next);
  status.textContent = files.length === 1 ? '1 arquivo pronto para organizar.' : `${files.length} arquivos prontos para ordenar.`;
}

async function working(task) {
  if (busy) return;
  busy = true;
  render();
  try {
    await task();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Não foi possível processar os documentos.';
  } finally {
    busy = false;
    render();
  }
}

addButton.addEventListener('click', () => input.click());
input.addEventListener('change', () => {
  const selected = [...input.files];
  input.value = '';
  working(() => add(selected));
});

example.addEventListener('click', () => working(async () => {
  const samples = await Promise.all([
    ['exemplo-prancha-a.pdf', 'Prancha A — estrutura.pdf'],
    ['exemplo-anexo-b.pdf', 'Anexo B — memorial.pdf'],
  ].map(async ([url, name]) => {
    const response = await fetch(`./${url}`);
    if (!response.ok) throw new Error('Não foi possível abrir os exemplos locais.');
    const sample = new File([await response.blob()], name, { type: 'application/pdf' });
    sampleFiles.add(sample);
    return sample;
  }));
  await add(samples);
}));

list.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (busy || !button || button.disabled) return;
  const { up, down, remove } = button.dataset;
  const index = Number(up ?? down ?? remove);
  let focus;
  if (remove !== undefined) {
    const [removed] = files.splice(index, 1);
    status.textContent = `${removed.name} removido da lista.`;
    focus = `[data-remove="${Math.min(index, files.length - 1)}"]`;
  } else {
    const next = up !== undefined ? index - 1 : index + 1;
    [files[index], files[next]] = [files[next], files[index]];
    status.textContent = `${files[next].name} movido para a posição ${next + 1}.`;
    focus = `[data-${up !== undefined ? 'up' : 'down'}="${next}"]:not(:disabled)`;
  }
  render();
  (list.querySelector(focus) || list.querySelector('button:not(:disabled)') || addButton).focus();
});

download.addEventListener('click', () => working(async () => {
  if (!files.length) return;
  const inputType = files.every(file => sampleFiles.has(file)) ? 'example' : 'file';
  const attempt = metrics.start('pdf', inputType, files.reduce((size, file) => size + file.size, 0));
  status.textContent = 'Reunindo as páginas no navegador.';
  let bytes;
  try {
    const { mergePdfFiles } = await import('./vendor/pdf-lib/engine.js');
    bytes = await mergePdfFiles([...files]);
  } catch {
    attempt.finish('failed');
    throw new Error('Não foi possível reunir os documentos. Confira se os PDFs estão íntegros e sem senha.');
  }
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  link.href = url;
  link.download = 'pranchas-organizadas-confenge.pdf';
  link.click();
  attempt.finish('ready');
  attempt.finish('exported');
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = 'PDF organizado e baixado. Abra o resultado para conferir a sequência.';
}));
render();
