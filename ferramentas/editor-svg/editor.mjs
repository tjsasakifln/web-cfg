import { createToolMetrics } from '/assets/js/aec-tool-metrics.mjs';

const metrics = createToolMetrics('editor-svg');
const host = document.querySelector('#svg-quadro');
const status = document.querySelector('#svg-status');
const actions = document.querySelector('#svg-edicao');
const openButton = document.querySelector('#svg-abrir');
const input = document.querySelector('#svg-arquivo');
const label = document.querySelector('#svg-rotulo');
let editorPromise;

const WIDTH = 720;
const HEIGHT = 420;
const MAX_BYTES = 512 * 1024;
const SVG_NS = 'http://www.w3.org/2000/svg';
const tags = new Set(['svg', 'g', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'path', 'text', 'tspan', 'title', 'desc']);
const attributes = new Set([
  'id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'opacity', 'transform', 'font-family', 'font-size',
  'font-weight', 'text-anchor', 'dominant-baseline', 'dx', 'dy', 'pointer-events',
]);

const EXAMPLE = `<svg xmlns="${SVG_NS}" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect x="36" y="42" width="648" height="336" fill="#f7f9f8" stroke="#102c47" stroke-width="2"/>
  <text x="66" y="106" fill="#102c47" font-family="sans-serif" font-size="28">Legenda de instalações</text>
  <line x1="70" y1="130" x2="645" y2="130" stroke="#286332" stroke-width="2"/>
  <circle cx="101" cy="186" r="20" fill="none" stroke="#176d82" stroke-width="4"/>
  <line x1="79" y1="186" x2="123" y2="186" stroke="#176d82" stroke-width="2"/>
  <text x="158" y="194" fill="#102c47" font-family="sans-serif" font-size="22">Ponto de água</text>
  <rect x="81" y="232" width="40" height="40" fill="none" stroke="#286332" stroke-width="4"/>
  <line x1="81" y1="232" x2="121" y2="272" stroke="#286332" stroke-width="2"/>
  <text x="158" y="260" fill="#102c47" font-family="sans-serif" font-size="22">Caixa de inspeção</text>
  <line x1="78" y1="320" x2="124" y2="320" stroke="#102c47" stroke-width="3" stroke-dasharray="8 5"/>
  <text x="158" y="328" fill="#102c47" font-family="sans-serif" font-size="22">Traçado de referência</text>
</svg>`;

async function fileSvg(text) {
  const { default: saxes } = await import('./vendor/saxes-6.0.0.browser.mjs');
  const stack = [];
  let root = null;
  let count = 0;
  let failure = null;
  const fail = message => { if (!failure) failure = new Error(message); };
  const parser = new saxes.SaxesParser({ xmlns: true });
  parser.on('error', () => fail('Abra um SVG vetorial válido.'));
  parser.on('doctype', () => fail('O editor não aceita declarações externas no SVG.'));
  parser.on('opentag', tag => {
    if (failure) return;
    if (++count > 1200) return fail('O SVG excede o limite de 1.200 elementos.');
    if (tag.uri !== SVG_NS || !tags.has(tag.local) || (!root && tag.local !== 'svg') || (root && tag.local === 'svg')) {
      return fail('O editor aceita geometrias e textos vetoriais simples.');
    }
    const attributesMap = {};
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.uri === 'http://www.w3.org/2000/xmlns/') {
        if (!root && ['xmlns', 'xmlns:svg'].includes(attribute.name) && attribute.value === SVG_NS) continue;
        return fail('O SVG contém espaços de nomes não permitidos.');
      }
      if ((tag.local === 'g' && attribute.name === 'class' && attribute.value === 'layer')) continue;
      if (attribute.uri || !attributes.has(attribute.name) || /url\s*\(|\\|[<>]/i.test(attribute.value)) {
        return fail('O SVG contém estilos, vínculos ou elementos externos. Exporte-o como geometria simples.');
      }
      attributesMap[attribute.name] = attribute.value;
    }
    const node = { name: tag.local, attributes: attributesMap, children: [] };
    if (!root) root = node;
    else stack.at(-1).children.push(node);
    stack.push(node);
  });
  parser.on('closetag', () => { stack.pop(); });
  const addText = value => {
    if (!failure && value && stack.length) stack.at(-1).children.push({ text: value });
  };
  parser.on('text', addText);
  parser.on('cdata', addText);
  try {
    parser.write(text).close();
  } catch {
    fail('Abra um SVG vetorial válido.');
  }
  if (failure || !root || stack.length) throw failure || new Error('Abra um SVG vetorial válido.');
  const size = root.attributes.viewBox?.trim().split(/[\s,]+/).map(Number)
    || [0, 0, Number(root.attributes.width), Number(root.attributes.height)];
  if (size.length !== 4 || size.some(value => !Number.isFinite(value))
      || size[0] !== 0 || size[1] !== 0
      || Math.min(size[2], size[3]) < 20 || Math.max(size[2], size[3]) > 2000) {
    throw new Error('Escolha um SVG com origem 0,0 e dimensões entre 20 e 2.000 unidades.');
  }
  return { root, width: size[2], height: size[3] };
}

