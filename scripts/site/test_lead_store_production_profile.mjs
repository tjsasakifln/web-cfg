/**
 * Story 1.1 — production-profile fail-closed store policy.
 * Drives real lead-store.cjs + lead.cjs (no reimplementation of unit under test).
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const storePath = path.join(root, "netlify/functions/lib/lead-store.cjs");
const leadPath = path.join(root, "netlify/functions/lead.cjs");

function loadStore() {
  delete require.cache[require.resolve(storePath)];
  return require(storePath);
}

function pass(name, detail) {
  console.log("PASS", name, detail || "");
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exitCode = 1;
  throw new Error(`FAIL: ${name}`);
}

// 1) helpers
{
  const { isProductionProfile, memoryFallbackAllowed, assertProductionStorePolicy } = loadStore();
  if (!isProductionProfile({ NODE_ENV: "production" })) fail("prod_node_env");
  if (!isProductionProfile({ CONTEXT: "production" })) fail("prod_context");
  if (isProductionProfile({ NODE_ENV: "test" })) fail("test_not_prod");
  if (memoryFallbackAllowed({ NODE_ENV: "production", LEAD_ALLOW_MEMORY_FALLBACK: "1" })) {
    fail("memory_allow_blocked_in_prod");
  }
  if (!memoryFallbackAllowed({ NODE_ENV: "test" })) fail("memory_ok_in_test");
  const bad = assertProductionStorePolicy({
    NODE_ENV: "production",
    LEAD_ALLOW_MEMORY_FALLBACK: "1",
  });
  if (bad.ok) fail("policy_should_fail_memory_flag");
  pass("helpers");
}

// 2) createStore returns null under production + memory flag
{
  const prev = { ...process.env };
  process.env.NODE_ENV = "production";
  process.env.LEAD_ALLOW_MEMORY_FALLBACK = "1";
  delete process.env.LEAD_STORE_DIR;
  delete process.env.LEAD_STORE;
  delete process.env.LEAD_STORE_HTTP_URL;
  delete process.env.NETLIFY_BLOBS_SITE_ID;
  delete process.env.NETLIFY_BLOBS_TOKEN;
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  const { createStore } = loadStore();
  const store = await createStore();
  if (store !== null) fail("createStore_should_null_on_prod_memory_flag", store);
  pass("createStore_null_on_policy_violation");
  process.env = prev;
}

// 3) test profile still allows memory
{
  const prev = { ...process.env };
  process.env.NODE_ENV = "test";
  delete process.env.LEAD_ALLOW_MEMORY_FALLBACK;
  delete process.env.LEAD_STORE_DIR;
  delete process.env.LEAD_STORE_HTTP_URL;
  const { createStore } = loadStore();
  const store = await createStore();
  if (!store || !store.ephemeral) fail("test_memory_allowed", store);
  pass("test_memory_allowed");
  process.env = prev;
}

// 3b) generic HTTP store is not a production-safe create-only backend
{
  const prev = { ...process.env };
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  process.env.NODE_ENV = "production";
  process.env.LEAD_STORE_HTTP_URL = "https://store.example.test/leads";
  delete process.env.LEAD_ALLOW_MEMORY_FALLBACK;
  delete process.env.LEAD_STORE;
  delete process.env.LEAD_STORE_DIR;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, status: 201, json: async () => ({}) };
  };
  try {
    const { createStore, assertProductionStorePolicy } = loadStore();
    const policy = assertProductionStorePolicy(process.env);
    if (policy.ok || policy.code !== "http_store_atomic_create_unproven") {
      fail("http_store_policy_should_fail", policy);
    }
    const stores = await Promise.all([createStore(), createStore()]);
    if (stores.some((store) => store !== null)) {
      fail("http_store_should_be_blocked_in_prod", stores);
    }
    if (fetchCalls !== 0) fail("http_store_blocked_before_fetch", fetchCalls);
    pass("http_store_blocked_before_fetch");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = prev;
  }
}

// 4) lead handler rejects production + memory fallback without durable store
{
  const prev = { ...process.env };
  process.env.NODE_ENV = "production";
  process.env.LEAD_ALLOW_MEMORY_FALLBACK = "1";
  delete process.env.LEAD_STORE_DIR;
  delete process.env.LEAD_STORE;
  delete process.env.LEAD_STORE_HTTP_URL;
  delete process.env.NETLIFY_BLOBS_CONTEXT;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.LEAD_REQUIRE_TURNSTILE;
  delete require.cache[require.resolve(leadPath)];
  delete require.cache[require.resolve(storePath)];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/lead-core.cjs"))];
  const { handler } = require(leadPath);
  const res = await handler({
    httpMethod: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://confenge.com.br",
      "user-agent": "prod-profile-test/1.0",
      "x-forwarded-for": "203.0.113.99",
    },
    body: JSON.stringify({
      nome: "Teste Prod",
      email: "prod-profile@example.com",
      telefone: "48999999999",
      estagio: "problema urgente em contrato",
      jornada: "contrato",
      consentimento: true,
      mensagem: "teste fail-closed",
    }),
  });
  if (res.statusCode >= 200 && res.statusCode < 300) {
    fail("lead_must_not_2xx_on_prod_memory", res.statusCode + " " + res.body);
  }
  const body = JSON.parse(res.body || "{}");
  if (body.email || body.telefone || body.nome) fail("no_pii_on_error", body);
  pass("lead_non2xx_prod_memory_policy", `status=${res.statusCode}`);
  process.env = prev;
}

// 5) FileStore still works for durable local fixtures
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-leads-prod-"));
  const prev = { ...process.env };
  process.env.NODE_ENV = "test";
  process.env.LEAD_STORE_DIR = dir;
  delete process.env.LEAD_ALLOW_MEMORY_FALLBACK;
  const { createStore, buildLeadRecord } = loadStore();
  const store = await createStore();
  const rec = buildLeadRecord({
    lead_id: "lead_fixture_1",
    lead: {
      nome: "Fixture",
      email: "f@example.com",
      telefone: "48988887777",
      estagio: "contrato",
      jornada: "contrato",
      consentimento: true,
    },
    received_at: new Date().toISOString(),
    ip_hash: "x",
    fingerprint: "y",
    status: "persisted",
    headers: {},
  });
  await store.put(rec);
  const got = await store.get("lead_fixture_1");
  if (!got || got.nome !== "Fixture") fail("filestore_roundtrip", got);
  pass("filestore_roundtrip");
  process.env = prev;
  fs.rmSync(dir, { recursive: true, force: true });
}

if (process.exitCode) {
  console.error("LEAD_STORE_PRODUCTION_PROFILE_FAIL");
  process.exit(1);
}
console.log("LEAD_STORE_PRODUCTION_PROFILE_OK");
