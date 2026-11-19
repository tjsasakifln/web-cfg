import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// This is the pinned native delivery contract, not Module.print:
// FreeCAD/FreeCAD@1.1.3 src/Gui/Application.cpp, tryRunEventLoop, logs after
// StartupPostProcess and flock.try_lock, immediately before QApplication::exec.
// Virtastic/freecad-web@v1.0.9 patches/freecad.patch adds FcwebConsoleMirror;
// the pinned FreeCAD.js __emscripten_log_formatted uses console.log(str) for
// EM_LOG_CONSOLE. It supplies exactly one string, including U+2026 and newline.
const marker = '[fc] Init: Executing event loop…\n';
const source = fs.readFileSync(new URL('../../cad/freecad/runtime.mjs', import.meta.url), 'utf8');
const graphics = fs.readFileSync(new URL('../../cad/freecad/vendor/graphics.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../../scripts/freecad/runtime.json', import.meta.url), 'utf8'));

function between(text, start, end) {
  const first = text.indexOf(start), last = text.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, 'exercise the actual production source boundaries');
  return text.slice(first, last);
}

function environment(runtime = source) {
  let now = 1000, pointer = 32;
  const calls = [], freed = [], live = new Set(), scripts = new Map(), sleeps = [], logs = [];
  const result = { loggerReturn: true }, nodes = new Map();
  const originalLog = function (...args) { logs.push({ receiver: this, args }); return result; };
  const logger = { log: originalLog };
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, disabled: true, textContent: '', classList: { toggle() {} } });
    return nodes.get(id);
  };
  let scope;
  const engine = {
    FS: {},
    _malloc() { const value = pointer++; live.add(value); return value; },
    _free(value) { assert.equal(live.delete(Number(value)), true, 'each pointer is freed exactly once'); freed.push(Number(value)); },
    stringToUTF8(value, address) { scripts.set(Number(address), value); },
    _fcweb_run_python(address) {
      const text = scripts.get(Number(address));
      calls.push({ text, at: now });
      if (text.includes('FCWORKREADY')) scope.window.append('FCWORKREADY');
      if (engine.failure) return Promise.reject(engine.failure);
      return engine.pending;
    },
  };
  scope = vm.createContext({
    document: { getElementById: node }, console: logger,
    TextEncoder, WebAssembly, wasm: Uint8Array.of(0,97,115,109,1,0,0,0).buffer,
    data: new ArrayBuffer(1), files: {}, engine,
    performance: { now: () => now }, installNetworkBoundary() {},
    setInterval() {}, requestAnimationFrame() {}, setTimeout(resolve, delay) { sleeps.push({ resolve, delay }); },
  });
  scope.window = scope; // Browser globals share one object, including unqualified fcRunPy in graphics.js.
  const prelude = runtime.slice(0, runtime.indexOf('\nfunction operation(')).replace(/^import .*;\r?\n/gm, '');
  vm.runInContext(prelude, scope);
  vm.runInContext('module = engine; window.fcInstance = engine;', scope);
  scope.stopObservingNative = vm.runInContext('observeNativeEventLoop()', scope);
  const configSource = between(runtime, '    const config = {', '    module = window.fcInstance = await window.qtLoad(config);');
  const config = vm.runInContext('(() => {' + configSource + '; return config; })()', scope);
  const loop = between(runtime, '    const deadline = performance.now() + 180000;', '    await operation(dialogs +');
  scope.RECT_PY = 'graphics rectangle probe';
  const publishRect = between(graphics, '    function publishRect(){', '    setTimeout(publishRect, 4000);');
  const runPy = between(graphics, '    function runPy(src){', '    window.__fcRunPyGuarded');
  const pump = between(graphics, '      function tick() {', '      requestAnimationFrame(tick);\n    })();');
  vm.runInContext(publishRect + '\n' + runPy + '\n' + pump, scope);
  vm.runInContext('var wakeSeen = 0, busy = false, busyAt = 0, down = 1, armedUntil = 0, lastPump = 0, PUMP_MIN = 0, CODE = "graphics event pump probe";', scope);
  const address = text => { const value = engine._malloc(); engine.stringToUTF8(text, value); return value; };
  return {
    scope, config, engine, calls, freed, live, logs, logger, originalLog, result, address,
    emit: (...args) => logger.log(...args),
    raw: text => scope.window.fcRunPy(engine, address(text)),
    startLoop: () => vm.runInContext('(async () => {' + loop + '})()', scope),
    async tick(time) {
      now = time;
      const pending = sleeps.shift();
      assert.ok(pending, 'the production loop must still be waiting');
      assert.equal(pending.delay, 600, 'retain the production polling interval');
      pending.resolve();
      for (let i = 0; i < 16; i++) await Promise.resolve();
    },
    runtime,
  };
}

