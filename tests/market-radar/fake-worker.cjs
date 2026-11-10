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
  if (message.action === "delay") setTimeout(finish, 25);
  else finish();
}

parentPort.on("message", (message) => {
  if (message.cancel) {
    canceled.add(message.id);
    return;
  }
  queue.push(message);
  setImmediate(pump);
});
