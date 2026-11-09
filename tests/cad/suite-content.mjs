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
const member = (archive, entry) => {
  const [start, length, size, method] = entry;
  const bytes = archive.subarray(start, start + length);
  const body = method === 8 ? inflateRawSync(bytes) : bytes;
  assert.equal(body.length, size);
  return body;
};
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

let firstBridge;
for (const [slug, edition] of Object.entries(releases)) {
  const archive = await read('cad/suite/pacotes/' + edition.archive);
  const root = `assets/apps/${slug}/`;
  const bridgeName = Object.keys(edition.files).find(name => name.startsWith(root) && name.endsWith('/confenge-export.js'));
  const hostName = Object.keys(edition.files).find(name => name.startsWith(root) && new RegExp(`^assets/apps/${slug}/[^/]+/host\\.js$`).test(name));
  assert.ok(bridgeName, slug + ': entitlement bridge');
  assert.ok(hostName, slug + ': host');
  const bridge = member(archive, edition.files[bridgeName]).toString();
  const host = member(archive, edition.files[hostName]).toString();
  assert.match(bridge, /event\.origin !== location\.origin \|\| event\.source !== window\.parent/);
  assert.match(bridge, /requestConfengeBackup/);
  assert.match(bridge, /unavailable = true/);
  assert.doesNotMatch(bridge, /authorization|access.?token|id.?token|firebase/i);
  assert.match(host, /requestConfengeExport, requestConfengeBackup/);
  assert.match(host, /this\.downloadLocal\(data, name, type\)/);
  assert.match(host, /requestConfengeBackup\(data, name, type\)/);
  assert.match(member(archive, edition.files['index.html']).toString(), new RegExp(bridgeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (slug === 'markupcraft' || slug === 'takeoffcraft') {
    const uiName = Object.keys(edition.files).find(name => name.startsWith(root) && new RegExp(`^assets/apps/${slug}/[^/]+/ui-util\\.js$`).test(name));
    assert.match(member(archive, edition.files[uiName]).toString(), /requestConfengeExport\(data, name, type\)/);
  }
  const cabinetMain = Object.keys(edition.files).find(name => name.startsWith(root) && name.endsWith('/addons/cabinetcraft/main.js'));
  if (cabinetMain) {
    assert.match(member(archive, edition.files[cabinetMain]).toString(), /requestConfengeExport, requestConfengeBackup/);
    const cabinetUi = cabinetMain.replace('/main.js', '/lib/ui.js');
    assert.match(member(archive, edition.files[cabinetUi]).toString(), /app\.backup\(\(p\.name \|\| 'job'\)/);
  }
  if (slug === 'cadcraft') firstBridge = bridge;
}

let posted, receive;
const parent = {postMessage(message, target) { posted = {message, target}; }};
globalThis.window = {parent, addEventListener(type, listener) { if (type === 'message') receive = listener; }, dispatchEvent() {}};
globalThis.location = {origin: 'https://confenge.invalid'};
const bridgeModule = await import('data:text/javascript;base64,' + Buffer.from(firstBridge).toString('base64'));
const exportBytes = new Blob(['resultado exato'], {type:'text/csv'});
assert.equal(bridgeModule.requestConfengeExport(exportBytes, 'resultado.csv', 'text/csv'), true);
assert.equal(posted.target, location.origin);
assert.equal(posted.message.kind, 'export');
assert.equal(posted.message.content, exportBytes);
receive({origin: location.origin, source: parent, data: {type:'confenge-suite-export-result', requestId:posted.message.requestId, status:'approved'}});
delete globalThis.window;
delete globalThis.location;

const launcher = (await read('cad/aplicativos/catalog.js')).toString();
assert.match(launcher, /event\.origin !== location\.origin \|\| event\.source !== frame\?\.contentWindow/);
assert.match(launcher, /input\.kind === 'backup'/);
assert.match(launcher, /toolId: 'cad-suite-' \+ app/);
assert.doesNotMatch(launcher, /allow-downloads/);
for (const slug of Object.keys(releases)) assert.match(launcher, new RegExp(`\\b${slug}: \\[`));
const calculations = (await read('cad/aplicativos/calculos.js')).toString();
assert.match(calculations, /toolId: 'cad-suite-calculos'/);
assert.match(calculations, /format: 'txt'/);
assert.match(calculations, /if \(data\.result\.ok\)/);

console.log('74 field packs, 12 engines and the fail-closed export bridge for 8 apps validated.');
