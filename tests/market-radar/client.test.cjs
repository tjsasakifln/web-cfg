"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createClient } = require("../../netlify/functions/lib/market-radar-client.cjs");

const workerFile = path.join(__dirname, "fake-worker.cjs");

test("bounded queue cancels queued work and timeout kills active native work", async () => {
  const client = createClient({ workerFile, timeoutMs: 1_000, bootTimeoutMs: 1_000, enqueueTimeoutMs: 500, maxQueue: 2, backoffBaseMs: 1 });
  const first = client.request("hang", "x").catch((error) => error);
  const second = client.request("ok", "x").catch((error) => error);
  const excess = await client.request("hang", "x").catch((error) => error);
  assert.equal(excess.code, "radar_busy");
  assert.equal(client.pendingCount(), 2);
  assert.equal((await second).code, "queue_timeout");
  assert.equal((await first).code, "query_timeout");
  assert.equal(client.pendingCount(), 0);
  client.stop();
});

test("successful serialized work leaves no pending requests", async () => {
  const client = createClient({ workerFile, timeoutMs: 500, enqueueTimeoutMs: 500, maxQueue: 3, backoffBaseMs: 1 });
  const [first, second] = await Promise.all([client.request("delay", "x"), client.request("ok", "x")]);
  assert.deepEqual(first, { action: "delay" });
  assert.deepEqual(second, { action: "ok" });
  assert.equal(client.pendingCount(), 0);
  client.stop();
});

test("worker crash rejects pending request and enters bounded backoff", async () => {
  const client = createClient({ workerFile, timeoutMs: 500, maxQueue: 2, backoffBaseMs: 20 });
  const error = await client.request("crash", "x").catch((caught) => caught);
  assert.equal(error.code, "worker_failed");
  const backoff = await client.request("ok", "x").catch((caught) => caught);
  assert.equal(backoff.code, "worker_backoff");
  client.stop();
});
