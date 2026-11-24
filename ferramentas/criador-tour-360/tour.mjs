import { createToolMetrics } from '/assets/js/aec-tool-metrics.mjs';

const MAX_SCENES = 12, MAX_SCENE_BYTES = 12 * 1024 * 1024, MAX_TOUR_BYTES = 48 * 1024 * 1024, MAX_IMPORT_CHARS = Math.ceil(MAX_TOUR_BYTES * 1.4);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/webp']);
const metric = createToolMetrics('criador-tour-360');
const list = document.querySelector('[data-scenes]'), nav = document.querySelector('[data-scene-nav]'), root = document.querySelector('[data-viewer]');
const status = document.querySelector('.tour-status'), exportButton = document.querySelector('[data-export]'), clearButton = document.querySelector('[data-clear]');
const hotspotPanel = document.querySelector('[data-hotspot-panel]');
const hotspotTarget = document.querySelector('[data-hotspot-target]');
const hotspotAdd = document.querySelector('[data-hotspot-add]');
const hotspotList = document.querySelector('[data-hotspot-list]');
const controls = document.querySelectorAll('[data-picker], [data-add-scenes], [data-import], [data-export], [data-clear], #exemplo-tour');
const scenes = []; let selected = -1, viewer, busy = false;

function say(message, error = false) { status.textContent = message; status.dataset.error = String(error); }
function safeName(value, fallback) { return String(value || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 100) || fallback; }
function active() { return scenes[selected]; }
function setBusy(value) { busy = value; controls.forEach(control => { control.disabled = value || (control.matches('[data-export]') && !scenes.length); }); showHotspots(); }
function release(scene) { URL.revokeObjectURL(scene.url); }

async function validImage(file) {
  if (!IMAGE_TYPES.has(file.type) || !file.size || file.size > MAX_SCENE_BYTES) throw new Error('Escolha panoramas JPEG ou WebP de até 12 MiB.');
  const bitmap = await createImageBitmap(file), ratio = bitmap.width / bitmap.height;
  const valid = bitmap.width >= 1000 && bitmap.height >= 500 && ratio >= 1.75 && ratio <= 2.25;
  bitmap.close();
  if (!valid) throw new Error('Use uma imagem equiretangular próxima de 2:1 e com pelo menos 1000 × 500 px.');
}

function previewHotspot(link) {
  return {
    id: link.id, type: 'scene', sceneId: link.to, yaw: link.yaw, pitch: link.pitch,
    text: scenes.find(scene => scene.id === link.to)?.name || 'Próxima cena',
  };
}

function showHotspots() {
  const current = active();
  hotspotPanel.hidden = !current || scenes.length < 2;
  if (hotspotPanel.hidden) return;
  const target = hotspotTarget.value;
  hotspotTarget.replaceChildren(...scenes.filter(scene => scene !== current)
    .map(scene => new Option(scene.name, scene.id)));
  if ([...hotspotTarget.options].some(option => option.value === target)) hotspotTarget.value = target;
  hotspotAdd.disabled = busy || root.dataset.ready !== 'true';
  hotspotList.replaceChildren(...current.links.map(link => {
    const row = document.createElement('li');
    const target = scenes.find(scene => scene.id === link.to);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = `Remover ponto para ${target.name}`;
    remove.disabled = busy;
    remove.addEventListener('click', () => {
      current.links = current.links.filter(item => item !== link);
      viewer?.removeHotSpot(link.id, current.id);
      showHotspots();
      hotspotAdd.focus();
      say('Ponto de navegação removido.');
    });
    row.append(remove);
    return row;
  }));
}

