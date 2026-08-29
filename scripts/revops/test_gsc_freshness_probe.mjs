import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { evaluateConsumerPayload, probePrivateConsumer } from "./verify_gsc_freshness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const current = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/revops/fixtures/gsc-consumer-current.json"), "utf8"),
);
const cli = path.join(root, "scripts/revops/verify_gsc_freshness.mjs");

test("CURRENT requires a durable versioned consumer with exact manifest parity", () => {
  const result = evaluateConsumerPayload(current, { now: new Date("2026-08-29T12:20:39Z") });
  assert.equal(result.ok, true);
  assert.equal(result.status, "CURRENT");
  assert.equal(result.producer_manifest_sha256, "a".repeat(64));
  assert.equal(result.consumer_manifest_sha256, "a".repeat(64));
  assert.equal(result.producer_as_of, "2026-08-26");
  assert.equal(result.consumer_as_of, "2026-08-26");
  assert.equal(result.producer_as_of, result.consumer_as_of);
  assert.equal(result.delivery_source, "durable_store");
});

test("CLI fixtures make CURRENT green and STALE/UNKNOWN red without logging insights", () => {
  for (const [fixture, expectedStatus, expectedExit] of [
    ["current", "CURRENT", 0],
    ["stale", "STALE", 1],
    ["unknown", "UNKNOWN", 1],
  ]) {
    const ran = spawnSync(
      process.execPath,
      [cli, "--fixture", fixture, "--now", "2026-08-29T12:20:39Z"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(ran.status, expectedExit, `${fixture}: ${ran.stdout}\n${ran.stderr}`);
    const proof = JSON.parse(ran.stdout);
    assert.equal(proof.status, expectedStatus, fixture);
    assert.equal(Object.hasOwn(proof, "insights"), false, fixture);
    assert.doesNotMatch(`${ran.stdout}\n${ran.stderr}`, /query_text|private query|individual query/i);
  }
});

test("manifest disagreement is UNKNOWN even when the producer claims CURRENT", () => {
  const mismatch = structuredClone(current);
  mismatch.meta.consumer_manifest_sha256 = "b".repeat(64);
  const result = evaluateConsumerPayload(mismatch, { now: new Date("2026-08-29T12:20:39Z") });
  assert.equal(result.ok, false);
  assert.equal(result.status, "UNKNOWN");
  assert.deepEqual(result.reason_codes, ["manifest_hash_mismatch"]);
});

test("live probe performs one authenticated GET and evaluates only the private consumer response", async () => {
  const requests = [];
  const result = await probePrivateConsumer({
    baseUrl: "https://confenge.com.br",
    token: "test-token-at-least-16-chars",
    now: new Date("2026-08-29T12:20:39Z"),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify(current), { status: 200 });
    },
  });
  assert.equal(result.status, "CURRENT");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://confenge.com.br/.netlify/functions/ops?action=gsc_insights");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(Object.hasOwn(requests[0].options, "body"), false);
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-token-at-least-16-chars");
});

test("timeout and partial responses are UNKNOWN", async () => {
  const timedOut = await probePrivateConsumer({
    baseUrl: "https://confenge.com.br",
    token: "test-token-at-least-16-chars",
    now: new Date("2026-08-29T12:20:39Z"),
    fetchImpl: async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    },
  });
  assert.equal(timedOut.status, "UNKNOWN");
  assert.deepEqual(timedOut.reason_codes, ["consumer_timeout"]);

  const partial = await probePrivateConsumer({
    baseUrl: "https://confenge.com.br",
    token: "test-token-at-least-16-chars",
    now: new Date("2026-08-29T12:20:39Z"),
    fetchImpl: async () => new Response("{truncated", { status: 200 }),
  });
  assert.equal(partial.status, "UNKNOWN");
  assert.deepEqual(partial.reason_codes, ["consumer_non_json"]);
});
