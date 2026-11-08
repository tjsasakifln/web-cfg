import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function tools(local = storage(), session = storage(), throwingGetters = false) {
  const window = {};
  if (throwingGetters) {
    Object.defineProperty(window, 'localStorage', {get() { throw Error('SecurityError'); }});
    Object.defineProperty(window, 'sessionStorage', {get() { throw Error('SecurityError'); }});
  } else {
    window.localStorage = local;
    window.sessionStorage = session;
  }
  window.window = window;
  const sandbox = {
    window,
    document: {querySelectorAll() { return []; }, addEventListener() {}},
    Blob,
    Date,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../../../assets/js/tools-common.js', import.meta.url), 'utf8'), sandbox);
  return window.ConfengeTools;
}

{
  const local = storage();
  const firstTab = tools(local, storage());
  assert.equal(firstTab.saveDraft('example', 1, {value:'primeira aba'}), true);
  const secondTab = tools(local, storage());
  assert.deepEqual({...secondTab.loadDraft('example', 1)}, {value:'primeira aba'});
  assert.equal(secondTab.saveDraft('example', 1, {value:'segunda aba'}), true);
  assert.deepEqual({...firstTab.loadDraft('example', 1)}, {value:'primeira aba'});
  assert.deepEqual({...secondTab.loadDraft('example', 1)}, {value:'segunda aba'});
  firstTab.clearDraft('example');
  assert.equal(firstTab.loadDraft('example', 1), null);
  assert.deepEqual({...secondTab.loadDraft('example', 1)}, {value:'segunda aba'});
}

{
  const unavailable = tools(storage(), storage(), true);
  assert.equal(unavailable.saveDraft('security-error', 1, {value:1}), false);
  assert.equal(unavailable.loadDraft('security-error', 1), null);
  assert.doesNotThrow(() => unavailable.clearDraft('security-error'));
}

{
  const local = storage();
  const legacy = tools(local, storage());
  assert.equal(legacy.saveState('legacy', 3, {kept:true}), true);
  const migrated = tools(local, storage());
  assert.deepEqual({...migrated.loadDraft('legacy', 3)}, {kept:true});
}

{
  const blocked = {getItem() { return null; }, setItem() { throw Error('blocked'); }, removeItem() {}};
  const fallback = tools(storage(), blocked);
  assert.equal(fallback.saveDraft('blocked-session', 1, {value:1}), false);
  assert.deepEqual({...fallback.loadDraft('blocked-session', 1)}, {value:1});
}

console.log('PASS draft storage isolates tabs, restores legacy state and reports session failure');