function showViewer() {
  viewer?.destroy(); viewer = undefined; root.dataset.ready = 'false';
  const scene = active();
  if (!scene) {
    showHotspots();
    return;
  }
  try {
    viewer = window.pannellum.viewer(root, {
      escapeHTML: true,
      default: {
        firstScene: scene.id, type: 'equirectangular', autoLoad: true, keyboardZoom: true,
        hfov: 100, minHfov: 50, maxHfov: 120,
        strings: { loadButtonLabel: 'Abrir panorama', loadingLabel: 'Carregando panorama', bylineLabel: '' },
      },
      scenes: Object.fromEntries(scenes.map(item => [item.id, {
        panorama: item.url,
        hotSpots: item.links.map(previewHotspot),
      }])),
    });
    viewer.on('scenechange', id => {
      const index = scenes.findIndex(item => item.id === id);
      if (index < 0) return;
      selected = index;
      root.dataset.ready = 'false';
      showNav();
      showHotspots();
      say(`Abrindo a cena ${active().name}.`);
    });
    viewer.on('load', () => {
      root.dataset.ready = 'true';
      active()?.attempt?.finish('ready');
      showHotspots();
    });
    viewer.on('error', () => { active()?.attempt?.finish('failed'); say('O visor não conseguiu abrir esta cena. Confira a imagem equiretangular.', true); });
  } catch { scene.attempt?.finish('failed'); say('Não foi possível iniciar o visor 360 desta cena.', true); }
  showHotspots();
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
    input.addEventListener('input', () => { scene.name = safeName(input.value, `Cena ${index + 1}`); showNav(); showHotspots(); });
    input.addEventListener('change', () => showViewer());
    label.append(input);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remover';
    remove.addEventListener('click', () => {
      const current = active();
      release(scene);
      scenes.splice(index, 1);
      scenes.forEach(item => { item.links = item.links.filter(link => link.to !== scene.id); });
      selected = current === scene ? Math.min(index, scenes.length - 1) : scenes.indexOf(current);
      render();
    });
    row.append(image, label, remove); list.append(row);
  });
  showNav(); showViewer(); exportButton.disabled = !scenes.length || busy; clearButton.hidden = !scenes.length;
}

async function makeScene(file, name, attempt) {
  await validImage(file);
  return { id: crypto.randomUUID(), name: safeName(name, `Cena ${scenes.length + 1}`), url: URL.createObjectURL(file), file, attempt, links: [] };
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
  if (!['confenge-local-tour/v1', 'confenge-local-tour/v2'].includes(payload?.schema)
      || !Array.isArray(payload.scenes) || !payload.scenes.length || payload.scenes.length > MAX_SCENES) throw new Error('Arquivo de tour inválido.');
  let total = 0;
  const ids = payload.scenes.map(() => crypto.randomUUID());
  const decoded = payload.scenes.map((item, index) => { const blob = dataUrlBlob(item?.image); total += blob.size; return { item, blob, index }; });
  if (total > MAX_TOUR_BYTES) throw new Error('As cenas excedem o limite total de 48 MiB.');
  const prepared = await Promise.all(decoded.map(async ({ item, blob, index }) => {
    const fileName = safeName(item?.name, `Cena ${index + 1}`) + (blob.type === 'image/webp' ? '.webp' : '.jpg');
    const image = new File([blob], fileName, { type: blob.type }); await validImage(image);
    const points = payload.schema === 'confenge-local-tour/v2' ? item.links : [];
    if (!Array.isArray(points) || points.length >= ids.length) throw new Error('O arquivo tem pontos de navegação inválidos.');
    const targets = new Set();
    const links = points.map(point => {
      const { to, pitch, yaw } = point ?? {};
      if (!Number.isInteger(to) || !ids[to] || to === index || targets.has(to)
          || !Number.isFinite(pitch) || Math.abs(pitch) > 90 || !Number.isFinite(yaw) || Math.abs(yaw) > 180) {
        throw new Error('O arquivo tem pontos de navegação inválidos.');
      }
      targets.add(to);
      return { id: crypto.randomUUID(), to: ids[to], pitch, yaw };
    });
    return { id: ids[index], name: safeName(item?.name, `Cena ${index + 1}`), file: image, links };
  }));
  return prepared.map(scene => ({ ...scene, url: URL.createObjectURL(scene.file) }));
}

function replace(next) { scenes.splice(0).forEach(release); scenes.push(...next); selected = 0; render(); }
function asDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível preparar o arquivo local.')); reader.readAsDataURL(file); }); }