test('native readiness is tied to the reviewed FreeCAD and JS artifact', () => {
  assert.equal(manifest.version, '1.0.9');
  assert.equal(manifest.engine, 'FreeCAD 1.1.3');
  assert.equal(manifest.files['FreeCAD.js'].sha256, '3f8c1ff4a0eecbc04da3ca6a25c33e56adb0624698230b58ab51ea083561e64e');
  const observeAt = source.indexOf('stopObservingNative = observeNativeEventLoop();');
  const engineAt = source.indexOf("await loadScript(files['FreeCAD.js'].path");
  assert.ok(observeAt >= 0 && engineAt > observeAt);
});

test('slow native startup keeps every Python entry closed beyond the old eight-second assumption', async () => {
  const e = environment();
  await e.config.qt.module;
  e.config.qt.onLoaded();
  assert.equal(e.scope.window.__fcAppReady, false, 'Emscripten initialization is not native GUI readiness');
  const loop = e.startLoop();
  await e.tick(15000);
  assert.equal(e.calls.length, 0, 'the workbench probe must wait for native startup even after eight seconds');
  assert.equal(await e.raw('direct bridge probe'), false);
  vm.runInContext('publishRect(); runPy("graphics autosave probe"); tick();', e.scope);
  await assert.rejects(vm.runInContext('rawPython("operation probe")', e.scope), /ainda está iniciando/);
  assert.equal(e.calls.length, 0, 'graphics, direct callers and operations share the closed boundary');
  assert.equal(e.live.size, 0, 'blocked direct calls release their allocated pointer');
  e.emit(marker);
  assert.equal(e.scope.window.__fcAppReady, true);
  await e.tick(15600);
  await loop;
  assert.equal(e.calls.length, 1, 'only the real workbench probe is released by the signal');
  assert.match(e.calls[0].text, /FCWORKREADY/);
  assert.equal(await e.raw('direct after readiness'), true);
  await vm.runInContext('runPy("graphics after readiness")', e.scope);
  vm.runInContext('publishRect()', e.scope);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  vm.runInContext('tick()', e.scope);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(e.calls.length, 5);
  assert.equal(e.calls.at(-1).text, 'graphics event pump probe');
  assert.equal(e.live.size, 0);
});

test('only the complete one-argument native marker can open the boundary', () => {
  const e = environment();
  e.config.qt.onLoaded();
  const retained = e.logger.log;
  for (const args of [
    [marker.trimEnd()], ['[fc] Init: Executing event loop...\n'],
    ['Init: Executing event loop…\n'], ['prefix ' + marker],
    [marker + 'suffix'], [marker, 'extra'], [new String(marker)],
    ['[fc] Init: Executing '], ['event loop…\n'], ['[fc] Init: Entering event loop\n'],
  ]) {
    assert.equal(e.emit(...args), e.result);
    assert.equal(e.scope.window.__fcAppReady, false);
  }
  e.scope.window.append(marker);
  assert.equal(e.scope.window.__fcAppReady, false, 'Module.print/append is not the native delivery contract');
  const receiver = { receiver: true };
  assert.equal(retained.call(receiver, marker), e.result);
  assert.equal(e.logs.at(-1).receiver, receiver);
  assert.deepEqual(e.logs.at(-1).args, [marker]);
  assert.equal(e.logger.log, e.originalLog);
  assert.equal(e.scope.window.__fcAppReady, true);
  e.scope.window.__fcAppReady = false;
  retained(marker);
  assert.equal(e.scope.window.__fcAppReady, false, 'a retained observer cannot announce readiness twice');
});

