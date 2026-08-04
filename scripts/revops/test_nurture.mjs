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
      "content-type": "application/json"...headers,
    },
    queryStringParameters: { action...qs },
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

// 6) tick advances remaining (day_offset future may skip, force by rewriting confirmed_at)
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

if (failed) {
  console.error(failed + " failures");
  process.exit(1);
}
console.log("\nALL nurture tests passed");
