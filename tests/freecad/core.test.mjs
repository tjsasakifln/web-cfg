import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { allowedRequest } from '../../cad/freecad/network.mjs';
import { capabilities } from '../../cad/freecad/capabilities.mjs';
import { createSaveWatcher, fileName, isBackup, MAX_INPUT_BYTES, prepareDownload, stagePath, validateInput } from '../../cad/freecad/files.mjs';

test('only local engine reads and the existing credit/auth contracts may use the network', () => {
  for (const path of ['/assets/freecad/FreeCAD-a.wasm', '/cad/freecad/bootstrap.txt', '/api/web/tool-credits?op=config']) assert.equal(allowedRequest(path), true, path);
  assert.equal(allowedRequest('/api/web/tool-credits?op=export-local', 'POST'), true);
  assert.equal(allowedRequest('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', 'POST'), true);
  for (const url of ['https://github.com/plugin.zip', '/proxy/github/plugin.zip', '/api/sessions', '/mcp', '/api/server-files', '/api/other', 'https://confenge.com.br.evil.test/assets/freecad/file', 'https://x:secret@confenge.com.br/assets/freecad/file', 'https://confenge.com.br/assets/freecad/%2e%2e/%2e%2e/api/session']) assert.equal(allowedRequest(url), false, url);
  assert.equal(allowedRequest('/assets/freecad/model', 'POST'), false);
  assert.equal(allowedRequest('/cad/freecad/../../mcp'), false);
});

test('unsupported browser exits before a download or a graphics operation', async () => {
  const calls = [];
  const scope = { isSecureContext: true, crossOriginIsolated: true, SharedArrayBuffer, WebAssembly: {}, document: { createElement: () => { calls.push('canvas'); throw new Error('unexpected graphics'); } } };
  assert.equal((await capabilities(scope)).ok, false);
  assert.deepEqual(calls, []);
  assert.equal((await capabilities({ isSecureContext: false })).ok, false);
  assert.equal((await capabilities({ isSecureContext: true, crossOriginIsolated: false })).ok, false);
});

test('import rejects executables, empty files and oversize input before reading it', () => {
  for (const name of ['a.FCStd', 'a.step', 'a.iges', 'a.stl', 'a.3mf', 'a.svg', 'a.dxf']) assert.doesNotThrow(() => validateInput({ name, size: 4 }));
  for (const name of ['addon.zip', 'malicious.py', 'macro.FCMacro', 'a.FCStd.exe', 'drawing.dwg', 'model.rvt']) assert.throws(() => validateInput({ name, size: 4 }));
  assert.throws(() => validateInput({ name: 'a.FCStd', size: 0 }));
  assert.throws(() => validateInput({ name: 'a.FCStd', size: MAX_INPUT_BYTES + 1 }));
  assert.equal(fileName('../../x"\n.step').includes('/'), false);
  assert.match(fileName('x'.repeat(200) + '.FCStd'), /\.FCStd$/);
  assert.equal(isBackup('fake.fcstd.exe'), false);
});

test('editable backups never call the wallet, even when authorization fails', async () => {
  let calls = 0, delivered;
  const item = prepareDownload({ name: 'meu-modelo.FCStd', bytes: Uint8Array.of(80,75,3,4), authorize: () => { calls++; throw new Error('no balance'); }, deliver: async blob => { delivered = [...new Uint8Array(await blob.arrayBuffer())]; } });
  assert.equal(await item.run(), true);
  assert.equal(calls, 0);
  assert.deepEqual(delivered, [80,75,3,4]);
});

test('technical result is frozen, requires authorization and can retry without regenerating', async () => {
  let allowed = false, receipts = 0, deliveries = 0;
  const bytes = Uint8Array.of(1,2,3);
  const item = prepareDownload({ name: 'modelo.step', bytes, authorize: async request => {
    assert.equal(request.toolId, 'modelador-parametrico-3d');
    assert.equal(request.format, 'step');
    assert.deepEqual([...new Uint8Array(await request.content.arrayBuffer())], [1,2,3]);
    if (!allowed) return false;
    receipts++; await request.deliver({ id: 'verified' }); return true;
  }, deliver: () => { deliveries++; } });
  bytes[0] = 99;
  assert.equal(await item.run(), false);
  assert.equal(deliveries, 0);
  allowed = true;
  assert.deepEqual(await Promise.all([item.run(), item.run()]), [true,true]);
  assert.equal(await item.run(), true);
  assert.equal(receipts, 1);
  assert.equal(deliveries, 1);
});

test('unknown technical formats and empty artifacts cannot bypass the export contract', () => {
  assert.throws(() => prepareDownload({ name: 'model.brep', bytes: Uint8Array.of(1), authorize() {}, deliver() {} }));
  assert.throws(() => prepareDownload({ name: 'model.FCStd', bytes: new Uint8Array(), authorize() {}, deliver() {} }));
  assert.equal(stagePath('/home/web_user/_dl/test.step'), true);
  for (const path of ['/home/web_user/_dl/../secret.FCStd', '/home/web_user/_dl/sub/model.step', '/tmp/foo.step', '/home/web_user/_dl/x\n.step']) assert.equal(stagePath(path), false);
});

