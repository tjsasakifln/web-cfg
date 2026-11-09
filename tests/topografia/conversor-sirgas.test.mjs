import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromGeographic, fromUtm, readPoints, values } from '../../ferramentas/conversor-utm-sirgas-2000/conversor.js';

// Independent reference: pyproj/PROJ 9.8.1 Transformer.from_crs(4674, epsg, always_xy=True).
const fixtures = [
  [-48.55, -27.6, 31982, 741816.1845257215, 6944710.15764008],
  [-60.67, 2.82, 31974, 759030.3292944817, 311956.4873116806],
  [-46.63, -23.55, 31983, 333624.18124383315, 7394647.522132406],
  [-51, 0, 31976, 500000, 0],
  [-34, -8, 31985, 389795.39792212506, 9115568.29353746],
  [-72, -10, 31979, 171071.2639411448, 8893091.145792766],
];
for (const [lon, lat, epsg, e, n] of fixtures) {
  test('check both directions for EPSG:' + epsg, () => {
    const out = fromGeographic(lat, lon);
    assert.equal(out.code, epsg);
    assert.ok(Math.abs(out.easting - e) < 0.001);
    assert.ok(Math.abs(out.northing - n) < 0.001);
    const point = fromUtm(e, n, out.zone, out.hemisphere);
    assert.ok(Math.abs(point.lat - lat) < 1e-8);
    assert.ok(Math.abs(point.lon - lon) < 1e-8);
  });
}
test('locale, spreadsheet paste and CSV column order', () => {
  const points = readPoints('-27,6;-48,55\r\n2.82\t-60.67', fromGeographic);
  assert.deepEqual(values(points[0], 0), ['1', '-27,60000000', '-48,55000000', '741816,185', '6944710,158', '22S', '31982']);
  assert.equal(points[1].hemisphere, 'N');
});
test('rejects malformed pairs, ambiguous thousands, injected formulas, missing coordinates and excessive input', () => {
  for (const input of ['', ' ', '1;', '1,2,3', '-27;-48;5', '=1+2;-48', '0;Infinity', '-27,1.2;-48', ('-27;-48\n').repeat(1001)]) {
    assert.throws(() => readPoints(input, fromGeographic));
  }
});
test('identifies invalid line and bounds, including a UTM pair outside the natural zone', () => {
  assert.throws(() => readPoints('-27;-48\n40;-45', fromGeographic), /Linha 2/);
  assert.throws(() => fromUtm(741816, 6944710, 16, 'S'));
  assert.throws(() => fromUtm(741816, 6944710, 22, 'N'));
  assert.throws(() => fromUtm(100000, 6944710, 22, 'S'));
  assert.throws(() => fromGeographic(4, -32));
  assert.throws(() => fromGeographic(NaN, -45));
});

test('inverse accepts millimetre-rounded CSV values on the inclusive envelope', () => {
  for (const [lat, lon] of [[-35, -31], [-35, -75], [6, -75], [6, -51]]) {
    const point = fromGeographic(lat, lon);
    const inverse = fromUtm(Number(point.easting.toFixed(3)), Number(point.northing.toFixed(3)), point.zone, point.hemisphere);
    assert.ok(Math.abs(inverse.lat - lat) <= 1e-8);
    assert.ok(Math.abs(inverse.lon - lon) <= 1e-8);
  }
  assert.throws(() => fromGeographic(-35.000000001, -31));
});
