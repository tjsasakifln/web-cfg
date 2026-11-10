"use strict";
const { parentPort } = require("node:worker_threads");
const queue = [];
const canceled = new Set();
let busy = false;

function pump() {
  if (busy) return;
  const message = queue.shift();
  if (!message) return;
  if (canceled.delete(message.id)) return setImmediate(pump);
  busy = true;
  parentPort.postMessage({ id: message.id, started: true });
  if (message.action === "crash") throw new Error("intentional crash");
  if (message.action === "hang") return;
  const finish = () => {
    if (!canceled.delete(message.id)) parentPort.postMessage({ id: message.id, ok: true, value: { action: message.action } });
    busy = false;
    setImmediate(pump);
  };
  if (message.action === "rollover") {
    const { loadMs, queryMs = 0, duplicateLoadingMs } = message.filters;
    const loading = () => parentPort.postMessage({ id: message.id, phase: "snapshot_loading" });
    loading();
    if (duplicateLoadingMs != null) setTimeout(loading, duplicateLoadingMs);
    setTimeout(() => {
      parentPort.postMessage({ id: message.id, phase: "snapshot_ready" });
      setTimeout(finish, queryMs);
    }, loadMs);
    return;
  }
  if (message.action === "delay") {
    parentPort.postMessage({ id: message.id, phase: "snapshot_ready" });
    setTimeout(finish, message.filters?.delayMs ?? 25);
  } else finish();
}

parentPort.on("message", (message) => {
  if (message.cancel) {
    canceled.add(message.id);
    return;
  }
  queue.push(message);
  setImmediate(pump);
});
