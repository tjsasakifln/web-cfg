/**
 * Drives real nurture-core + nurture function paths (subscribe → confirm → tick → unsub).
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

process.env.NODE_ENV = "test";
process.env.NURTURE_ADVANCE_WITHOUT_RESEND = "1";
process.env.LEAD_ALLOW_MEMORY_FALLBACK = "1";
delete process.env.RESEND_API_KEY;
process.env.OPS_TOKEN = "x".repeat(24);

const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "confenge-nurture-"));
process.env.NURTURE_STORE_DIR = storeDir;

const core = require(path.join(root, "netlify/functions/lib/nurture-core.cjs"));
const ratePath = path.join(root, "netlify/functions/lib/nurture-rate-limit.cjs");
const rate = require(ratePath);
const nurturePath = path.join(root, "netlify/functions/nurture.cjs");
delete require.cache[require.resolve(nurturePath)];
const { handler } = require(nurturePath);

let failed = 0;
function pass(n, d = "") {
  console.log("PASS", n, d);
}
function fail(n, d) {
  console.error("FAIL", n, d);
  failed += 1;
}

function event(action, { method = "GET", body, qs = {}, headers = {} } = {}) {
  return {
    httpMethod: method,
    headers: {
      origin: "https://confenge.com.br",
      accept: "application/json",
      "content-type": "application/json",
      ...headers,
    },
    queryStringParameters: { action, ...qs },
    body: body ? JSON.stringify(body) : "",
  };
}

// 1) tracks load
{
  const t = core.loadTracks();
  if (!t.tracks?.contrato?.messages?.length === 5) {
    /* fix check */
  }
  const n = t.tracks?.contrato?.messages?.length;
  if (n !== 5) fail("track_contrato_5", n);
  else pass("track_contrato_5");
  if (t.tracks?.edital?.messages?.length !== 5) fail("track_edital_5");
  else pass("track_edital_5");
  if (t.tracks?.operacao?.messages?.length !== 5) fail("track_operacao_5");
  else pass("track_operacao_5");
}

// 2) health
{
  const res = await handler(event("health"));
  const j = JSON.parse(res.body);
  if (!j.ok || !j.tracks?.includes("contrato")) fail("health", j);
  else pass("health");
}

// 3) subscribe without consent
{
  const res = await handler(
    event("subscribe", {
      method: "POST",
      body: { email: "a@example.com", track: "contrato", consent: false },
    })
  );
  if (res.statusCode !== 400) fail("consent_required", res.statusCode);
  else pass("consent_required");
}

// 4) subscribe ok
let subId;
let confirmToken;
let unsubToken;
{
  const res = await handler(
    event("subscribe", {
      method: "POST",
      body: {
        email: "construtora@example.com",
        track: "contrato",
        consent: true,
        source: "test",
        landing_page: "/ferramentas/",
      },
    })
  );
  const j = JSON.parse(res.body);
  if (res.statusCode !== 201 || j.status !== "pending_confirm") fail("subscribe", j);
  else pass("subscribe", j.subscription_id);
  subId = j.subscription_id;
  // read raw tokens from file store
  const rec = JSON.parse(fs.readFileSync(path.join(storeDir, `${subId}.json`), "utf8"));
  confirmToken = rec._confirm_raw;
  unsubToken = rec._unsub_raw;
  if (!confirmToken) fail("confirm_token_stored");
  else pass("confirm_token_stored");
  // public body must not include email
  if (JSON.stringify(j).includes("construtora@")) fail("pii_in_response");
  else pass("no_email_in_subscribe_response");
}

// 5) confirm
{
  const res = await handler(
    event("confirm", { qs: { id: subId, token: confirmToken }, headers: { accept: "application/json" } })
  );
  const j = JSON.parse(res.body);
  if (!j.ok || j.status !== "active") fail("confirm", j);
  else pass("confirm_active");
  const rec = JSON.parse(fs.readFileSync(path.join(storeDir, `${subId}.json`), "utf8"));
  if (rec.messages_sent < 1) fail("first_message_after_confirm", rec.messages_sent);
  else pass("first_message_sent", rec.messages_sent);
}

// 6) tick advances remaining (day_offset future may skip — force by rewriting confirmed_at)
{
  const rec = JSON.parse(fs.readFileSync(path.join(storeDir, `${subId}.json`), "utf8"));
  rec.confirmed_at = new Date(Date.now() - 30 * 864e5).toISOString();
  fs.writeFileSync(path.join(storeDir, `${subId}.json`), JSON.stringify(rec));
  const res = await handler(
    event("tick", {
      method: "POST",
      body: {},
      headers: { authorization: "Bearer " + "x".repeat(24) },
    })
  );
  const j = JSON.parse(res.body);
  if (!j.ok) fail("tick", j);
  else pass("tick", `sent=${j.sent}`);
  const rec2 = JSON.parse(fs.readFileSync(path.join(storeDir, `${subId}.json`), "utf8"));
  if (rec2.messages_sent < 2) fail("tick_progress", rec2);
  else pass("tick_progress", rec2.messages_sent);
}

// 7) unsub + suppression
{
  const res = await handler(
    event("unsubscribe", {
      qs: { id: subId, token: unsubToken },
      headers: { accept: "application/json" },
    })
  );
  const j = JSON.parse(res.body);
  if (!j.ok) fail("unsub", j);
  else pass("unsub");
  // re-subscribe should silent accept (suppressed)
  const res2 = await handler(
    event("subscribe", {
      method: "POST",
      body: { email: "construtora@example.com", track: "edital", consent: true },
    })
  );
  if (res2.statusCode !== 202) fail("suppression_blocks", res2.statusCode + res2.body);
  else pass("suppression_silent_accept");
}

