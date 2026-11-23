import { combine, parseDbf, parseShp } from './vendor/shpjs-6.2.0.min.js';
import { createDemoZip } from './demo.mjs';
import { identifyProjection, normalizeLayers } from './projecao.mjs';
import { createToolMetrics } from '/assets/js/aec-tool-metrics.mjs';
import { exportToolResult } from '/assets/js/tool-credits.mjs';

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 5;
const REQUIRED = new Set(['.shp', '.shx', '.dbf', '.prj']);
const ALLOWED = new Set([...REQUIRED, '.cpg']);
const $ = (selector) => document.querySelector(selector);
const input = $('#arquivo'), status = $('#status'), result = $('#resultado');
const metrics = createToolMetrics('converter-shp-geojson');
let currentResult = null, converting = false;

function setStatus(message, mode = '') { status.textContent = message; status.dataset.mode = mode; }

function eocdOffset(bytes) {
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
  }
  throw new Error('O ZIP não possui diretório central válido.');
}

function inspectZip(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), end = eocdOffset(bytes);
  const entriesCount = view.getUint16(end + 10, true), directorySize = view.getUint32(end + 12, true);
  let cursor = view.getUint32(end + 16, true), total = 0;
  if (!entriesCount || entriesCount > MAX_ENTRIES || cursor + directorySize > end) throw new Error('O ZIP deve conter somente uma camada SHP completa.');
  const files = [];
  for (let index = 0; index < entriesCount; index += 1) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('O diretório do ZIP está incompleto.');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true), uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true), next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(method) || !uncompressed || compressed > MAX_BYTES) throw new Error('O ZIP contém uma entrada não suportada.');
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (!name || name.includes('..') || name.startsWith('/') || name.includes('\\')) throw new Error('O ZIP contém um caminho de arquivo inválido.');
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('O ZIP contém um deslocamento de arquivo inválido.');
    const localNameLength = view.getUint16(localOffset + 26, true), localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength, dataEnd = dataStart + compressed;
    if (dataEnd > bytes.length) throw new Error('O ZIP termina antes do conteúdo esperado.');
    total += uncompressed;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error('O conteúdo descompactado excede o limite deste piloto.');
    files.push({ name, method, dataStart, dataEnd, declaredBytes: uncompressed }); cursor = next;
  }
  const stems = new Set(), byExtension = new Map();
  for (const file of files) {
    const match = /^(.*)(\.[^.]+)$/i.exec(file.name);
    if (!match || !ALLOWED.has(match[2].toLowerCase())) throw new Error('O ZIP deve conter somente .shp, .shx, .dbf, .prj e .cpg opcional.');
    const extension = match[2].toLowerCase(); stems.add(match[1].toLowerCase());
    if (byExtension.has(extension)) throw new Error('O ZIP contém arquivos repetidos para a mesma camada.');
    byExtension.set(extension, file);
  }
  if (stems.size !== 1 || [...REQUIRED].some((extension) => !byExtension.has(extension))) {
    throw new Error('O ZIP precisa conter exatamente uma camada com .shp, .shx, .dbf e .prj do mesmo nome.');
  }
  return { files: byExtension, bytes, datasetName: [...stems][0].split('/').pop() };
}

async function inflateEntry(archive, entry, remaining) {
  const compressed = archive.bytes.slice(entry.dataStart, entry.dataEnd);
  const limit = Math.min(MAX_ENTRY_BYTES, remaining);
  if (entry.declaredBytes > limit) throw new Error('O conteúdo descompactado excede o limite deste piloto.');
  if (entry.method === 0) {
    if (compressed.length !== entry.declaredBytes) throw new Error('O tamanho declarado no ZIP não corresponde ao arquivo armazenado.');
    return compressed;
  }
  if (entry.method !== 8 || !('DecompressionStream' in window)) throw new Error('Este navegador não consegue ler a compressão do ZIP. Atualize-o e tente novamente.');
  const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit || total > entry.declaredBytes) {
        await reader.cancel();
        throw new Error('O tamanho real descompactado excede o limite declarado pelo ZIP.');
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  if (total !== entry.declaredBytes) throw new Error('O tamanho real descompactado não corresponde ao declarado pelo ZIP.');
  const bytes = new Uint8Array(total); let cursor = 0;
  for (const part of parts) { bytes.set(part, cursor); cursor += part.length; }
  return bytes;
}

