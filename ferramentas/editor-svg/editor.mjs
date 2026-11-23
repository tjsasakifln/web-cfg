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

function fileSvg(text) {
  const document = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = document.documentElement;
  if (document.doctype || root.namespaceURI !== SVG_NS || root.localName !== 'svg'
      || root.querySelector('parsererror')) {
    throw new Error('Abra um SVG vetorial válido.');
  }
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 1200) throw new Error('O SVG excede o limite de 1.200 elementos.');
  for (const element of elements) {
    if (element.namespaceURI !== SVG_NS || !tags.has(element.localName)
        || (element !== root && element.localName === 'svg')) {
      throw new Error('O editor aceita geometrias e textos vetoriais simples.');
    }
    for (const attribute of element.attributes) {
      if (element === root && ['xmlns', 'xmlns:svg'].includes(attribute.name) && attribute.value === SVG_NS) continue;
      if (element.localName === 'g' && attribute.name === 'class' && attribute.value === 'layer') continue;
      if (!attributes.has(attribute.name) || attribute.namespaceURI
          || /url\s*\(|\\|[<>]/i.test(attribute.value)) {
        throw new Error('O SVG contém estilos, vínculos ou elementos externos. Exporte-o como geometria simples.');
      }
    }
  }
  const size = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
    || [0, 0, Number(root.getAttribute('width')), Number(root.getAttribute('height'))];
  if (size.length !== 4 || size.some(value => !Number.isFinite(value))
      || size[0] !== 0 || size[1] !== 0
      || Math.min(size[2], size[3]) < 20 || Math.max(size[2], size[3]) > 2000) {
    throw new Error('Escolha um SVG com origem 0,0 e dimensões entre 20 e 2.000 unidades.');
  }
  return { root, width: size[2], height: size[3] };
}

function copySafeNode(source, document, engine) {
  if (source.nodeType === Node.TEXT_NODE || source.nodeType === Node.CDATA_SECTION_NODE) {
    return document.createTextNode(source.data);
  }
  if (source.nodeType !== Node.ELEMENT_NODE) return null;
  if (source.namespaceURI !== SVG_NS || !tags.has(source.localName)) {
    throw new Error('O SVG contém conteúdo que não pode ser editado com segurança.');
  }
  const target = document.createElementNS(SVG_NS, source.localName);
  if (!['title', 'desc', 'tspan'].includes(source.localName)) target.id = engine.getNextId();
  for (const attribute of source.attributes) {
    if (attribute.name !== 'id' && attributes.has(attribute.name)) {
      target.setAttribute(attribute.name, attribute.value);
    }
  }
  appendSafeChildren(target, source, engine);
  return target;
}

function appendSafeChildren(target, source, engine) {
  for (const child of source.childNodes) {
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
    const validated = source ? fileSvg(source) : null;
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
