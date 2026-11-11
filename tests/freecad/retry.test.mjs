import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareDownload } from '../../cad/freecad/files.mjs';

test('the file-row retry preserves the exact frozen export result and original bytes', async () => {
  const source = Uint8Array.of(1, 2, 3, 4);
  let first, calls = 0, deliveries = 0;
  const file = prepareDownload({
    name: 'modelo.step', bytes: source,
    authorize: async result => {
      calls++;
      if (!first) { first = result; return false; }
      assert.equal(result, first, 'the same pending emission must reach the wallet');
      await result.deliver();
      return true;
    },
    deliver: async (content, name) => {
      deliveries++;
      assert.equal(name, 'modelo.step');
      assert.deepEqual([...new Uint8Array(await content.arrayBuffer())], [1, 2, 3, 4]);
    },
  });
  assert.equal(await file.run(), false);
  assert.ok(Object.isFrozen(first));
  source.fill(9);
  assert.equal(await file.run(), true);
  assert.equal(calls, 2);
  assert.equal(deliveries, 1);
  assert.equal(await file.run(), true);
  assert.equal(calls, 2, 'an already delivered file cannot start another authorization');
  assert.equal(deliveries, 1);
});

test('a different generated file cannot replace an interrupted emission', async () => {
  let interrupted, approvals = 0, deliveries = 0;
  const authorize = async result => {
    if (!interrupted) { interrupted = result; return false; }
    if (interrupted !== result) return false;
    approvals++;
    await result.deliver();
    return true;
  };
  const makeFile = () => prepareDownload({ name: 'modelo.step', bytes: Uint8Array.of(1, 2), authorize,
    deliver: async () => { deliveries++; } });
  const first = makeFile(), second = makeFile();
  assert.equal(await first.run(), false);
  assert.equal(await second.run(), false, 'even an identical separately generated file is a different result');
  assert.equal(deliveries, 0);
  assert.equal(await first.run(), true);
  assert.equal(approvals, 1);
  assert.equal(deliveries, 1);
});