// 8) stop commercial
{
  const built = core.buildSubscription({
    email: "ops@example.com",
    track: "edital",
    consent: true,
  });
  built.record.status = "active";
  built.record.confirmed_at = new Date().toISOString();
  built.record.lead_id = "lead123";
  fs.writeFileSync(path.join(storeDir, `${built.record.subscription_id}.json`), JSON.stringify(built.record));
  const res = await handler(
    event("stop_commercial", {
      method: "POST",
      body: { lead_id: "lead123", stage: "meeting" },
      headers: { authorization: "Bearer " + "x".repeat(24) },
    })
  );
  const j = JSON.parse(res.body);
  if (!j.ok || j.stopped < 1) fail("stop_commercial", j);
  else pass("stop_commercial", j.stopped);
}

// 9) render has no internal jargon
{
  const t = core.loadTracks();
  const blob = JSON.stringify(t);
  if (/datalake|slug de ingest|\bpipeline de ingest/i.test(blob)) fail("internal_lang_tracks", "jargon");
  else pass("tracks_clean_language");
}

// 10) rate window expires deterministically and subscribe blocks before persist/send.
{
  const env = {
    NURTURE_RATE_WINDOW_MS: "1000",
    NURTURE_RATE_MAX_IP: "1",
    NURTURE_RATE_MAX_FP: "2",
  };
  rate._reset();
  const first = rate.nurtureRateLimit({ ip: "203.0.113.200", fingerprint: "fp-window", now: 0, env });
  const blocked = rate.nurtureRateLimit({ ip: "203.0.113.200", fingerprint: "fp-window", now: 500, env });
  const expired = rate.nurtureRateLimit({ ip: "203.0.113.200", fingerprint: "fp-window", now: 1001, env });
  if (!first.allowed || blocked.allowed || !expired.allowed) {
    fail("rate_window", { first, blocked, expired });
  } else pass("rate_window");

  rate._reset();
  const sharedHeaders = {
    headers: { "user-agent": "common-browser/1.0", "accept-language": "pt-BR" },
  };
  const fingerprintEnv = {
    IP_HASH_SALT: "test-private-rate-limit-salt",
    NURTURE_RATE_WINDOW_MS: "60000",
    NURTURE_RATE_MAX_IP: "5",
    NURTURE_RATE_MAX_FP: "1",
  };
  const firstIp = "203.0.113.210";
  const secondIp = "203.0.113.211";
  const firstFingerprint = rate.nurtureFingerprint(sharedHeaders, firstIp, fingerprintEnv);
  const secondFingerprint = rate.nurtureFingerprint(sharedHeaders, secondIp, fingerprintEnv);
  const firstVisitor = rate.nurtureRateLimit({
    ip: firstIp,
    fingerprint: firstFingerprint,
    now: 0,
    env: fingerprintEnv,
  });
  const secondVisitor = rate.nurtureRateLimit({
    ip: secondIp,
    fingerprint: secondFingerprint,
    now: 0,
    env: fingerprintEnv,
  });
  if (firstFingerprint === secondFingerprint || !firstVisitor.allowed || !secondVisitor.allowed) {
    fail("rate_distinct_visitors_common_browser", {
      firstFingerprint,
      secondFingerprint,
      firstVisitor,
      secondVisitor,
    });
  } else pass("rate_distinct_visitors_common_browser");

  process.env.NURTURE_RATE_MAX_IP = "2";
  process.env.NURTURE_RATE_MAX_FP = "2";
  process.env.NURTURE_RATE_WINDOW_MS = "60000";
  rate._reset();
  const before = fs.readdirSync(storeDir).filter((name) => name.endsWith(".json")).length;
  for (let i = 0; i < 2; i += 1) {
    const accepted = await handler(
      event("subscribe", {
        method: "POST",
        body: { email: `rate-${i}@example.com`, track: "contrato", consent: true },
        headers: { "x-forwarded-for": "203.0.113.201", "user-agent": "rate-probe/1.0" },
      })
    );
    if (accepted.statusCode !== 201) fail("rate_happy_path", accepted.statusCode);
  }
  const limited = await handler(
    event("subscribe", {
      method: "POST",
      body: { email: "rate-blocked@example.com", track: "contrato", consent: true },
      headers: { "x-forwarded-for": "203.0.113.201", "user-agent": "rate-probe/1.0" },
    })
  );
  const after = fs.readdirSync(storeDir).filter((name) => name.endsWith(".json")).length;
  if (limited.statusCode !== 429 || !limited.headers["Retry-After"]) {
    fail("rate_handler_429", { status: limited.statusCode, headers: limited.headers });
  } else if (after !== before + 2) fail("rate_blocked_before_persist", { before, after });
  else pass("rate_handler_429");

  rate._reset();
  const beforeLarge = fs.readdirSync(storeDir).filter((name) => name.endsWith(".json")).length;
  const tooLarge = await handler(
    event("subscribe", {
      method: "POST",
      body: { email: "large@example.com", track: "contrato", consent: true, source: "x".repeat(9000) },
    })
  );
  const afterLarge = fs.readdirSync(storeDir).filter((name) => name.endsWith(".json")).length;
  if (tooLarge.statusCode !== 413 || afterLarge !== beforeLarge) {
    fail("subscribe_payload_limit", { status: tooLarge.statusCode, beforeLarge, afterLarge });
  } else pass("subscribe_payload_limit");

  delete process.env.NURTURE_RATE_MAX_IP;
  delete process.env.NURTURE_RATE_MAX_FP;
  delete process.env.NURTURE_RATE_WINDOW_MS;
  rate._reset();
}

if (failed) {
  console.error(failed + " failures");
  process.exit(1);
}
console.log("\nALL nurture tests passed");
