// CADCraft 0.18's browser runtime edits DXF. ACadSharp-TS reads and writes the
// DWG envelope in the same browser. Both are self-hosted and version-pinned.
import * as cad from '../bim/web/vendor-cad/acad.mjs';

const MiB = 1024 * 1024;
function dxfBytes(doc, notify) {
  doc.header.version = cad.ACadVersion.AC1027; // UTF-8 text and layer names
  const chunks = [];
  let length = 0;
  cad.DxfWriter.writeToStream({
    write(text) {
      length += text.length;
      if (length > 64 * MiB) throw new Error('O desenho expandido ultrapassa 64 MiB.');
      chunks.push(text);
    }
  }, doc, false, undefined, notify);
  const data = new TextEncoder().encode(chunks.join(''));
  if (data.length > 64 * MiB) throw new Error('O desenho expandido ultrapassa 64 MiB.');
  return data;
}

function inventory(doc) {
  const counts = new Map();
  for (const block of doc.blockRecords) {
    for (const entity of block.entities) {
      const key = JSON.stringify([block.name, entity.layer?.name, entity.objectName]);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}
function unchanged(before, after) {
  return before.size === after.size && [...before].every(([key, n]) => n === after.get(key));
}

export async function convertDrawing(operation, name, input) {
  if (typeof name !== 'string' || !['open', 'save'].includes(operation)) throw new Error('Pedido de conversão inválido.');
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const saving = operation === 'save';
  const dwg = /\.dwg$/i.test(name);
  if (!(dwg || /\.dxf$/i.test(name)) || (saving && dwg)) throw new Error('Selecione um desenho DWG ou DXF.');
  if (!bytes.length || bytes.length > (dwg ? 25 : 64) * MiB) throw new Error(dwg ? 'Use um DWG de até 25 MiB.' : 'Use um DXF de até 64 MiB.');
  const warnings = new Set();
  let loss = false;
  function notify(_, event) {
    const message = String(event.message || '').slice(0, 220);
    if (event.notificationType === 0) return;
    // ACadSharp emits these even for an untouched AutoCAD file containing one LINE.
    // They concern presentation resources. Flag their absence explicitly, but only
    // block the DWG copy when the drawing geometry or other records are at risk.
    if (/^Object not implemented\s*:\s*VisualStyle$/.test(message) ||
        /^(Unlisted object with DXF name (ACDBDETAILVIEWSTYLE|ACDBSECTIONVIEWSTYLE|CELLSTYLEMAP) |Entry not found .*(ACAD_DETAILVIEWSTYLE|ACAD_SECTIONVIEWSTYLE|TABLESTYLE_CELLSTYLEMAP))/.test(message)) {
      warnings.add('Alguns estilos de apresentação do arquivo original não acompanham a cópia 2D.');
      return;
    }
    if (message.includes('joggedRadiusDimensionTransverseSegmentAngle')) {
      warnings.add('O leitor usou o ângulo padrão para a quebra em cotas de raio.');
      return;
    }
    if (event.notificationType === 3 && saving) throw new Error('Erro no desenho durante a gravação. Baixe o DXF para conferência.');
    loss = true;
    const unknown = /Unlisted object with DXF name ([A-Z0-9_]+)/.exec(message);
    if (warnings.size < 5) warnings.add(unknown ? 'Registro sem suporte: ' + unknown[1] + '.' :
      'O leitor encontrou registros inconsistentes ou sem suporte no arquivo.');

  }

  if (dwg && !/^AC10\d{2}$/.test(new TextDecoder().decode(bytes.subarray(0, 6)))) {
    throw new Error('A assinatura é inválida. Confirme se o arquivo é um DWG.');
  }
  let doc;
  try {
    doc = dwg
      ? cad.DwgReader.readFromStream(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), notify)
      : cad.DxfReader.readFromStream(bytes, notify);
  } catch (error) {
    throw new Error('Não foi possível ler o desenho. ' + String(error?.message || '').slice(0, 180));
  }
  const before = inventory(doc);
  if (!before.size) throw new Error('Nenhuma entidade gráfica foi encontrada no arquivo.');
  const xref = [...doc.blockRecords].some(block => (block.combinedFlags & 12) || block.blockEntity?.xRefPath);
  if (xref) loss = true;
  if (xref) warnings.add('O desenho contém referência externa. O conteúdo do arquivo vinculado pode não aparecer.');
  let result = bytes;
  if (saving) {
    const expected = snapshot(doc);
    if (loss) throw new Error('O DXF contém registros que o gravador DWG não reconhece. Baixe a cópia em DXF.');
    doc.header.version = cad.ACadVersion.AC1015;
    result = cad.DwgWriter.writeToBuffer(doc, null, notify);
    const output = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
    const reopened = cad.DwgReader.readFromStream(output, notify);
    const verified = snapshot(reopened);
    if (!unchanged(expected.entities, verified.entities) || missingNames(expected, verified).length || loss) {
      throw new Error('O DWG gerado não preservou a geometria ou a organização do desenho. Baixe a cópia em DXF.');
    }
  } else if (dwg) {
    result = dxfBytes(doc, notify);
    try {
      if (!unchanged(before, inventory(cad.DxfReader.readFromStream(result, notify)))) loss = true;
    } catch {
      loss = true;
      warnings.add('Algumas entidades não puderam ser relidas na cópia para visualização.');
    }
  }
  if (loss) warnings.add('Há registros sem suporte nesta conversão. A cópia editada pode omitir elementos do original.');
  const stem = name.replace(/\.[^.]+$/, '');
  return { name: stem + (saving ? '.dwg' : '.dxf'), bytes: result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength), warnings: [...warnings], lossy: loss };
}

