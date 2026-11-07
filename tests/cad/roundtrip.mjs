// Run after building the public site: node tests/cad/roundtrip.mjs _site
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const site = pathToFileURL(path.resolve(process.argv[2] || '_site') + '/');
const { convertDrawing, compareBaseline } = await import(new URL('cad/drawing.mjs', site));
const cad = await import(new URL('bim/web/vendor-cad/acad.mjs', site));
const demo = await readFile(new URL('cad/exemplo.dwg', site));
const original = await convertDrawing('open', 'planta.dwg', demo);
assert.equal(original.name, 'planta.dxf');
assert.equal(original.lossy, false);
assert.equal(compareBaseline(original.bytes, original.bytes).lossy, false);

const doc = cad.DxfReader.readFromStream(new Uint8Array(original.bytes));
const count = doc.modelSpace.entities.count;
const line = new cad.Line();
line.startPoint = new cad.XYZ(6500, 1000, 0);
line.endPoint = new cad.XYZ(7200, 1900, 0);
doc.modelSpace.entities.add(line);
const chunks = [];
cad.DxfWriter.writeToStream({ write: text => chunks.push(text) }, doc);
const edited = new TextEncoder().encode(chunks.join(''));
assert.equal(compareBaseline(original.bytes, edited).lossy, true);
const output = await convertDrawing('save', 'planta.dxf', edited);
assert.equal(new TextDecoder().decode(output.bytes.slice(0, 6)), 'AC1015');
const reopened = cad.DwgReader.readFromStream(output.bytes);
assert.equal(reopened.modelSpace.entities.count, count + 1);
assert.ok([...reopened.modelSpace.entities].some(e => e.objectName === 'LINE' &&
  e.startPoint.x === 6500 && e.startPoint.y === 1000 && e.endPoint.x === 7200 && e.endPoint.y === 1900));
// The writer must emit distinct minimum and maximum plot limits on every layout.
for (const [i, block] of [doc.modelSpace, doc.paperSpace].entries()) {
  const layout = new cad.Layout(i ? 'Prancha A3' : 'Model');
  layout.associatedBlock = block;
  layout.minLimits = new cad.XY(-i - 1, -i - 2);
  layout.maxLimits = new cad.XY(420 + i, 297 + i);
  doc.layouts.add(layout);
}
doc.header.version = cad.ACadVersion.AC1015;
const sheets = cad.DwgReader.readFromStream(cad.DwgWriter.writeToBuffer(doc).buffer);
assert.equal(Array.from(sheets.layouts).length, 2);
for (const layout of doc.layouts) {
  const copy = Array.from(sheets.layouts).find(item => item.name === layout.name);
  assert.deepEqual(copy.minLimits, layout.minLimits);
  assert.deepEqual(copy.maxLimits, layout.maxLimits);
}
// A justified dimension label can recalculate its first point without moving its anchor.
function textSample(horizontal, firstX, anchorX) {
  const sample = new cad.CadDocument();
  const text = new cad.TextEntity();
  text.value = '4,80 m';
  text.height = 2;
  text.horizontalAlignment = horizontal;
  text.insertPoint = new cad.XYZ(firstX, 1, 0);
  text.alignmentPoint = new cad.XYZ(anchorX, 1, 0);
  sample.modelSpace.entities.add(text);
  const parts = [];
  cad.DxfWriter.writeToStream({ write: value => parts.push(value) }, sample);
  return new TextEncoder().encode(parts.join(''));
}
const centered = textSample(1, 10, 10);
assert.equal(compareBaseline(centered, textSample(1, 7, 10)).lossy, false);
assert.equal(compareBaseline(centered, textSample(1, 7, 11)).lossy, true);
assert.equal(compareBaseline(centered, textSample(2, 7, 10)).lossy, true);
for (const mode of [0, 3, 5]) {
  assert.equal(compareBaseline(textSample(mode, 10, 10), textSample(mode, 7, 10)).lossy, true);
}

await assert.rejects(convertDrawing('open', 'quebrado.dwg', new Uint8Array(1500)), /assinatura/);
await assert.rejects(convertDrawing('open', 'grande.dwg', new Uint8Array(25 * 1024 * 1024 + 1)), /25 MiB/);
assert.equal(compareBaseline(new ArrayBuffer(0), edited).lossy, true);
console.log('CAD: leitura, comparação do desenho, edição, gravação, releitura e rejeição de arquivos inválidos.');
