import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { currentDocument, drawingWarnings, exportRequest, EXPORT_FORMATS, MAX_EXPORT_BYTES } from '../../cad/host-protocol.mjs';

const message = (overrides = {}) => ({
  type: 'confenge-cad:export', id: 'save:fixture_1', name: 'planta.dwg',
  bytes: Uint8Array.of(65, 67, 49, 48, 51, 50), ...overrides,
});
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// Execute the actual browser scripts with an injected module loader and a small
// DOM fixture. The CAD and wallet are explicit substitutes; these tests exercise
// the parent/frame protocol and do not claim to validate the WASM engine.
function script(source, context) {
  const body = source.replace(/^import\s+\{[^}]+\}\s+from\s+'\.\/host-protocol\.mjs';\s*/m, '')
    .replace(/\bimport\(/g, '__loadModule(');
  return vm.runInNewContext(`(async () => {\n${body}\n})()`, context);
}
function clock() {
  let next = 0;
  const tasks = new Map();
  return {
    tasks,
    setTimeout(fn, ms) { const id = ++next; tasks.set(id, { fn, ms }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    fire(id) { const task = tasks.get(id); tasks.delete(id); task.fn(); },
  };
}
async function frameFixture() {
  const timers = clock(), listeners = new Map(), sent = [];
  const parent = { postMessage(data, origin, transfer) {
    sent.push({ data: structuredClone(data, { transfer: transfer || [] }), origin });
  } };
  const window = { parent, addEventListener(name, callback) { listeners.set(name, callback); } };
  let serial = 0;
  const origin = 'https://confenge.example.test';
  const running = script(await readFile(new URL('../../cad/editor/start.js', import.meta.url), 'utf8'), {
    window, location: { origin }, document: {}, Uint8Array, ArrayBuffer,
    crypto: { randomUUID: () => `fixture-${++serial}` },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    // Leave boot pending after the real export hook and message listener install.
    __loadModule: () => new Promise(() => {}),
  });
  void running;
  return { window, parent, origin, sent, timers,
    receive(data, source = parent, from = origin) { listeners.get('message')({ data, source, origin: from }); } };
}

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.handlers = new Map();
    this.attributes = new Map(); this.hidden = false; this.disabled = false; this.dataset = {};
    this.style = { setProperty() {} }; this.textContent = ''; this.inert = false;
    this.classes = new Set(); this.classList = {
      contains: name => this.classes.has(name), add: name => this.classes.add(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
    this.selectors = new Map();
  }
  cloneNode() { return new Element(this.tagName); }
  querySelector(selector) { return this.selectors.get(selector); }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  prepend(node) { node.parentElement = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(name, handler) { const list = this.handlers.get(name) || []; list.push(handler); this.handlers.set(name, list); }
  emit(name, event = {}) { return Promise.all((this.handlers.get(name) || []).map(handler => handler(event))); }
  getBoundingClientRect() { return { height: 50, top: 50 }; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  matches(selector) { return selector.split(',').some(part => this.classes.has(part.trim().slice(1))); }
  focus() {}
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  click() { this.onClick?.(); void this.emit('click'); }
}

async function parentFixture(wallet = async request => { await request.deliver(); return true; }, initialFailure = false) {
  const timers = clock(), sent = [], calls = [], downloads = [], controlRequests = [];
  const origin = 'https://confenge.example.test';
  const editor = new Element(), body = new Element('body'), header = new Element('header');
  body.append(editor, header);
  for (const selector of ['.cad-doc', '[data-file]', '[data-open]', '[data-new]', '[data-example]',
    '[data-save]', '[data-fit]', '[data-expand]', '[data-page]', '.cad-stage', '.cad-status',
    '.cad-issue', '.cad-name', '.cad-caption', '.cad-welcome', '.cad-help']) {
    const node = new Element(); editor.selectors.set(selector, node); editor.append(node);
  }
  editor.querySelector('.cad-issue').selectors.set('ul', new Element('ul'));
  editor.querySelector('.cad-issue').selectors.set('p', new Element('p'));
  editor.querySelector('[data-expand]').selectors.set('span', new Element('span'));
  const window = new Element('window'); window.scrollBy = () => {};
  let frame, frameCount = 0, revision = 7;
  const document = {
    body, documentElement: new Element('html'),
    getElementById: id => id === 'cad-editor' ? editor : null,
    querySelector: selector => selector === '.site-header' ? header : new Element('img'),
    addEventListener() {},
    createElement(tag) {
      const node = new Element(tag);
      if (tag === 'iframe') {
        frame = node; frameCount++;
        const drawing = new Element('canvas');
        node.contentDocument = { querySelector: selector => selector === 'canvas' ? drawing : null };
        drawing.ownerDocument = node.contentDocument;
        node.contentWindow = {
          postMessage: (data, targetOrigin) => sent.push({ data, targetOrigin }),
          ocsControl: { request: async payload => {
            controlRequests.push(payload);
            if (['new', 'open', 'run', 'action'].includes(payload.op)) {
              assert.match(payload.request_id, /^[0-9a-f-]{36}$/);
              assert.equal(payload.document_id, 1);
              assert.equal(payload.revision, revision, 'Mutations must use the latest observed document revision.');
              revision++;
            }
            return { ok: true, document_id: 1, revision,
              documents: [{ id: 1, title: 'planta.dwg', dirty: true, start: false, revision }] };
          } },
        };
      }
      if (tag === 'a') node.onClick = () => downloads.push({ name: node.download, url: node.href });
      return node;
    },
  };
  window.document = document;
  const blobs = new Map(); let blobId = 0;
  await script(await readFile(new URL('../../cad/editor.js', import.meta.url), 'utf8'), {
    document, window, location: { origin }, HTMLElement: Element,
    currentDocument, drawingWarnings, exportRequest, Blob, ArrayBuffer, Uint8Array,
    crypto: { randomUUID },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    setInterval: () => 1, clearInterval() {}, requestAnimationFrame: fn => fn(),
    URL: { createObjectURL(blob) { const url = `blob:fixture-${++blobId}`; blobs.set(url, blob); return url; }, revokeObjectURL() {} },
    __loadModule: async path => {
      assert.equal(path, '/assets/js/tool-credits.mjs');
      return { exportToolResult: request => { calls.push(request); return wallet(request); } };
    },
  });
  async function startEditor(fail = false) {
    const boot = editor.querySelector('[data-new]').emit('click');
    await window.emit('message', { source: frame.contentWindow, origin, data: fail
      ? { type: 'confenge-cad:failed', error: 'A área gráfica não ficou disponível.' }
      : { type: 'confenge-cad:ready' } });
    await boot;
    if (!fail) assert.equal(editor.querySelector('.cad-status').dataset.error, 'false',
      'The simulated editor must complete the new-drawing operation, not merely load its frame.');
  }
  await startEditor(initialFailure);
  return { editor, get frame() { return frame; }, get frameCount() { return frameCount; }, startEditor,
    sent, calls, downloads, blobs, origin, controlRequests,
    async receive(data, source = frame.contentWindow, from = origin) {
      await window.emit('message', { source, origin: from, data }); await tick();
    } };
}

test('exports preserve the exact byte window and normalize only the basename', () => {
  const storage = Uint8Array.of(90, 1, 2, 3, 91);
  for (const bytes of [storage.subarray(1, 4), new DataView(storage.buffer, 1, 3)]) {
    const request = exportRequest(message({ bytes, name: 'C:\\obra\\revisão final.DWG' }));
    assert.equal(request.name, 'revisão final.DWG'); assert.equal(request.format, 'dwg');
    assert.deepEqual([...request.bytes], [1, 2, 3]);
  }
  assert.deepEqual([...exportRequest(message({ bytes: Uint8Array.of(4, 5).buffer })).bytes], [4, 5]);
});

test('empty, unsupported, malformed and oversized exports are refused before delivery', () => {
  for (const value of [null, {}, message({ type: 'another:message' }), message({ id: '' }),
    message({ id: 'a'.repeat(129) }), message({ id: 'bad id' }), message({ name: 'a\u0000.dwg' }),
    message({ name: 'a\n.dwg' }), message({ name: 'a'.repeat(513) + '.dwg' }),
    message({ name: '../../' }), message({ name: '.dwg' }), message({ name: 'planta.html' }),
    message({ bytes: [1, 2] }), message({ bytes: 'AC1032' }), message({ bytes: new Uint8Array() })]) {
    assert.throws(() => exportRequest(value));
  }
  const large = new Uint8Array(MAX_EXPORT_BYTES + 1);
  assert.throws(() => exportRequest(message({ bytes: large })), /128 MiB/);
  assert.equal(exportRequest(message({ bytes: large.subarray(0, MAX_EXPORT_BYTES) })).bytes.byteLength, MAX_EXPORT_BYTES);
});

test('document status uses the active drawing, not the first tab', () => {
  const drawing = { id: 9, start: false, title: 'planta.dwg', dirty: true };
  assert.equal(currentDocument({ document_id: 9, documents: [{ id: 1, start: true }, drawing] }), drawing);
  assert.equal(currentDocument({ document_id: 1, documents: [{ id: 1, start: true }, drawing] }), undefined);
  assert.equal(currentDocument(undefined), undefined);
  assert.equal(drawingWarnings({ missing_fonts: ['Font'], xrefs: [{ status: 'missing', name: 'base.dwg' }] }).length, 2);
});

test('all offered export formats have a matching wallet contract', () => {
  const require = createRequire(import.meta.url);
  const { LOCAL_FORMATS } = require('../../runtime/tools-commerce/exports.cjs');
  assert.deepEqual([...EXPORT_FORMATS].sort(), [...LOCAL_FORMATS['cad-editor']].sort());
});

test('a failed initial boot can be retried even if the control API was installed', async () => {
  const f = await parentFixture(undefined, true);
  const stage = f.editor.querySelector('.cad-stage');
  assert.equal(stage.children.filter(node => node.tagName === 'IFRAME').length, 0);
  assert.equal(f.editor.querySelector('[data-new]').disabled, false);
  await f.startEditor();
  assert.equal(f.frameCount, 2, 'Retry must construct a new frame instead of reusing the rejected boot Promise.');
  assert.equal(stage.children.filter(node => node.tagName === 'IFRAME').length, 1);
  assert.equal(f.editor.querySelector('[data-save]').hidden, false);
});

test('mutating controls identify their request and target the latest document revision', async () => {
  const f = await parentFixture();
  await f.editor.querySelector('[data-fit]').emit('click');
  await f.editor.querySelector('[data-save]').emit('click');
  const mutations = f.controlRequests.filter(request => request.op !== 'state');
  assert.deepEqual(mutations.map(request => request.op), ['new', 'action', 'run']);
  assert.deepEqual(mutations.map(request => request.revision), [7, 8, 9]);
  assert.equal(new Set(mutations.map(request => request.request_id)).size, mutations.length);
  assert.equal(mutations.at(-1).cmd, 'SAVEAS');
});

test('frame ignores foreign origins, sibling frames and malformed acknowledgements', async () => {
  const f = await frameFixture();
  let settled = false;
  const promise = f.window.openCadStudioSaveFile('planta.dwg', Uint8Array.of(1, 2, 3));
  promise.then(() => { settled = true; });
  const request = f.sent[0];
  assert.equal(request.origin, f.origin); assert.deepEqual([...request.data.bytes], [1, 2, 3]);
  const ack = { type: 'confenge-cad:export-result', id: request.data.id, ok: true };
  f.receive(ack, f.parent, 'https://foreign.example.test');
  f.receive(ack, {});
  f.receive({ ...ack, ok: 'true' });
  f.receive({ ...ack, id: 'another-request' });
  await tick(); assert.equal(settled, false);
  f.receive({ ...ack, ok: false });
  assert.equal(await promise, false); assert.equal(f.timers.tasks.size, 0);
});

test('frame success, failure and timeout settle once and never silently succeed', async () => {
  for (const outcome of ['success', 'failure', 'timeout']) {
    const f = await frameFixture();
    const promise = f.window.openCadStudioSaveFile('planta.dwg', Uint8Array.of(1));
    const observed = promise.then(value => ({ value }), error => ({ error: error.message }));
    const ack = { type: 'confenge-cad:export-result', id: f.sent[0].data.id, ok: true };
    if (outcome === 'success') f.receive(ack);
    else if (outcome === 'failure') f.receive({ ...ack, ok: false, error: 'Falha na autorização.' });
    else f.timers.fire([...f.timers.tasks.keys()][0]);
    const result = await observed;
    if (outcome === 'success') assert.equal(result.value, true);
    else assert.match(result.error, outcome === 'failure' ? /autorização/ : /não foi concluída/);
    f.receive(ack); assert.equal(f.timers.tasks.size, 0);
  }
});

test('parent refuses foreign/sibling export requests and invalid payloads', async () => {
  const f = await parentFixture();
  await f.receive(message(), f.frame.contentWindow, 'https://foreign.example.test');
  await f.receive(message(), {});
  assert.equal(f.calls.length, 0); assert.equal(f.sent.length, 0);
  await f.receive(message({ name: 'payload.html' }));
  assert.equal(f.calls.length, 0); assert.equal(f.downloads.length, 0);
  assert.equal(f.sent.at(-1).data.ok, false);
  assert.equal(f.sent.at(-1).targetOrigin, f.origin);
});

test('parent waits for authorization, rejects a concurrent export and delivers exact bytes once', async () => {
  let release;
  const f = await parentFixture(request => new Promise(resolve => {
    release = async () => { await request.deliver(); resolve(true); };
  }));
  await f.receive(message());
  assert.equal(f.calls.length, 1); assert.equal(f.downloads.length, 0); assert.equal(f.sent.length, 0);
  await f.receive(message({ id: 'concurrent' }));
  assert.equal(f.calls.length, 1); assert.equal(f.sent.at(-1).data.ok, false);
  await release(); await tick();
  assert.equal(f.sent.at(-1).data.ok, true); assert.equal(f.downloads.length, 1);
  assert.equal(f.downloads[0].name, 'planta.dwg');
  const saved = f.blobs.get(f.downloads[0].url);
  assert.deepEqual([...new Uint8Array(await saved.arrayBuffer())], [65, 67, 49, 48, 51, 50]);
  await f.receive(message());
  assert.equal(f.calls.length, 1); assert.equal(f.downloads.length, 1);
});

test('parent cancellation and authorization failure never deliver a file', async () => {
  for (const wallet of [async () => false, async () => { throw new Error('Carteira indisponível.'); }]) {
    const f = await parentFixture(wallet);
    await f.receive(message());
    assert.equal(f.downloads.length, 0); assert.equal(f.sent.at(-1).data.ok, false);
    assert.equal(f.editor.getAttribute('aria-busy'), 'false');
    assert.equal(f.editor.querySelector('[data-open]').disabled, false);
  }
});