test('logger exceptions remain visible and cannot announce readiness', () => {
  const e = environment();
  e.scope.stopObservingNative();
  const originalError = new Error('original logger failure');
  const throwingLog = () => { throw originalError; };
  e.logger.log = throwingLog;
  e.scope.stopObservingNative = vm.runInContext('observeNativeEventLoop()', e.scope);
  assert.throws(() => e.emit(marker), error => error === originalError);
  assert.equal(e.scope.window.__fcAppReady, false);
  e.scope.stopObservingNative();
  assert.equal(e.logger.log, throwingLog);
});

test('disposal preserves a newer logger and disables any retained observer', () => {
  const e = environment(), retained = e.logger.log;
  const newer = () => 'new logger';
  e.logger.log = newer;
  e.scope.stopObservingNative();
  retained(marker);
  assert.equal(e.logger.log, newer);
  assert.equal(e.scope.window.__fcAppReady, false);
});

test('abort, exit and startup catch restore logging and close the Python boundary', async () => {
  for (const event of ['abort', 'exit', 'catch']) for (const wasReady of [false, true]) {
    const e = environment(), retained = e.logger.log;
    if (wasReady) e.emit(marker);
    if (event === 'abort') e.config.onAbort('native failure');
    else if (event === 'exit') e.config.qt.onExit({ crashed: true });
    else {
      const first = e.runtime.lastIndexOf('  } catch (error) {');
      const last = e.runtime.indexOf("\n  }\n}\n$('start').addEventListener", first);
      assert.ok(first >= 0 && last > first);
      const body = e.runtime.slice(first + '  } catch (error) {'.length, last);
      vm.runInContext('((error) => {' + body + '})(new Error("startup failure"));', e.scope);
    }
    assert.equal(e.logger.log, e.originalLog, event);
    retained(marker);
    assert.equal(e.scope.window.__fcAppReady, false, event);
    assert.equal(await e.raw('call after ' + event), false);
    assert.equal(e.calls.length, 0);
    assert.equal(e.live.size, 0);
  }
});

test('an early native signal retains the eight-second workbench delay and existing 180-second deadline', async () => {
  const fast = environment();
  fast.config.qt.onLoaded();
  fast.emit(marker);
  const loop = fast.startLoop();
  await fast.tick(8500);
  assert.equal(fast.calls.length, 0, 'the existing eight seconds are not shortened');
  await fast.tick(9100);
  await loop;
  assert.equal(fast.calls.length, 1);
  const absent = environment();
  absent.config.qt.onLoaded();
  const waiting = absent.startLoop();
  const failure = assert.rejects(waiting, /interface não concluiu a inicialização/);
  await absent.tick(181001);
  await failure;
  assert.equal(absent.calls.length, 0);
});

test('busy and rejected calls retain pointer ownership after native readiness', async () => {
  const e = environment();
  e.emit(marker);
  let release;
  e.engine.pending = new Promise(resolve => { release = resolve; });
  const first = e.raw('pending native call');
  assert.equal(await e.raw('overlapping native call'), false);
  assert.equal(e.calls.length, 1);
  release();
  assert.equal(await first, true);
  e.engine.pending = undefined;
  e.engine.failure = new Error('native rejection');
  assert.equal(await e.raw('rejected native call'), false);
  assert.equal(e.scope.window.__fcPyBusy, false);
  assert.equal(e.live.size, 0);
});

test('counterfactual old onLoaded contract demonstrably permits a premature Python call', async () => {
  const old = source.replace(
    'onLoaded: () => { readyAt = performance.now(); },',
    'onLoaded: () => { window.__fcAppReady = true; readyAt = performance.now(); },',
  );
  assert.notEqual(old, source);
  const e = environment(old);
  e.config.qt.onLoaded();
  assert.equal(await e.raw('premature call under old readiness contract'), true);
  assert.equal(e.calls.length, 1, 'the fixture must observe the defect instead of reporting a vacuous zero');
  assert.equal(e.live.size, 0);
});
