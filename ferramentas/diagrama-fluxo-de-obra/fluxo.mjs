const example = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="registro" value="Registrar indício" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d9ead3;strokeColor=#38761d" vertex="1" parent="1"><mxGeometry x="80" y="120" width="160" height="60" as="geometry"/></mxCell><mxCell id="verificar" value="Verificar evidência e impacto" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#cfe2f3;strokeColor=#1155cc" vertex="1" parent="1"><mxGeometry x="330" y="120" width="190" height="60" as="geometry"/></mxCell><mxCell id="corrigir" value="Definir correção e responsável" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#bf9000" vertex="1" parent="1"><mxGeometry x="610" y="120" width="200" height="60" as="geometry"/></mxCell><mxCell id="aprovar" value="Aprovar e registrar fechamento" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ead1dc;strokeColor=#a64d79" vertex="1" parent="1"><mxGeometry x="900" y="120" width="210" height="60" as="geometry"/></mxCell><mxCell id="e1" edge="1" parent="1" source="registro" target="verificar"><mxGeometry relative="1" as="geometry"/></mxCell><mxCell id="e2" edge="1" parent="1" source="verificar" target="corrigir"><mxGeometry relative="1" as="geometry"/></mxCell><mxCell id="e3" edge="1" parent="1" source="corrigir" target="aprovar"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>`;
const EMPTY_DIAGRAM = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';
const MAX_DIAGRAM_BYTES = 1024 * 1024;
const editor = document.querySelector('#fluxo-editor');
const frame = document.querySelector('#fluxo-frame');
const status = document.querySelector('#fluxo-status');
const nativeButton = document.querySelector('#fluxo-salvar');
const svgButton = document.querySelector('#fluxo-svg');

let diagram = example;
let initialized = false;
let loaded = false;
let exportFormat = '';
let timer;

function post(message) {
  frame.contentWindow?.postMessage(JSON.stringify(message), location.origin);
}

function setExportEnabled(enabled) {
  nativeButton.disabled = !enabled;
  svgButton.disabled = !enabled;
}

function parseDiagram(xml) {
  if (typeof xml !== 'string' || !xml.trim() || xml.length > MAX_DIAGRAM_BYTES) return false;
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  return !parsed.querySelector('parsererror') && ['mxGraphModel', 'mxfile'].includes(parsed.documentElement.localName);
}

function save(contents, name, type) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([contents], { type }));
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadDiagram() {
  post({ action: 'load', xml: diagram, autosave: 0, exportProtocol: true, fit: 1 });
}

function openDiagram(xml) {
  if (!parseDiagram(xml)) {
    status.textContent = 'O arquivo não contém um diagrama editável compatível.';
    return;
  }
  clearTimeout(timer);
  exportFormat = '';
  diagram = xml;
  loaded = false;
  editor.hidden = false;
  frame.hidden = false;
  setExportEnabled(false);
  status.textContent = 'Carregando o editor local…';
  if (!frame.hasAttribute('src')) {
    frame.src = './runtime/index.html?embed=1&proto=json&offline=1&lang=pt-br';
  } else if (initialized) {
    loadDiagram();
  }
  timer = setTimeout(() => {
    if (loaded) return;
    initialized = false;
    frame.removeAttribute('src');
    frame.hidden = true;
    status.textContent = 'O editor demorou a responder. Abra o diagrama novamente.';
  }, 15000);
}

function requestExport(format) {
  if (!loaded || exportFormat) return;
  exportFormat = format;
  setExportEnabled(false);
  post({ action: 'export', format });
  timer = setTimeout(() => {
    exportFormat = '';
    setExportEnabled(true);
    status.textContent = 'O arquivo demorou a ser gerado. Tente baixar novamente.';
  }, 12000);
}

function decodeSvg(uri) {
  const match = /^data:image\/svg\+xml(?:;charset=[-a-z0-9]+)?(;base64)?,(.*)$/is.exec(uri);
  if (!match) throw new Error('Formato de imagem inesperado.');
  if (!match[1]) return decodeURIComponent(match[2]);
  return new TextDecoder().decode(Uint8Array.from(atob(match[2]), character => character.charCodeAt(0)));
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  let message;
  try {
    message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    return;
  }
  if (message?.event === 'init') {
    initialized = true;
    loadDiagram();
  } else if (message?.event === 'load') {
    clearTimeout(timer);
    loaded = true;
    setExportEnabled(true);
    status.textContent = 'Editor pronto. Você pode alterar o fluxo antes de baixar.';
  } else if (message?.event === 'export' && exportFormat && exportFormat === message.format) {
    clearTimeout(timer);
    try {
      if (exportFormat === 'xml' && parseDiagram(message.xml)) {
        save(message.xml, 'fluxo-de-obra-confenge.drawio', 'application/vnd.jgraph.mxfile');
        status.textContent = 'Arquivo editável baixado.';
      } else if (exportFormat === 'svg' && typeof message.data === 'string') {
        save(decodeSvg(message.data), 'fluxo-de-obra-confenge.svg', 'image/svg+xml;charset=utf-8');
        status.textContent = 'SVG baixado.';
      } else {
        throw new Error('Formato de arquivo inesperado.');
      }
    } catch {
      status.textContent = 'O editor não devolveu um arquivo válido.';
    } finally {
      exportFormat = '';
      setExportEnabled(true);
    }
  }
});

document.querySelector('#fluxo-exemplo').addEventListener('click', () => openDiagram(example));
document.querySelector('#fluxo-vazio').addEventListener('click', () => openDiagram(EMPTY_DIAGRAM));
document.querySelector('#fluxo-arquivo').addEventListener('change', async event => {
  const input = event.currentTarget;
  const selected = input.files?.[0];
  input.value = '';
  if (!selected) return;
  if (selected.size > MAX_DIAGRAM_BYTES) {
    status.textContent = 'O arquivo excede 1 MiB.';
    return;
  }
  try {
    openDiagram(await selected.text());
  } catch {
    status.textContent = 'Não foi possível ler o arquivo escolhido.';
  }
});
nativeButton.addEventListener('click', () => requestExport('xml'));
svgButton.addEventListener('click', () => requestExport('svg'));
