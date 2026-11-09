import './roteiros.js';
import { installFileLauncher } from './file-launch.js';
import { runtimeURL } from './runtime.js';
import { exportToolResult } from '/assets/js/tool-credits.mjs';

const catalog = document.getElementById('suite-catalog');
const workspace = document.getElementById('suite-workspace');
const mount = document.getElementById('suite-frame');
const title = document.getElementById('suite-active');
const status = workspace.querySelector('[role="status"]');
const names = new Map(Array.from(catalog.querySelectorAll('[data-app]'), link => [
  link.dataset.app, link.querySelector('.suite-card-bottom span').textContent
]));
const expand = workspace.querySelector('[data-expand]');
let active = '', frame, timer;

const exportFormats = Object.freeze({
  cadcraft: ['bcfzip', 'craft', 'csv', 'dxf', 'gcode', 'geojson', 'html', 'json', 'jsonl', 'mp4', 'pdf', 'png', 'svg', 'swb', 'usda', 'webm', 'zip'],
  bimcraft: ['bcfzip', 'craft', 'csv', 'dxf', 'gcode', 'gltf', 'glb', 'html', 'ifc', 'json', 'jsonl', 'mp4', 'nc', 'pcf', 'pdf', 'png', 'svg', 'txt', 'usda', 'usdc', 'usdz', 'wav', 'webm', 'xlsx', 'xml', 'zip'],
  modelcraft: ['3mf', 'csv', 'dae', 'dwg', 'dxf', 'glb', 'html', 'ifc', 'json', 'jsonl', 'mp4', 'mtlx', 'obj', 'pdf', 'ply', 'png', 'stl', 'svg', 'usda', 'usdc', 'usdz', 'webm', 'zip'],
  markupcraft: ['bcfzip', 'csv', 'json', 'jsonl', 'pdf', 'png', 'xlsx'],
  takeoffcraft: ['csv', 'glb', 'json', 'jsonl', 'pdf', 'png', 'usdz', 'xlsx'],
  civilcraft: ['csv', 'dwg', 'dxf', 'geojson', 'html', 'ifc', 'json', 'jsonl', 'kml', 'landxml', 'pdf', 'png', 'tif', 'tiff', 'xml', 'zip'],
  detailcraft: ['craft', 'csv', 'dwg', 'dxf', 'html', 'ifc', 'json', 'jsonl', 'kss', 'nc1', 'pdf', 'stl', 'txt', 'usda', 'usdc', 'usdz', 'zip'],
  partcraft: ['3mf', 'csv', 'dxf', 'gcode', 'html', 'json', 'jsonl', 'md', 'nc', 'pcscript', 'pdf', 'stl', 'svg', 'vdb', 'vti', 'vtu', 'zip'],
});
const extension = name => /\.([a-z0-9]{1,12})$/i.exec(name)?.[1].toLowerCase() || '';
const downloadBlob = (content, name) => {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

window.addEventListener('message', async event => {
  const input = event.data;
  if (event.origin !== location.origin || event.source !== frame?.contentWindow ||
      input?.type !== 'confenge-suite-export' || input.version !== 1 || !['backup', 'export'].includes(input.kind) ||
      !/^[0-9a-f-]{36}$/i.test(input.requestId || '') || typeof input.name !== 'string' || input.name.length > 200 ||
      !(input.content instanceof Blob) || input.content.size !== input.size || !Number.isSafeInteger(input.size) || input.size < 1) return;
  const app = active, source = event.source, origin = event.origin;
  const reply = status => {
    if (active === app && frame?.contentWindow === source) source.postMessage({ type: 'confenge-suite-export-result', requestId: input.requestId, status }, origin);
  };
  const format = extension(input.name), allowed = exportFormats[app] || [];
  if (input.kind === 'backup') {
    downloadBlob(input.content, input.name);
    reply('approved');
    return;
  }
  if (!allowed.includes(format)) {
    reply('unavailable');
    return;
  }
  try {
    const ok = await exportToolResult({
      toolId: 'cad-suite-' + app, format, content: input.content,
      deliver: () => { downloadBlob(input.content, input.name); reply('approved'); },
    });
    if (!ok) reply('denied');
  } catch {
    reply('unavailable');
  }
});

function choose(slug, changeHistory = true, fileId = '') {
  if ((!fileId && slug === active) || (slug && !names.has(slug))) return false;
  if (active && !window.confirm('Sair do aplicativo atual? Baixe o trabalho que deseja guardar antes de sair.')) {
    if (!changeHistory) history.replaceState(null, '', '#' + active);
    return;
  }
  if (changeHistory) {
    const url = new URL(location.href);
    url.hash = slug;
    history.pushState(null, '', url);
  }
  clearTimeout(timer);
  const previous = active;
  active = slug;
  frame?.remove();
  frame = null;
  workspace.hidden = !slug;
  catalog.hidden = Boolean(slug);
  if (!slug) {
    if (document.fullscreenElement === workspace) document.exitFullscreen().catch(() => {});
    (catalog.querySelector('[data-app="' + previous + '"]') || catalog.querySelector('h2')).focus();
    return;
  }

  const name = names.get(slug);
  title.textContent = name;
  workspace.querySelector('[data-dwg-note]').hidden = slug !== 'cadcraft';
  status.textContent = 'Abrindo ' + name + '…';
  const next = document.createElement('iframe');
  next.title = name + ' · área de trabalho';
  next.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-modals allow-popups allow-forms allow-pointer-lock');
  // The workspace owns fullscreen so its logo and return control stay accessible.
  next.allow = "fullscreen 'none'; microphone " + (slug === 'markupcraft' ? "'self'" : "'none'");
  next.referrerPolicy = 'no-referrer';
  const failed = () => {
    if (frame !== next) return;
    clearTimeout(timer);
    status.textContent = 'O aplicativo não concluiu a abertura. Volte a “Escolher outro” e tente novamente.';
  };
  next.addEventListener('error', failed);
  next.addEventListener('load', () => {
    if (frame !== next) return;
    // A same-origin 404 or a generic error page also fires the load event.
    try {
      if (!next.contentDocument?.querySelector('body.app-shell #main')) return failed();
    } catch { return failed(); }
    clearTimeout(timer);
    status.textContent = '';
    if (slug === 'cadcraft') {
      next.contentDocument.addEventListener('toggle', event => {
        if (event.target.matches('dialog[open]') && event.target.querySelector('[data-dwg-version]')) {
          next.scrollIntoView({block:'nearest', behavior:'instant'});
        }
      }, true);
    }
  });
  frame = next;
  timer = setTimeout(failed, 45000);
  const url = new URL(runtimeURL(slug), location.origin);
  if (fileId) url.searchParams.set('handoff', fileId);
  next.src = url.href;
  mount.replaceChildren(next);
  workspace.scrollIntoView({block:'start'});
  status.focus({preventScroll:true});
  return true;
}
installFileLauncher(choose, names);
for (const link of catalog.querySelectorAll('[data-app]')) {
  link.addEventListener('click', event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    choose(link.dataset.app);
  });
}
workspace.querySelector('[data-catalog]').addEventListener('click', () => choose(''));
if (!document.fullscreenEnabled || !workspace.requestFullscreen) expand.hidden = true;
expand.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement === workspace) await document.exitFullscreen();
    else await workspace.requestFullscreen();
  } catch { status.textContent = 'Seu navegador não conseguiu ampliar a área de trabalho.'; }
});
document.addEventListener('fullscreenchange', () => {
  expand.textContent = document.fullscreenElement === workspace ? 'Reduzir área' : 'Ampliar área';
});
const syncLocation = () => {
  const slug = location.hash.slice(1);
  const transfer = /^cadcraft\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(slug);
  if (transfer) {
    history.replaceState(null, '', '#cadcraft');
    choose('cadcraft', false, transfer[1]);
  } else if (!slug || names.has(slug)) choose(slug, false);
};
window.addEventListener('hashchange', syncLocation);
syncLocation();
