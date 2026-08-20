/**
 * Contract tests for the shipped confenge.search_observation.v1 producer.
 * Drives netlify/functions/lib/search-observation.cjs against a mock receiver.
 */
import { createRequire } from "module";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-so-"));
process.env.LEAD_STORE_DIR = storeDir;
process.env.NODE_ENV = "test";
delete process.env.CONTEXT;
delete process.env.NETLIFY_CONTEXT;

const SECRET = "so-test-secret-not-for-prod";
const inboundPath = path.join(root, "netlify/functions/lib/search-observation.cjs");

function loadMod() {
  delete require.cache[require.resolve(inboundPath)];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"))];
  return require(inboundPath);
}

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log("PASS", name, detail || "");
}
function fail(name, detail) {
  console.error("FAIL", name, detail);
  process.exitCode = 1;
  throw new Error(`FAIL: ${name} — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

function verifySig(secret, header, rawBody) {
  let tUnix = 0;
  let sig = "";
  for (const part of String(header || "").split(",")) {
    const p = part.trim();
    if (p.startsWith("t=")) tUnix = Number(p.slice(2));
    if (p.startsWith("v1=")) sig = p.slice(3);
  }
  const mac = crypto.createHmac("sha256", secret).update(`${tUnix}.${rawBody}`).digest("hex");
  return mac === sig;
}

function startReceiver(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8");
      handler(req, res, raw);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        inbound: `http://127.0.0.1:${port}/api/v1/webhooks/confenge/inbound`,
        health: `http://127.0.0.1:${port}/api/v1/webhooks/confenge/inbound/health`,
      });
    });
  });
}

function envFor(url, health) {
  return {
    ...process.env,
    LEAD_STORE_DIR: storeDir,
    NODE_ENV: "test",
    CONFENGE_INBOUND_WEBHOOK_URL: url,
    CONFENGE_INBOUND_WEBHOOK_SECRET: SECRET,
    CONFENGE_INBOUND_HEALTH_URL: health,
    CONFENGE_INBOUND_ALLOWED_HOSTS: "127.0.0.1",
  };
}

const baseInput = {
  window: { label: "28d", start: "2026-07-20", end: "2026-08-17" },
  query_class: "non_brand",
  counts: { impressions: 19, clicks: 0, sessions: null, engaged: null, leads: null, pipeline: null },
  coverage: { complete: false },
  freshness: { as_of: "2026-08-17", class: "LIVE_TOP_ROWS_ONLY" },
};

{
  const so = loadMod();
  const bad = so.buildPayload({ ...baseInput, query: "sinapi desonerado" });
  if (bad.ok) fail("literal_query_rejected", bad);
  else pass("literal_query_rejected", bad.error);
  const hashed = so.buildPayload({ ...baseInput, query_hash: "sha256:abc" });
  if (hashed.ok) fail("query_hash_rejected", hashed);
  else pass("query_hash_rejected", hashed.error);
  const nulled = so.buildPayload({ ...baseInput, counts: { impressions: null, clicks: null } });
  if (!nulled.ok) fail("null_counts_ok", nulled);
  else if (nulled.payload.counts.impressions !== null) fail("null_counts_ok", nulled.payload.counts);
  else pass("null_counts_ok");
  const zero = so.buildPayload({ ...baseInput, counts: { impressions: 0, clicks: 0 } });
  if (!zero.ok || zero.payload.counts.impressions !== 0 || zero.payload.counts.clicks !== 0) {
    fail("observed_zero_distinct_from_null", zero);
  } else pass("observed_zero_distinct_from_null");
}

{
  const rx = await startReceiver((req, res) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.inbound.v1"] }));
      return;
    }
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "should_not_post" }));
  });
  const so = loadMod();
  const out = await so.produce({ ...baseInput, event_id: "so-cap-absent" }, { env: envFor(rx.inbound, rx.health) });
  if (!out.ok) fail("capability_absent_held", out);
  else if (out.record.outbox.status !== "HELD") fail("capability_absent_held", out.record.outbox);
  else pass("capability_absent_held", out.record.outbox.status);
  rx.server.close();
}

{
  const rx = await startReceiver((req, res, raw) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.inbound.v1", "confenge.search_observation.v1"] }));
      return;
    }
    const body = JSON.parse(raw || "{}");
    const okSig = verifySig(SECRET, req.headers["x-warmbly-signature"], raw);
    if (!okSig) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad_sig" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ version: body.version, event_id: body.event_id }));
  });
  const so = loadMod();
  const out = await so.produce({ ...baseInput, event_id: "so-cap-present" }, { env: envFor(rx.inbound, rx.health) });
  if (!out.ok || out.record.outbox.status !== "DELIVERED") fail("capability_present_delivered", out.record && out.record.outbox);
  else pass("capability_present_delivered");
  rx.server.close();
}

