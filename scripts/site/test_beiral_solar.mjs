// node --test scripts/site/test_beiral_solar.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { geometria, paraCentimetro, simular } from '../../ferramentas/calculadora-de-beiral/calculo.js';
import { getPosition } from '../../ferramentas/calculadora-de-beiral/vendor/suncalc-2.1.2.js';

const perto = (obtido, esperado, tolerancia = 1e-9) =>
  assert.ok(Math.abs(obtido - esperado) <= tolerancia, `${obtido} difere de ${esperado}`);

test('fachada frontal a 45°, recuo vertical e arredondamento para cima', () => {
  const r = geometria(45, 0, 0, 1.2, 0.2, 0.8);
  perto(r.fracao, 0.5);
  perto(r.minimo, 1.4);
  assert.equal(paraCentimetro(r.minimo), 1.4);
  assert.equal(paraCentimetro(1.401), 1.41);
});

test('incidência oblíqua, azimute circular e limite da área do vão', () => {
  const r = geometria(45, 30, 330, 1, 0, 0.4);
  perto(r.minimo, 0.5);
  perto(r.fracao, 0.8);
  perto(geometria(45, 0, 360, 1, 0, 2).fracao, 1);
  perto(geometria(45, 0, 0, 1, 2, 0.1).fracao, 0);
});

test('noite, sol tangente e sol atrás da fachada', () => {
  assert.equal(geometria(-1, 0, 0, 1, 0, 1).estado, 'Noite');
  for (const angulo of [90, 180, 270]) assert.equal(geometria(40, angulo, 0, 1, 0, 1).estado, 'Sem sol direto');
});

test('posição solar contra o exemplo independente NREL SPA, tabela A.5', () => {
  // Reda & Andreas, NREL/TP-560-34302. Zenith 50.11162°, azimuth 194.34024°.
  const r = getPosition(new Date('2003-10-17T19:30:30Z'), 39.742476, -105.1786);
  perto(r.azimuth, 194.34024, 0.02);
  perto(r.altitude, 90 - 50.11162, 0.02);
});

test('fusos independentes do navegador, inclusive ao virar a data UTC', () => {
  const local = {data: '2026-06-21', latitude: -27.5949, longitude: -48.5482, fachada: 0, vao: 1.2, distancia: 0.2, avanco: 0.8};
  const r = simular({...local, fuso: -3}, '23:00');
  const esperado = getPosition(new Date('2026-06-22T02:00:00Z'), local.latitude, local.longitude);
  perto(r.azimuth, esperado.azimuth);
  perto(r.altitude, esperado.altitude);
  const meioDia = simular({...local, fuso: -3}, '12:00');
  perto(meioDia.minimo, simular({...local, fuso: -4}, '11:00').minimo);
  assert.equal(paraCentimetro(meioDia.minimo), 1.74);
});
