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
await assert.rejects(convertDrawing('open', 'quebrado.dwg', new Uint8Array(1500)), /assinatura/);
await assert.rejects(convertDrawing('open', 'grande.dwg', new Uint8Array(25 * 1024 * 1024 + 1)), /25 MiB/);
assert.equal(compareBaseline(new ArrayBuffer(0), edited).lossy, true);
console.log('CAD: leitura, comparação do desenho, edição, gravação, releitura e rejeição de arquivos inválidos.');
