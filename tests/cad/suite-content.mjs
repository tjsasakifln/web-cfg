// node tests/cad/suite-content.mjs _site
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
const site = pathToFileURL(resolve(process.argv[2] || '_site') + '/');
const read = name => readFile(new URL(name, site));
const releases = JSON.parse(await read('cad/suite/pacotes/edicoes.json'));
const release = releases.cadcraft;
const [offset, packed] = release.files['assets/js/fields.js'];
const zip = await read('cad/suite/pacotes/' + release.archive);
const moduleSource = inflateRawSync(zip.subarray(offset, offset + packed));
const { createFields, readPack } = await import('data:text/javascript;base64,' + moduleSource.toString('base64'));
const catalogue = JSON.parse(await read('assets/fields/index.json'));
assert.equal(catalogue.packs.length, 74);
const coverage = { well: 0, partly: 0, thin: 0 };
for (const row of catalogue.packs) {
  const data = await read('assets/fields/' + row.file);
  assert.equal(createHash('sha256').update(data).digest('hex'), row.sha256);
  const parsed = readPack(JSON.parse(data));
  assert.ok(parsed.ok, row.id + ': ' + parsed.errors.join(', '));
  coverage[row.today]++;
  for (const app of row.hosts.filter(h => h !== 'super')) {
    const fields = createFields({ app: app + 'craft' });
    assert.ok(fields.install(parsed.pack).ok, row.id);
    assert.ok(fields.has(row.id));
    assert.ok(fields.remove(row.id));
  }
}
assert.deepEqual(coverage, { well: 5, partly: 11, thin: 58 });
const { createEngines } = await import(new URL('assets/cad-engines/engines.js', site));
const engines = createEngines();
assert.equal(engines.list().length, 12);
for (const { id } of engines.list()) {
  const sample = await engines.example(id);
  const r = await engines.run(id, sample.text);
  assert.ok(r.tables.length, id);
  if (id === 'trace') {
    assert.ok(r.problems.some(p => p.code === 'trace.failed'));
    const data = JSON.parse(sample.text);
    data.results.find(test => test.outcome === 'fail').outcome = 'pass';
    assert.ok((await engines.run(id, JSON.stringify(data))).ok);
  } else assert.ok(r.ok, id);
  if (id === 'network') {
    const pipe = r.tables.find(table => table.title === 'Links').rows[0];
    // 50 L/s, diameter 300 mm, 1 km long, Hazen-Williams C=120.
    const h = 10.67 * 1000 * 0.05 ** 1.852 / (120 ** 1.852 * 0.3 ** 4.871);
    const v = 0.05 / (Math.PI * 0.3 ** 2 / 4);
    assert.ok(Math.abs(Number(pipe[2]) - h) < 0.00001);
    assert.ok(Math.abs(Number(pipe[3]) - v) < 0.00001);
  }
}
console.log('74 field packs and 12 engines validated, including hydraulic loss and traceability.');
