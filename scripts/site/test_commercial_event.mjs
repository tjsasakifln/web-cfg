/**
 * Contract tests for the shipped confenge.commercial_event.v1 producer.
 * Drives netlify/functions/lib/commercial-event.cjs against a mock receiver.
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
const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-ce-"));
process.env.LEAD_STORE_DIR = storeDir;
process.env.NODE_ENV = "test";
delete process.env.CONTEXT;
delete process.env.NETLIFY_CONTEXT;

const SECRET = "ce-test-secret-not-for-prod";
const inboundPath = path.join(root, "netlify/functions/lib/commercial-event.cjs");

function loadMod() {
  delete require.cache[require.resolve(inboundPath)];
  delete require.cache[require.resolve(path.join(root, "netlify/functions/lib/inbound-handoff.cjs"))];
  delete require.cache[require.resolve(path.join(root, "scripts/offers/events.cjs"))];
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

function envFor(url, health, extra = {}) {
  return {
    ...process.env,
    LEAD_STORE_DIR: storeDir,
    NODE_ENV: "test",
    CONFENGE_COMMERCIAL_EVENT_ENABLED: "1",
    CONFENGE_COMMERCIAL_EVENT_WEBHOOK_URL: url,
    CONFENGE_COMMERCIAL_EVENT_WEBHOOK_SECRET: SECRET,
    CONFENGE_COMMERCIAL_EVENT_HEALTH_URL: health,
    CONFENGE_INBOUND_ALLOWED_HOSTS: "127.0.0.1",
    ...extra,
  };
}

const baseInput = {
  type: "offer_selected",
  offer_id: "CFG-DIAG-EXP-v1",
  offer_version: "1",
  origin: "journey",
};

{
  const ce = loadMod();
  const bad = ce.buildPayload({ type: "payment_received", origin: "checkout" });
  if (bad.ok) fail("checkout_cannot_emit_payment_received", bad);
  else pass("checkout_cannot_emit_payment_received", bad.error);
  const cb = ce.buildPayload({ type: "payment_received", origin: "callback" });
  if (cb.ok) fail("callback_cannot_emit_payment_received", cb);
  else pass("callback_cannot_emit_payment_received", cb.error);
  const oc = ce.buildPayload({ type: "payment_received", origin: "offer-checkout" });
  if (oc.ok) fail("offer_checkout_cannot_emit_payment_received", oc);
  else pass("offer_checkout_cannot_emit_payment_received", oc.error);
}

{
  const ce = loadMod();
  const built = ce.buildPayload({ ...baseInput, event_id: "ce-schema" });
  if (!built.ok) fail("schema_payload", built);
  else if (built.payload.schema !== "confenge.commercial_event.v1") fail("schema_payload", built.payload);
  else if (built.payload.source !== "CONFENGE_WEB") fail("schema_payload_source", built.payload);
  else pass("schema_payload", built.payload.schema);
}

{
  const posts = [];
  const rx = await startReceiver((req, res) => {
    posts.push(req.method + req.url);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "down" }));
  });
  const ce = loadMod();
  const env = envFor(rx.inbound, rx.health);
  env.CONFENGE_COMMERCIAL_EVENT_ENABLED = "0";
  const out = await ce.produce({ ...baseInput, event_id: "ce-persist-first" }, { env });
  const recPath = path.join(storeDir, "commercial-event");
  const files = fs.existsSync(recPath) ? fs.readdirSync(recPath) : [];
  if (!out.ok) fail("persist_first", out);
  else if (!files.length) fail("persist_first_store_empty", { files, recPath });
  else if (out.record.outbox.status === "DELIVERED") fail("persist_first_not_delivered", out.record.outbox);
  else if (posts.some((p) => p.startsWith("POST") && !p.endsWith("/health"))) {
    fail("persist_first_posted_while_disabled", posts);
  } else pass("persist_first", out.record.outbox.status);
  rx.server.close();
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
  const ce = loadMod();
  const out = await ce.produce({ ...baseInput, event_id: "ce-cap-absent" }, { env: envFor(rx.inbound, rx.health) });
  if (!out.ok) fail("capability_absent_held", out);
  else if (out.record.outbox.status === "DELIVERED") fail("capability_absent_not_delivered", out.record.outbox);
  else if (out.record.outbox.status !== "HELD") fail("capability_absent_held", out.record.outbox);
  else pass("capability_absent_held", out.record.outbox.status);
  rx.server.close();
}

{
  const rx = await startReceiver((req, res) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: [] }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const ce = loadMod();
  const out = await ce.produce(
    { ...baseInput, event_id: "ce-cap-omit-version" },
    { env: envFor(rx.inbound, rx.health) },
  );
  if (!out.ok) fail("consumer_omit_version_fail_closed", out);
  else if (out.record.outbox.status === "DELIVERED") fail("consumer_omit_version_fail_closed", out.record.outbox);
  else pass("consumer_omit_version_fail_closed", out.record.outbox.status);
  rx.server.close();
}

{
  const seen = [];
  const rx = await startReceiver((req, res, raw) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.inbound.v1", "confenge.commercial_event.v1"] }));
      return;
    }
    const okSig = verifySig(SECRET, req.headers["x-warmbly-signature"], raw);
    seen.push({ okSig, raw });
    if (!okSig) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad_sig" }));
      return;
    }
    const body = JSON.parse(raw || "{}");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ version: body.version, schema: body.schema, event_id: body.event_id }));
  });
  const ce = loadMod();
  const dest = `http://127.0.0.1:${rx.port}/api/v1/webhooks/confenge/inbound`;
  const out = await ce.produce(
    { ...baseInput, event_id: "ce-hmac-dest" },
    { env: envFor(dest, rx.health) },
  );
  if (!out.ok || out.record.outbox.status !== "DELIVERED") fail("hmac_and_env_destination", out.record && out.record.outbox);
  else if (!seen.length || !seen[0].okSig) fail("hmac_over_timestamp_body", seen);
  else pass("hmac_and_env_destination");
  rx.server.close();
}

{
  const rx = await startReceiver((req, res, raw) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.commercial_event.v1"] }));
      return;
    }
    const body = JSON.parse(raw || "{}");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ version: body.version, event_id: body.event_id }));
  });
  const ce = loadMod();
  const first = await ce.produce({ ...baseInput, event_id: "ce-replay" }, { env: envFor(rx.inbound, rx.health) });
  const second = await ce.produce({ ...baseInput, event_id: "ce-replay" }, { env: envFor(rx.inbound, rx.health) });
  if (!first.ok || !second.ok || second.replay !== true) fail("event_id_idempotent", { first, second });
  else pass("event_id_idempotent");
  rx.server.close();
}

{
  const rx = await startReceiver((req, res, raw) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.commercial_event.v1"] }));
      return;
    }
    const body = JSON.parse(raw || "{}");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ version: body.version, event_id: body.event_id }));
  });
  const ce = loadMod();
  const env = envFor(rx.inbound, rx.health);
  const first = await ce.produce(
    { ...baseInput, provider_event_id: "asaas_evt_1", origin: "journey" },
    { env },
  );
  const second = await ce.produce(
    { ...baseInput, provider_event_id: "asaas_evt_1", origin: "journey" },
    { env },
  );
  if (!first.ok || !second.ok || second.replay !== true) fail("provider_event_id_idempotent", { first, second });
  else if (first.record.event_id !== second.record.event_id) fail("provider_event_id_same_id", { first, second });
  else pass("provider_event_id_idempotent");
  rx.server.close();
}

{
  let posts = 0;
  const rx = await startReceiver((req, res, raw) => {
    if (req.url.endsWith("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ capabilities: ["confenge.commercial_event.v1"] }));
      return;
    }
    posts += 1;
    const body = JSON.parse(raw || "{}");
    if (posts === 1) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "down" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ version: body.version, event_id: body.event_id }));
  });
  const ce = loadMod();
  const env = envFor(rx.inbound, rx.health);
  const first = await ce.produce({ ...baseInput, event_id: "ce-retry" }, { env });
  if (!first.ok || first.record.outbox.status !== "RETRYABLE") fail("retry_first", first.record && first.record.outbox);
  const drain = await ce.drainHeld({ env, limit: 10 });
  if (!drain.ok || drain.delivered < 1) fail("retry_replay_drain", drain);
  else pass("retry_replay", { posts, delivered: drain.delivered });
  rx.server.close();
}

{
  const ce = loadMod();
  const out = await ce.produce(
    { type: "payment_received", origin: "callback", event_id: "ce-pay" },
    { env: { ...process.env, LEAD_STORE_DIR: storeDir, CONFENGE_COMMERCIAL_EVENT_ENABLED: "1" } },
  );
  if (out.ok) fail("produce_payment_received_from_callback", out);
  else pass("produce_payment_received_from_callback", out.error);
}

console.log("COMMERCIAL_EVENT_PRODUCER_OK", JSON.stringify({ passed: results.length }));