async function readDataset(archive) {
  let remaining = MAX_UNCOMPRESSED_BYTES;
  const files = {};
  for (const extension of ALLOWED) {
    const entry = archive.files.get(extension);
    if (!entry) continue;
    const bytes = await inflateEntry(archive, entry, remaining);
    remaining -= bytes.length;
    files[extension] = bytes;
  }
  const wkt = new TextDecoder().decode(files['.prj']);
  const projection = identifyProjection(wkt);
  if (!projection.ok) throw new Error(projection.reason);
  const geometries = parseShp(new DataView(files['.shp'].buffer, files['.shp'].byteOffset, files['.shp'].byteLength), wkt);
  const encoding = files['.cpg'] ? new TextDecoder().decode(files['.cpg']) : undefined;
  const records = parseDbf(new DataView(files['.dbf'].buffer, files['.dbf'].byteOffset, files['.dbf'].byteLength), encoding);
  if (!Array.isArray(geometries) || !Array.isArray(records) || geometries.length !== records.length) {
    throw new Error('A quantidade de geometrias e registros do Shapefile não coincide.');
  }
  const layer = combine([geometries, records]);
  layer.fileName = archive.datasetName;
  return { layer, projection };
}

function saveLayer(layer, content) {
  const url = URL.createObjectURL(content), link = document.createElement('a');
  link.href = url; link.download = `${layer.name}.geojson`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function download(layer, prepared) {
  const content = new Blob([JSON.stringify(layer, null, 2)], { type: 'application/geo+json;charset=utf-8' });
  if (prepared.demo) { saveLayer(layer, content); metrics.finish('exported'); return; }
  await exportToolResult({ toolId: 'converter-shp-geojson', format: 'geojson', content, requireEntitlement: true,
    deliver() { saveLayer(layer, content); metrics.finish('exported'); },
  });
}

function showResult(layers, projection, demo) {
  const prepared = { layers, demo }; currentResult = prepared;
  $('#resumo').textContent = `${layers.reduce((count, layer) => count + layer.features.length, 0)} feições em ${layers.length} camada${layers.length === 1 ? '' : 's'}. Origem reconhecida: ${projection.label}, coordenadas ${projection.kind}.${demo ? ' Este é o exemplo da ferramenta.' : ''}`;
  const list = $('#camadas');
  list.replaceChildren(...layers.map((layer) => {
    const item = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.className = 'button button-secondary'; button.textContent = `Baixar ${layer.name}.geojson${demo ? ' de exemplo' : ''}`;
    button.addEventListener('click', () => download(layer, prepared).catch((error) => {
      if (currentResult === prepared) setStatus(error.message || 'Não foi possível preparar a exportação.', 'error');
    }));
    item.append(`${layer.name}: ${layer.features.length} feições `, button); return item;
  }));
  result.hidden = false;
}

async function convert(file, source) {
  if (converting) return;
  converting = true; input.disabled = true; $('#exemplo').disabled = true; result.hidden = true; currentResult = null;
  let measured = false;
  try {
    if (!file || !/\.zip$/i.test(file.name)) throw new Error('Escolha um arquivo ZIP com .shp, .shx, .dbf e .prj.');
    if (file.size <= 0 || file.size > MAX_BYTES) throw new Error('Este piloto aceita ZIPs de até 25 MiB.');
    metrics.start('shp', source, file.size); measured = true;
    const buffer = await file.arrayBuffer(), archive = inspectZip(buffer), dataset = await readDataset(archive);
    setStatus('Convertendo localmente…');
    const layers = normalizeLayers(dataset.layer);
    const projection = dataset.projection;
    showResult(layers, projection, source === 'example'); setStatus('Conversão concluída. O arquivo foi processado somente neste navegador.', 'ok'); metrics.finish('ready');
  } catch (error) {
    setStatus(error.message || 'Não foi possível converter o arquivo.', 'error'); if (measured) metrics.finish('failed');
  } finally { converting = false; input.disabled = false; $('#exemplo').disabled = false; }
}

input.addEventListener('change', () => convert(input.files[0], 'file'));
$('#exemplo').addEventListener('click', () => {
  const zip = createDemoZip(), file = new File([zip], 'exemplo-shp.zip', { type: 'application/zip' });
  convert(file, 'example');
});
