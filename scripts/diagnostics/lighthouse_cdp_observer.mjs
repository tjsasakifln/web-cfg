/**
 * Diagnostic-only ESM preload for Lighthouse 13.4.1 / Puppeteer 25.8.0.
 *
 * Set LH_CDP_OBSERVER_DIR and preload with NODE_OPTIONS=--import=<this file>.
 * Dependencies resolve from cwd, not the directory containing this preload.
 * Only lighthouse_measure_child.mjs activates it automatically.
 *
 * Puppeteer's existing protocol logger calls are the observation points. No
 * CDP method, transport, callback, promise or exception handler is replaced.
 * Only the versioned Node logging dependency is redirected for SEND/RECV.
 * The hot path buffers allowlisted metadata; it performs no file I/O or await.
 * JSONL is written at startup and process exit, so SIGKILL leaves an explicitly
 * incomplete file. All measurements, including any failures, stay untouched.
 *
 * hrtime brackets are observer times, not proof of a common Chrome clock.
 * Network timestamps/IDs and any clock marker ALREADY sent by Lighthouse may
 * support an independently verified alignment. This module sends no marker.
 */
import { closeSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const METHOD = /^\{"method":"([A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*)"[,}]/;
const SEND_END = /,"id":([1-9][0-9]*)(?:,"sessionId":"([A-Za-z0-9_.:-]{1,128})")?\}$/;
const SESSION_END = /,"sessionId":"([A-Za-z0-9_.:-]{1,128})"\}$/;
const RESPONSE = /^\{"id":([1-9][0-9]*),"(result|error)":/;
const EVENTS = new Set([
  'Debugger.paused', 'Debugger.resumed',
  'Target.attachedToTarget', 'Target.detachedFromTarget',
  'Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFinished',
  'Page.frameNavigated',
]);
const safeId = value => typeof value === 'string' && SAFE_ID.test(value) ? value : undefined;
const encode = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item);
function writeLine(fd, value) {
  const bytes = Buffer.from(encode(value) + '\n');
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    if (written === 0) throw new Error('Observer write made no progress');
    offset += written;
  }
}

