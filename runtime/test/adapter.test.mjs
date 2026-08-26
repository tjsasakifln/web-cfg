import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig } from "../lib/config.mjs";
import { createFunctionRegistry } from "../lib/functions.mjs";
import { createPortableRuntime } from "../lib/server.mjs";
import {
  FIXTURE_FUNCTIONS,
  isolatedTestEnv,
  startFixtureRuntime,
} from "./helpers.mjs";

test("adapter maps method, body, query, headers and trusted proxy client IP explicitly", async (t) => {
  const marker = "must-not-appear-in-runtime-log";
  const fixture = await startFixtureRuntime();
  t.after(() => fixture.runtime.shutdown("test"));
  const response = await fetch(
    fixture.baseUrl + "/.netlify/functions/echo?one=1&one=2&encoded=a%20b",
    {
      method: "PATCH",
      headers: {
        "content-type": "text/plain",
        "x-forwarded-for": "203.0.113.40, 127.0.0.1",
        "x-test-marker": marker,
      },
      body: "raw-body-" + marker,
    },
  );
  assert.equal(response.status, 207);
  assert.equal(response.headers.get("x-handler"), "echo");
  const body = await response.json();
  assert.equal(body.method, "PATCH");
  assert.equal(body.body, "raw-body-" + marker);
  assert.equal(body.path, "/.netlify/functions/echo");
  assert.equal(body.raw_query, "one=1&one=2&encoded=a%20b");
  assert.deepEqual(body.query, { one: "2", encoded: "a b" });
  assert.deepEqual(body.multi_query, { one: ["1", "2"], encoded: ["a b"] });
  assert.equal(body.headers.forwarded_for, "203.0.113.40, 127.0.0.1");
  assert.equal(body.source_ip, "203.0.113.40");
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(fixture.logs.join("\n").includes(marker), false);
});

test("canonical and legacy aliases execute the same handler", async (t) => {
  const fixture = await startFixtureRuntime();
  t.after(() => fixture.runtime.shutdown("test"));
  const legacy = await fetch(fixture.baseUrl + "/.netlify/functions/echo");
  const canonical = await fetch(fixture.baseUrl + "/api/web/echo");
  assert.equal(legacy.status, 207);
  assert.equal(canonical.status, 207);
  const legacyBody = await legacy.json();
  const canonicalBody = await canonical.json();
  assert.equal(legacyBody.path, "/.netlify/functions/echo");
  assert.equal(canonicalBody.path, "/api/web/echo");
  delete legacyBody.path;
  delete canonicalBody.path;
  assert.deepEqual(legacyBody, canonicalBody);
});

test("untrusted proxy headers are stripped and socket IP becomes client IP", async (t) => {
  const fixture = await startFixtureRuntime({ RUNTIME_TRUST_PROXY: "none" });
  t.after(() => fixture.runtime.shutdown("test"));
  const response = await fetch(fixture.baseUrl + "/api/web/echo", {
    headers: { "x-forwarded-for": "198.51.100.99" },
  });
  const body = await response.json();
  assert.equal(body.headers.forwarded_for, null);
  assert.match(body.headers.client_ip, /^127\./);
  assert.match(body.source_ip, /^127\./);
});

test("missing, schedule-only, oversized and malformed requests fail closed", async (t) => {
  const fixture = await startFixtureRuntime();
  t.after(() => fixture.runtime.shutdown("test"));

  assert.equal((await fetch(fixture.baseUrl + "/api/web/does-not-exist")).status, 404);
  assert.equal(
    (await fetch(fixture.baseUrl + "/.netlify/functions/search-observation-tick")).status,
    404,
  );

  const oversized = await fetch(fixture.baseUrl + "/api/web/echo", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "x".repeat(2048),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error, "payload_too_large");

  const malformed = await fetch(fixture.baseUrl + "/api/web/echo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{\"broken\":",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, "invalid_json");
});

test("handler timeout returns a bounded response while shutdown still tracks the invocation", async (t) => {
  const fixture = await startFixtureRuntime({ RUNTIME_HANDLER_TIMEOUT_MS: "100" });
  t.after(() => fixture.runtime.shutdown("test"));
  const response = await fetch(fixture.baseUrl + "/api/web/slow?delay=300");
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error, "handler_timeout");
  assert.equal(fixture.runtime.activeHandlers.size, 1);
});

test("health, readiness and identity are honest and identity never exposes secrets", async (t) => {
  const secret = "runtime-secret-marker-778899";
  const fixture = await startFixtureRuntime({
    OPS_TOKEN: secret,
    RESEND_API_KEY: secret,
    NURTURE_TOKEN_SECRET: secret.repeat(2),
  });
  t.after(() => fixture.runtime.shutdown("test"));

  const health = await fetch(fixture.baseUrl + "/healthz");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "live");
  const ready = await fetch(fixture.baseUrl + "/ready");
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).ok, true);
  const identity = await fetch(fixture.baseUrl + "/runtime-identity");
  assert.equal(identity.status, 200);
  const identityText = await identity.text();
  assert.equal(identityText.includes(secret), false);
  assert.equal(/token|secret|path|dir/i.test(identityText), false);
  const parsed = JSON.parse(identityText);
  assert.match(parsed.release_sha, /^[a-f0-9]{40}$/);
  assert.equal(parsed.storage_backend, "memory");
  assert.equal(parsed.contract_version, "confenge-portable-runtime/v2");
  const wellKnown = await fetch(fixture.baseUrl + "/.well-known/runtime-info.json");
  assert.equal(wellKnown.status, 200);
  assert.deepEqual(await wellKnown.json(), parsed);
});

test("Netcup production profile rejects any upstream port except the integrated 18100 contract", () => {
  const env = isolatedTestEnv({
    NODE_ENV: "production",
    RUNTIME_PROFILE: "netcup-production",
    RUNTIME_PORT: "8787",
  });
  const config = loadRuntimeConfig({ env, nodeVersion: "v22.23.2" });
  assert.ok(config.errors.includes("netcup_runtime_port_contract_mismatch"));
});

test("production startup is refused when critical requirements are absent", async () => {
  const env = isolatedTestEnv({
    NODE_ENV: "production",
    LEAD_STORE: "",
    RUNTIME_FUNCTIONS_DIR: "",
    RUNTIME_PORT: "",
    RUNTIME_RELEASE_SHA: "",
    RUNTIME_BUILD_TIMESTAMP: "",
  });
  const config = loadRuntimeConfig({ env, nodeVersion: "v22.23.2" });
  const registry = createFunctionRegistry({
    functionsDir: FIXTURE_FUNCTIONS,
    netlifyTomlPath: config.netlifyTomlPath,
  });
  const runtime = createPortableRuntime({
    config,
    registry,
    logger: () => {},
  });
  await assert.rejects(
    runtime.listen(),
    (error) => {
      assert.equal(error.code, "runtime_startup_refused");
      assert.ok(error.failures.includes("storage_backend_unconfigured"));
      assert.ok(error.failures.includes("release_sha_required"));
      assert.ok(error.failures.includes("runtime_port_required_in_production"));
      assert.ok(error.failures.includes("public_artifact_hash_required"));
      assert.ok(error.failures.includes("release_bundle_hash_required"));
      return true;
    },
  );
});