// Handles, generated record order and automatically-added tables vary by writer.
// Compare the drawing geometry and user-defined names independent of those details.
const signatureKeys = [
  'startPoint', 'endPoint', 'center', 'radius', 'startAngle', 'endAngle', 'majorAxisEndPoint', 'radiusRatio',
  'insertPoint', 'alignmentPoint', 'rotation', 'height', 'value', 'scale', 'normal',
  'lineTypeScale', 'thickness', 'constantWidth', 'isClosed', 'flags'
];
const rounded = value => Number(value.toFixed(6));
function coordinate(value) {
  if (typeof value === 'number') return rounded(value);
  if (typeof value === 'object' && value && 'x' in value) return [value.x, value.y, value.z || 0].map(rounded);
  return typeof value === 'object' ? undefined : value;
}
function snapshot(doc) {
  const entities = new Map();
  let total = 0;
  for (const block of doc.blockRecords) for (const e of block.entities) {
    const signature = [block.name.toUpperCase(), e.layer?.name.toUpperCase(), e.objectName];
    // For justified TEXT, DXF 11 anchors the glyphs and AutoCAD recalculates DXF 10.
    // Aligned and fit text use two endpoints, so keep both for those modes.
    const anchoredText = e.objectName === 'TEXT' && e.alignmentPoint &&
      ([1, 2, 4].includes(e.horizontalAlignment) || (e.horizontalAlignment === 0 && e.verticalAlignment > 0));
    if (e.objectName === 'TEXT') {
      signature.push(['text', e.horizontalAlignment, e.verticalAlignment, e.widthFactor,
        e.obliqueAngle, e.mirror, e.style?.name.toUpperCase()]);
    }
    for (const key of signatureKeys) {
      if (anchoredText && key === 'insertPoint') continue;
      if (e[key] !== undefined) signature.push([key, coordinate(e[key])]);
    }
    if (e.objectName === 'VIEWPORT') {
      signature.push(['view', e.width, e.viewHeight, e.twistAngle, e.viewCenter, e.viewDirection, e.viewTarget].map(coordinate));
      signature.push(['frozen', Array.from(e.frozenLayers, layer => layer.name.toUpperCase()).sort()]);
      // CADCraft stores sheet settings (including inch units) on a paper viewport.
      for (const [app, data] of e.extendedData) {
        if (app.name === 'CADCRAFT' && data.records[0]?.value === 'LAYOUT') {
          signature.push(['sheetData', data.records.map(record => [record.code, coordinate(record.value)])]);
        }
      }
    }
    if (e.block?.name) signature.push(['block', e.block.name.toUpperCase()]);
    if (e.vertices?.[Symbol.iterator]) {
      signature.push(['vertices', Array.from(e.vertices, v => [
        coordinate(v.location || v.position || v), coordinate(v.bulge || 0), coordinate(v.startWidth || 0), coordinate(v.endWidth || 0)
      ])]);
    }
    const key = JSON.stringify(signature);
    entities.set(key, (entities.get(key) || 0) + 1);
    total++;
  }
  const names = table => new Set(Array.from(table, item => item.name.toUpperCase()));
  const sheets = new Map(Array.from(doc.layouts, layout => [layout.name.toUpperCase(), JSON.stringify([
    layout.associatedBlock?.name.toUpperCase(), layout.paperSize, layout.paperUnits, layout.paperRotation,
    layout.paperWidth, layout.paperHeight, layout.numeratorScale, layout.denominatorScale,
    layout.minLimits.x, layout.minLimits.y, layout.maxLimits.x, layout.maxLimits.y
  ].map(value => typeof value === 'number' ? rounded(value) : value))]));
  return { entities, total, layers: names(doc.layers), layouts: names(doc.layouts), blocks: names(doc.blockRecords), sheets };
}

function missingNames(original, opened) {
  const messages = [];
  for (const [key, label] of [['layers', 'camadas'], ['layouts', 'folhas'], ['blocks', 'blocos']]) {
    const missing = [...original[key]].filter(name => !opened[key].has(name));
    if (missing.length) messages.push('A cópia omitiu ' + label + ': ' + missing.slice(0, 5).join(', ') + '.');
  }
  for (const [name, settings] of original.sheets) {
    if (name !== 'MODEL' && opened.sheets.has(name) && opened.sheets.get(name) !== settings) {
      messages.push('A cópia alterou o papel, a escala ou os limites da folha ' + name + '.');
    }
  }
  return messages;
}

export function compareBaseline(before, after) {
  const warnings = [];
  try {
    const read = input => {
      const bytes = new Uint8Array(input);
      if (!bytes.length || bytes.length > 64 * MiB) throw new Error();
      return snapshot(cad.DxfReader.readFromStream(bytes));
    };
    const original = read(before), opened = read(after);
    if (!unchanged(original.entities, opened.entities)) {
      warnings.push('O editor alterou a geometria, a camada ou o conteúdo de entidades durante a abertura. ' +
        'Entidades no original: ' + original.total + '. Na cópia: ' + opened.total + '.');
    }
    warnings.push(...missingNames(original, opened));
  } catch {
    warnings.push('Não foi possível conferir a geometria importada pelo editor.');
  }
  return { warnings, lossy: warnings.length !== 0 };
}
