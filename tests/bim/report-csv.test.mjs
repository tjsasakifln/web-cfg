import test from 'node:test';
import assert from 'node:assert/strict';
import {readBimSource} from '../../scripts/bim/read-source.mjs';

const source=readBimSource('web/csv-seguro.mjs');
const {gerarCsv} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('IFC text stays literal in spreadsheets, including whitespace-prefixed formulas', () => {
  const payloads = ['=HYPERLINK("https://invalid.example")', '+SUM(1,2)', '-2+3', '@SUM(A1)', '\t=1+1', '\n+1', '  =1', '\uFEFF=1'];
  for (const value of payloads) assert.ok(gerarCsv([[value]]).startsWith('\uFEFF"\''), value);
  assert.equal(gerarCsv([['Parede "A"; Norte', -2.5, 0, null]]), '\uFEFF"Parede ""A""; Norte";"-2.5";"0";""\r\n');
});

test('the comparison export actually uses the safe encoder', () => {
  const app = readBimSource('web/comparar.mjs');
  assert.match(app, /import \{gerarCsv\} from '\.\/csv-seguro\.mjs'/);
  assert.match(app, /const content=gerarCsv\(rows\)/);
});