/** Exported for checks against the real installed Puppeteer connection. */
export function createMetadataObserver({ maxRecords = 50000, maxPending = 10000 } = {}) {
  if (![maxRecords, maxPending].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('Observer capacities must be positive integers');
  }
  const records = [];
  const contexts = [];
  const stats = {
    callbacks: 0, malformed_messages: 0, oversized_metadata: 0,
    dropped_records: 0, dropped_pending: 0, unmatched_responses: 0,
    unpaired_loggers: 0, observer_errors: 0,
    callback_total_ns: 0n, callback_max_ns: 0n,
  };
  let awaitingReceive = null;

  function context() {
    const value = { id: contexts.length + 1, pending: new Map() };
    contexts.push(value);
    return value;
  }

  function metadata(raw, record) {
    // Large traces, response bodies and debugger call frames are NEVER parsed.
    // Only these small event/marker envelopes need selected metadata fields.
    if (raw.length > 65536) { stats.oversized_metadata++; return; }
    const params = JSON.parse(raw).params;
    if (!params || typeof params !== 'object') return;
    if (record.method === 'Tracing.recordClockSyncMarker') {
      record.sync_id = safeId(params.syncId);
    } else if (record.method.startsWith('Network.')) {
      record.request_id = safeId(params.requestId);
      record.frame_id = safeId(params.frameId);
      record.loader_id = safeId(params.loaderId);
      if (Number.isFinite(params.timestamp) && params.timestamp >= 0) {
        record.cdp_timestamp_s = params.timestamp;
      }
    } else if (record.method === 'Page.frameNavigated') {
      record.frame_id = safeId(params.frame?.id);
      record.loader_id = safeId(params.frame?.loaderId);
    } else if (record.method.startsWith('Target.')) {
      record.child_session_id = safeId(params.sessionId);
      record.target_id = safeId(params.targetInfo?.targetId);
      if (typeof params.waitingForDebugger === 'boolean') {
        record.waiting_for_debugger = params.waitingForDebugger;
      }
    }
  }

  function capture(ctx, direction, raw, begin) {
    if (typeof raw !== 'string') { stats.malformed_messages++; return null; }
    let record;
    if (direction === 'send') {
      const method = METHOD.exec(raw)?.[1];
      // _rawSend's exact JSON.stringify order puts identity after params.
      // Inspect only the tail; never deserialize an evaluate body or script.
      const identity = SEND_END.exec(raw.slice(-256));
      if (!method || !identity) { stats.malformed_messages++; return null; }
      const id = Number(identity[1]);
      if (!Number.isSafeInteger(id)) { stats.malformed_messages++; return null; }
      record = { phase: 'send', method, command_id: id, session_id: identity[2] };
      if (method === 'Tracing.recordClockSyncMarker') metadata(raw, record);
      if (ctx.pending.size < maxPending) {
        ctx.pending.set(id, { method, session_id: identity[2], sync_id: record.sync_id });
      } else stats.dropped_pending++;
    } else {
      const response = RESPONSE.exec(raw);
      if (response) {
        const id = Number(response[1]);
        const sent = ctx.pending.get(id);
        if (!sent) { stats.unmatched_responses++; return null; }
        ctx.pending.delete(id);
        record = { ...sent, phase: response[2] === 'error' ? 'response_error' : 'response', command_id: id };
      } else {
        const method = METHOD.exec(raw)?.[1];
        if (!method) { stats.malformed_messages++; return null; }
        if (!EVENTS.has(method)) return null;
        record = { phase: 'event', method, session_id: SESSION_END.exec(raw.slice(-256))?.[1] };
        if (method !== 'Debugger.paused' && method !== 'Debugger.resumed') metadata(raw, record);
      }
    }
    record.connection_index = ctx.id;
    record.pid = process.pid;
    record.observed_begin_ns = begin;
    if (records.length === maxRecords) { stats.dropped_records++; return null; }
    records.push(record);
    return record;
  }

  function logger(ctx, direction) {
    const result = raw => {
      const begin = process.hrtime.bigint();
      let record;
      stats.callbacks++;
      try { record = capture(ctx, direction, raw, begin); }
      catch { stats.observer_errors++; }
      const end = process.hrtime.bigint();
      if (record) record.observed_end_ns = end;
      const cost = end - begin;
      stats.callback_total_ns += cost;
      if (cost > stats.callback_max_ns) stats.callback_max_ns = cost;
    };
    Object.defineProperty(result, 'enabled', { value: true });
    return result;
  }

  function wrapDebuglog(original, prefixes) {
    return function (...args) {
      if (args[0] === prefixes.cdpSend) {
        if (awaitingReceive) stats.unpaired_loggers++;
        awaitingReceive = context();
        return logger(awaitingReceive, 'send');
      }
      if (args[0] === prefixes.cdpReceive) {
        // Connection's constructor obtains SEND then RECV synchronously.
        if (!awaitingReceive) stats.unpaired_loggers++;
        const ctx = awaitingReceive || context();
        awaitingReceive = null;
        return logger(ctx, 'receive');
      }
      return Reflect.apply(original, this, args);
    };
  }

  return {
    records, stats, wrapDebuglog, capacity: { max_records: maxRecords, max_pending: maxPending },
    summary: () => ({ ...stats, connections: contexts.length,
      pending_commands: contexts.reduce((sum, ctx) => sum + ctx.pending.size, 0),
      unpaired_loggers: stats.unpaired_loggers + Number(Boolean(awaitingReceive)) }),
  };
}

function processIdentity() {
  const readStat = path => {
    const text = readFileSync(path, 'utf8');
    const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
    return { id: Number(text.slice(0, text.indexOf(' '))), start_ticks: fields[19] };
  };
  const main = readStat('/proc/self/stat');
  const thread = readStat('/proc/thread-self/stat');
  const bootId = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  return { pid: main.id, ppid: process.ppid, tid: thread.id,
    process_start_ticks: main.start_ticks, thread_start_ticks: thread.start_ticks,
    boot_id: safeId(bootId) };
}

