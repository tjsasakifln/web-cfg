import { createToolMetrics } from '/assets/js/aec-tool-metrics.mjs';

const MAX_SCENES = 12, MAX_SCENE_BYTES = 12 * 1024 * 1024, MAX_TOUR_BYTES = 48 * 1024 * 1024, MAX_IMPORT_CHARS = Math.ceil(MAX_TOUR_BYTES * 1.4);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/webp']);
const metric = createToolMetrics('criador-tour-360');
const list = document.querySelector('[data-scenes]'), nav = document.querySelector('[data-scene-nav]'), root = document.querySelector('[data-viewer]');
const status = document.querySelector('.tour-status'), exportButton = document.querySelector('[data-export]'), clearButton = document.querySelector('[data-clear]');
const controls = document.querySelectorAll('[data-add-scenes], [data-import], [data-export], [data-clear], #exemplo-tour');
const scenes = []; let selected = -1, viewer, busy = false;

function say(message, error = false) { status.textContent = message; status.dataset.error = String(error); }
function safeName(value, fallback) { return String(value || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 100) || fallback; }
function active() { return scenes[selected]; }
function setBusy(value) { busy = value; controls.forEach(control => { control.disabled = value || (control.matches('[data-export]') && !scenes.length); }); }
function release(scene) { URL.revokeObjectURL(scene.url); }

async function validImage(file) {
  if (!IMAGE_TYPES.has(file.type) || !file.size || file.size > MAX_SCENE_BYTES) throw new Error('Escolha panoramas JPEG ou WebP de até 12 MiB.');
  const bitmap = await createImageBitmap(file), ratio = bitmap.width / bitmap.height;
  const valid = bitmap.width >= 1000 && bitmap.height >= 500 && ratio >= 1.75 && ratio <= 2.25;
  bitmap.close();
  if (!valid) throw new Error('Use uma imagem equiretangular próxima de 2:1 e com pelo menos 1000 × 500 px.');
}

function showViewer() {
  viewer?.destroy(); viewer = undefined; root.dataset.ready = 'false';
  const scene = active(); if (!scene) return;
  try {
    viewer = window.pannellum.viewer(root, { type: 'equirectangular', panorama: scene.url, autoLoad: true, showControls: true, keyboardZoom: true, mouseZoom: true, hfov: 100, minHfov: 50, maxHfov: 120, strings: { loadButtonLabel: 'Abrir panorama', loadingLabel: 'Carregando panorama', bylineLabel: '' } });
    viewer.on('load', () => { root.dataset.ready = 'true'; scene.attempt?.finish('ready'); });
    viewer.on('error', () => { scene.attempt?.finish('failed'); say('O visor não conseguiu abrir esta cena. Confira a imagem equiretangular.', true); });
  } catch { scene.attempt?.finish('failed'); say('Não foi possível iniciar o visor 360 desta cena.', true); }
}

function showNav() {
  nav.replaceChildren();
  scenes.forEach((scene, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = scene.name; button.setAttribute('aria-current', String(index === selected));
    button.addEventListener('click', () => { selected = index; render(); }); nav.append(button);
  });
}

function render() {
  list.replaceChildren();
  scenes.forEach((scene, index) => {
    const row = document.createElement('li'); row.className = 'tour-scene';
    const image = document.createElement('img'); image.src = scene.url; image.alt = '';
    const label = document.createElement('label'); label.textContent = `Nome da cena ${index + 1}`;
    const input = document.createElement('input'); input.value = scene.name; input.maxLength = 100;
    input.addEventListener('input', () => { scene.name = safeName(input.value, `Cena ${index + 1}`); showNav(); });
    label.append(input);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remover';
    remove.addEventListener('click', () => { release(scene); scenes.splice(index, 1); selected = Math.min(selected, scenes.length - 1); render(); });
    row.append(image, label, remove); list.append(row);
  });
  showNav(); showViewer(); exportButton.disabled = !scenes.length || busy; clearButton.hidden = !scenes.length;
}

async function makeScene(file, name, attempt) {
  await validImage(file);
  return { name: safeName(name, `Cena ${scenes.length + 1}`), url: URL.createObjectURL(file), file, attempt };
}

async function append(files, source) {
  if (busy || !files.length) return;
  const selectedFiles = files.slice(0, MAX_SCENES - scenes.length);
  if (!selectedFiles.length) return say(`O tour aceita até ${MAX_SCENES} cenas.`, true);
  const currentBytes = scenes.reduce((sum, scene) => sum + scene.file.size, 0);
  const nextBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  if (currentBytes + nextBytes > MAX_TOUR_BYTES) {
    return say('As cenas excedem o limite total de 48 MiB para um arquivo de tour local.', true);
  }
  const attempt = metric.start('panorama', source, nextBytes);
  setBusy(true);
  try {
    const next = await Promise.all(selectedFiles.map(file => makeScene(file, file.name.replace(/\.[^.]+$/, ''), attempt)));
    scenes.push(...next); selected = selected < 0 ? 0 : selected; render(); say(`${next.length} panorama(s) incluído(s). Escolha uma cena para navegar em 360°.`);
  } catch (error) { attempt.finish('failed'); say(error.message || 'Não foi possível preparar as imagens.', true); }
  finally { setBusy(false); render(); }
}

