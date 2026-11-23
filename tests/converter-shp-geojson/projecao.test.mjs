import assert from 'node:assert/strict';
import test from 'node:test';
import { identifyProjection, normalizeLayers } from '../../ferramentas/converter-shp-geojson/projecao.mjs';
import { createDemoZip } from '../../ferramentas/converter-shp-geojson/demo.mjs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pointShapefile() {
  const bytes = new Uint8Array(128);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 9994, false);
  view.setInt32(24, 64, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, 1, true);
  for (const offset of [36, 52]) view.setFloat64(offset, -48.55, true);
  for (const offset of [44, 60]) view.setFloat64(offset, -27.6, true);
  view.setInt32(100, 1, false);
  view.setInt32(104, 10, false);
  view.setInt32(108, 1, true);
  view.setFloat64(112, -48.55, true);
  view.setFloat64(120, -27.6, true);
  return bytes;
}

function storedZip(entries) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name);
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc32(bytes), true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    parts.push(header, bytes);
    const record = new Uint8Array(46 + nameBytes.length);
    const recordView = new DataView(record.buffer);
    recordView.setUint32(0, 0x02014b50, true);
    recordView.setUint16(4, 20, true);
    recordView.setUint16(6, 20, true);
    recordView.setUint32(16, crc32(bytes), true);
    recordView.setUint32(20, bytes.length, true);
    recordView.setUint32(24, bytes.length, true);
    recordView.setUint16(28, nameBytes.length, true);
    recordView.setUint32(42, offset, true);
    record.set(nameBytes, 46);
    central.push(record);
    offset += header.length + bytes.length;
  }
  const centralSize = central.reduce((size, record) => size + record.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const total = [...parts, ...central, end];
  const result = new Uint8Array(total.reduce((size, part) => size + part.length, 0));
  let cursor = 0;
  for (const part of total) { result.set(part, cursor); cursor += part.length; }
  return result.buffer;
}

test('aceita SIRGAS 2000 UTM declarado no .prj', () => {
  const result = identifyProjection('PROJCS["SIRGAS 2000 / UTM zone 22S",GEOGCS["SIRGAS 2000"]]');
  assert.deepEqual(result, { ok: true, label: 'SIRGAS 2000', kind: 'UTM' });
});

test('recusa .prj sem CRS reconhecido', () => {
  assert.equal(identifyProjection('LOCAL_CS["coordenadas de obra"]').ok, false);
});

test('normaliza coleção GeoJSON e descarta propriedades ausentes', () => {
  const [layer] = normalizeLayers({ type: 'FeatureCollection', fileName: 'lotes', features: [{ type: 'Feature', geometry: null }] });
  assert.equal(layer.name, 'lotes');
  assert.deepEqual(layer.features[0].properties, {});
});

test('converte a fixture SHP de um ponto com .prj WGS 84 em GeoJSON RFC 7946', async () => {
  globalThis.self = globalThis;
  const { default: parseZip } = await import('../../ferramentas/converter-shp-geojson/vendor/shpjs-6.2.0.min.js');
  const fixture = storedZip([
    ['ponto.shp', pointShapefile()],
    ['ponto.prj', 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'],
  ]);
  const [layer] = normalizeLayers(await parseZip(fixture));
  assert.equal(layer.type, 'FeatureCollection');
  assert.deepEqual(layer.features[0].geometry, { type: 'Point', coordinates: [-48.55, -27.6] });
});

test('gera um ZIP de demonstração com SHP, SHX, DBF e PRJ que o parser aceita', async () => {
  globalThis.self = globalThis;
  const { default: parseZip } = await import('../../ferramentas/converter-shp-geojson/vendor/shpjs-6.2.0.min.js');
  const [layer] = normalizeLayers(await parseZip(createDemoZip().buffer));
  assert.equal(layer.features[0].properties.NOME, 'DEMONSTRAC');
});

test('recusa coordenada fora dos limites RFC 7946', () => {
  assert.throws(() => normalizeLayers({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [500, 0] } },
  ] }), /limites geográficos/);
});