{
  const rx = await startReceiver((req, res) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.search_observation.v1"] }));
      return;
    }
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
  });
  const so = loadMod();
  const out = await so.produce({ ...baseInput, event_id: "so-401" }, { env: envFor(rx.inbound, rx.health) });
  if (!out.ok || out.record.outbox.status !== "BLOCKED") fail("http_401_blocked", out.record && out.record.outbox);
  else pass("http_401_blocked");
  rx.server.close();
}

{
  const rx = await startReceiver((req, res) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.search_observation.v1"] }));
      return;
    }
    res.writeHead(422, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "schema" }));
  });
  const so = loadMod();
  const out = await so.produce({ ...baseInput, event_id: "so-422" }, { env: envFor(rx.inbound, rx.health) });
  if (!out.ok || out.record.outbox.status !== "RETRYABLE") fail("http_422_retryable", out.record && out.record.outbox);
  else pass("http_422_retryable");
  rx.server.close();
}

{
  const rx = await startReceiver((req, res) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.search_observation.v1"] }));
      return;
    }
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "down" }));
  });
  const so = loadMod();
  const out = await so.produce({ ...baseInput, event_id: "so-5xx" }, { env: envFor(rx.inbound, rx.health) });
  if (!out.ok || out.record.outbox.status !== "RETRYABLE") fail("http_5xx_retryable", out.record && out.record.outbox);
  else pass("http_5xx_retryable");
  rx.server.close();
}

{
  const so = loadMod();
  so.setFetchForTests(async () => {
    await new Promise((r) => setTimeout(r, 30));
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  });
  process.env.CONFENGE_INBOUND_WEBHOOK_URL = "http://127.0.0.1:9/api/v1/webhooks/confenge/inbound";
  process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = SECRET;
  process.env.CONFENGE_INBOUND_HEALTH_URL = "http://127.0.0.1:9/health";
  process.env.CONFENGE_INBOUND_ALLOWED_HOSTS = "127.0.0.1";
  process.env.CONFENGE_INBOUND_TIMEOUT_MS = "5";
  const capFail = await so.produce({ ...baseInput, event_id: "so-timeout" }, { env: process.env });
  if (!capFail.ok) fail("timeout_held_or_retryable", capFail);
  else if (!["HELD", "RETRYABLE"].includes(capFail.record.outbox.status)) {
    fail("timeout_held_or_retryable", capFail.record.outbox);
  } else pass("timeout_held_or_retryable", capFail.record.outbox.status);
  so.setFetchForTests(null);
}

{
  const rx = await startReceiver((req, res, raw) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.search_observation.v1"] }));
      return;
    }
    const body = JSON.parse(raw || "{}");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ version: body.version, event_id: body.event_id }));
  });
  const so = loadMod();
  const first = await so.produce({ ...baseInput, event_id: "so-replay" }, { env: envFor(rx.inbound, rx.health) });
  const second = await so.produce({ ...baseInput, event_id: "so-replay" }, { env: envFor(rx.inbound, rx.health) });
  if (!first.ok || !second.ok || second.replay !== true) fail("replay_idempotent", { first, second });
  else pass("replay_idempotent");
  rx.server.close();
}

{
  const rx = await startReceiver((req, res) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.search_observation.v1"] }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const so = loadMod();
  const out = await so.produce({ ...baseInput, event_id: "so-generic-2xx" }, { env: envFor(rx.inbound, rx.health) });
  if (!out.ok || out.record.outbox.status === "DELIVERED") fail("generic_2xx_not_delivered", out.record && out.record.outbox);
  else pass("generic_2xx_not_delivered", out.record.outbox.status);
  rx.server.close();
}

{
  const so = loadMod();
  const out = await so.produce({ ...baseInput, event_id: "so-synth", synthetic: true }, {
    env: { ...process.env, LEAD_STORE_DIR: storeDir },
  });
  if (!out.ok || !out.synthetic) fail("synthetic_excluded", out);
  else if (out.record.outbox.status !== "SKIPPED") fail("synthetic_excluded", out.record.outbox);
  else pass("synthetic_excluded");
}

{
  const so = loadMod();
  const out = await so.produce(
    { ...baseInput, event_id: "so-unknown-dest", destination: "unknown", require_known_destination: true },
    { env: { ...process.env, LEAD_STORE_DIR: storeDir } },
  );
  if (out.ok) fail("unknown_destination", out);
  else pass("unknown_destination", out.error);
}

{
  const so = loadMod();
  const env = { ...process.env, LEAD_STORE_DIR: storeDir };
  delete env.CONFENGE_INBOUND_WEBHOOK_URL;
  const leadCore = require(path.join(root, "netlify/functions/lib/lead-core.cjs"));
  const lead = leadCore.validateAndNormalize({
    nome: "Ana Teste",
    email: "ana@example.com",
    estagio: "diagnostico-expansao",
    consentimento: true,
  });
  if (!lead.ok) fail("lead_capture_independent", lead);
  else pass("lead_capture_independent");
}

console.log(`search_observation ${results.filter((r) => r.ok).length}/${results.length} passed`);
if (process.exitCode) process.exit(1);