function dataUrlBlob(raw) {
  const match = /^data:(image\/(?:jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if (!match) throw new Error('Uma cena não contém JPEG ou WebP codificado corretamente.');
  const bytes = Math.floor(match[2].length * 3 / 4);
  if (!bytes || bytes > MAX_SCENE_BYTES) throw new Error('Uma cena excede o limite de 12 MiB.');
  const binary = atob(match[2]), output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return new Blob([output], { type: match[1] });
}

async function parseTour(file) {
  if (!file.size || file.size > MAX_IMPORT_CHARS) throw new Error('O arquivo de tour é grande demais para abrir neste navegador.');
  const text = await file.text(); if (text.length > MAX_IMPORT_CHARS) throw new Error('O arquivo de tour é grande demais para abrir neste navegador.');
  const payload = JSON.parse(text);
  if (payload?.schema !== 'confenge-local-tour/v1' || !Array.isArray(payload.scenes) || !payload.scenes.length || payload.scenes.length > MAX_SCENES) throw new Error('Arquivo de tour inválido.');
  let total = 0;
  const decoded = payload.scenes.map((item, index) => { const blob = dataUrlBlob(item?.image); total += blob.size; return { item, blob, index }; });
  if (total > MAX_TOUR_BYTES) throw new Error('As cenas excedem o limite total de 48 MiB.');
  return Promise.all(decoded.map(async ({ item, blob, index }) => {
    const fileName = safeName(item?.name, `Cena ${index + 1}`) + (blob.type === 'image/webp' ? '.webp' : '.jpg');
    const image = new File([blob], fileName, { type: blob.type }); await validImage(image);
    return { name: safeName(item?.name, `Cena ${index + 1}`), url: URL.createObjectURL(image), file: image };
  }));
}

function replace(next) { scenes.splice(0).forEach(release); scenes.push(...next); selected = 0; render(); }
function asDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível preparar o arquivo local.')); reader.readAsDataURL(file); }); }

document.querySelector('[data-add-scenes]').addEventListener('change', event => { void append([...event.target.files], 'file'); event.target.value = ''; });
document.querySelector('[data-clear]').addEventListener('click', () => { if (busy) return; scenes.splice(0).forEach(release); selected = -1; render(); say('O tour foi limpo deste navegador.'); });
document.querySelector('[data-export]').addEventListener('click', async () => {
  if (busy || !scenes.length) return; setBusy(true);
  try {
    const totalBytes = scenes.reduce((sum, scene) => sum + scene.file.size, 0);
    if (totalBytes > MAX_TOUR_BYTES) throw new Error('As cenas excedem o limite total de 48 MiB para exportação.');
    const payload = { schema: 'confenge-local-tour/v1', createdAt: new Date().toISOString(), scenes: await Promise.all(scenes.map(async scene => ({ name: scene.name, image: await asDataUrl(scene.file) }))) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = 'tour-local-confenge.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); say('Arquivo local do tour baixado. Abra-o nesta ferramenta para continuar editando.');
  } catch (error) { say(error.message || 'Não foi possível preparar o arquivo do tour.', true); }
  finally { setBusy(false); }
});
document.querySelector('[data-import]').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file || busy) return;
  const attempt = metric.start('panorama', 'import', file.size); setBusy(true);
  try { const next = await parseTour(file); next[0].attempt = attempt; replace(next); say(`${next.length} cena(s) reaberta(s) localmente.`); }
  catch (error) { attempt.finish('failed'); say(error.message || 'Não foi possível abrir este arquivo de tour.', true); }
  finally { setBusy(false); render(); }
});

async function demoFile(name, primary, accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><defs><linearGradient id="g"><stop stop-color="${primary}"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="${primary}"/></linearGradient></defs><rect width="1600" height="800" fill="url(#g)"/><path d="M0 590 Q400 420 800 590T1600 590V800H0Z" fill="#102f38" opacity=".55"/><path d="M150 150h260v300H150m650-280h340v270H800" fill="none" stroke="#fff" stroke-width="28" opacity=".72"/><text x="800" y="730" fill="#fff" font-family="Arial" font-size="56" text-anchor="middle">${name} · panorama demonstrativo</text></svg>`;
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const blob = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível preparar o exemplo.')), 'image/jpeg', .9);
      };
      image.onerror = () => reject(new Error('Não foi possível preparar o exemplo.'));
      image.src = svgUrl;
    });
    return new File([blob], name.toLowerCase().replaceAll(' ', '-') + '.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(svgUrl); }
}

document.querySelector('#exemplo-tour').addEventListener('click', async () => {
  if (busy) return; const attempt = metric.start('panorama', 'example'); setBusy(true);
  try {
    const colors = [['Entrada', '#1d5d73', '#dcefcf'], ['Sala de estar', '#77505d', '#fae5b8'], ['Varanda', '#38654b', '#cde9f5']];
    const files = await Promise.all(colors.map(([name, primary, accent]) => demoFile(name, primary, accent)));
    const next = await Promise.all(files.map((file, index) => makeScene(file, colors[index][0], attempt)));
    replace(next); say('Tour demonstrativo carregado com três cenas. Escolha uma cena para navegar em 360°.');
  } catch (error) { attempt.finish('failed'); say(error.message || 'Não foi possível carregar o exemplo.', true); }
  finally { setBusy(false); render(); }
});
render();
