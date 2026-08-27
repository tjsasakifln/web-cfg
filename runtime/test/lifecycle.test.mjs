import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import {
  childExit,
  isolatedTestEnv,
  temporaryDirectory,
  waitForChildJson,
} from "./helpers.mjs";

const SERVER = resolve("runtime/server.mjs");
const require = createRequire(import.meta.url);
const { HostFileBackend } = require("../../netlify/functions/lib/host-file-store.cjs");

function collect(stream) {
  let output = "";
  stream.on("data", (chunk) => {
    output += String(chunk);
  });
  return () => output;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return address.port;
}

test("SIGTERM drains an active request before process exit", async (t) => {
  const env = isolatedTestEnv({
    RUNTIME_TEST_DELAY_MS: "350",
    RUNTIME_SHUTDOWN_GRACE_MS: "2000",
  });
  const child = spawn(process.execPath, [SERVER], {
    cwd: resolve("."),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
  });
  const stderr = collect(child.stderr);
  const listening = await waitForChildJson(
    child,
    (record) => record.event === "runtime_listening",
  );
  const request = fetch(
    "http://127.0.0.1:" + listening.port + "/.netlify/functions/slow",
  );
  await waitForChildJson(child, (record) => record.event === "fixture_slow_started");
  const exit = childExit(child);
  child.kill("SIGTERM");
  const response = await request;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, completed: true });
  assert.deepEqual(await exit, { code: 0, signal: null });
  assert.equal(stderr(), "");
});

test("SIGTERM exits nonzero after the graceful shutdown deadline", async (t) => {
  const env = isolatedTestEnv({
    RUNTIME_TEST_DELAY_MS: "2000",
    RUNTIME_HANDLER_TIMEOUT_MS: "5000",
    RUNTIME_SHUTDOWN_GRACE_MS: "100",
  });
  const child = spawn(process.execPath, [SERVER], {
    cwd: resolve("."),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
  });
  const listening = await waitForChildJson(
    child,
    (record) => record.event === "runtime_listening",
  );
  const request = fetch(
    "http://127.0.0.1:" + listening.port + "/.netlify/functions/slow",
  ).then(
    () => "completed",
    () => "aborted",
  );
  await waitForChildJson(child, (record) => record.event === "fixture_slow_started");
  const exit = childExit(child);
  child.kill("SIGTERM");
  assert.deepEqual(await exit, { code: 1, signal: null });
  assert.equal(await request, "aborted");
});

test("production child exits 78 instead of binding with missing critical config", async () => {
  const secret = "startup-secret-must-not-leak";
  const env = isolatedTestEnv({
    NODE_ENV: "production",
    LEAD_STORE: "",
    RUNTIME_FUNCTIONS_DIR: "",
    RUNTIME_PORT: "18787",
    RUNTIME_RELEASE_SHA: "",
    RUNTIME_BUILD_TIMESTAMP: "",
    OPS_TOKEN: secret,
  });
  delete env.LEAD_STORE_DIR;
  delete env.CORRECTION_STORE_DIR;
  delete env.RESEND_API_KEY;
  delete env.NURTURE_TOKEN_SECRET;
  const child = spawn(process.execPath, [SERVER], {
    cwd: resolve("."),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = collect(child.stdout);
  const stderr = collect(child.stderr);
  const exit = await childExit(child);
  assert.deepEqual(exit, { code: 78, signal: null });
  assert.match(stdout(), /runtime_start_refused/);
  assert.doesNotMatch(stdout(), /runtime_listening/);
  assert.equal((stdout() + stderr()).includes(secret), false);
});

test("complete production profile binds privately and reports ready", async (t) => {
  const root = temporaryDirectory("confenge-runtime-production-");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const port = await freePort();
  const env = isolatedTestEnv({
    NODE_ENV: "production",
    LEAD_STORE: "",
    CONFENGE_STORAGE_BACKEND: "filesystem",
    CONFENGE_STORAGE_DIR: root,
    RUNTIME_FUNCTIONS_DIR: "",
    RUNTIME_PORT: String(port),
    RUNTIME_RELEASE_SHA: "a".repeat(40),
    RUNTIME_BUILD_TIMESTAMP: "2026-08-26T12:00:00Z",
    RUNTIME_PROFILE: "portable-production",
    RUNTIME_PUBLIC_ARTIFACT_HASH: "b".repeat(64),
    RUNTIME_RELEASE_BUNDLE_HASH: "c".repeat(64),
    LEAD_REQUIRE_ORIGIN: "1",
    LEAD_REQUIRE_TURNSTILE: "1",
    TURNSTILE_SECRET_KEY: "turnstile-production-test",
    IP_HASH_SALT: "p".repeat(40),
    CONFENGE_INBOUND_WEBHOOK_URL: "https://api.confenge.com.br/api/v1/webhooks/confenge/inbound",
    CONFENGE_INBOUND_WEBHOOK_SECRET: "i".repeat(40),
    OPS_TOKEN: "ops-production-test-token",
    NURTURE_TOKEN_SECRET: "n".repeat(40),
    RESEND_API_KEY: "re_production_test",
  });
  const child = spawn(process.execPath, [SERVER], {
    cwd: resolve("."),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
  });
  const listening = await waitForChildJson(
    child,
    (record) => record.event === "runtime_listening",
  );
  assert.equal(listening.host, "127.0.0.1");
  const ready = await fetch("http://127.0.0.1:" + port + "/ready");
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).ok, true);
  const backend = new HostFileBackend(root);
  const corrupt = backend.namespace("runtime-corruption-test");
  corrupt.put("corrupt-after-start", { ok: true });
  writeFileSync(corrupt.pathForKey("corrupt-after-start"), "{truncated", { mode: 0o600 });
  const notReady = await fetch("http://127.0.0.1:" + port + "/ready");
  assert.equal(notReady.status, 503);
  const notReadyBody = await notReady.json();
  assert.equal(notReadyBody.ok, false);
  assert.equal(
    notReadyBody.checks.some((item) => item.name === "host_owned_storage" && item.code === "STORE_CORRUPT"),
    true,
  );
  const exit = childExit(child);
  child.kill("SIGTERM");
  assert.deepEqual(await exit, { code: 0, signal: null });
});