test('native export waits for writer close and stable bytes, including a same-size rewrite', () => {
  const emitted = [], errors = [];
  const path = '/home/web_user/_dl/model.step';
  let content = Uint8Array.of(1,2), time = 100, busy = false;
  const fs = { streams: [], mkdirTree() {}, stat: () => ({ size: content.length, mtime: new Date(time) }), readFile: () => content };
  const watcher = createSaveWatcher({ fs, busy: () => busy, onReady: value => emitted.push(value), onError: value => errors.push(value) });
  watcher.register(path);
  time = 200; content = Uint8Array.of(4,5);
  fs.streams.push({ path, flags: 1 });
  for (let i = 0; i < 10; i++) watcher.tick();
  assert.equal(emitted.length, 0);
  fs.streams = [];
  busy = true; watcher.tick(); busy = false;
  watcher.tick(); watcher.tick();
  assert.equal(emitted.length, 0);
  watcher.tick(); assert.equal(emitted.length, 1);
  assert.deepEqual([...emitted[0].bytes], [4,5]);
  content[0] = 9;
  assert.equal(emitted[0].bytes[0], 4);
  time = 300;
  watcher.tick(); watcher.tick(); watcher.tick();
  assert.equal(emitted.length, 2);
  assert.deepEqual(errors, []);
});

test('memory pressure confirms the Python receipt and browser persistence before announcing recovery', async () => {
  const graphics = fs.readFileSync(new URL('../../cad/freecad/vendor/graphics.js', import.meta.url), 'utf8');
  const runner = graphics.slice(graphics.indexOf('    function runPy(src){'), graphics.indexOf('    window.__fcRunPyGuarded'));
  const recovery = graphics.slice(graphics.indexOf('    async function forceAutosaveConfirmed(){'), graphics.indexOf('    setInterval(checkMemoryPressure, 5000);'));
  assert.ok(runner && recovery, 'exercise the production functions');
  for (const scenario of [
    { name: 'confirmed', receipt: true, expected: true },
    { name: 'Python did not acknowledge', receipt: false, expected: false },
    { name: 'storage failed', receipt: true, storageError: true, expected: false },
    { name: 'interpreter busy', busy: true, expected: false },
    { name: 'allocation failed', noMemory: true, expected: false },
  ]) {
    const files = new Map([['/tmp/.confenge_autosave_stale', 'ok']]);
    const notifications = [];
    let source = '', calls = 0, persisted = 0;
    const module = {
      _fcweb_run_python() {},
      _malloc: () => scenario.noMemory ? 0 : 64,
      stringToUTF8: value => { source = value; },
      FS: {
        readFile: path => { if (!files.has(path)) throw new Error('missing receipt'); return files.get(path); },
        unlink: path => files.delete(path),
        syncfs: (populate, callback) => {
          assert.equal(populate, false);
          persisted++;
          callback(scenario.storageError ? new Error('quota exceeded') : null);
        },
      },
    };
    const scope = vm.createContext({
      window: { fcInstance: module, __fcAppReady: true, __fcPyBusy: Boolean(scenario.busy), fcwebNotify: message => notifications.push(message) },
      TextEncoder,
      crypto: { randomUUID: () => 'fresh' },
      __memState: 0,
      checkAutosaveHealth() {},
      heapUsedFraction: () => 0.98,
      heapCapMB: () => 4096,
      memCritAt: () => 0.95,
      memWarnAt: () => 0.8,
      fcRunPy: async () => {
        calls++;
        assert.ok(source.indexOf('_cfg_saver.dirty = True') < source.indexOf('_cfg_saver.save(True)'));
        assert.match(source, /if not _cfg_saver\.dirty and not _os\.path\.exists/);
        const marker = source.match(/with open\(("[^"]+"), 'w'\)/);
        assert.ok(marker);
        if (scenario.receipt) files.set(JSON.parse(marker[1]), 'ok');
        return true;
      },
    });
    vm.runInContext(runner + '\n' + recovery, scope);
    assert.equal(await scope.checkMemoryPressure(), scenario.expected, scenario.name);
    assert.doesNotMatch(notifications[0], /confirmada|been saved/);
    assert.match(notifications.at(-1), scenario.expected ? /Cópia de recuperação confirmada/ : /Não foi possível confirmar/);
    assert.equal(calls, scenario.busy || scenario.noMemory ? 0 : 1);
    assert.equal(persisted, scenario.receipt ? 1 : 0);
    assert.equal(files.has('/tmp/.confenge_autosave_fresh'), false, 'temporary confirmation is removed');
  }
});
