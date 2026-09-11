/**
 * POS-INB-20260911/01 — persist-first handoff against shipped inbound-handoff + lead handler.
 */
import http from "http";
import {
  ROOT,
  isolateEnv,
  makeStoreDir,
  loadLeadHandler,
  event,
  pass,
  fail,
  privatePayload,
  tmpCleanup,
  getResults,
  path,
  require,
} from "./helpers.mjs";

const storeDir = makeStoreDir("handoff");
isolateEnv(storeDir);

const inboundPath = "/api/v1/webhooks/confenge/inbound";
const SECRET = "pos-inb-01-local-inbound-secret-not-for-prod";

function startDest({ mode = "ok" } = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let parsed = {};
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }
      seen.push({ method: req.method, url: req.url, body: parsed });
      if (mode === "timeout") {
        return; // never respond
      }
      if (mode === "5xx") {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
        return;
      }
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, receipt_id: parsed.lead_id || parsed.receipt_id }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        seen,
        port,
        url: `http://127.0.0.1:${port}${inboundPath}`,
        setMode(next) { mode = next; },
        close() {
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

const dest = await startDest();
process.env.CONFENGE_INBOUND_WEBHOOK_URL = dest.url;
process.env.CONFENGE_INBOUND_WEBHOOK_SECRET = SECRET;
process.env.CONFENGE_INBOUND_ALLOWED_HOSTS = "127.0.0.1";
process.env.CONFENGE_INBOUND_TIMEOUT_MS = "200";

const { handler, setStoreForTests } = loadLeadHandler();
const { FileStore } = require(path.join(ROOT, "netlify/functions/lib/lead-store.cjs"));
const inbound = require(path.join(ROOT, "netlify/functions/lib/inbound-handoff.cjs"));
setStoreForTests(null);

function realish(extra = {}) {
  return privatePayload({
    email: "ana.handoff@construtora-norte.com.br",
    telefone: "",
    ...extra,
  });
}

{
  const order = [];
  const FileStoreCtor = FileStore;
  const wrapped = new FileStoreCtor(storeDir);
  const origPut = wrapped.put.bind(wrapped);
  wrapped.put = async (...args) => {
    order.push("persist");
    return origPut(...args);
  };
  setStoreForTests(wrapped);
  const before = dest.seen.length;
  const res = await handler(event(realish({
    idempotency_key: "pos-inb-01-handoff-happy-001",
  }), "POST", { ip: "198.51.100.11", "Idempotency-Key": "pos-inb-01-handoff-happy-001" }));
  const body = JSON.parse(res.body);
  const stored = await wrapped.get(body.lead_id);
  if (res.statusCode !== 201 || !stored) fail("handoff_persist", body);
  if (order[0] !== "persist") fail("persist_not_first", order);
  if (dest.seen.length !== before + 1) fail("dest_not_called", dest.seen.length);
  if (stored.handoff.status !== "DELIVERED") fail("not_delivered", stored.handoff);
  if (body.handoff || body.handoff_status === "DELIVERED") fail("public_claimed_delivered", body);
  if (inbound.handoffAcceptedSemantic(stored.handoff) !== "handoff_accepted") {
    fail("semantic_delivered");
  }
  pass("persist_first_then_delivered", { lead_id: body.lead_id });
}

{
  const durable = new FileStore(storeDir);
  setStoreForTests(durable);
  const first = await handler(event(realish({
    idempotency_key: "pos-inb-01-handoff-replay-001",
  }), "POST", { ip: "198.51.100.12", "Idempotency-Key": "pos-inb-01-handoff-replay-001" }));
  const firstBody = JSON.parse(first.body);
  const afterFirst = dest.seen.length;
  const second = await handler(event(realish({
    idempotency_key: "pos-inb-01-handoff-replay-001",
  }), "POST", { ip: "198.51.100.12", "Idempotency-Key": "pos-inb-01-handoff-replay-001" }));
  const secondBody = JSON.parse(second.body);
  if (second.statusCode !== 200 || secondBody.idempotent !== true) fail("replay_status", secondBody);
  if (secondBody.lead_id !== firstBody.lead_id) fail("replay_new_id");
  if (dest.seen.length !== afterFirst) fail("replay_redelivered");
  const stored = firstBody.lead_id ? await durable.get(firstBody.lead_id) : null;
  if (!stored) fail("replay_not_durable");
  const rows = (await durable.list()).filter((r) => r.lead_id === firstBody.lead_id);
  if (rows.length !== 1) fail("replay_two_opportunities", rows.length);
  pass("idempotent_handoff_no_second_opportunity");
}

{
  dest.setMode("timeout");
  const durable = new FileStore(storeDir);
  setStoreForTests(durable);
  const res = await handler(event(realish({
    email: "ana.timeout@construtora-norte.com.br",
    idempotency_key: "pos-inb-01-timeout-001",
  }), "POST", { ip: "198.51.100.13", "Idempotency-Key": "pos-inb-01-timeout-001" }));
  const body = JSON.parse(res.body);
  const stored = body.lead_id ? await durable.get(body.lead_id) : null;
  if (res.statusCode !== 201 || !stored) fail("timeout_dropped_capture", body);
  if (stored.handoff.status !== "RETRYABLE") fail("timeout_status", stored.handoff);
  if (stored.handoff.last_error !== "timeout") fail("timeout_error", stored.handoff);
  if (body.ok !== true || body.handoff_status === "DELIVERED") fail("timeout_fake_receipt", body);
  if (inbound.handoffAcceptedSemantic(stored.handoff) === "handoff_accepted") {
    fail("timeout_claimed_accepted");
  }
  dest.setMode("ok");
  pass("timeout_persist_ok_handoff_retryable");
}

{
  delete process.env.CONFENGE_INBOUND_WEBHOOK_URL;
  delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
  const { handler: hSkip, setStoreForTests: setSkip } = loadLeadHandler();
  const durable = new FileStore(storeDir);
  setSkip(durable);
  const before = dest.seen.length;
  const res = await hSkip(event(realish({
    email: "ana.skip@construtora-norte.com.br",
    idempotency_key: "pos-inb-01-skip-001",
  }), "POST", { ip: "198.51.100.14" }));
  const body = JSON.parse(res.body);
  const stored = body.lead_id ? await durable.get(body.lead_id) : null;
  if (res.statusCode !== 201 || !stored) fail("skip_capture", body);
  if (stored.handoff.status !== "SKIPPED" || stored.handoff.reason !== "not_configured") {
    fail("skip_state", stored.handoff);
  }
  if (dest.seen.length !== before) fail("skip_posted");
  if (body.handoff_status === "DELIVERED") fail("skip_fake_downstream", body);
  pass("missing_url_skipped_not_configured");
}

{
  process.env.CONFENGE_INBOUND_WEBHOOK_URL = dest.url;
  delete process.env.CONFENGE_INBOUND_WEBHOOK_SECRET;
  process.env.CONFENGE_INBOUND_ALLOWED_HOSTS = "127.0.0.1";
  const { handler: hBlock, setStoreForTests: setBlock } = loadLeadHandler();
  const durable = new FileStore(storeDir);
  setBlock(durable);
  const before = dest.seen.length;
  const res = await hBlock(event(realish({
    email: "ana.secret@construtora-norte.com.br",
    idempotency_key: "pos-inb-01-secret-missing-001",
  }), "POST", { ip: "198.51.100.15" }));
  const body = JSON.parse(res.body);
  const stored = body.lead_id ? await durable.get(body.lead_id) : null;
  if (res.statusCode !== 201 || !stored) fail("secret_capture", body);
  if (stored.handoff.status !== "BLOCKED" || stored.handoff.reason !== "secret_missing") {
    fail("secret_state", stored.handoff);
  }
  if (dest.seen.length !== before) fail("secret_posted");
  if (inbound.handoffAcceptedSemantic(stored.handoff) === "handoff_accepted") {
    fail("secret_claimed_accepted");
  }
  pass("missing_credential_blocked_secret_missing");
}

{
  if (inbound.handoffAcceptedSemantic(null) !== "UNKNOWN") fail("semantic_null");
  if (inbound.handoffAcceptedSemantic({ status: "PENDING" }) !== "PENDING") fail("semantic_pending");
  if (inbound.handoffAcceptedSemantic({ status: "SKIPPED" }) !== "SKIPPED") fail("semantic_skipped");
  if (inbound.handoffAcceptedSemantic({ status: "BLOCKED" }) !== "BLOCKED") fail("semantic_blocked");
  if (inbound.handoffAcceptedSemantic({ status: "RETRYABLE" }) !== "RETRYABLE") fail("semantic_retryable");
  pass("handoff_states_are_not_human_availability");
}

await dest.close();
console.log("POS_INB_01_LOCAL_HANDOFF_OK", JSON.stringify({ tests: getResults().length }));
tmpCleanup(storeDir);
