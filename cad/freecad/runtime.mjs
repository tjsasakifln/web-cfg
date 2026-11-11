// SPDX-License-Identifier: GPL-3.0-or-later
import { capabilities } from './capabilities.mjs';
import { fetchRuntimeBytes, installNetworkBoundary } from './network.mjs';
import { createSaveWatcher, fileName, isBackup, prepareDownload, validateInput } from './files.mjs';

const $ = id => document.getElementById(id);
const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
const fail = error => status(error?.message || String(error), true);
const encoder = new TextEncoder();
let started = false, ready = false, module, readyAt = 0, watcher;
let operations = Promise.resolve();
const pending = new Map();
const log = [];

installNetworkBoundary();
window.FC_JSPI = true;
window.__fcAppReady = false;
window.__fcWorkReady = false;
window.__fcPyBusy = false;
window.append = (value, kind) => {
  const text = String(value);
  const rect = text.indexOf('FCRECT ');
  if (rect >= 0) { try { window.__fcWidgetRect = JSON.parse(text.slice(rect + 7)); } catch {} return; }
  if (text.includes('FCACTIVE-')) {
    window.__fcActive3D = text.includes('FCACTIVE-3D');
    if (!window.__fcActive3D) { window.__fcVisibleFbo = null; window.__fcWidgetRect = null; }
    return;
  }
  if (text.includes('FCWORKREADY')) window.__fcWorkReady = true;
  if (/IDBFS persist failed|QuotaExceeded|Autosave is FAILING/i.test(text)) {
    status('O navegador não conseguiu guardar a cópia automática. Use “Salvar cópia FCStd grátis” para manter seu trabalho.', true);
  }
  if (/out of memory|Cannot enlarge memory|Aborted\(OOM\)/i.test(text)) {
    status('A memória disponível não foi suficiente. Tente recuperar uma cópia FCStd em “Arquivos e exportações”.', true);
  }
  log.push(text.slice(0, 1800));
  if (log.length > 150) log.splice(0, log.length - 150);
  if (kind === 'err' && /fatal|abort|RuntimeError/i.test(text)) fail('O motor encontrou uma falha. Confira o registro em “Como usar” e recupere uma cópia FCStd, se disponível.');
};
setInterval(() => { if (!$('help').hidden) $('log').textContent = log.join('\n'); }, 1000);
window.fcwebNotify = text => {
  // Upstream warning strings must not claim an autosave finished without evidence.
  if (/memory|saved|autosave/i.test(String(text))) {
    status('Confira a memória e o armazenamento disponíveis. Salve uma cópia FCStd no seu aparelho para preservar seu trabalho.', true);
  } else status(String(text));
};
window.fcwebEvent = () => {}; // No upstream analytics.
window.fcwebCallPy = (instance, pointer) => instance._fcweb_run_python(BigInt(pointer));
window.fcRunPy = (instance, pointer) => {
  if (window.__fcPyBusy) { instance._free(pointer); return Promise.resolve(false); }
  window.__fcPyBusy = true;
  let result;
  try { result = window.fcwebCallPy(instance, pointer); } catch (error) { result = Promise.reject(error); }
  return Promise.resolve(result).then(() => true, error => { window.append(error?.stack || error, 'err'); fail('A operação 3D foi interrompida. Seu arquivo pode ser recuperado em “Arquivos e exportações”.'); return false; })
    .finally(() => { instance._free(pointer); window.__fcPyBusy = false; });
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rawPython(source) {
  while (window.__fcPyBusy) await sleep(100);
  if (!module?._fcweb_run_python || !window.__fcAppReady) throw new Error('O ambiente ainda está iniciando.');
  const length = encoder.encode(source).length + 1;
  const pointer = module._malloc(length);
  if (!pointer) throw new Error('Não há memória suficiente para iniciar esta operação.');
  module.stringToUTF8(source, pointer, length);
  if (!await window.fcRunPy(module, pointer)) throw new Error('A operação não pôde ser concluída.');
}

function operation(source) {
  const next = operations.catch(() => {}).then(async () => {
    const receipt = `/tmp/confenge-operation-${crypto.randomUUID()}.json`;
    const code = `import json as _cfg_json\n_cfg_result = None\ntry:\n${source.split('\n').map(line => ' ' + line).join('\n')}\n _cfg_out = {'ok': True, 'result': _cfg_result}\nexcept Exception as _cfg_error:\n _cfg_out = {'ok': False, 'error': str(_cfg_error)}\nwith open(${JSON.stringify(receipt)}, 'w') as _cfg_file:\n _cfg_json.dump(_cfg_out, _cfg_file)\n`;
    await rawPython(code);
    let result;
    try { result = JSON.parse(module.FS.readFile(receipt, { encoding: 'utf8' })); }
    catch { throw new Error('O motor não confirmou a conclusão da operação.'); }
    finally { try { module.FS.unlink(receipt); } catch {} }
    if (!result.ok) throw new Error(result.error || 'A operação não foi concluída.');
    return result.result;
  });
  operations = next;
  return next;
}

function download(content, name) {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function authorize(options) {
  const { exportToolResult } = await import('/assets/js/tool-credits.mjs');
  return exportToolResult(options);
}

function showDrawer(id, show = true) {
  $(id).hidden = !show;
  $(`${id}-toggle`).setAttribute('aria-expanded', String(show));
  window.dispatchEvent(new Event('resize'));
}
for (const id of ['files', 'help']) $(`${id}-toggle`).addEventListener('click', () => showDrawer(id, $(id).hidden));

function receiveFile({ name, bytes, path }) {
  let item;
  try { item = prepareDownload({ name, bytes, authorize, deliver: async (content, name) => { download(content, name); } }); }
  catch (error) { fail(error); showDrawer('files'); return; }
  const row = document.createElement('li');
  const text = document.createElement('span');
  text.textContent = `${item.name} · ${(item.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KiB. `;
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = item.backup ? 'Baixar cópia gratuita' : 'Autorizar e baixar';
  row.append(text, button); $('downloads').prepend(row);
  pending.set(row, item);
  const attempt = async () => {
    button.disabled = true;
    try {
      if (await item.run()) {
        text.textContent = `${item.name}: download enviado ao navegador. `;
        button.textContent = 'Baixar novamente';
        button.onclick = () => download(new Blob([bytes]), item.name);
        pending.delete(row);
        // FCStd stays available for recovery and native Save. Technical staging can be released.
        if (!item.backup && path) try { module.FS.unlink(path); } catch {}
        status(item.backup ? 'Cópia FCStd enviada ao navegador. Confira o arquivo na pasta de downloads.' : 'Exportação autorizada e enviada ao navegador.');
      } else {
        button.textContent = 'Retomar autorização';
        status('O arquivo está pronto nesta aba. Retome a autorização em “Arquivos e exportações” para concluir.');
      }
    } catch (error) { fail(error); }
    finally { button.disabled = false; }
  };
  button.onclick = attempt;
  showDrawer('files');
  attempt();
}

function ensureReady() { if (!ready) throw new Error('Aguarde o ambiente terminar a inicialização.'); }
async function openFile() {
  try { ensureReady(); } catch (error) { fail(error); return; }
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.FCStd,.fcstd,.step,.stp,.iges,.igs,.stl,.3mf,.svg,.dxf';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      validateInput(file);
      status('Abrindo o modelo neste dispositivo…');
      const ext = file.name.split('.').pop().toLowerCase();
      const folder = `/home/web_user/uploads/${crypto.randomUUID()}`;
      const path = `${folder}/${fileName(file.name)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      module.FS.mkdirTree(folder); module.FS.writeFile(path, bytes);
      const hasGeometry = `def _cfg_import_has_geometry(document):\n return any((hasattr(obj, 'Shape') and not obj.Shape.isNull()) or (hasattr(obj, 'Mesh') and obj.Mesh.CountFacets > 0) for obj in document.Objects)`;
      const load = ext === 'fcstd' ? `d = App.openDocument(${JSON.stringify(path)})`
        : ['dxf', 'svg'].includes(ext) ? `d = App.newDocument('Importado')\nimport ${ext === 'dxf' ? 'importDXF' : 'importSVG'} as _importer\n_importer.insert(${JSON.stringify(path)}, d.Name)`
          : `d = App.newDocument('Importado')\nApp.loadFile(${JSON.stringify(path)}, d.Name)`;
      // ImportGui's XCAF reader can return without an exception or any shapes.
      // Preserve its color/assembly import first; the native Part reader is the
      // geometry fallback only for an otherwise empty IGES result.
      const fallback = ['iges', 'igs'].includes(ext)
        ? `\nif not _cfg_import_has_geometry(d):\n App.Console.PrintWarning('CONFENGE: retomando a importação IGES pelo leitor geométrico nativo.\\n')\n import Part as _cfg_iges\n _cfg_iges.insert(${JSON.stringify(path)}, d.Name)\n d.recompute()` : '';
      const verify = ext === 'fcstd' ? ''
        : `\nif not _cfg_import_has_geometry(d):\n raise ValueError('O arquivo não produziu geometria compatível. Confira o formato e tente novamente.')`;
      await operation(`import FreeCAD as App, FreeCADGui as Gui\n${hasGeometry}\n${load}\nd.recompute()${fallback}${verify}\nApp.setActiveDocument(d.Name)\nGui.activeDocument().activeView().viewIsometric()\nGui.activeDocument().activeView().fitAll()\nGui.updateGui()`);
      status('Modelo aberto. Salve uma cópia FCStd para preservar suas alterações.');
    } catch (error) { fail(error); }
  }, { once: true });
  input.click();
}
window.fcwebOpen = openFile;
$('open').addEventListener('click', openFile);
window.fcwebPickImage = () => status('Abertura de imagens não faz parte desta edição. Use os formatos de modelo indicados em “Abrir modelo”.');

async function saveBackup() {
  ensureReady();
  status('Preparando sua cópia editável FCStd…');
  const path = await operation(`import FreeCAD as App, os\nd = App.ActiveDocument\nif d is None:\n raise ValueError('Abra ou crie um documento antes de salvar.')\nos.makedirs('/home/web_user/_dl', exist_ok=True)\nname = ''.join(c for c in (d.Label or 'modelo') if c.isalnum() or c in '-_ ')[:100].strip() or 'modelo'\np = '/home/web_user/_dl/' + name + '.FCStd'\nd.recompute()\nd.saveCopy(p)\n_cfg_result = p`);
  receiveFile({ path, name: path.split('/').pop(), bytes: module.FS.readFile(path).slice() });
}
window.fcwebDownload = () => saveBackup().catch(fail);
$('backup').addEventListener('click', () => saveBackup().catch(fail));
$('sample').addEventListener('click', async () => {
  try {
    ensureReady(); $('sample').disabled = true;
    await operation("import FreeCAD as App, FreeCADGui as Gui\nd = App.newDocument('PecaExemplo')\nb = d.addObject('Part::Box', 'Bloco')\nb.Label = 'Bloco 100 x 60 x 30 mm'\nb.Length = 100\nb.Width = 60\nb.Height = 30\nd.recompute()\nGui.activeDocument().activeView().viewIsometric()\nGui.activeDocument().activeView().fitAll()\nGui.Selection.clearSelection()\nGui.Selection.addSelection(b)\nGui.updateGui()");
    status('Peça de exemplo criada: 100 × 60 × 30 mm. Selecione o bloco na árvore para alterar suas medidas.');
  } catch (error) { fail(error); } finally { $('sample').disabled = !ready; }
});

$('export').addEventListener('click', async () => {
  try {
    ensureReady(); $('export').disabled = true;
    const format = $('export-format').value;
    if (!['step', 'stl'].includes(format)) throw new Error('Escolha STEP ou STL.');
    const path = `/home/web_user/_dl/modelo-${crypto.randomUUID()}.${format}`;
    const exporter = format === 'step' ? 'Import' : 'Mesh';
    status('Preparando o arquivo técnico dos objetos selecionados…');
    await operation(`import FreeCAD as App, FreeCADGui as Gui, os\nimport ${exporter}\nobjects = Gui.Selection.getSelection()\nif not objects:\n raise ValueError('Selecione os objetos na árvore antes de exportar.')\nos.makedirs('/home/web_user/_dl', exist_ok=True)\n${exporter}.export(objects, ${JSON.stringify(path)})`);
    receiveFile({ path, name: `modelo.${format}`, bytes: module.FS.readFile(path).slice() });
  } catch (error) { fail(error); } finally { $('export').disabled = !ready; }
});

$('recover').addEventListener('click', () => {
  $('backups').replaceChildren();
  if (!module?.FS) { fail('O sistema de arquivos ainda não foi carregado nesta aba.'); return; }
  const files = [];
  function visit(path, depth = 0) {
    if (depth > 8 || files.length >= 100) return;
    let names;
    try { names = module.FS.readdir(path); } catch { return; }
    for (const name of names) {
      if (['.', '..'].includes(name)) continue;
      const file = `${path}/${name}`;
      try {
        const stat = module.FS.stat(file);
        if (module.FS.isDir(stat.mode)) visit(file, depth + 1);
        else if (isBackup(name) && stat.size > 0) files.push({ path: file, name });
      } catch { /* one unavailable file does not hide the rest */ }
    }
  }
  visit('/home/web_user');
  for (const file of files) {
    const row = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.textContent = `Baixar ${file.name}`;
    button.addEventListener('click', () => {
      try { download(new Blob([module.FS.readFile(file.path).slice()]), fileName(file.name)); }
      catch (error) { fail(error); }
    });
    row.append(button); $('backups').append(row);
  }
  if (!files.length) $('backups').textContent = 'Nenhuma cópia FCStd está disponível nesta aba.';
});

let questions = Promise.resolve();
function question({ title, text, labels, defaultValue }) {
  const next = questions.then(() => new Promise(resolve => {
    const dialog = $('question');
    $('question-title').textContent = String(title || 'CONFENGE');
    $('question-text').textContent = String(text || '');
    $('question-label').hidden = defaultValue === undefined;
    $('question-input').value = defaultValue ?? '';
    $('question-buttons').replaceChildren();
    let finished = false;
    const finish = value => { if (finished) return; finished = true; dialog.close(); resolve(value); };
    labels.forEach((label, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.onclick = () => finish(defaultValue === undefined ? index : index === 0 ? $('question-input').value : null);
      $('question-buttons').append(button);
    });
    dialog.oncancel = event => {
      event.preventDefault();
      // The Python shim maps rejection to Qt roles, never to the first label.
      finish(defaultValue === undefined ? -1 : null);
    };
    dialog.showModal();
    if (defaultValue !== undefined) $('question-input').focus();
  }));
  questions = next.catch(() => {});
  return next;
}
window.fcwebConfirm = (title, text, buttons) => question({ title, text, labels: String(buttons).split('|') });
window.fcwebPrompt = (title, text, value) => question({ title, text, defaultValue: String(value || ''), labels: ['Confirmar', 'Cancelar'] });

function loadScript(path, integrity) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = path;
    if (integrity) { script.integrity = integrity; script.crossOrigin = 'anonymous'; }
    script.onload = resolve; script.onerror = () => reject(new Error('Não foi possível carregar um componente do modelador. Reabra a ferramenta para tentar novamente.'));
    document.head.append(script);
  });
}
const integrity = hex => 'sha256-' + btoa(String.fromCharCode(...hex.match(/../g).map(byte => parseInt(byte, 16))));

async function textFile(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Não foi possível carregar a configuração do ambiente.');
  return response.text();
}

async function start() {
  if (started) return;
  $('start').disabled = true; $('capability').textContent = 'Conferindo o suporte 3D deste navegador…';
  const support = await capabilities();
  if (!support.ok) { $('capability').textContent = support.reason; $('start').disabled = false; return; }
  started = true; $('entry').hidden = true; $('workspace').hidden = false;
  try {
    const response = await fetch('/assets/freecad/runtime.json');
    if (!response.ok) throw new Error('O ambiente ainda não está disponível nesta publicação.');
    const manifest = await response.json();
    if (manifest.schema !== 'confenge.freecad-runtime/v1' || manifest.version !== '1.0.9' || manifest.decoded_bytes !== 503224999) throw new Error('Versão de ambiente incompatível. Reabra a ferramenta.');
    const files = manifest.files;
    const progress = {};
    $('phase').textContent = 'Preparando o ambiente de modelagem';
    status('Conferindo os componentes salvos e baixando o que faltar. Os modelos continuarão neste dispositivo.');
    const report = (key, bytes) => {
      progress[key] = bytes;
      const total = Object.values(progress).reduce((a, b) => a + b, 0);
      $('progress').value = total;
      $('progress-detail').textContent = `${(total / 1000000).toFixed(0)} de 503 MB preparados. Mantenha esta aba aberta.`;
    };
    const wasm = await fetchRuntimeBytes(files['FreeCAD.wasm'], value => report('wasm', value));
    const data = await fetchRuntimeBytes(files['FreeCAD.data'], value => report('data', value));
    const [sysconfig, bootstrap, dialogs] = await Promise.all([
      textFile('/assets/freecad/sysconfig.txt'), textFile('/cad/freecad/bootstrap.txt'), textFile('/cad/freecad/vendor/dialogs.txt'),
    ]);
    await loadScript('/cad/freecad/vendor/graphics.js');
    await loadScript('/cad/freecad/vendor/qtloader.js');
    await loadScript(files['FreeCAD.js'].path, integrity(files['FreeCAD.js'].sha256));
    report('js', files['FreeCAD.js'].size);
    $('phase').textContent = 'Iniciando o FreeCAD'; $('progress').removeAttribute('value');
    $('progress-detail').textContent = 'Preparando a geometria, a interface e os arquivos locais. Esta etapa pode levar alguns minutos.';
    const config = {
      wasmBinary: wasm,
      getPreloadedPackage: (_name, size) => { if (size !== data.byteLength) throw new Error('Pacote FreeCAD incompatível com o motor.'); return data; },
      locateFile: file => files[file]?.path || '/assets/freecad/' + file,
      print: text => window.append(text), printErr: text => window.append(text, 'err'),
      onAbort: reason => { fail(`O motor foi interrompido: ${String(reason).slice(0, 180)}. Recupere uma cópia FCStd se disponível.`); $('boot-progress').hidden = true; },
      preRun: [function () {
        const dir = '/usr/local/lib/python3.13/site-packages';
        config.FS.mkdirTree(dir);
        config.FS.writeFile(dir + '/_sysconfigdata__emscripten_wasm64-emscripten.py', encoder.encode(sysconfig));
      }],
      qt: {
        // This pinned Emscripten build ignores Module.wasmBinary when loading
        // the engine. Qt's explicit module path prevents a second, unverified
        // fetch while wasmBinary remains available to the FreeCAD PyEM bridge.
        module: WebAssembly.compile(wasm),
        entryFunction: window.FreeCAD_entry,
        containerElements: [$('screen')],
        onLoaded: () => { window.__fcAppReady = true; readyAt = performance.now(); },
        onExit: result => { ready = false; for (const id of ['open', 'sample', 'backup', 'export']) $(id).disabled = true; fail(result?.crashed ? 'O motor foi interrompido. Procure uma cópia FCStd em “Arquivos e exportações”.' : 'O ambiente de modelagem foi encerrado.'); },
      },
    };
    module = window.fcInstance = await window.qtLoad(config);
    if (!module?.FS) throw new Error('O motor não disponibilizou o sistema de arquivos.');
    watcher = createSaveWatcher({ fs: module.FS, busy: () => window.__fcPyBusy, onReady: receiveFile, onError: fail });
    window.fcwebRegisterSave = path => watcher.register(path);
    setInterval(() => watcher.tick(), 450);
    const deadline = performance.now() + 180000;
    while (!window.__fcWorkReady) {
      if (performance.now() > deadline) throw new Error('A interface não concluiu a inicialização. Você pode consultar o registro técnico e tentar outro navegador.');
      await sleep(600);
      if (window.__fcPyBusy || performance.now() - readyAt < 8000) continue;
      await rawPython("import FreeCADGui as _g, sys as _s\ntry:\n _wb = _g.activeWorkbench()\n if _wb is not None:\n  _s.__stderr__.write('FCWORKREADY\\n'); _s.__stderr__.flush()\nexcept Exception: pass\n");
    }
    await operation(dialogs + '\n' + bootstrap);
    // Do not let first user actions race the local recovery pass.
    $('phase').textContent = 'Conferindo as cópias locais';
    const restoreDeadline = performance.now() + 120000;
    while (!module.FS.analyzePath('/tmp/.confenge_restore_complete').exists) {
      if (performance.now() > restoreDeadline) throw new Error('A recuperação local não terminou. Procure uma cópia FCStd em “Arquivos e exportações” antes de reabrir o ambiente.');
      await sleep(250);
    }
    ready = true;
    for (const id of ['open', 'sample', 'backup', 'export']) $(id).disabled = false;
    $('boot-progress').hidden = true;
    window.dispatchEvent(new Event('resize'));
    status('Modelador pronto. Crie uma peça de exemplo ou abra seu arquivo. A cópia FCStd é gratuita.');
  } catch (error) {
    fail(error); $('boot-progress').hidden = true;
    $('entry').hidden = false; $('start').hidden = true;
    $('capability').textContent = 'Reabra a página para tentar novamente. Antes de fechar, procure cópias FCStd em “Arquivos e exportações”.';
  }
}
$('start').addEventListener('click', start);
// A one-use marker is set only by the launcher's explicit, size-labelled action.
try {
  const consent = Number(sessionStorage.getItem('confenge-freecad-start'));
  sessionStorage.removeItem('confenge-freecad-start');
  if (consent > Date.now() - 60000 && consent <= Date.now()) start();
} catch { /* Direct visits and blocked storage retain the explicit start button. */ }
