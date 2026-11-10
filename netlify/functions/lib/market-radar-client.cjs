"use strict";

const { Worker } = require("node:worker_threads");
const path = require("node:path");

const MAX_QUEUE = 4;
const TIMEOUT_MS = 15_000;
const SNAPSHOT_TIMEOUT_MS = 50_000;
const QUEUE_TIMEOUT_MS = 5_000;
const HANDLER_TIMEOUT_MS = SNAPSHOT_TIMEOUT_MS + QUEUE_TIMEOUT_MS + 2_000;

function unavailable(code = "data_unavailable", status = 503, message = "Dados do radar indisponíveis.") {
  return Object.assign(new Error(message), { code, status });
}

function createClient({
  workerFile = path.join(__dirname, "market-radar-worker.cjs"),
  timeoutMs = TIMEOUT_MS,
  bootTimeoutMs = SNAPSHOT_TIMEOUT_MS,
  enqueueTimeoutMs = QUEUE_TIMEOUT_MS,
  maxQueue = MAX_QUEUE,
  backoffBaseMs = 250,
} = {}) {
  let worker = null;
  let sequence = 0;
  let failures = 0;
  let retryAt = 0;
  let warmed = false;
  const pending = new Map();

  function rejectPending(reason) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      clearTimeout(request.enqueueTimer);
      request.reject(reason);
    }
    pending.clear();
  }

  function stop(reason, { terminate = true } = {}) {
    const current = worker;
    worker = null;
    warmed = false;
    const termination = terminate && current ? current.terminate().catch(() => {}) : Promise.resolve();
    rejectPending(reason);
    failures = Math.min(6, failures + 1);
    retryAt = Date.now() + Math.min(30_000, backoffBaseMs * (2 ** failures));
    return termination;
  }

  function armDeadline(request, deadline, code) {
    clearTimeout(request.timer);
    request.deadline = deadline;
    request.timeoutCode = code;
    request.timer = setTimeout(() => stop(unavailable(code)), Math.max(1, Math.ceil(deadline - performance.now())));
    request.timer.unref();
  }

  function start() {
    if (worker) return worker;
    if (Date.now() < retryAt) throw unavailable("worker_backoff");
    const instance = new Worker(workerFile);
    instance.on("message", (message) => {
      if (worker !== instance) return;
      const request = pending.get(message.id);
      if (!request) return;
      const now = performance.now();
      if (request.deadline != null && now >= request.deadline) {
        stop(unavailable(request.timeoutCode));
        return;
      }
      if (message.started) {
        if (request.phase !== "queued") return;
        clearTimeout(request.enqueueTimer);
        request.phase = "running";
        request.snapshotDeadline = now + bootTimeoutMs;
        armDeadline(request, warmed ? now + timeoutMs : request.snapshotDeadline, "query_timeout");
        return;
      }
      if (message.phase) {
        if (message.phase === "snapshot_loading" && request.phase === "running") {
          request.phase = "loading";
          armDeadline(request, request.snapshotDeadline, "snapshot_load_timeout");
        } else if (message.phase === "snapshot_ready" && request.phase === "loading") {
          request.phase = "query";
          // SQL gets its own budget within the original snapshot deadline.
          armDeadline(request, Math.min(now + timeoutMs, request.snapshotDeadline), "query_timeout");
        }
        return;
      }
      pending.delete(message.id);
      clearTimeout(request.timer);
      clearTimeout(request.enqueueTimer);
      if (pending.size === 0) instance.unref();
      failures = 0;
      if (message.ok) {
        warmed = true;
        request.resolve(message.value);
      }
      else request.reject(unavailable(message.error, message.status, message.message));
    });
    instance.on("error", () => {
      if (worker === instance) stop(unavailable("worker_failed"));
    });
    instance.on("exit", () => {
      if (worker !== instance) return;
      stop(unavailable("worker_failed"), { terminate: false });
    });
    instance.unref();
    worker = instance;
    return worker;
  }

  function request(action, root, filters) {
    if (pending.size >= maxQueue) return Promise.reject(unavailable("radar_busy", 503, "O radar está ocupado. Tente novamente."));
    let target;
    try { target = start(); } catch (error) { return Promise.reject(error); }
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const enqueueTimer = setTimeout(() => {
        const request = pending.get(id);
        if (!request) return;
        pending.delete(id);
        try { target.postMessage({ id, cancel: true }); } catch {}
        if (pending.size === 0) target.unref();
        reject(unavailable("queue_timeout", 503, "A fila do radar excedeu o tempo disponível."));
      }, enqueueTimeoutMs);
      enqueueTimer.unref();
      pending.set(id, { resolve, reject, timer: null, enqueueTimer, phase: "queued" });
      target.ref();
      target.postMessage({ id, action, root, filters });
    });
  }

  return { request, stop: () => stop(unavailable("test_stop")), pendingCount: () => pending.size };
}

const singleton = createClient();
module.exports = { request: singleton.request, _stopForTests: singleton.stop, createClient, MAX_QUEUE, TIMEOUT_MS, HANDLER_TIMEOUT_MS };