hotspotAdd.addEventListener('click', () => {
  const current = active();
  const destination = scenes.find(scene => scene.id === hotspotTarget.value);
  if (busy || !viewer || !current || !destination || current === destination || root.dataset.ready !== 'true') return;
  const pitch = Math.round(viewer.getPitch() * 10) / 10;
  const yaw = Math.round((((viewer.getYaw() + 180) % 360 + 360) % 360 - 180) * 10) / 10;
  const existing = current.links.find(link => link.to === destination.id);
  if (existing) viewer.removeHotSpot(existing.id, current.id);
  const link = { id: crypto.randomUUID(), to: destination.id, pitch, yaw };
  viewer.addHotSpot(previewHotspot(link), current.id);
  current.links = [...current.links.filter(point => point !== existing), link];
  showHotspots();
  say(`Ponto para ${destination.name} salvo na direção atual.`);
});

document.querySelector('[data-add-scenes]').addEventListener('change', event => { void append([...event.target.files], 'file'); event.target.value = ''; });
document.querySelector('[data-clear]').addEventListener('click', () => { if (busy) return; scenes.splice(0).forEach(release); selected = -1; render(); say('O tour foi limpo deste navegador.'); });
document.querySelector('[data-export]').addEventListener('click', async () => {
  if (busy || !scenes.length) return; setBusy(true);
  try {
    const totalBytes = scenes.reduce((sum, scene) => sum + scene.file.size, 0);
    if (totalBytes > MAX_TOUR_BYTES) throw new Error('As cenas excedem o limite total de 48 MiB para exportação.');
    const byId = new Map(scenes.map((scene, index) => [scene.id, index]));
    const payload = {
      schema: 'confenge-local-tour/v2',
      scenes: await Promise.all(scenes.map(async scene => ({
        name: scene.name, image: await asDataUrl(scene.file),
        links: scene.links.map(({ to, pitch, yaw }) => ({ to: byId.get(to), pitch, yaw })),
      }))),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = 'tour-local-confenge.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); say('Arquivo local do tour baixado. Abra-o nesta ferramenta para continuar editando.');
  } catch (error) { say(error.message || 'Não foi possível preparar o arquivo do tour.', true); }
  finally { setBusy(false); }
});
document.querySelector('[data-picker="panorama"]').addEventListener('click', () => document.querySelector('[data-add-scenes]').click());
document.querySelector('[data-picker="tour"]').addEventListener('click', () => document.querySelector('[data-import]').click());
document.querySelector('[data-import]').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file || busy) return;
  const attempt = metric.start('panorama', 'import', file.size); setBusy(true);
  try { const next = await parseTour(file); next[0].attempt = attempt; replace(next); say(`${next.length} cena(s) reaberta(s) localmente.`); }
  catch (error) { attempt.finish('failed'); say(error.message || 'Não foi possível abrir este arquivo de tour.', true); }
  finally { setBusy(false); render(); }
});

async function demoFile(name, primary, accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><defs><linearGradient id="g"><stop stop-color="${primary}"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="${primary}"/></linearGradient></defs><rect width="1600" height="800" fill="url(#g)"/><path d="M0 590 Q400 420 800 590T1600 590V800H0Z" fill="#102f38" opacity=".55"/><path d="M180 205h260v300H180m460-320h320v350H640m570-330h210v300h-210" fill="none" stroke="#fff" stroke-width="28" opacity=".72"/><text x="800" y="730" fill="#fff" font-family="Arial" font-size="56" text-anchor="middle">${name} · panorama demonstrativo</text></svg>`;
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
    next.forEach((scene, index) => scene.links.push({
      id: crypto.randomUUID(), to: next[(index + 1) % next.length].id, pitch: -8, yaw: 12,
    }));
    replace(next); say('Tour demonstrativo carregado com três cenas e pontos de navegação.');
  } catch (error) { attempt.finish('failed'); say(error.message || 'Não foi possível carregar o exemplo.', true); }
  finally { setBusy(false); render(); }
});
render();