/** Only the logging dependency is changed. Core prototypes remain identical. */
export async function installObserver(directory, { root = process.cwd() } = {}) {
  const requireHere = createRequire(join(root, 'package.json'));
  const lighthouseEntry = requireHere.resolve('lighthouse');
  const requireLighthouse = createRequire(lighthouseEntry);
  const lh = JSON.parse(readFileSync(requireHere.resolve('lighthouse/package.json'), 'utf8'));
  const pptr = JSON.parse(readFileSync(requireLighthouse.resolve('puppeteer-core/package.json'), 'utf8'));
  if (lh.version !== '13.4.1' || pptr.version !== '25.8.0') {
    throw new Error('CDP observer requires Lighthouse 13.4.1 and Puppeteer 25.8.0');
  }
  const pptrEntry = pathToFileURL(requireLighthouse.resolve('puppeteer-core'));
  // Initializes Node dependencies before replacing only the logger destination.
  await import(pptrEntry.href);
  const { environment } = await import(new URL('./environment.js', pptrEntry));
  const { DEBUG_PREFIXES } = await import(new URL('./common/Debug.js', pptrEntry));
  if (typeof environment.value.debuglog !== 'function') throw new Error('Missing Puppeteer Node logger');

  const identity = processIdentity();
  const observer = createMetadataObserver();
  const original = environment.value.debuglog;
  const wrapped = observer.wrapDebuglog(original, DEBUG_PREFIXES);
  mkdirSync(directory, { recursive: true });
  const file = join(resolve(directory), `cdp-${identity.pid}-${identity.process_start_ticks}.jsonl`);
  const fd = openSync(file, 'wx', 0o600);
  let measurement = { spec_valid: false };
  try {
    const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const lhr = typeof spec.out_json === 'string' ? relative(root, resolve(spec.out_json)) : null;
    const validLhr = typeof lhr === 'string' && /^docs\/lighthouse-runs\/[A-Za-z0-9_-]+\.json$/.test(lhr);
    const validRun = Number.isSafeInteger(spec.run) && spec.run >= 0;
    const validAttempt = Number.isSafeInteger(spec.attempt) && spec.attempt >= 1;
    measurement = { run: validRun ? spec.run : null, attempt: validAttempt ? spec.attempt : null,
      preflight: spec.preflight === true, lhr_relative_path: validLhr ? lhr : null,
      spec_valid: validRun && validAttempt && (spec.preflight === true || validLhr) };
  } catch { /* explicit install in a source-level check need not have a spec */ }
  writeLine(fd, { phase: 'observer_start', schema: 'confenge.cdp-observer/1.0',
    qualification_eligible: false, clock: 'process.hrtime.bigint',
    clock_alignment_proven: false, ...identity, ...measurement, ...observer.capacity,
    observed_begin_ns: process.hrtime.bigint() });

  let flushed = false;
  function flush() {
    if (flushed) return;
    flushed = true;
    try {
      for (const record of observer.records) writeLine(fd, record);
      const summary = observer.summary();
      const complete = measurement.spec_valid && ['malformed_messages', 'oversized_metadata', 'dropped_records',
        'dropped_pending', 'unmatched_responses', 'unpaired_loggers', 'observer_errors',
        'pending_commands'].every(key => summary[key] === 0);
      writeLine(fd, { phase: 'observer_end', pid: process.pid,
        status: complete ? 'complete' : 'incomplete', qualification_eligible: false,
        records: observer.records.length, observed_begin_ns: process.hrtime.bigint(), ...summary });
    } catch { process.stderr.write('LH_CDP_OBSERVER_WRITE_FAILED\n'); }
    finally { try { closeSync(fd); } catch { /* evidence remains incomplete */ } }
  }
  environment.value.debuglog = wrapped;
  process.once('exit', flush);
  return { file, observer, flush, restore() {
    if (environment.value.debuglog === wrapped) environment.value.debuglog = original;
    process.removeListener('exit', flush);
  } };
}

if (process.env.LH_CDP_OBSERVER_DIR && basename(process.argv[1] || '') === 'lighthouse_measure_child.mjs') {
  await installObserver(process.env.LH_CDP_OBSERVER_DIR);
}