function copySafeNode(source, document, engine) {
  if ('text' in source) return document.createTextNode(source.text);
  const target = document.createElementNS(SVG_NS, source.name);
  if (!['title', 'desc', 'tspan'].includes(source.name)) target.id = engine.getNextId();
  for (const [name, value] of Object.entries(source.attributes)) {
    if (name !== 'id' && attributes.has(name)) target.setAttribute(name, value);
  }
  appendSafeChildren(target, source, engine);
  return target;
}

function appendSafeChildren(target, source, engine) {
  for (const child of source.children) {
    const safe = copySafeNode(child, target.ownerDocument, engine);
    if (safe) target.append(safe);
  }
}

function loadSafeSvg(engine, { root, width, height }) {
  engine.clear();
  engine.setResolution(width, height);
  engine.updateCanvas(width, height);
  appendSafeChildren(engine.getSvgContent(), root, engine);
  engine.identifyLayers();
}

function fitElement(engine) {
  const root = host.querySelector('#svgroot');
  const { w, h } = engine.getResolution();
  root.setAttribute('viewBox', `0 0 ${w || WIDTH} ${h || HEIGHT}`);
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}

function setMode(engine, mode) {
  engine.setMode(mode);
  for (const control of actions.querySelectorAll('[data-modo-svg]')) {
    control.setAttribute('aria-pressed', String(control.dataset.modoSvg === mode));
  }
}

function editor() {
  if (editorPromise) return editorPromise;
  status.textContent = 'Carregando o editor vetorial.';
  editorPromise = import('./vendor/svgcanvas.js').then(({ default: SvgCanvas }) => {
    host.hidden = false;
    const engine = new SvgCanvas(host, {
      initFill: { color: 'eaf4ec', opacity: 1 },
      initStroke: { color: '102c47', opacity: 1, width: 2 },
      text: { stroke_width: 0, font_size: 22, font_family: 'sans-serif' },
      initOpacity: 1,
      dimensions: [WIDTH, HEIGHT],
      baseUnit: 'px',
      imgPath: './vendor/',
    });
    engine.updateCanvas(WIDTH, HEIGHT);
    engine.textActions.setInputElem(label);
    label.addEventListener('input', () => engine.setTextContent(label.value));
    actions.hidden = false;
    fitElement(engine);
    setMode(engine, 'select');
    return engine;
  }).catch(error => {
    editorPromise = null;
    host.replaceChildren();
    host.hidden = true;
    throw error;
  });
  return editorPromise;
}

async function show(source, message, inputType, size) {
  const attempt = metrics.start('svg', inputType, size);
  try {
    const validated = source ? await fileSvg(source) : null;
    const engine = await editor();
    if (validated) {
      loadSafeSvg(engine, validated);
      fitElement(engine);
    }
    setMode(engine, 'select');
    attempt.finish('ready');
    status.textContent = message;
  } catch (error) {
    attempt.finish('failed');
    status.textContent = error instanceof Error ? error.message : 'Não foi possível abrir o editor.';
  }
}

document.querySelector('#svg-iniciar').addEventListener('click', () => show(null, 'Quadro aberto. Escolha a geometria para desenhar.', 'new'));
document.querySelector('#svg-exemplo').addEventListener('click', () => show(EXAMPLE, 'Legenda aberta. Selecione um símbolo ou acrescente traços e rótulos.', 'example'));
openButton.addEventListener('click', () => input.click());
input.addEventListener('change', async () => {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > MAX_BYTES) {
    status.textContent = 'Escolha um SVG de até 512 KiB.';
    return;
  }
  try {
    await show(await file.text(), 'SVG aberto para edição neste navegador.', 'file', file.size);
  } catch {
    status.textContent = 'O navegador não conseguiu ler o arquivo selecionado.';
  }
});

actions.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  const engine = await editor();
  if (button.dataset.modoSvg) setMode(engine, button.dataset.modoSvg);
  if (button.id === 'svg-apagar') engine.deleteSelectedElements();
  if (button.id === 'svg-desfazer') engine.undoMgr.undo();
  if (button.id === 'svg-salvar') {
    const url = URL.createObjectURL(new Blob([engine.getSvgString()], { type: 'image/svg+xml' }));
    const download = document.createElement('a');
    download.href = url;
    download.download = 'esquema-confenge.svg';
    download.click();
    metrics.finish('exported');
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'SVG preparado para download.';
  }
});
