import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowserEvidence } from './browser-evidence.mjs';

function fixture(t) {
  const errors = [];
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', (...args) => errors.push(args));
  const directory = mkdtempSync(join(tmpdir(), 'confenge-freecad-evidence-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const report = { checks: [] };
  return { directory, report, errors, evidence: createBrowserEvidence(report, directory),
    saved: () => JSON.parse(readFileSync(join(directory, 'browser.json'), 'utf8')) };
}

test('partial checkpoints are ordered, atomic and never announce success', t => {
  const { evidence, saved, directory } = fixture(t);
  assert.equal(saved().ok, false);
  assert.equal(saved().status, 'running');
  evidence.record('launcher verified');
  evidence.record('unsupported browser verified');
  evidence.phase('native:new-page');
  assert.deepEqual(saved().checks, ['launcher verified', 'unsupported browser verified']);
  assert.equal(saved().phase, 'native:new-page');
  assert.equal(saved().ok, false);
  evidence.complete();
  assert.equal(saved().ok, true);
  assert.equal(saved().status, 'passed');
  assert.deepEqual(readdirSync(directory), ['browser.json']);
});

test('the original failure is already saved before secondary diagnostics begin', async t => {
  const { evidence, saved, errors } = fixture(t);
  evidence.phase('boot:wait-ready');
  const original = new Error('original boot failure');
  assert.equal(evidence.fail(original), original);
  assert.equal(saved().ok, false);
  assert.equal(saved().failedPhase, 'boot:wait-ready');
  assert.equal(saved().failure, original.stack);
  assert.equal(JSON.parse(errors[0][0]).failure, original.stack);
  await evidence.diagnostic('page-state', () => {
    assert.equal(saved().failure, original.stack);
    assert.equal(JSON.parse(errors[0][0]).failure, original.stack);
    throw new Error('secondary CDP failure');
  });
  assert.equal(saved().failure, original.stack);
  assert.match(saved().diagnosticErrors[0].error, /secondary CDP failure/);
  assert.deepEqual(await evidence.diagnostic('available-state', async () => ({ ready: false })), { ready: false });
  assert.throws(() => evidence.complete(), error => error === original);
});

test('an unresponsive secondary diagnostic ends at its own five-second deadline', async t => {
  const { evidence, saved } = fixture(t);
  const original = new Error('original failure before an unresponsive CDP command');
  evidence.fail(original);
  assert.equal(await evidence.diagnostic('unresponsive', () => new Promise(() => {})), undefined);
  assert.match(saved().diagnosticErrors[0].error, /Diagnostic unresponsive exceeded 5000 ms/);
  assert.equal(saved().ok, false);
  assert.equal(saved().failure, original.stack);
  assert.throws(() => evidence.complete(), error => error === original);
});

test('a persistence or cleanup error cannot replace the original failure', t => {
  const { evidence, directory } = fixture(t);
  const original = new Error('original assertion failure');
  rmSync(directory, { recursive: true });
  assert.equal(evidence.fail(original), original);
  assert.doesNotThrow(() => evidence.diagnosticFailure('cleanup:browser', new Error('secondary close failure')));
  assert.equal(evidence.fail(new Error('later failure')), original);
  assert.throws(() => evidence.complete(), error => error === original);
});
