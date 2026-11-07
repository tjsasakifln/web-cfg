import './roteiros.js';
import { installFileLauncher } from './file-launch.js';
import { runtimeURL } from './runtime.js';

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
  next.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-downloads allow-modals allow-popups allow-forms allow-pointer-lock');
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
  if (!slug || names.has(slug)) choose(slug, false);
};
window.addEventListener('hashchange', syncLocation);
syncLocation();
